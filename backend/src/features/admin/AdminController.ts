import { Response } from 'express';
import { Op } from 'sequelize';
import { z } from 'zod';
import {
  Notification,
  Report,
  Status,
  SystemSetting,
  User,
  VerificationRequest,
  RefreshSession,
  UserPreference,
  UserInterest,
  UserSwipe,
  UserBlock,
  DatingEvent,
  PairState,
  DatingRequest,
  DiscoverySession,
  DiscoveryImpression,
  Story,
  StatusLike,
  StatusComment,
  Match,
  Conversation,
  Message,
  Transaction,
} from '../../models';
import { AuthRequest } from '../../middlewares/authMiddleware';
import { datingTransaction as adminTransaction } from '../match/transactions';
import { adminError, filter, pagination, pageResult, search, searchWhere } from './adminQuery';

const identity = ['id', 'username', 'first_name', 'last_name', 'avatar'];
const userAttributes = [...identity, 'email', 'role', 'status', 'is_verified', 'violation_count', 'createdAt', 'last_active', 'is_premium', 'premium_expires_at'];
const handler = (work: (req: AuthRequest, res: Response) => Promise<unknown>) => async (req: AuthRequest, res: Response) => {
  try { return await work(req, res); }
  catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues.map(issue => issue.message).join(' ') });
    if (!error.statusCode) console.error('Admin request failed:', error);
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Không thể xử lý yêu cầu. Vui lòng thử lại.' });
  }
};
function administrator(req: AuthRequest) {
  if (req.user?.role !== 'ADMIN') throw adminError('Chỉ quản trị viên được thực hiện thao tác này.', 403);
}
function mayManage(req: AuthRequest, user: any) {
  if (user.get('id') === req.user.id || user.get('role') === 'ADMIN' || (req.user.role !== 'ADMIN' && user.get('role') !== 'USER')) {
    throw adminError('Bạn không có quyền thay đổi tài khoản này.', 403);
  }
}
const reportIncludes = () => [
  { model: User, as: 'Reporter', attributes: identity },
  { model: User, as: 'ReportedUser', attributes: identity },
  { model: Status, as: 'ReportedStatus', attributes: ['id', 'user_id', 'content', 'is_hidden'], include: [{ model: User, attributes: identity }] },
];
const verificationUser = () => [{ model: User, as: 'user', attributes: [...identity, 'email'] }];

