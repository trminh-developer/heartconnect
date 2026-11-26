import { createHmac } from 'node:crypto';
import { Router, type Response } from 'express';
import { Op, UniqueConstraintError, type Transaction } from 'sequelize';
import { z } from 'zod';
import { CallSession, CallParticipant, CallSignal, CallPresence, Conversation, Match, User, UserBlock } from '../../models';
import { requireAuth, type AuthRequest } from '../../middlewares/authMiddleware';
import { datingTransaction } from '../match/transactions';
import { datingError } from '../match/swipes';

const router = Router();
const active = ['ringing', 'accepted'];
const presenceCutoff = () => new Date(Date.now() - 35000);
const deviceSchema = z.object({ deviceId: z.uuid() });

async function finish(call: CallSession, status: string, reason: string, transaction: Transaction) {
  await call.update({ status, reason, ended_at: new Date() }, { transaction });
  await CallParticipant.destroy({ where: { call_id: call.get('id') }, transaction });
  // SDP and ICE contain network addresses; retain them only while a call is active.
  await CallSignal.destroy({ where: { call_id: call.get('id') }, transaction });
}

async function expire(transaction: Transaction) {
  const stale = await CallSession.findAll({ where: { [Op.or]: [
    { status: 'ringing', expires_at: { [Op.lte]: new Date() } },
    { status: 'accepted', [Op.or]: [
      { caller_seen_at: { [Op.lt]: new Date(Date.now() - 45000) } },
      { callee_seen_at: { [Op.lt]: new Date(Date.now() - 45000) } },
    ] },
  ] }, transaction, lock: transaction.LOCK.UPDATE });
  for (const call of stale) await finish(call, call.get('status') === 'ringing' ? 'missed' : 'ended', 'timeout', transaction);
}

async function participants(conversationId: string, userId: string, transaction: Transaction) {
  const conversation: any = await Conversation.findByPk(conversationId, { include: [Match], transaction });
  if (!conversation) throw datingError('Không tìm thấy cuộc trò chuyện.', 404);
  const ids = [conversation.Match?.user1_id, conversation.Match?.user2_id];
  if (!ids.includes(userId)) throw datingError('Bạn không thuộc cuộc trò chuyện này.', 403);
  const peerId = ids.find(id => id && id !== userId);
  if (!peerId) throw datingError('Không thể tự gọi cho chính mình.', 400);
  const peer = await User.findByPk(peerId, { transaction });
  if (!peer || peer.get('status') !== 'ACTIVE') throw datingError('Tài khoản nhận cuộc gọi không khả dụng.', 403);
  const blocked = await UserBlock.findOne({ where: { [Op.or]: [
    { user_id: userId, target_id: peerId }, { user_id: peerId, target_id: userId },
  ] }, transaction });
  if (blocked) throw datingError('Không thể gọi khi một trong hai người đã chặn người còn lại.', 403);
  return peerId as string;
}

async function owned(id: string, userId: string, transaction: Transaction) {
  z.uuid().parse(id);
  const call = await CallSession.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!call) throw datingError('Không tìm thấy cuộc gọi.', 404);
  if (![call.get('caller_id'), call.get('callee_id')].includes(userId)) throw datingError('Bạn không thuộc cuộc gọi này.', 403);
  if (active.includes(call.get('status') as string)) {
    try { await participants(call.get('conversation_id') as string, userId, transaction); }
    catch { await finish(call, 'ended', 'unavailable', transaction); }
  }
  return call;
}

async function snapshot(call: CallSession, userId: string, transaction: Transaction, details = false) {
  const data = call.toJSON();
  const online = await CallPresence.count({ where: { user_id: data.callee_id, seen_at: { [Op.gte]: presenceCutoff() } }, transaction });
  const peer = details ? await User.findByPk(data.caller_id === userId ? data.callee_id : data.caller_id, {
    attributes: ['id', 'username', 'first_name', 'last_name', 'avatar'], transaction,
  }) : undefined;
  return {
    id: data.id, conversationId: data.conversation_id, callerId: data.caller_id, calleeId: data.callee_id,
    mode: data.mode, status: data.status, reason: data.reason, createdAt: data.created_at,
    expiresAt: data.expires_at, acceptedAt: data.accepted_at, endedAt: data.ended_at,
    calleeOnline: online > 0, ringingAt: data.ringing_at, ...(details ? { peer } : {}),
  };
}

