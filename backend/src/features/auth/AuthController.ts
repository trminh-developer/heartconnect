import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { User } from "../../models";
import { randomUUID } from 'node:crypto';
import { UniqueConstraintError } from 'sequelize';
import { z } from "zod";
import { registerSchema } from "../../validators/userValidator";
import { profileIncludes } from '../match/profiles';
import { REFRESH_SECRET } from '../../config/auth';
import { createSession, revokeSession, rotateSession } from './sessions';
import type { AuthRequest } from '../../middlewares/authMiddleware';
import { datingTransaction } from '../match/transactions';

const isProduction = process.env.NODE_ENV === "production";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction, // Requires HTTPS in production, works on HTTP in local dev
  sameSite: isProduction ? ("none" as const) : ("lax" as const),
  maxAge: 15 * 60 * 1000, // 15m
};

const REFRESH_COOKIE_OPTIONS = {
  ...COOKIE_OPTIONS,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7d
};

export class AuthController {
  public async login(req: Request, res: Response) {
    let stage = 'validation';
    try {
      const { email, password } = z.object({ email: z.string().trim().email().toLowerCase(), password: z.string().min(1) }).parse(req.body);

      stage = 'load-user';
      const user = await User.findOne({ where: { email }, include: profileIncludes() });

      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Check password using bcrypt
      stage = 'verify-password';
      const isMatch = await bcrypt.compare(password, (user as any).password);
      if (!isMatch) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      if (['BANNED', 'DELETED'].includes(user.get('status') as string)) {
        return res.status(403).json({ error: 'Account has been suspended or deleted' });
      }

      stage = 'update-activity';
      await user.update({ last_active: new Date(), is_online: true });
      const data = user.toJSON();
      delete data.password;
      const userId = data.id;

      // Issue tokens
      stage = 'create-session';
      const { accessToken, refreshToken } = await createSession(userId);

      // Set tokens in HttpOnly cookies
      res.cookie("accessToken", accessToken, COOKIE_OPTIONS);
      res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS);

      // Also return access token in JSON (fallback for current frontend)
      return res.json({ accessToken, refreshToken, user: data });
    } catch (e: any) {
      if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues.map(issue => issue.message).join(', ') });
      console.error('Login failed:', { stage, name: e.name, code: e.original?.code || e.code, message: e.message });
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  public async register(req: Request, res: Response) {
    try {
      // Zod validation (Checklist #9)
      const { email, password, firstName, lastName, gender, dateOfBirth, username: requestedUsername } =
        registerSchema.parse(req.body);

      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ error: "Email already registered" });
      }

      let username = requestedUsername;
      if (!username) {
        const baseUsername = email
          .split("@")[0]
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "").slice(0, 20) || 'user';
        username = `${baseUsername}_${randomUUID().slice(0, 8)}`;
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const { data, accessToken, refreshToken } = await datingTransaction(async transaction => {
        const newUser = await User.create({
          email, password: hashedPassword, username, first_name: firstName,
          last_name: lastName, gender, date_of_birth: dateOfBirth,
        }, { transaction });
        const data = newUser.toJSON();
        delete data.password;
        return { data, ...await createSession(data.id, transaction) };
      });

      res.cookie("accessToken", accessToken, COOKIE_OPTIONS);
      res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS);

      return res.status(201).json({ accessToken, refreshToken, user: data });
    } catch (error: any) {
      if (error instanceof UniqueConstraintError) return res.status(409).json({ error: 'Email or username is already registered' });
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ error: error.issues.map(issue => issue.message).join(', ') });
      }
      console.error('Registration failed:', error);
      return res.status(500).json({ error: "Error creating user" });
    }
  }

  public async refresh(req: Request, res: Response) {
    // Try to get token from body OR cookies
    const token = req.body?.token ?? req.cookies?.refreshToken;

    if (typeof token !== 'string' || !token) {
      return res
        .status(401)
        .json({ error: "Refresh token invalid or expired" });
    }

    try {
      const decoded = jwt.verify(token, REFRESH_SECRET, { algorithms: ['HS256'] });
      if (typeof decoded === 'string' || typeof decoded.id !== 'string' || !decoded.id) {
        return res.status(403).json({ error: 'Invalid refresh token' });
      }
      const user = await User.findByPk(decoded.id);
      if (!user || user.get('status') !== 'ACTIVE') {
        await revokeSession(token);
        res.clearCookie('accessToken', COOKIE_OPTIONS);
        res.clearCookie('refreshToken', REFRESH_COOKIE_OPTIONS);
        return res.status(403).json({ error: 'Account is unavailable' });
      }
      const tokens = await rotateSession(token, decoded.id);
      if (!tokens) return res.status(403).json({ error: 'Refresh token invalid or expired' });
      res.cookie('accessToken', tokens.accessToken, COOKIE_OPTIONS);
      res.cookie('refreshToken', tokens.refreshToken, REFRESH_COOKIE_OPTIONS);
      return res.json(tokens);
    } catch (err) {
      if (!(err instanceof jwt.JsonWebTokenError)) {
        console.error('Session refresh failed:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }
      res.clearCookie("accessToken", COOKIE_OPTIONS);
      res.clearCookie("refreshToken", REFRESH_COOKIE_OPTIONS);
      return res.status(403).json({ error: "Invalid refresh token" });
    }
  }

  public async forgotPassword(req: any, res: any) {
    res.status(501).json({ error: 'Password recovery is not configured. Please contact an administrator.' });
  }
  public async verifyOTP(req: any, res: any) {
    res.status(501).json({ error: 'Password recovery is not configured. Please contact an administrator.' });
  }
  public async resetPassword(req: any, res: any) {
    res.status(501).json({ error: 'Password recovery is not configured. Please contact an administrator.' });
  }

  public async logout(req: Request, res: Response) {
    const token = req.body?.token ?? req.cookies?.refreshToken;

    if (typeof token === 'string' && token) {
      await revokeSession(token);
    }

    res.clearCookie("accessToken", COOKIE_OPTIONS);
    res.clearCookie("refreshToken", REFRESH_COOKIE_OPTIONS);

    return res.json({ success: true, message: "Logged out successfully" });
  }

  public async me(req: AuthRequest, res: Response) {
    try {
      const user = await User.findByPk(req.user.id, { include: profileIncludes() });

      if (!user) return res.status(404).json({ error: "User not found" });

      const data = user.toJSON();
      delete data.password;
      return res.json(data);
    } catch (e) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
}
