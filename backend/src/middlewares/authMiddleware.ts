import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models";
import { Op } from 'sequelize';
import { accessTokenFrom, JWT_SECRET } from '../config/auth';

async function touchActivity(user: any) {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000);
  if (!user.last_active || new Date(user.last_active) < cutoff) {
    await User.update({ last_active: new Date() }, { where: {
      id: user.id, [Op.or]: [{ last_active: null }, { last_active: { [Op.lt]: cutoff } }],
    }, silent: true });
  }
}

export interface AuthRequest extends Request {
  user?: any;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = accessTokenFrom(req);

    if (!token) {
      return res.status(401).json({ error: "Unauthorized: No token provided" });
    }

    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof decoded === 'string' || typeof decoded.id !== 'string' || !decoded.id) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
    const user = await User.findByPk(decoded.id);

    if (!user) {
      return res.status(401).json({ error: "Unauthorized: User not found" });
    }

    if (
      (user as any).status === "BANNED" ||
      (user as any).status === "DELETED"
    ) {
      return res
        .status(403)
        .json({ error: "Forbidden: Account has been suspended or deleted" });
    }

    await touchActivity(user);
    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) return res.status(401).json({ error: "Unauthorized: Invalid token" });
    next(error);
  }
};

export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = accessTokenFrom(req);
    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
      if (typeof decoded === 'string' || typeof decoded.id !== 'string' || !decoded.id) return next();
      const user = await User.findByPk(decoded.id);
      if (
        user &&
        (user as any).status !== "BANNED" &&
        (user as any).status !== "DELETED"
      ) {
        await touchActivity(user);
        req.user = user;
      }
    }
  } catch (error) {
    if (!(error instanceof jwt.JsonWebTokenError)) return next(error);
  }
  next();
};

export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.user.role !== "ADMIN" && req.user.role !== "CENSOR") {
    return res
      .status(403)
      .json({
        error:
          "Forbidden: Requires admin privileges. Role is: " + req.user.role,
      });
  }

  next();
};
