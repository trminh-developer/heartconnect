import { createHash, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import type { Transaction } from 'sequelize';
import { RefreshSession } from '../../models';
import { JWT_SECRET, REFRESH_SECRET } from '../../config/auth';

const lifetime = 7 * 24 * 60 * 60 * 1000;
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

function tokensFor(userId: string) {
  return {
    accessToken: jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '15m', algorithm: 'HS256' }),
    refreshToken: jwt.sign({ id: userId }, REFRESH_SECRET, {
      expiresIn: '7d', algorithm: 'HS256', jwtid: randomUUID(),
    }),
  };
}

export async function createSession(userId: string, transaction?: Transaction) {
  const tokens = tokensFor(userId);
  await RefreshSession.create({
    user_id: userId, token_hash: tokenHash(tokens.refreshToken), expires_at: new Date(Date.now() + lifetime),
  }, { transaction });
  return tokens;
}

export async function rotateSession(token: string, userId: string) {
  const tokens = tokensFor(userId);
  // Compare and swap makes a refresh token single use, including concurrent requests.
  const [updated] = await RefreshSession.update({
    token_hash: tokenHash(tokens.refreshToken), expires_at: new Date(Date.now() + lifetime),
  }, { where: { token_hash: tokenHash(token), user_id: userId, expires_at: { [Op.gt]: new Date() } } });
  return updated === 1 ? tokens : null;
}

export async function revokeSession(token: string) {
  await RefreshSession.destroy({ where: { token_hash: tokenHash(token) } });
}