export const submitVerification = handler(async (req, res) => {
  if (req.user?.id !== req.params.id) throw adminError('Forbidden', 403);
  const body = z.object({ id_card_image: z.string().min(1).max(10000000), selfie_image: z.string().min(1).max(40000000) }).parse(req.body);
  await adminTransaction(async transaction => {
    await User.findByPk(req.user.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (await VerificationRequest.findOne({ where: { user_id: req.user.id, status: 'PENDING' }, transaction })) {
      throw adminError('Bạn đã có yêu cầu xác thực đang chờ duyệt.', 409);
    }
    await VerificationRequest.create({ ...body, user_id: req.user.id, status: 'PENDING' }, { transaction });
  });
  return res.status(201).json({ message: 'Đã gửi yêu cầu xác thực.' });
});

export const getPendingVerifications = handler(async (req, res) => {
  const paging = pagination(req), status = filter(req, 'status', ['PENDING', 'APPROVED', 'REJECTED']);
  const { rows, count } = await VerificationRequest.findAndCountAll({
    ...paging, attributes: ['id', 'user_id', 'status', 'createdAt', 'updatedAt'],
    where: { ...(status ? { status } : {}), ...searchWhere(search(req), ['$user.username$', '$user.first_name$', '$user.email$']) },
    include: verificationUser(), order: [['createdAt', 'DESC'], ['id', 'ASC']], distinct: true, subQuery: false,
  });
  return res.json(pageResult(rows, count, paging));
});
export const getVerificationDetail = handler(async (req, res) => {
  const request = await VerificationRequest.findByPk(req.params.id as string, { include: verificationUser() });
  if (!request) throw adminError('Yêu cầu không tồn tại.', 404);
  return res.json(request);
});
const reviewVerification = (status: 'APPROVED' | 'REJECTED') => handler(async (req, res) => {
  await adminTransaction(async transaction => {
    const request: any = await VerificationRequest.findByPk(req.params.id as string, { transaction, lock: transaction.LOCK.UPDATE });
    if (!request) throw adminError('Yêu cầu không tồn tại.', 404);
    if (request.status !== 'PENDING') throw adminError('Yêu cầu này đã được xử lý. Hãy tải lại danh sách.', 409);
    const user: any = await User.findByPk(request.user_id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!user || user.status !== 'ACTIVE') throw adminError('Tài khoản không còn hoạt động.', 409);
    await request.update({ status }, { transaction });
    if (status === 'APPROVED') await user.update({ is_verified: true }, { transaction });
    await Notification.create({
      type: 'SYSTEM', user_id: request.user_id, is_read: false,
      message: status === 'APPROVED' ? 'Yêu cầu xác thực danh tính của bạn đã được phê duyệt.' : 'Yêu cầu xác thực chưa được chấp nhận. Vui lòng kiểm tra và gửi lại hình ảnh rõ nét.',
    }, { transaction });
  });
  return res.json({ message: status === 'APPROVED' ? 'Đã phê duyệt xác thực.' : 'Đã từ chối yêu cầu.' });
});
export const approveVerification = reviewVerification('APPROVED');
export const rejectVerification = reviewVerification('REJECTED');

export const getAllUsers = handler(async (req, res) => {
  const paging = pagination(req), role = filter(req, 'role', ['ADMIN', 'CENSOR', 'USER']);
  const status = filter(req, 'status', ['ACTIVE', 'BANNED', 'DELETED']);
  const verified = filter(req, 'verified', ['true', 'false']);
  const { rows, count } = await User.findAndCountAll({
    ...paging, attributes: userAttributes,
    where: { ...searchWhere(search(req), ['username', 'email', 'first_name', 'last_name']),
      ...(role ? { role } : {}), ...(status ? { status } : {}), ...(verified ? { is_verified: verified === 'true' } : {}) },
    order: [['createdAt', 'DESC'], ['id', 'ASC']],
  });
  return res.json(pageResult(rows, count, paging));
});
const changeUser = (work: (req: AuthRequest, user: any, transaction: any) => Promise<void>) => handler(async (req, res) => {
  const id = req.params.id as string;
  await adminTransaction(async transaction => {
    const user = await User.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!user) throw adminError('Người dùng không tồn tại.', 404);
    await work(req, user, transaction);
  });
  return res.json({ message: 'Đã cập nhật người dùng.' });
});
export const toggleUserStatus = changeUser(async (req, user, transaction) => {
  mayManage(req, user);
  const { status } = z.object({ status: z.enum(['ACTIVE', 'BANNED']) }).parse(req.body);
  if (user.status === 'DELETED') throw adminError('Tài khoản đã xóa không thể thay đổi tại đây.', 409);
  await user.update({ status }, { transaction });
});
export const updateUserRole = changeUser(async (req, user, transaction) => {
  administrator(req);
  const { role } = z.object({ role: z.enum(['ADMIN', 'CENSOR', 'USER']) }).parse(req.body);
  if (user.id === req.user.id || user.email === 'admin@heartconnect.com') throw adminError('Không thể thay đổi quyền của tài khoản quản trị này.', 403);
  if (user.status === 'DELETED') throw adminError('Tài khoản đã xóa không thể phân quyền.', 409);
  await user.update({ role }, { transaction });
});
export const revokeUserVerification = changeUser(async (req, user, transaction) => {
  mayManage(req, user);
  if (!user.is_verified) return;
  await user.update({ is_verified: false }, { transaction });
  await Notification.create({ type: 'SYSTEM', user_id: user.id, message: 'Xác thực danh tính của bạn đã được thu hồi. Vui lòng cập nhật thông tin để xác thực lại.', is_read: false }, { transaction });
});
export const resetUserViolations = changeUser(async (req, user, transaction) => {
  mayManage(req, user);
  if (!user.violation_count) return;
  await user.update({ violation_count: 0 }, { transaction });
  await Notification.create({ type: 'SYSTEM', user_id: user.id, message: 'Số lần vi phạm của bạn đã được đặt lại về 0.', is_read: false }, { transaction });
});

