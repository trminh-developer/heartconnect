import type { Request } from 'express';

export const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';
export const REFRESH_SECRET = process.env.REFRESH_SECRET || 'super-refresh-key';

export function accessTokenFrom(req: Request): string | undefined {
  const authorization = req.headers.authorization;
  if (authorization?.startsWith('Bearer ')) return authorization.slice(7).trim();
  return req.cookies?.accessToken;
}
