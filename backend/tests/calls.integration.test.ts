import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { before, beforeEach, after, test } from 'node:test';
import jwt from 'jsonwebtoken';

Object.assign(process.env, { NODE_ENV: 'test', USE_MOCK_DB: 'true', SQLITE_STORAGE: ':memory:', JWT_SECRET: 'calls-integration-test' });
let models: typeof import('../src/models'), server: Server, base: string;
let a: any, b: any, stranger: any, conversation: any;
before(async () => {
  models = await import('../src/models');
  assert.equal(models.sequelize.options.storage, ':memory:');
  const { createApp } = await import('../src/app');
  server = createApp().listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string'); base = `http://127.0.0.1:${address.port}/api`;
});
beforeEach(async () => {
  await models.sequelize.sync({ force: true });
  const make = async (username: string) => (await models.User.create({ username, email: username + '@example.test', password: 'unused', status: 'ACTIVE', last_active: new Date(), is_online: true })).toJSON();
  a = await make('caller'); b = await make('callee'); stranger = await make('stranger');
  const match = await models.Match.create({ user1_id: a.id, user2_id: b.id });
  conversation = (await models.Conversation.create({ match_id: match.get('id') })).toJSON();
});
after(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); if (models) await models.sequelize.close(); });
async function request(path: string, actor: any = a, method = 'GET', body?: unknown) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json',
    ...(actor ? { Authorization: 'Bearer ' + jwt.sign({ id: actor.id }, process.env.JWT_SECRET!) } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, data: await response.json() as any };
}
async function create(mode = 'audio', actor = a, conversationId = conversation.id) {
  return request('/calls', actor, 'POST', { id: randomUUID(), conversationId, mode });
}

test('calls require a real signed-in conversation participant, including all signaling and configuration routes', async () => {
  for (const [path, method] of [['/calls/config', 'GET'], ['/calls/incoming', 'GET'], ['/calls/presence', 'POST'], ['/calls', 'POST'], ['/calls/' + randomUUID(), 'GET']]) {
    assert.equal((await request(path, null, method)).status, 401);
  }
  assert.equal((await create('audio', stranger)).status, 403);
  assert.equal((await create('audio', a, randomUUID())).status, 404);
  assert.equal((await create('bad')).status, 400);
  const call = await create(); assert.equal(call.status, 201);
  assert.equal(call.data.callerId, a.id); assert.equal(call.data.calleeId, b.id);
  assert.equal(call.data.peer.email, undefined); assert.equal(call.data.peer.password, undefined);
  for (const [path, method, body] of [[`/calls/${call.data.id}`, 'GET', undefined], [`/calls/${call.data.id}/accept`, 'POST', {}], [`/calls/${call.data.id}/end`, 'POST', {}], [`/calls/${call.data.id}/signals`, 'POST', { id: randomUUID(), type: 'candidate', payload: { candidate: 'test' } }]] as const) {
    assert.equal((await request(path, stranger, method, body)).status, 403);
  }
});

test('offline users can be dialed without fake answering; online state comes from live per-device heartbeats', async () => {
  const call = (await create()).data;
  assert.equal(call.status, 'ringing'); assert.equal(call.calleeOnline, false);
  const device1 = randomUUID(), device2 = randomUUID();
  for (const deviceId of [device1, device2]) assert.equal((await request('/calls/presence', b, 'POST', { deviceId })).status, 200);
  assert.equal((await request(`/calls/${call.id}`)).data.call.calleeOnline, true);
  await request('/calls/presence', b, 'DELETE', { deviceId: device1 });
  assert.equal((await request(`/calls/${call.id}`)).data.call.calleeOnline, true);
  const incoming = (await request('/calls/incoming', b)).data.call;
  assert.equal(incoming.id, call.id); assert.ok(incoming.ringingAt);
  assert.equal((await request('/calls/incoming', stranger)).data.call, null);
  await models.CallPresence.update({ seen_at: new Date(Date.now() - 36000) }, { where: { user_id: b.id } });
  const state = (await request(`/calls/${call.id}`)).data.call;
  assert.equal(state.calleeOnline, false); assert.equal(state.status, 'ringing');
});

