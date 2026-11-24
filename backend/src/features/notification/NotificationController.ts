import { Request, Response } from "express";
import { AuthRequest } from "../../middlewares/authMiddleware";
import { Notification, User } from '../../models';
import { z } from 'zod';

export const getNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.userId;
    if (req.user?.id !== userId && req.user?.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { Notification, User } = require("../../models");
    const notifications = await Notification.findAll({
      where: { user_id: userId },
      include: [{ model: User, as: "FromUser", attributes: ['id', 'username', 'first_name', 'last_name', 'avatar'] }],
      order: [["created_at", "DESC"]],
    });

    // Map to frontend format
    const formatted = notifications.map((n: any) => {
      const data = n.toJSON();
      return {
        ...data,
        fromUser: data.FromUser
          ? {
              id: data.FromUser.id,
              firstName: data.FromUser.first_name,
              lastName: data.FromUser.last_name,
              avatar: data.FromUser.avatar,
            }
          : null,
      };
    });

    return res.json(formatted);
  } catch (e: any) {
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const getUnreadCount = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.userId;
    if (req.user?.id !== userId && req.user?.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { Notification } = require("../../models");
    const count = await Notification.count({
      where: { user_id: userId, is_read: false },
    });
    return res.json({ count });
  } catch (e: any) {
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const markAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const { Notification } = require("../../models");
    const notification: any = await Notification.findByPk(req.params.id);

    if (!notification)
      return res.status(404).json({ error: "Notification not found" });

    if (notification.user_id !== req.user?.id && req.user?.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden" });
    }

    await notification.update({ is_read: true });
    return res.json({ success: true });
  } catch (e: any) {
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const markAllAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.params.userId;
    if (req.user?.id !== userId && req.user?.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { Notification } = require("../../models");
    await Notification.update(
      { is_read: true },
      { where: { user_id: userId } },
    );
    return res.json({ success: true });
  } catch (e: any) {
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const createNotification = async (req: AuthRequest, res: Response) => {
  try {
    // Only ADMIN or system should create notifications freely like this
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { userId, type, message, fromUserId } = z.object({
      userId: z.string().min(1),
      fromUserId: z.string().min(1).nullish(),
      type: z.string().transform(value => value.toUpperCase()).pipe(z.enum(['LIKE', 'MATCH', 'MESSAGE', 'PROFILE_VIEW', 'SUPER_LIKE', 'SYSTEM'])),
      message: z.string().trim().min(1).max(5000),
    }).parse(req.body);
    if (!await User.findByPk(userId) || (fromUserId && !await User.findByPk(fromUserId))) {
      return res.status(404).json({ error: 'User not found' });
    }
    const notification = await Notification.create({
      user_id: userId,
      type,
      message,
      from_user_id: fromUserId || null,
    });
    return res.json(notification);
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues.map(issue => issue.message).join(', ') });
    return res.status(500).json({ error: "Internal server error" });
  }
};
