import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { once } from 'node:events';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

process.env.NODE_ENV = 'test';
process.env.USE_MOCK_DB = 'true';
process.env.SQLITE_STORAGE = ':memory:';
process.env.JWT_SECRET = 'all-api-integration-test';
process.env.REFRESH_SECRET = 'all-api-refresh-test';
process.env.BANK_PAYMENT_MODE = 'direct';
let models: typeof import('../src/models'), server: Server, baseUrl: string;
let member: any, other: any, admin: any;
let ready = true;

before(async () => {
  models = await import('../src/models');
  assert.equal(models.sequelize.options.storage, ':memory:');
  const { createApp } = await import('../src/app');
  server = createApp(() => ready).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  baseUrl = `http://127.0.0.1:${address.port}/api`;
});
beforeEach(async () => {
  ready = true;
  await models.sequelize.sync({ force: true });
  const password = await bcrypt.hash('password-test-123', 4);
  const make = async (username: string, role = 'USER') => (await models.User.create({
    username, email: username + '@example.test', password, first_name: username,
    date_of_birth: '2000-01-01', gender: 'male', role, status: 'ACTIVE', last_active: new Date(),
  })).toJSON();
  member = await make('member');
  other = await make('other');
  admin = await make('admin', 'ADMIN');
  (await import('../src/features/match/recommendations')).clearInterestCatalogueCache();
});
after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  if (models) await models.sequelize.close();
});
async function request(path: string, actor: any = member, method = 'GET', body?: unknown, cookie?: string) {
  const response = await fetch(baseUrl + path, { method, headers: {
    'Content-Type': 'application/json',
    ...(actor ? { Authorization: 'Bearer ' + jwt.sign({ id: actor.id }, process.env.JWT_SECRET!) } : {}),
    ...(cookie ? { Cookie: cookie } : {}),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.match(response.headers.get('content-type') || '', /application\/json/, path);
  return { status: response.status, data: await response.json() as any, cookies: response.headers.getSetCookie() };
}

test('the complete app mounts every view API, returns JSON and blocks requests until the database is ready', async () => {
  for (const [path, actor] of [
    ['/health', null], ['', null], ['/users', member], ['/users/recommended', member],
    ['/users/nearby', member], ['/users/search?q=other', member], ['/users/discover', member],
    ['/users/' + member.id, member], ['/users/username/member', member], ['/auth/me', member],
    ['/feed/all', null], ['/feed/' + member.id, member],
    ['/stories', member],
    ['/messages/conversations/' + member.id, member], ['/matches/' + member.id, member],
    ['/matches/who-liked-me/' + member.id, member], ['/matches/who-i-liked/' + member.id, member],
    ['/notifications/' + member.id, member], ['/notifications/unread-count/' + member.id, member],
    ['/payments/methods', null], ['/payments/bank/pending', admin],
    ['/admin/overview', admin], ['/admin/analytics', admin], ['/admin/users?q=member', admin],
    ['/admin/feed', admin], ['/admin/reports', admin], ['/admin/verifications', admin], ['/admin/settings', admin],
  ] as const) {
    const result = await request(path, actor);
    assert.equal(result.status, 200, path + ': ' + result.data.error);
  }
  for (const path of ['/users/discover', '/admin/overview', '/payments/bank/pending', '/messages/conversations/qa', '/notifications/qa']) {
    assert.equal((await request(path, null)).status, 401, path);
  }
  assert.equal((await request('/not-a-route', null)).status, 404);
  ready = false;
  assert.equal((await request('/health', null)).status, 503);
  assert.equal((await request('/users', null)).status, 503);
  ready = true;
  assert.equal((await request('/health', null)).data.apiVersion, 2);
});

test('invalid registration and login return validation errors instead of server errors', async () => {
  for (const body of [{}, { email: 'invalid', password: '123' }]) {
    const invalid = await request('/auth/register', null, 'POST', body);
    assert.equal(invalid.status, 400);
    assert.equal(typeof invalid.data.error, 'string');
    assert.equal((await request('/auth/login', null, 'POST', body)).status, 400);
  }
});

test('search and nearby return public profiles, and keyword searches do not return unrelated users', async () => {
  const found = await request('/users/search?q=other', null);
  assert.equal(found.status, 200);
  assert.deepEqual(found.data.map((user: any) => user.id), [other.id]);
  for (const path of ['/users/search', '/users/nearby']) {
    const profiles = await request(path, null);
    assert.ok(profiles.data.length > 0);
    for (const profile of profiles.data) {
      for (const field of ['password', 'email', 'latitude', 'longitude', 'UserPreference']) assert.equal(profile[field], undefined, path + ': ' + field);
    }
  }
});

test('registration, cookie login, current user, refresh and logout work without exposing password hashes', async () => {
  const registered = await request('/auth/register', null, 'POST', {
    email: 'new@example.test', password: 'password-test-123', firstName: 'New', lastName: 'User', gender: 'FEMALE', dateOfBirth: '2000-01-01',
  });
  assert.equal(registered.status, 201);
  assert.equal(registered.data.user.password, undefined);
  assert.equal(registered.cookies.length, 2);
  const login = await request('/auth/login', null, 'POST', { email: member.email, password: 'password-test-123' });
  assert.equal(login.status, 200);
  const cookies = login.cookies.map(cookie => cookie.split(';')[0]).join('; ');
  assert.equal((await request('/auth/me', null, 'GET', undefined, cookies)).data.id, member.id);
  assert.equal((await request('/auth/refresh', null, 'POST', {}, cookies)).status, 200);
  const logout = await request('/auth/logout', null, 'POST', {}, cookies);
  assert.equal(logout.status, 200);
  assert.ok(logout.cookies.every(cookie => cookie.includes('Expires=Thu, 01 Jan 1970')));
  await models.User.update({ status: 'BANNED' }, { where: { id: member.id } });
  assert.equal((await request('/auth/login', null, 'POST', { email: member.email, password: 'password-test-123' })).status, 403);
});

test('feed creation, repeated likes, comments and deletion persist and validate bad requests', async () => {
  assert.equal((await request('/feed', member, 'POST', { content: '' })).status, 400);
  const created = await request('/feed', member, 'POST', { content: 'API test post', mediaUrls: [] });
  assert.equal(created.status, 200);
  const id = created.data.status.id;
  for (let attempt = 0; attempt < 2; attempt++) assert.equal((await request('/feed/like', other, 'POST', { statusId: id, isLiked: true })).status, 200);
  const feed = await request('/feed/all', other);
  assert.equal(feed.data[0].likesCount, 1);
  assert.equal(feed.data[0].hasLiked, true);
  assert.equal((await request('/feed/like', other, 'POST', { statusId: id, isLiked: false })).status, 200);
  assert.equal((await request('/feed/comment', other, 'POST', { statusId: id, content: '' })).status, 400);
  assert.equal((await request('/feed/comment', other, 'POST', { statusId: id, content: 'Test comment' })).status, 200);
  assert.equal((await request('/feed/' + id + '/comments', member)).data[0].content, 'Test comment');
  assert.equal((await request('/feed/' + id, other, 'PUT', { content: 'Hacked content' })).status, 403);
  const updated = await request('/feed/' + id, member, 'PUT', { content: 'Updated content' });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.status.content, 'Updated content');
  assert.equal((await request('/feed/' + id + '/report', member, 'POST', { reason: 'Self report' })).status, 400);
  const reported = await request('/feed/' + id + '/report', other, 'POST', { reason: 'Spam', details: 'Spam post' });
  assert.equal(reported.status, 200);
  assert.equal((await request('/feed/' + id, other, 'DELETE')).status, 403);
  assert.equal((await request('/feed/' + id, member, 'DELETE')).status, 200);
  assert.equal((await request('/feed/all', member)).data.length, 0);
});

test('notifications expose the sender safely and support read and mark-all-read actions', async () => {
  const created = await request('/notifications', admin, 'POST', { userId: member.id, fromUserId: other.id, type: 'SYSTEM', message: 'Test notification' });
  assert.equal(created.status, 200);
  const list = await request('/notifications/' + member.id);
  assert.equal(list.data[0].fromUser.id, other.id);
  assert.ok(!JSON.stringify(list.data).includes(other.password));
  assert.equal((await request('/notifications/unread-count/' + member.id)).data.count, 1);
  assert.equal((await request('/notifications/' + created.data.id + '/read', member, 'PUT', {})).status, 200);
  assert.equal((await request('/notifications/mark-all-read/' + member.id, member, 'PUT', {})).status, 200);
  assert.equal((await request('/notifications/unread-count/' + member.id)).data.count, 0);
});

test('chat send, unread counts, read, recall and delete are restricted to conversation participants', async () => {
  const match = await models.Match.create({ user1_id: member.id, user2_id: other.id });
  const conversation = await models.Conversation.create({ match_id: match.get('id') });
  const id = conversation.get('id');
  assert.equal((await request('/messages', member, 'POST', { conversationId: id, content: '' })).status, 400);
  const sent = await request('/messages', member, 'POST', { conversationId: id, content: 'Hello', type: 'TEXT' });
  assert.equal(sent.status, 200);
  const chats = await request('/messages/conversations/' + other.id, other);
  assert.ok(!JSON.stringify(chats.data).includes(member.password));
  assert.equal(chats.data[0].unreadCount, 1);
  assert.equal((await request('/messages/' + id + '/read', other, 'PUT', {})).status, 200);
  assert.equal((await request('/messages/conversations/' + other.id, other)).data[0].unreadCount, 0);
  const outsider = (await models.User.create({ username: 'outsider', email: 'outsider@example.test', password: 'test' })).toJSON();
  assert.equal((await request('/messages/' + id + '/read', outsider, 'PUT', {})).status, 403);
  assert.equal((await request('/messages/' + sent.data.id, outsider, 'DELETE')).status, 403);
  assert.equal((await request('/messages/' + sent.data.id + '/recall', other, 'PUT', {})).status, 403);
  assert.equal((await request('/messages/' + sent.data.id + '/recall', member, 'PUT', {})).status, 200);
  assert.equal((await request('/messages/' + sent.data.id, other, 'DELETE')).status, 200);
  assert.equal((await request('/messages/' + id, other)).data.length, 0);
});

test('reports sent from the profile API enter the admin queue', async () => {
  const result = await request('/users/report', member, 'POST', { reportedId: other.id, reason: 'Spam', details: 'Test report' });
  assert.equal(result.status, 200);
  const queue = await request('/admin/reports', admin);
  assert.equal(queue.data.total, 1);
  assert.equal(queue.data.items[0].reported_user_id, other.id);
});

test('refresh sessions are hashed, single use under concurrency and revoked by logout without a body', async () => {
  const login = () => request('/auth/login', null, 'POST', { email: member.email, password: 'password-test-123' });
  const first = await login(), second = await login();
  assert.notEqual(first.data.refreshToken, second.data.refreshToken);
  const sessions = await models.RefreshSession.findAll();
  assert.equal(sessions.length, 2);
  assert.ok(sessions.every(session => /^[a-f0-9]{64}$/.test(session.get('token_hash') as string)));
  const token = first.data.refreshToken;
  const attempts = await Promise.all([
    request('/auth/refresh', null, 'POST', { token }),
    request('/auth/refresh', null, 'POST', { token }),
  ]);
  assert.deepEqual(attempts.map(result => result.status).sort(), [200, 403]);
  const rotated = attempts.find(result => result.status === 200)!;
  assert.notEqual(rotated.data.refreshToken, token);
  assert.equal((await request('/auth/refresh', null, 'POST', { token })).status, 403);
  const cookie = rotated.cookies.map(value => value.split(';')[0]).join('; ');
  const cookieRefresh = await request('/auth/refresh', null, 'POST', undefined, cookie);
  assert.equal(cookieRefresh.status, 200);
  const activeCookie = cookieRefresh.cookies.map(value => value.split(';')[0]).join('; ');
  assert.equal((await request('/auth/logout', null, 'POST', undefined, activeCookie)).status, 200);
  assert.equal((await request('/auth/refresh', null, 'POST', { token: cookieRefresh.data.refreshToken })).status, 403);
  assert.equal((await request('/auth/refresh', null, 'POST')).status, 401);
  assert.equal((await request('/auth/logout', null, 'POST')).status, 200);
  const untracked = jwt.sign({ id: member.id }, process.env.REFRESH_SECRET!);
  assert.equal((await request('/auth/refresh', null, 'POST', { token: untracked })).status, 403);
});

test('suspended accounts lose current-user and refresh access; bearer credentials take precedence over stale cookies', async () => {
  const login = await request('/auth/login', null, 'POST', { email: member.email, password: 'password-test-123' });
  assert.equal((await request('/auth/me', other, 'GET', undefined, 'accessToken=expired-cookie')).data.id, other.id);
  for (const status of ['BANNED', 'DELETED']) {
    await models.User.update({ status }, { where: { id: member.id } });
    assert.equal((await request('/auth/me', member)).status, 403);
    assert.equal((await request('/auth/refresh', null, 'POST', { token: login.data.refreshToken })).status, 403);
  }
});

test('changing a password revokes existing refresh sessions and the new password can sign in', async () => {
  const login = await request('/auth/login', null, 'POST', { email: member.email, password: 'password-test-123' });
  assert.equal((await request('/users/' + member.id, member, 'PUT', { password: 'new-password-456' })).status, 400);
  assert.equal((await request('/users/' + member.id, member, 'PUT', { password: 'new-password-456', currentPassword: 'incorrect-password' })).status, 400);
  assert.equal(await models.RefreshSession.count(), 1);
  const saved = await request('/users/' + member.id, member, 'PUT', { password: 'new-password-456', currentPassword: 'password-test-123' });
  assert.equal(saved.status, 200);
  assert.equal(await models.RefreshSession.count(), 0);
  assert.equal((await request('/auth/refresh', null, 'POST', { token: login.data.refreshToken })).status, 403);
  assert.equal((await request('/auth/login', null, 'POST', { email: member.email, password: 'password-test-123' })).status, 401);
  assert.equal((await request('/auth/login', null, 'POST', { email: member.email, password: 'new-password-456' })).status, 200);
});

test('registration validates usernames and real adult birth dates and normalizes email addresses', async () => {
  const valid = { email: ' Fresh@Example.Test ', password: 'password-test-123', firstName: ' Fresh ', lastName: ' User ', gender: 'FEMALE', dateOfBirth: '2000-01-01', username: 'fresh.user' };
  for (const invalid of [
    { dateOfBirth: '2000-02-30' }, { dateOfBirth: '2099-01-01' },
    { dateOfBirth: '1900-01-01' }, { dateOfBirth: '01/01/2000' },
    { dateOfBirth: new Date().toISOString().slice(0, 10) },
    { username: 'x' }, { username: 'bad username' }, { username: { admin: true } },
    { firstName: '   ' },
  ]) assert.equal((await request('/auth/register', null, 'POST', { ...valid, ...invalid })).status, 400, JSON.stringify(invalid));
  const registered = await request('/auth/register', null, 'POST', valid);
  assert.equal(registered.status, 201);
  assert.equal(registered.data.user.email, 'fresh@example.test');
  assert.equal(registered.data.user.first_name, 'Fresh');
  assert.equal((await request('/auth/login', null, 'POST', { email: ' FRESH@EXAMPLE.TEST ', password: valid.password })).status, 200);
  assert.equal((await request('/auth/register', null, 'POST', { ...valid, email: 'another@example.test' })).status, 409);
  assert.equal((await request('/users/' + member.id, member, 'PUT', { dateOfBirth: '2000-02-30' })).status, 400);
});

test('registration rolls back the account when its session cannot be persisted', async context => {
  context.mock.method(models.RefreshSession, 'create', async () => { throw new Error('Session persistence test'); });
  const result = await request('/auth/register', null, 'POST', { email: 'rollback@example.test', password: 'password-test-123', firstName: 'New', lastName: 'User', gender: 'MALE', dateOfBirth: '2000-01-01' });
  assert.equal(result.status, 500);
  assert.equal(await models.User.count({ where: { email: 'rollback@example.test' } }), 0);
});

test('feed pagination rejects invalid queries and hidden posts do not expose their comments', async () => {
  for (const query of ['page=0', 'page=-1', 'page=1.5', 'page=1oops', 'page=100001', 'limit=0', 'limit=-1', 'limit=101', 'limit=oops', 'limit=1&limit=2']) {
    assert.equal((await request('/feed/all?' + query)).status, 400, query);
  }
  const post = await models.Status.create({ user_id: member.id, content: 'Moderated post', is_hidden: true });
  const id = post.get('id');
  await models.StatusComment.create({ status_id: id, user_id: other.id, content: 'Hidden evidence' });
  assert.equal((await request('/feed/' + id + '/comments')).status, 404);
  await post.update({ is_hidden: false });
  assert.equal((await request('/feed/' + id + '/comments')).data.length, 1);
  assert.equal((await request('/feed/missing/comments')).status, 404);
});

test('notification creation validates payloads and missing users without inserting invalid records', async () => {
  for (const body of [{}, { userId: member.id, type: 'OTHER', message: 'Test' }, { userId: member.id, type: 'SYSTEM', message: '   ' }]) {
    assert.equal((await request('/notifications', admin, 'POST', body)).status, 400);
  }
  assert.equal((await request('/notifications', admin, 'POST', { userId: 'missing', type: 'SYSTEM', message: 'Test' })).status, 404);
  assert.equal((await request('/notifications', admin, 'POST', { userId: member.id, fromUserId: 'missing', type: 'SYSTEM', message: 'Test' })).status, 404);
  assert.equal(await models.Notification.count(), 0);
});

test('reading a conversation persists seen status only for messages from the other participant', async () => {
  const match = await models.Match.create({ user1_id: member.id, user2_id: other.id });
  const conversation = await models.Conversation.create({ match_id: match.get('id') });
  const id = conversation.get('id');
  const sent = await request('/messages', member, 'POST', { conversationId: id, content: 'Incoming' });
  const reply = await request('/messages', other, 'POST', { conversationId: id, content: 'Outgoing' });
  assert.equal((await request('/messages/' + id + '/read', other, 'PUT')).status, 200);
  assert.equal((await models.Message.findByPk(sent.data.id))?.get('status'), 'seen');
  assert.equal((await models.Message.findByPk(reply.data.id))?.get('status'), 'sent');
});

test('unconfigured recovery endpoints report unavailable instead of claiming to reset a password', async () => {
  for (const path of ['forgot-password', 'verify-otp', 'reset-password']) {
    const result = await request('/auth/' + path, null, 'POST', { email: member.email, otp: '123456', password: 'changed-password' });
    assert.equal(result.status, 501);
    assert.equal(result.data.success, undefined);
    assert.match(result.data.error, /not configured/);
  }
  const saved = await models.User.findByPk(member.id);
  assert.equal(await bcrypt.compare('password-test-123', saved!.get('password') as string), true);
});

test('stories persist with the authenticated author and server-controlled expiry and restrict deletion', async () => {
  assert.equal((await request('/stories', null)).status, 401);
  assert.equal((await request('/stories', null, 'POST', { mediaType: 'text', textContent: 'Unauthorized' })).status, 401);
  const started = Date.now();
  const created = await request('/stories', member, 'POST', { userId: other.id, mediaType: 'text', textContent: ' Persistent story ', backgroundColor: '#ff6b6b', expiresAt: '2099-01-01' });
  assert.equal(created.status, 201);
  assert.equal(created.data.userId, member.id);
  assert.equal(created.data.textContent, 'Persistent story');
  assert.ok(Math.abs(new Date(created.data.expiresAt).getTime() - started - 86400000) < 5000);
  assert.equal(await models.Story.count(), 1);
  const list = await request('/stories', other);
  assert.equal(list.data[0].id, created.data.id);
  assert.equal(list.data[0].user.password, undefined);
  assert.equal(list.data[0].user.email, undefined);
  assert.equal((await request('/stories/' + created.data.id, other, 'DELETE')).status, 403);
  assert.equal((await request('/stories/' + created.data.id, member, 'DELETE')).status, 200);
  assert.equal((await request('/stories/' + created.data.id, member, 'DELETE')).status, 404);
  const second = await request('/stories', member, 'POST', { mediaType: 'text', textContent: 'Moderation' });
  assert.equal((await request('/stories/' + second.data.id, admin, 'DELETE')).status, 200);
});

test('stories validate content and media and exclude expired, blocked and suspended authors', async () => {
  for (const body of [
    {}, { mediaType: 'text', textContent: ' ' }, { mediaType: 'text', textContent: 'Text', backgroundColor: 'url(script)' },
    { mediaType: 'image' }, { mediaType: 'image', mediaUrl: 'javascript:alert(1)' },
    { mediaType: 'video', mediaUrl: 'data:image/png;base64,aGVsbG8=' },
  ]) assert.equal((await request('/stories', member, 'POST', body)).status, 400);
  const image = await request('/stories', other, 'POST', { mediaType: 'image', mediaUrl: 'data:image/png;base64,aGVsbG8=' });
  assert.equal(image.status, 201);
  assert.equal((await request('/stories', member)).data.length, 1);
  await models.Story.update({ expires_at: new Date(Date.now() - 1000) }, { where: { id: image.data.id } });
  assert.equal((await request('/stories', member)).data.length, 0);
  await models.Story.update({ expires_at: new Date(Date.now() + 60000) }, { where: { id: image.data.id } });
  await models.User.update({ status: 'BANNED' }, { where: { id: other.id } });
  assert.equal((await request('/stories', member)).data.length, 0);
  await models.User.update({ status: 'ACTIVE' }, { where: { id: other.id } });
  await models.UserBlock.create({ user_id: other.id, target_id: member.id });
  assert.equal((await request('/stories', member)).data.length, 0);
  assert.equal((await request('/stories', other)).data.length, 1);
});