type Work = (req: AuthRequest, res: Response, transaction: Transaction) => Promise<unknown>;
function endpoint(work: Work) {
  return [requireAuth, async (req: AuthRequest, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      // Queue SQLite writers and commit before sending a successful response.
      let response: unknown;
      await datingTransaction(async transaction => { response = await work(req, res, transaction); });
      return res.json(response);
    } catch (error: any) {
      const status = error instanceof z.ZodError ? 400 : error instanceof UniqueConstraintError ? 409 : error.statusCode || 500;
      if (status === 500) console.error('Call API failed:', error);
      return res.status(status).json({ error: status === 400 ? 'Dữ liệu cuộc gọi không hợp lệ.' : status === 409 ? 'Một người đang có cuộc gọi khác hoặc trạng thái đã thay đổi.' : status === 500 ? 'Không thể xử lý cuộc gọi.' : error.message });
    }
  }];
}

router.post('/api/calls/presence', ...endpoint(async (req, _res, transaction) => {
  const { deviceId } = deviceSchema.parse(req.body);
  await CallPresence.upsert({ user_id: req.user.id, device_id: deviceId, seen_at: new Date() }, { transaction });
  await CallPresence.destroy({ where: { seen_at: { [Op.lt]: new Date(Date.now() - 86400000) } }, transaction });
  return { ok: true };
}));
router.delete('/api/calls/presence', ...endpoint(async (req, _res, transaction) => {
  const { deviceId } = deviceSchema.parse(req.body);
  await CallPresence.destroy({ where: { user_id: req.user.id, device_id: deviceId }, transaction });
  return { ok: true };
}));

