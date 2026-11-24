import { Response } from 'express';
import { col, fn, Op } from 'sequelize';
import { Match, Report, Status, Transaction, User, VerificationRequest, sequelize } from '../../models';
import { AuthRequest } from '../../middlewares/authMiddleware';
import { period, REPORT_TIME_OFFSET_MS } from './adminQuery';

const identity = ['id', 'username', 'first_name', 'last_name', 'avatar'];
const premiumWhere = () => ({ is_premium: true, status: 'ACTIVE', premium_expires_at: { [Op.gt]: new Date() } });
const dateRange = (range: ReturnType<typeof period>) => ({ [Op.gte]: range.from, [Op.lt]: range.to });
const fail = (res: Response, error: any) => {
  if (!error.statusCode) console.error('Admin statistics failed:', error);
  return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Không thể tải thống kê.' });
};

export function vietnamDayExpression(field: string, dialect = sequelize.getDialect()) {
  if (dialect === 'sqlite') return fn('DATE', col(field), '+7 hours');
  if (dialect === 'postgres') return fn('TO_CHAR', fn('TIMEZONE', 'Asia/Ho_Chi_Minh', col(field)), 'YYYY-MM-DD');
  return fn('DATE', fn('CONVERT_TZ', col(field), '+00:00', '+07:00'));
}

async function daily(model: any, field: string, where: any, amount = false) {
  const day = vietnamDayExpression(field);
  return model.findAll({
    attributes: [[day, 'date'], [amount ? fn('SUM', col('amount')) : fn('COUNT', col('id')), 'value']],
    where, group: [day], order: [[day, 'ASC']], raw: true,
  }) as Promise<{ date: string; value: number | string }[]>;
}
function series(range: ReturnType<typeof period>, ...groups: { date: string; value: number | string }[][]) {
  return Array.from({ length: range.days }, (_, i) => {
    const date = new Date(range.from.getTime() + REPORT_TIME_OFFSET_MS + i * 86400000).toISOString().slice(0, 10);
    return { date, values: groups.map(group => Number(group.find(point => String(point.date).slice(0, 10) === date)?.value || 0)) };
  });
}

export const getAdminOverview = async (req: AuthRequest, res: Response) => {
  try {
    const range = period(req);
    const [total, active, banned, verified, premium, newUsers, activeWeek, pendingReports, pendingVerifications, posts, matches,
      userDaily, matchDaily, recentUsers, reportQueue, verificationQueue] = await Promise.all([
      User.count({ where: { status: { [Op.ne]: 'DELETED' } } }), User.count({ where: { status: 'ACTIVE' } }),
      User.count({ where: { status: 'BANNED' } }), User.count({ where: { is_verified: true, status: 'ACTIVE' } }),
      User.count({ where: premiumWhere() }), User.count({ where: { createdAt: dateRange(range) } }),
      User.count({ where: { status: 'ACTIVE', last_active: { [Op.gte]: new Date(Date.now() - 7 * 86400000) } } }),
      Report.count({ where: { status: 'PENDING' } }), VerificationRequest.count({ where: { status: 'PENDING' } }),
      Status.count({ where: { is_hidden: false } }), Match.count({ where: { matched_at: dateRange(range) } }),
      daily(User, 'createdAt', { createdAt: dateRange(range) }), daily(Match, 'matched_at', { matched_at: dateRange(range) }),
      User.findAll({ attributes: [...identity, 'email', 'status', 'role', 'createdAt', 'is_verified'], order: [['createdAt', 'DESC'], ['id', 'ASC']], limit: 5 }),
      Report.findAll({ where: { status: 'PENDING' }, include: [{ model: User, as: 'ReportedUser', attributes: identity }], order: [['createdAt', 'ASC']], limit: 4 }),
      VerificationRequest.findAll({ attributes: ['id', 'user_id', 'status', 'createdAt'], where: { status: 'PENDING' },
        include: [{ model: User, as: 'user', attributes: identity }], order: [['createdAt', 'ASC']], limit: 4 }),
    ]);
    const revenue = req.user.role === 'ADMIN' ? Number(await Transaction.sum('amount', { where: { status: 'SUCCESS', created_at: dateRange(range) } }) || 0) : undefined;
    return res.json({
      days: range.days, updated_at: new Date(), users: { total, active, banned, verified, premium, new_in_period: newUsers, active_week: activeWeek },
      moderation: { pending_reports: pendingReports, pending_verifications: pendingVerifications, visible_posts: posts },
      matches_in_period: matches, ...(revenue === undefined ? {} : { revenue }),
      trend: series(range, userDaily, matchDaily).map(point => ({ date: point.date, users: point.values[0], matches: point.values[1] })),
      recent_users: recentUsers, report_queue: reportQueue, verification_queue: verificationQueue,
    });
  } catch (error) { return fail(res, error); }
};

export const getAdminAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Chỉ quản trị viên được xem doanh thu.' });
    const range = period(req), where = { created_at: dateRange(range) };
    const [states, providers, plans, revenueDaily, recent, premium, expiring] = await Promise.all([
      Transaction.findAll({ attributes: ['status', [fn('COUNT', col('id')), 'count'], [fn('SUM', col('amount')), 'amount']], where, group: ['status'], raw: true }),
      Transaction.findAll({ attributes: ['provider', [fn('COUNT', col('id')), 'count'], [fn('SUM', col('amount')), 'amount']], where: { ...where, status: 'SUCCESS' }, group: ['provider'], raw: true }),
      Transaction.findAll({ attributes: ['plan_id', [fn('COUNT', col('id')), 'count'], [fn('SUM', col('amount')), 'amount']], where: { ...where, status: 'SUCCESS' }, group: ['plan_id'], raw: true }),
      daily(Transaction, 'created_at', { ...where, status: 'SUCCESS' }, true),
      Transaction.findAll({ where, order: [['created_at', 'DESC'], ['id', 'ASC']], limit: 10 }),
      User.count({ where: premiumWhere() }), User.count({ where: { ...premiumWhere(), premium_expires_at: { [Op.gt]: new Date(), [Op.lte]: new Date(Date.now() + 7 * 86400000) } } }),
    ]);
    const rows: any[] = states;
    const get = (status: string, key: string) => Number(rows.find(row => row.status === status)?.[key] || 0);
    const ids = [...new Set(recent.map(tx => tx.get('user_id') as string))];
    const users = ids.length ? await User.findAll({ where: { id: { [Op.in]: ids } }, attributes: identity }) : [];
    const byId = new Map(users.map(user => [user.get('id'), user.toJSON()]));
    return res.json({ days: range.days, revenue: get('SUCCESS', 'amount'), successful: get('SUCCESS', 'count'), pending: get('PENDING', 'count'),
      failed: get('FAILED', 'count'), premium, expiring, providers, plans,
      trend: series(range, revenueDaily).map(point => ({ date: point.date, revenue: point.values[0] })),
      transactions: recent.map(tx => ({ ...tx.toJSON(), user: byId.get(tx.get('user_id')) || null })),
    });
  } catch (error) { return fail(res, error); }
};
