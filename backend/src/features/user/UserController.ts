import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { User, UserPreference, UserBlock, DatingEvent, Report, RefreshSession } from "../../models";
import { UniqueConstraintError, Op } from 'sequelize';
import { AuthRequest } from "../../middlewares/authMiddleware";
import { z } from "zod";
import { updateProfileSchema } from "../../validators/userValidator";
import { clearInterestCatalogueCache, discoveryFeed, recordImpression, recommendUsers } from '../match/recommendations';
import { ownProfile, profileIncludes, publicProfile } from '../match/profiles';
import { datingError } from '../match/swipes';
import { ALGORITHM_VERSION, interestKey } from '../match/compatibility';
import { datingTransaction, lockPair } from '../match/transactions';
import { findSearchUsers } from './search';

export const getUserByUsername = async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findOne({
      where: { username: req.params.username },
      include: profileIncludes(),
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json(req.user?.id === user.get('id') ? ownProfile(user) : publicProfile(user));
  } catch (error: any) {
    console.error(error);
    return res
      .status(500)
      .json({ error: error.message || "Internal server error" });
  }
};

export const getUserById = async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findByPk(req.params.id as string, {
      include: profileIncludes(),
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json(req.user?.id === user.get('id') ? ownProfile(user) : publicProfile(user));
  } catch (error: any) {
    console.error(error);
    return res
      .status(500)
      .json({ error: error.message || "Internal server error" });
  }
};

export const getRecommendedUsers = async (req: AuthRequest, res: Response) => {
  try {
    const requested = Number(req.query.limit ?? 20);
    if (!Number.isInteger(requested) || requested < 1 || requested > 50) {
      return res.status(400).json({ error: 'Limit must be an integer between 1 and 50' });
    }
    const users = await recommendUsers(req.user?.id, requested);
    return res.json(users);
  } catch (error: any) {
    console.error(error);
    return res
      .status(500)
      .json({ error: error.message || "Internal server error" });
  }
};

export const getNearbyUsers = async (req: Request, res: Response) => {
  try {
    const users = await User.findAll({ where: { status: 'ACTIVE', role: 'USER' }, limit: 20, include: profileIncludes() });
    return res.json(users.map(publicProfile));
  } catch (error: any) {
    console.error(error);
    return res
      .status(500)
      .json({ error: error.message || "Internal server error" });
  }
};

export const searchUsers = async (req: Request, res: Response) => {
  try {
    const users = await findSearchUsers(req.query);
    return res.json(users.map(publicProfile));
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'Từ khóa hoặc bộ lọc tìm kiếm không hợp lệ.' });
    console.error(error);
    return res
      .status(500)
      .json({ error: error.message || "Internal server error" });
  }
};