test('only the callee accepts, signaling is private, idempotent and ordered, and hangup clears SDP/ICE', async () => {
  const call = (await create('video')).data, path = `/calls/${call.id}`;
  const offer = { id: randomUUID(), type: 'offer', payload: { type: 'offer', sdp: 'v=0\r\n' } };
  assert.equal((await request(path + '/signals', a, 'POST', offer)).status, 409);
  assert.equal((await request(path + '/accept', a, 'POST', {})).status, 403);
  assert.equal((await request(path + '/accept', b, 'POST', {})).data.status, 'accepted');
  assert.equal((await request(path + '/signals', b, 'POST', offer)).status, 403);
  for (let attempt = 0; attempt < 2; attempt++) assert.equal((await request(path + '/signals', a, 'POST', offer)).status, 200);
  assert.equal((await request(path + '/signals', a, 'POST', { ...offer, payload: { type: 'offer', sdp: 'changed' } })).status, 409);
  assert.equal((await request(path + '/signals', a, 'POST', { id: randomUUID(), type: 'candidate', payload: { candidate: 'candidate:test', sdpMid: '0', sdpMLineIndex: 0 } })).status, 200);
  const received = (await request(path, b)).data.signals;
  assert.deepEqual(received.map((signal: any) => signal.type), ['offer', 'candidate']);
  assert.deepEqual((await request(path)).data.signals, []);
  assert.deepEqual((await request(path + '?after=' + received.at(-1).seq, b)).data.signals, []);
  assert.equal((await request(path + '/signals', b, 'POST', { id: randomUUID(), type: 'answer', payload: { type: 'answer', sdp: 'v=0\r\n' } })).status, 200);
  assert.equal((await request(path)).data.signals[0].type, 'answer');
  assert.equal((await request(path + '/end', b, 'POST', {})).data.status, 'ended');
  assert.equal((await request(path)).data.call.status, 'ended');
  assert.equal((await request(path + '/end', a, 'POST', {})).status, 200);
  assert.equal(await models.CallSignal.count(), 0); assert.equal(await models.CallParticipant.count(), 0);
});

test('a busy user cannot receive concurrent calls and a decline releases both participants', async () => {
  const match = await models.Match.create({ user1_id: stranger.id, user2_id: b.id });
  const otherConversation = await models.Conversation.create({ match_id: match.get('id') });
  const results = await Promise.all([create(), create('video', stranger, otherConversation.get('id') as string)]);
  assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
  const winner = results.find(result => result.status === 201)!.data;
  assert.equal((await request(`/calls/${winner.id}/end`, b, 'POST', { reason: 'declined' })).data.status, 'declined');
  assert.equal((await create()).status, 201);
});

test('unanswered and disconnected calls expire and release reservations without a running timer process', async () => {
  const missed = (await create()).data;
  await models.CallSession.update({ expires_at: new Date(Date.now() - 1) }, { where: { id: missed.id } });
  assert.equal((await request(`/calls/${missed.id}`)).data.call.status, 'missed');
  assert.equal((await request(`/calls/${missed.id}/accept`, b, 'POST', {})).status, 409);
  const disconnected = (await create()).data;
  await request(`/calls/${disconnected.id}/accept`, b, 'POST', {});
  await models.CallSession.update({ callee_seen_at: new Date(Date.now() - 46000) }, { where: { id: disconnected.id } });
  assert.equal((await request(`/calls/${disconnected.id}`)).data.call.status, 'ended');
  assert.equal(await models.CallParticipant.count(), 0);
});

test('blocking or deleting a participant stops calls and prevents new signaling', async () => {
  const call = (await create()).data;
  await models.UserBlock.create({ user_id: b.id, target_id: a.id });
  assert.equal((await request(`/calls/${call.id}`)).data.call.status, 'ended');
  assert.equal((await create()).status, 403);
  await models.UserBlock.destroy({ where: {} });
  const next = (await create()).data;
  await models.User.destroy({ where: { id: b.id } });
  assert.equal(await models.CallSession.count({ where: { id: next.id } }), 0);
  assert.equal(await models.CallParticipant.count(), 0);
});

test('TURN credentials are short lived and the server shared secret is never returned', async () => {
  const { iceConfiguration } = await import('../src/features/call/CallModule');
  const previous = { urls: process.env.TURN_URLS, secret: process.env.TURN_SHARED_SECRET };
  try {
    process.env.TURN_URLS = 'turn:relay.example.test:3478,turns:relay.example.test:5349'; process.env.TURN_SHARED_SECRET = 'test-secret-never-returned';
    const config = iceConfiguration(a.id); assert.equal(config.relayConfigured, true);
    assert.ok(Number(config.iceServers[1].username!.split(':')[0]) > Date.now() / 1000 + 3500);
    assert.ok(!JSON.stringify(config).includes(process.env.TURN_SHARED_SECRET));
  } finally {
    if (previous.urls === undefined) delete process.env.TURN_URLS; else process.env.TURN_URLS = previous.urls;
    if (previous.secret === undefined) delete process.env.TURN_SHARED_SECRET; else process.env.TURN_SHARED_SECRET = previous.secret;
  }
});