export const deleteUser = handler(async (req, res) => {
  administrator(req);
  const id = req.params.id as string;

  await adminTransaction(async transaction => {
    const user = await User.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!user) throw adminError('Người dùng không tồn tại.', 404);
    if (user.get('id') === req.user.id) throw adminError('Bạn không thể tự xóa tài khoản của chính mình.', 403);
    if (user.get('email') === 'admin@heartconnect.com') throw adminError('Không thể xóa tài khoản Quản trị viên hệ thống.', 403);

    // 1. Delete RefreshSessions & VerificationRequests
    await RefreshSession.destroy({ where: { user_id: id }, transaction });
    await VerificationRequest.destroy({ where: { user_id: id }, transaction });

    // 2. Delete User Preferences & Interests
    await UserPreference.destroy({ where: { user_id: id }, transaction });
    await UserInterest.destroy({ where: { user_id: id }, transaction });

    // 3. Delete Swipes, Blocks, Dating Events, Pair States, Discovery Sessions & Impressions
    await UserSwipe.destroy({ where: { [Op.or]: [{ user_id: id }, { target_id: id }] }, transaction });
    await UserBlock.destroy({ where: { [Op.or]: [{ user_id: id }, { target_id: id }] }, transaction });
    await DatingEvent.destroy({ where: { [Op.or]: [{ user_id: id }, { target_id: id }] }, transaction });
    await PairState.destroy({ where: { [Op.or]: [{ user_low_id: id }, { user_high_id: id }] }, transaction });
    await DatingRequest.destroy({ where: { user_id: id }, transaction });
    await DiscoveryImpression.destroy({ where: { [Op.or]: [{ user_id: id }, { target_id: id }] }, transaction });
    await DiscoverySession.destroy({ where: { user_id: id }, transaction });

    // 4. Delete Stories
    await Story.destroy({ where: { user_id: id }, transaction });

    // 5. Delete Statuses and their Likes / Comments / Reports
    const userStatuses = await Status.findAll({ where: { user_id: id }, attributes: ['id'], transaction });
    const userStatusIds = userStatuses.map((s: any) => s.id);
    if (userStatusIds.length > 0) {
      await StatusLike.destroy({ where: { status_id: userStatusIds }, transaction });
      await StatusComment.destroy({ where: { status_id: userStatusIds }, transaction });
      await Report.destroy({ where: { reported_status_id: userStatusIds }, transaction });
      await Status.destroy({ where: { id: userStatusIds }, transaction });
    }
    // Delete likes and comments made by this user on other statuses
    await StatusLike.destroy({ where: { user_id: id }, transaction });
    await StatusComment.destroy({ where: { user_id: id }, transaction });

    // 6. Delete Matches, Conversations, and Messages
    const matches = await Match.findAll({
      where: { [Op.or]: [{ user1_id: id }, { user2_id: id }] },
      attributes: ['id'],
      transaction,
    });
    const matchIds = matches.map((m: any) => m.id);
    if (matchIds.length > 0) {
      const conversations = await Conversation.findAll({
        where: { match_id: matchIds },
        attributes: ['id'],
        transaction,
      });
      const convIds = conversations.map((c: any) => c.id);
      if (convIds.length > 0) {
        await Message.destroy({ where: { conversation_id: convIds }, transaction });
        await Conversation.destroy({ where: { id: convIds }, transaction });
      }
      await Match.destroy({ where: { id: matchIds }, transaction });
    }
    // Also delete any messages sent by this user
    await Message.destroy({ where: { sender_id: id }, transaction });

    // 7. Delete Notifications (sent or received)
    await Notification.destroy({ where: { [Op.or]: [{ user_id: id }, { from_user_id: id }] }, transaction });

    // 8. Delete Reports (reported by or reported against this user)
    await Report.destroy({ where: { [Op.or]: [{ reporter_id: id }, { reported_user_id: id }] }, transaction });

    // 9. Delete Transactions
    await Transaction.destroy({ where: { user_id: id }, transaction });

    // 10. Delete the user
    await user.destroy({ transaction });
  });

  return res.json({ success: true, message: 'Đã xóa hoàn toàn tài khoản và toàn bộ dữ liệu người dùng.' });
});

export const getAllStatuses = handler(async (req, res) => {
  const paging = pagination(req), visibility = filter(req, 'visibility', ['visible', 'hidden']);
  const { rows, count } = await Status.findAndCountAll({
    ...paging, where: { ...searchWhere(search(req), ['content', '$User.username$']), ...(visibility ? { is_hidden: visibility === 'hidden' } : {}) },
    include: [{ model: User, attributes: identity }], order: [['created_at', 'DESC'], ['id', 'ASC']], distinct: true, subQuery: false,
  });
  return res.json(pageResult(rows, count, paging));
});
export const setPostVisibility = handler(async (req, res) => {
  const body = z.object({ hidden: z.boolean() }).parse(req.body);
  const post = await Status.findByPk(req.params.id as string);
  if (!post) throw adminError('Bài viết không tồn tại.', 404);
  await post.update({ is_hidden: body.hidden, hidden_at: body.hidden ? new Date() : null });
  return res.json({ message: body.hidden ? 'Đã ẩn bài viết khỏi bảng tin.' : 'Đã khôi phục bài viết.' });
});
// Keep the old URL compatible while preserving posts and their moderation evidence.
export const deleteStatus = handler(async (req, res) => {
  const post = await Status.findByPk(req.params.id as string);
  if (!post) throw adminError('Bài viết không tồn tại.', 404);
  await post.update({ is_hidden: true, hidden_at: new Date() });
  return res.json({ message: 'Đã ẩn bài viết.' });
});