export const updateUserProfile = async (req: AuthRequest, res: Response) => {
  try {
    const userIdToUpdate = req.params.id as string;

    // AUTHORIZATION CHECK (IDOR Protection)
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Users can only update their own profile (unless they are admin)
    if (req.user.id !== userIdToUpdate && req.user.role !== "ADMIN") {
      return res
        .status(403)
        .json({ error: "Forbidden: You can only update your own profile" });
    }

    const body = updateProfileSchema.parse(req.body);
    const user = await datingTransaction(async (transaction) => {
      const user: any = await User.findByPk(userIdToUpdate, { transaction, lock: transaction.LOCK.UPDATE });
      if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });
      const updateData: any = {};
      const now = new Date();
      const cooldown = 7 * 24 * 60 * 60 * 1000;
      const checkCooldown = (lastChanged: Date | null, field: string, label: string) => {
        const nextAllowedAt = lastChanged ? new Date(new Date(lastChanged).getTime() + cooldown) : null;
        if (nextAllowedAt && now < nextAllowedAt) {
          throw Object.assign(new Error(`Bạn chỉ có thể đổi ${label} sau 7 ngày. Có thể đổi lại từ ${nextAllowedAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.`), {
            statusCode: 429, field, nextAllowedAt: nextAllowedAt.toISOString(),
          });
        }
      };
      const nameChanged = (body.firstName !== undefined && body.firstName !== (user.first_name || '')) ||
        (body.lastName !== undefined && body.lastName !== (user.last_name || ''));
      if (nameChanged) {
        checkCooldown(user.name_changed_at, 'name', 'tên hiển thị');
        updateData.name_changed_at = now;
      }
      if (body.username !== undefined && body.username !== user.username) {
        checkCooldown(user.username_changed_at, 'username', 'username');
        updateData.username_changed_at = now;
      }
      if (body.appLogo !== undefined && body.appLogo !== (user.app_logo || '')) {
        const activePremium = user.is_premium && user.premium_expires_at && new Date(user.premium_expires_at) > now;
        if (body.appLogo && !activePremium) {
          throw Object.assign(new Error('Bạn cần gói Premium còn hiệu lực để đổi logo.'), { statusCode: 403 });
        }
        updateData.app_logo = body.appLogo;
      }

      // Whitelist only safe fields
      if (body.username !== undefined) updateData.username = body.username;
      if (body.firstName !== undefined) updateData.first_name = body.firstName;
      if (body.lastName !== undefined) updateData.last_name = body.lastName;
      if (body.coverPhoto !== undefined) updateData.cover_photo = body.coverPhoto;
      if (body.dateOfBirth !== undefined) {
        updateData.date_of_birth =
          body.dateOfBirth === "" ? null : body.dateOfBirth;
      }
      if (body.isOnline !== undefined) updateData.is_online = body.isOnline;
      if (body.isOnline === true) updateData.last_active = now;
      if (body.datingVisible !== undefined) updateData.dating_visible = body.datingVisible;

      // Hash password if updated
      if (body.password && body.password.trim() !== "") {
        if (!body.currentPassword || !await bcrypt.compare(body.currentPassword, req.user.password)) {
          throw datingError('Current password is incorrect.');
        }
        updateData.password = await bcrypt.hash(body.password, 10);
        await RefreshSession.destroy({ where: { user_id: userIdToUpdate }, transaction });
      }

      if (body.location?.city !== undefined) updateData.city = body.location.city;
      if (body.location?.country !== undefined)
        updateData.country = body.location.country;
      if (body.location?.latitude !== undefined)
        updateData.latitude = body.location.latitude;
      if (body.location?.longitude !== undefined)
        updateData.longitude = body.location.longitude;
      const coordinatesChanged = (body.location?.latitude !== undefined && body.location.latitude !== user.latitude) ||
        (body.location?.longitude !== undefined && body.location.longitude !== user.longitude);
      if (body.refreshLocation || coordinatesChanged) {
        // Only a complete GPS pair refreshes its timestamp.
        if (body.location?.latitude == null || body.location?.longitude == null) updateData.location_updated_at = null;
        else updateData.location_updated_at = now;
      }

      if (body.bio !== undefined) updateData.bio = body.bio;
      if (body.profession !== undefined) updateData.profession = body.profession;
      if (body.education !== undefined) updateData.education = body.education;
      if (body.relationshipGoal !== undefined)
        updateData.relationship_goal = body.relationshipGoal;

      if (body.avatar !== undefined) updateData.avatar = body.avatar;
      if (body.photos !== undefined) updateData.photos = body.photos;

      if (body.interests && Array.isArray(body.interests)) {
        const { Interest } = require("../../models");
        const interestRecords = [];
        const existingInterests = await Interest.findAll({ transaction });
        const canonical = new Map(existingInterests.map((item: any) => [interestKey(item.name), item]));
        for (const i of body.interests) {
          if (i.name) {
            const key = interestKey(i.name);
            const [record] = canonical.has(key) ? [canonical.get(key)] : await Interest.findOrCreate({
              where: { name: i.name.trim() },
              defaults: {
                icon: i.icon || "bi-star",
                category: i.category || "other",
              },
              transaction,
            });
            canonical.set(key, record);
            interestRecords.push(record);
          }
        }
        await user.setInterests(interestRecords, { transaction });
        clearInterestCatalogueCache();
      }

      // Update preferences if any
      if (body.datingPreference) {
        const preferenceData: Record<string, unknown> = {};
        if (body.datingPreference.preferredGender !== undefined)
          preferenceData.preferred_gender = body.datingPreference.preferredGender;
        if (body.datingPreference.ageRange) {
          if (body.datingPreference.ageRange.min !== undefined)
            preferenceData.age_min = body.datingPreference.ageRange.min;
          if (body.datingPreference.ageRange.max !== undefined)
            preferenceData.age_max = body.datingPreference.ageRange.max;
        }
        if (body.datingPreference.maxDistance !== undefined)
          preferenceData.max_distance = body.datingPreference.maxDistance;
        if (body.datingPreference.relationshipGoal !== undefined)
          preferenceData.relationship_goal =
            body.datingPreference.relationshipGoal;
        for (const [api, column] of Object.entries({ acceptedGoals: 'accepted_goals', goalRequired: 'goal_required',
          distanceRequired: 'distance_required', distanceHalfLife: 'distance_half_life' })) {
          const value = body.datingPreference[api as keyof typeof body.datingPreference];
          if (value !== undefined) preferenceData[column] = value;
        }
        const preference = await UserPreference.findOne({ where: { user_id: userIdToUpdate }, transaction });
        const min = preferenceData.age_min ?? preference?.get('age_min') ?? 18;
        const max = preferenceData.age_max ?? preference?.get('age_max') ?? 100;
        if (Number(min) > Number(max)) throw datingError('Tuổi tối thiểu không được lớn hơn tuổi tối đa.');
        if (preference) await preference.update(preferenceData, { transaction });
        else await UserPreference.create({ user_id: userIdToUpdate, ...preferenceData }, { transaction });
      }

      await user.update(updateData, { transaction });

      const { Interest } = require("../../models");
      await user.reload({
        transaction,
        include: profileIncludes(),
      });
      return user;
    });

    return res.json({ message: "Profile updated successfully", user: ownProfile(user) });
  } catch (error: any) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message, field: error.field, nextAllowedAt: error.nextAllowedAt });
    }
    if (error instanceof UniqueConstraintError) return res.status(409).json({ error: 'Username đã được sử dụng.' });
    if (error instanceof z.ZodError) {
      console.error("ZodError:", JSON.stringify(error.issues));
      return res.status(400).json({
        error: error.issues
          .map((e) => e.path.join(".") + ": " + e.message)
          .join(", "),
      });
    }
    console.error(error);
    return res
      .status(500)
      .json({ error: error.message || "Internal server error" });
  }
};