export function iceConfiguration(userId: string) {
  const iceServers: { urls: string[]; username?: string; credential?: string }[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];
  const urls = (process.env.TURN_URLS || '').split(',').map(url => url.trim()).filter(url => /^turns?:/.test(url));
  if (urls.length && process.env.TURN_SHARED_SECRET) {
    const username = `${Math.floor(Date.now() / 1000) + 3600}:${userId}`;
    iceServers.push({ urls, username, credential: createHmac('sha1', process.env.TURN_SHARED_SECRET).update(username).digest('base64') });
  } else if (urls.length && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({ urls, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  }
  return { iceServers, relayConfigured: iceServers.length > 1 };
}
router.get('/api/calls/config', requireAuth, (req: AuthRequest, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(iceConfiguration(req.user.id));
});

router.get('/api/calls/incoming', ...endpoint(async (req, _res, transaction) => {
  await expire(transaction);
  const call = await CallSession.findOne({ where: { callee_id: req.user.id, status: 'ringing' }, transaction });
  if (!call) return { call: null };
  const checked = await owned(call.get('id') as string, req.user.id, transaction);
  if (checked.get('status') !== 'ringing') return { call: null };
  if (!checked.get('ringing_at')) await checked.update({ ringing_at: new Date() }, { transaction });
  return { call: await snapshot(checked, req.user.id, transaction, true) };
}));

router.post('/api/calls', ...endpoint(async (req, res, transaction) => {
  const { id, conversationId, mode } = z.object({ id: z.uuid(), conversationId: z.string().min(1).max(100), mode: z.enum(['audio', 'video']) }).parse(req.body);
  await expire(transaction);
  const existing = await CallSession.findByPk(id, { transaction });
  if (existing) {
    if (existing.get('caller_id') !== req.user.id || existing.get('conversation_id') !== conversationId || existing.get('mode') !== mode) throw datingError('ID cuộc gọi đã được sử dụng.', 409);
    return snapshot(existing, req.user.id, transaction, true);
  }
  const peerId = await participants(conversationId, req.user.id, transaction);
  if (await CallParticipant.count({ where: { user_id: { [Op.in]: [req.user.id, peerId] } }, transaction })) throw datingError('Người dùng đang bận.', 409);
  const call = await CallSession.create({ id, conversation_id: conversationId, caller_id: req.user.id, callee_id: peerId, mode,
    expires_at: new Date(Date.now() + 45000), caller_seen_at: new Date() }, { transaction });
  await CallParticipant.bulkCreate([{ user_id: req.user.id, call_id: id }, { user_id: peerId, call_id: id }], { transaction });
  res.status(201);
  return snapshot(call, req.user.id, transaction, true);
}));

router.get('/api/calls/:callId', ...endpoint(async (req, _res, transaction) => {
  const after = z.coerce.number().int().min(0).max(2147483647).parse(req.query.after ?? 0);
  await expire(transaction);
  const call = await owned(req.params.callId as string, req.user.id, transaction);
  if (active.includes(call.get('status') as string)) await call.update({
    [call.get('caller_id') === req.user.id ? 'caller_seen_at' : 'callee_seen_at']: new Date(),
  }, { transaction });
  const signals = await CallSignal.findAll({ where: { call_id: call.get('id'), sender_id: { [Op.ne]: req.user.id }, seq: { [Op.gt]: after } },
    order: [['seq', 'ASC']], limit: 100, attributes: ['seq', 'type', 'payload'], transaction });
  return { call: await snapshot(call, req.user.id, transaction, req.query.details === '1'), signals };
}));

router.post('/api/calls/:callId/accept', ...endpoint(async (req, _res, transaction) => {
  await expire(transaction);
  const call = await owned(req.params.callId as string, req.user.id, transaction);
  if (call.get('callee_id') !== req.user.id) throw datingError('Chỉ người nhận mới được trả lời.', 403);
  if (call.get('status') !== 'ringing') throw datingError('Cuộc gọi không còn chờ trả lời.', 409);
  await call.update({ status: 'accepted', accepted_at: new Date(), caller_seen_at: new Date(), callee_seen_at: new Date() }, { transaction });
  return snapshot(call, req.user.id, transaction, true);
}));
router.post('/api/calls/:callId/end', ...endpoint(async (req, _res, transaction) => {
  const { reason } = z.object({ reason: z.enum(['hangup', 'declined', 'failed']).default('hangup') }).parse(req.body ?? {});
  const call = await owned(req.params.callId as string, req.user.id, transaction);
  if (reason === 'declined' && (call.get('callee_id') !== req.user.id || call.get('status') === 'accepted')) throw datingError('Không thể từ chối cuộc gọi này.', 409);
  if (active.includes(call.get('status') as string)) await finish(call, reason === 'declined' ? 'declined' : 'ended', reason, transaction);
  return snapshot(call, req.user.id, transaction, true);
}));

const signalSchema = z.discriminatedUnion('type', [
  z.object({ id: z.uuid(), type: z.literal('offer'), payload: z.object({ type: z.literal('offer'), sdp: z.string().min(1).max(100000) }) }),
  z.object({ id: z.uuid(), type: z.literal('answer'), payload: z.object({ type: z.literal('answer'), sdp: z.string().min(1).max(100000) }) }),
  z.object({ id: z.uuid(), type: z.literal('candidate'), payload: z.object({ candidate: z.string().max(8192),
    sdpMid: z.string().max(100).nullable().optional(), sdpMLineIndex: z.number().int().min(0).max(100).nullable().optional(), usernameFragment: z.string().max(512).nullable().optional() }) }),
]);
router.post('/api/calls/:callId/signals', ...endpoint(async (req, _res, transaction) => {
  const signal = signalSchema.parse(req.body);
  await expire(transaction);
  const call = await owned(req.params.callId as string, req.user.id, transaction);
  if (call.get('status') !== 'accepted') throw datingError('Cuộc gọi chưa được chấp nhận hoặc đã kết thúc.', 409);
  if ((signal.type === 'offer' && call.get('caller_id') !== req.user.id) || (signal.type === 'answer' && call.get('callee_id') !== req.user.id)) throw datingError('Tín hiệu không thuộc vai trò của bạn.', 403);
  const existing = await CallSignal.findOne({ where: { request_id: signal.id }, transaction });
  if (existing) {
    if (existing.get('call_id') !== call.get('id') || existing.get('sender_id') !== req.user.id || existing.get('type') !== signal.type || JSON.stringify(existing.get('payload')) !== JSON.stringify(signal.payload)) throw datingError('ID tín hiệu đã được sử dụng.', 409);
    return { ok: true };
  }
  if (await CallSignal.count({ where: { call_id: call.get('id') }, transaction }) >= 512) throw datingError('Quá nhiều tín hiệu cuộc gọi.', 429);
  if (signal.type !== 'candidate' && await CallSignal.count({ where: { call_id: call.get('id'), type: signal.type }, transaction })) throw datingError('Tín hiệu đã được gửi.', 409);
  await CallSignal.create({ request_id: signal.id, call_id: call.get('id'), sender_id: req.user.id, type: signal.type, payload: signal.payload }, { transaction });
  return { ok: true };
}));

export default router;