export const getAllReports = handler(async (req, res) => {
  const paging = pagination(req), status = filter(req, 'status', ['PENDING', 'RESOLVED', 'DISMISSED']);
  const { rows, count } = await Report.findAndCountAll({
    ...paging, where: { ...(status ? { status } : {}), ...searchWhere(search(req), ['reason', 'description', '$Reporter.username$', '$ReportedUser.username$']) },
    include: reportIncludes(), order: [['createdAt', 'DESC'], ['id', 'ASC']], distinct: true, subQuery: false,
  });
  return res.json(pageResult(rows, count, paging));
});
export const resolveReport = handler(async (req, res) => {
  const { status, penalize } = z.object({ status: z.enum(['RESOLVED', 'DISMISSED']), penalize: z.boolean().default(false) }).parse(req.body);
  if (penalize && status !== 'RESOLVED') throw adminError('Chỉ xử phạt khi xác nhận báo cáo vi phạm.');
  const result = await adminTransaction(async transaction => {
    const report: any = await Report.findByPk(req.params.id as string, { transaction, lock: transaction.LOCK.UPDATE });
    if (!report) throw adminError('Báo cáo không tồn tại.', 404);
    if (report.status !== 'PENDING') throw adminError('Báo cáo đã được xử lý. Hãy tải lại danh sách.', 409);
    let autoBanned = false, currentViolations = 0;
    if (penalize) {
      const post: any = report.reported_status_id ? await Status.findByPk(report.reported_status_id, { transaction }) : null;
      const targetId = report.reported_user_id || post?.user_id;
      const user: any = targetId ? await User.findByPk(targetId, { transaction, lock: transaction.LOCK.UPDATE }) : null;
      if (!user) throw adminError('Không xác định được tài khoản bị báo cáo.', 409);
      mayManage(req, user);
      const settings = await readSettings(transaction);
      const threshold = Number(settings.MAX_VIOLATIONS);
      currentViolations = (user.violation_count || 0) + 1;
      autoBanned = settings.AUTO_BAN_ENABLED === 'true' && currentViolations >= threshold;
      await user.update({ violation_count: currentViolations, ...(autoBanned ? { status: 'BANNED' } : {}) }, { transaction });
      if (autoBanned || settings.WARNING_NOTIFICATION_ENABLED === 'true') await Notification.create({
        type: 'SYSTEM', user_id: user.id, is_read: false,
        message: autoBanned ? 'Tài khoản đã bị khóa do đạt ngưỡng vi phạm cộng đồng.' :
          'Bạn nhận thêm một vi phạm cộng đồng. Số lần vi phạm hiện tại: ' + currentViolations + '/' + threshold + '.',
      }, { transaction });
    }
    await report.update({ status }, { transaction });
    return { autoBanned, currentViolations };
  });
  return res.json({ message: 'Đã xử lý báo cáo.', ...result });
});

export const DEFAULT_SETTINGS: Record<string, string> = { MAX_VIOLATIONS: '5', AUTO_BAN_ENABLED: 'true', WARNING_NOTIFICATION_ENABLED: 'true' };
async function readSettings(transaction?: any): Promise<Record<string, string>> {
  const rows = await SystemSetting.findAll({ transaction });
  return { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map(row => [row.get('key'), row.get('value')])) };
}
export const getSettingValue = async (key: string, fallback = '') => (await readSettings())[key] ?? fallback;
export const getSystemSettings = handler(async (req, res) => {
  administrator(req);
  return res.json({ settings: await readSettings() });
});
export const updateSystemSettings = handler(async (req, res) => {
  administrator(req);
  const schema = z.object({
    MAX_VIOLATIONS: z.string().regex(/^(?:[1-9]|1[0-9]|20)$/),
    AUTO_BAN_ENABLED: z.enum(['true', 'false']), WARNING_NOTIFICATION_ENABLED: z.enum(['true', 'false']),
  }).partial().strict();
  const { settings } = z.object({ settings: schema }).parse(req.body);
  if (!Object.keys(settings).length) throw adminError('Chưa có cài đặt cần lưu.');
  await adminTransaction(async transaction => {
    await SystemSetting.bulkCreate(Object.entries(settings).map(([key, value]) => ({ key, value })), { updateOnDuplicate: ['value', 'updatedAt'], transaction });
  });
  return res.json({ message: 'Đã lưu chính sách kiểm duyệt.', settings: await readSettings() });
});