export const blockUser = async (req: AuthRequest, res: Response) => {
  try {
    const targetId = req.body?.blockedId;
    if (typeof targetId !== 'string' || !targetId || targetId === req.user?.id) return res.status(400).json({ error: 'Invalid target' });
    await datingTransaction(async transaction => {
      const pair = await lockPair(req.user.id, targetId, transaction);
      const { Op } = await import('sequelize');
      const users = await User.findAll({
        where: { id: { [Op.in]: [req.user.id, targetId] } }, order: [['id', 'ASC']],
        transaction, lock: transaction.LOCK.UPDATE,
      });
      if (users.length !== 2) throw datingError('User not found', 404);
      const [, created] = await UserBlock.findOrCreate({ where: { user_id: req.user.id, target_id: targetId }, transaction });
      await pair.update({ state: 'blocked' }, { transaction });
      if (created) await DatingEvent.create({ user_id: req.user.id, target_id: targetId, type: 'block', algorithm_version: ALGORITHM_VERSION }, { transaction });
    });
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Internal server error' });
  }
};
export const reportUser = async (req: AuthRequest, res: Response) => {
  try {
    const body = z.object({ reportedId: z.string().min(1), reason: z.string().trim().min(1).max(255), details: z.string().trim().max(5000).optional() }).parse(req.body);
    if (body.reportedId === req.user.id) return res.status(400).json({ error: 'Không thể tự báo cáo tài khoản của bạn.' });
    if (!await User.findByPk(body.reportedId)) return res.status(404).json({ error: 'User not found' });
    const report = await Report.create({ reporter_id: req.user.id, reported_user_id: body.reportedId, reason: body.reason, description: body.details, status: 'PENDING' });
    return res.json({ success: true, report: { id: report.get('id'), status: report.get('status') } });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues.map(issue => issue.message).join(', ') });
    return res.status(500).json({ error: 'Không thể gửi báo cáo.' });
  }
};

export const getDiscoveryFeed = async (req: AuthRequest, res: Response) => {
  try {
    const limit = Number(req.query.limit ?? 20);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw datingError('Limit must be between 1 and 50');
    if (req.query.cursor !== undefined && typeof req.query.cursor !== 'string') throw datingError('Invalid cursor');
    return res.json(await discoveryFeed(req.user.id, limit, req.query.cursor as string | undefined));
  } catch (error: any) {
    if (!error.statusCode) console.error('Discovery failed:', error);
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Internal server error', code: error.code });
  }
};

export const postDiscoveryImpression = async (req: AuthRequest, res: Response) => {
  try {
    await recordImpression(req.user.id, req.params.sessionId as string, req.body?.targetId);
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Internal server error' });
  }
};
