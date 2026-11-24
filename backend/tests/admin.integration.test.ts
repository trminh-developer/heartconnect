import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.USE_MOCK_DB = 'true';
process.env.SQLITE_STORAGE = ':memory:';
process.env.JWT_SECRET = 'admin-integration-test-only';
let models: typeof import('../src/models'), server: Server, baseUrl: string;
let admin: any, censor: any, member: any;
before(async () => {
  models = await import('../src/models');
  assert.equal(models.sequelize.options.storage, ':memory:');
  const [{ default: adminModule }, { default: feed }] = await Promise.all([import('../src/features/admin/AdminModule'), import('../src/features/feed/FeedModule')]);
  const app = express();
  app.use(express.json(), adminModule, feed);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  baseUrl = `http://127.0.0.1:${address.port}/api`;
});
beforeEach(async () => {
  assert.equal(models.sequelize.options.storage, ':memory:');
  await models.sequelize.sync({ force: true });
  admin = await makeUser('admin', { role: 'ADMIN' });
  censor = await makeUser('censor', { role: 'CENSOR' });
  member = await makeUser('member_1');
});
after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  if (models) await models.sequelize.close();
});
async function makeUser(name: string, overrides: Record<string, unknown> = {}) {
  return (await models.User.create({ username: name, email: name + '@example.test', password: 'test-hash', first_name: name, date_of_birth: '2000-01-01', ...overrides })).toJSON();
}
async function request(path: string, actor = admin, method = 'GET', body?: unknown) {
  const response = await fetch(baseUrl + path, { method, headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: 'Bearer ' + jwt.sign({ id: actor.id }, process.env.JWT_SECRET!) } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, data: await response.json() as any };
}

test('admin data requires staff access and restricts financial, role and settings controls to administrators', async () => {
  assert.equal((await request('/admin/overview', null)).status, 401);
  assert.equal((await request('/admin/overview', member)).status, 403);
  assert.equal((await request('/admin/overview', censor)).status, 200);
  assert.equal((await request('/admin/analytics', censor)).status, 403);
  assert.equal((await request('/admin/settings', censor, 'PUT', { settings: { MAX_VIOLATIONS: '1' } })).status, 403);
  assert.equal((await request('/admin/users/' + member.id + '/role', censor, 'PUT', { role: 'ADMIN' })).status, 403);
  assert.equal((await request('/admin/users/' + admin.id + '/status', censor, 'PUT', { status: 'BANNED' })).status, 403);
  assert.equal((await request('/admin/users/' + admin.id + '/role', admin, 'PUT', { role: 'USER' })).status, 403);
});

test('users are searched, filtered and paginated on the server without credentials or large profiles', async () => {
  for (let i = 2; i <= 24; i++) await makeUser('member_' + i);
  const first = await request('/admin/users?role=USER&pageSize=10&page=1');
  const second = await request('/admin/users?role=USER&pageSize=10&page=2');
  assert.equal(first.data.total, 24);
  assert.equal(first.data.items.length, 10);
  const ids = new Set(first.data.items.map((user: any) => user.id));
  assert.equal(second.data.items.some((user: any) => ids.has(user.id)), false);
  assert.equal(first.data.items[0].password, undefined);
  const search = await request('/admin/users?q=member_24');
  assert.equal(search.data.total, 1);
  assert.equal(search.data.items[0].username, 'member_24');
  assert.equal((await request('/admin/users?page=0')).status, 400);
  assert.equal((await request('/admin/users?role=invalid')).status, 400);
  assert.equal((await request('/admin/users?pageSize=10000')).status, 400);
});

test('overview and analytics use confirmed transactions only, fill missing dates and hide money from censors', async () => {
  const tx = { user_id: member.id, provider: 'stripe', plan_id: '1_month', amount: 99000, created_at: new Date() };
  await models.Transaction.bulkCreate([{ ...tx, status: 'SUCCESS' }, { ...tx, status: 'PENDING' }, { ...tx, status: 'FAILED' }]);
  await models.User.update({ is_premium: true, premium_expires_at: new Date(Date.now() + 3 * 86400000) }, { where: { id: member.id } });
  const overview = await request('/admin/overview?days=7');
  assert.equal(overview.status, 200);
  assert.equal(overview.data.revenue, 99000);
  assert.equal(overview.data.trend.length, 7);
  assert.equal((await request('/admin/overview', censor)).data.revenue, undefined);
  const analytics = await request('/admin/analytics?days=7');
  assert.equal(analytics.status, 200);
  assert.equal(analytics.data.revenue, 99000);
  assert.equal(analytics.data.successful, 1);
  assert.equal(analytics.data.pending, 1);
  assert.equal(analytics.data.failed, 1);
  assert.equal(analytics.data.expiring, 1);
  assert.equal(analytics.data.transactions[0].user.password, undefined);
  assert.equal((await request('/admin/analytics?days=100')).status, 400);
});

test('report decisions are atomic: duplicate processing never adds a second penalty', async () => {
  await models.SystemSetting.bulkCreate([{ key: 'MAX_VIOLATIONS', value: '1' }, { key: 'AUTO_BAN_ENABLED', value: 'true' }]);
  const report = await models.Report.create({ reporter_id: admin.id, reported_user_id: member.id, reason: 'spam', description: 'Test evidence' });
  const results = await Promise.all([request('/admin/reports/' + report.get('id'), censor, 'PUT', { status: 'RESOLVED', penalize: true }), request('/admin/reports/' + report.get('id'), censor, 'PUT', { status: 'RESOLVED', penalize: true })]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  const updated = await models.User.findByPk(member.id);
  assert.equal(updated?.get('violation_count'), 1);
  assert.equal(updated?.get('status'), 'BANNED');
  assert.equal(await models.Notification.count(), 1);
});

test('hidden posts preserve evidence and disappear from public feeds; restoring makes them visible again', async () => {
  const post = await models.Status.create({ user_id: member.id, content: 'Moderation example', media_urls: [] });
  await models.StatusLike.create({ status_id: post.get('id'), user_id: admin.id });
  assert.equal((await request('/admin/feed?q=Moderation')).data.total, 1);
  assert.equal((await request('/admin/feed/' + post.get('id') + '/visibility', censor, 'PUT', { hidden: true })).status, 200);
  assert.equal(await models.Status.count(), 1);
  assert.equal(await models.StatusLike.count(), 1);
  const { getStatuses } = await import('../src/features/feed/FeedController');
  let visible: any;
  await getStatuses({ params: { userId: 'all' }, query: {} } as any, { json: (value: unknown) => { visible = value; } } as any);
  assert.equal(visible.length, 0);
  assert.equal((await request('/admin/feed?visibility=hidden')).data.total, 1);
  await request('/admin/feed/' + post.get('id') + '/visibility', admin, 'PUT', { hidden: false });
  assert.equal((await request('/admin/feed?visibility=visible')).data.total, 1);
});

test('verification images are loaded on detail only and a review cannot be applied twice', async () => {
  const verification = await models.VerificationRequest.create({ user_id: member.id, id_card_image: 'test-image', selfie_image: 'test-selfie' });
  const list = await request('/admin/verifications?status=PENDING&q=member_1');
  assert.equal(list.data.total, 1);
  assert.equal(list.data.items[0].id_card_image, undefined);
  assert.equal((await request('/admin/verifications/' + verification.get('id'))).data.id_card_image, 'test-image');
  assert.equal((await request('/admin/verifications/' + verification.get('id') + '/approve', censor, 'POST')).status, 200);
  assert.equal((await request('/admin/verifications/' + verification.get('id') + '/reject', censor, 'POST')).status, 409);
  assert.equal((await models.User.findByPk(member.id))?.get('is_verified'), true);
  assert.equal(await models.Notification.count(), 1);
});

test('settings validate values and apply warnings policy without accepting unrelated system keys', async () => {
  assert.equal((await request('/admin/settings', admin, 'PUT', { settings: { MAX_VIOLATIONS: '0' } })).status, 400);
  assert.equal((await request('/admin/settings', admin, 'PUT', { settings: { MIN_AGE: '16' } })).status, 400);
  const saved = await request('/admin/settings', admin, 'PUT', { settings: { MAX_VIOLATIONS: '7', AUTO_BAN_ENABLED: 'false', WARNING_NOTIFICATION_ENABLED: 'false' } });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.settings.MAX_VIOLATIONS, '7');
  const report = await models.Report.create({ reporter_id: admin.id, reported_user_id: member.id, reason: 'test' });
  await request('/admin/reports/' + report.get('id'), censor, 'PUT', { status: 'RESOLVED', penalize: true });
  assert.equal(await models.Notification.count(), 0);
  assert.equal((await models.User.findByPk(member.id))?.get('violation_count'), 1);
});

test('daily statistics use Vietnam calendar days around UTC midnight', async () => {
  const { period, REPORT_TIME_OFFSET_MS } = await import('../src/features/admin/adminQuery');
  const range = period({ query: { days: '7' } } as any);
  const today = new Date(Date.now() + REPORT_TIME_OFFSET_MS).toISOString().slice(0, 10);
  const justAfterVietnamMidnight = new Date(range.to.getTime() - 86400000 + 15 * 60000);
  await models.Transaction.create({ user_id: member.id, provider: 'stripe', plan_id: '1_month', amount: 99000, status: 'SUCCESS', created_at: justAfterVietnamMidnight });
  const response = await request('/admin/analytics?days=7');
  assert.equal(response.status, 200);
  assert.equal(response.data.trend.at(-1).date, today);
  assert.equal(response.data.trend.at(-1).revenue, 99000);
});

test('admin can delete a user and all related data', async () => {
  const victim = await makeUser('victim', { role: 'USER' });
  await models.Status.create({ user_id: victim.id, content: 'victim status' });
  await models.Notification.create({ user_id: victim.id, type: 'SYSTEM', message: 'test' });
  
  assert.equal((await request('/admin/users/' + victim.id, censor, 'DELETE')).status, 403);
  assert.equal((await request('/admin/users/' + admin.id, admin, 'DELETE')).status, 403);

  const res = await request('/admin/users/' + victim.id, admin, 'DELETE');
  assert.equal(res.status, 200);
  assert.equal(await models.User.findByPk(victim.id), null);
  assert.equal(await models.Status.count({ where: { user_id: victim.id } }), 0);
  assert.equal(await models.Notification.count({ where: { user_id: victim.id } }), 0);
});

test('admin search and daily statistics expressions adapt to sqlite, postgres and mysql dialects', async () => {
  const { searchWhere } = await import('../src/features/admin/adminQuery');
  const { vietnamDayExpression } = await import('../src/features/admin/AdminStatistics');
  const pgSearch: any = searchWhere('Minh', ['$user.username$'], 'postgres');
  const pgFn = pgSearch[Object.getOwnPropertySymbols(pgSearch)[0]][0].attribute;
  assert.equal(pgFn.fn, 'STRPOS');
  const sqliteSearch: any = searchWhere('Minh', ['$user.username$'], 'sqlite');
  const sqliteFn = sqliteSearch[Object.getOwnPropertySymbols(sqliteSearch)[0]][0].attribute;
  assert.equal(sqliteFn.fn, 'INSTR');

  const pgDay: any = vietnamDayExpression('createdAt', 'postgres');
  assert.equal(pgDay.fn, 'TO_CHAR');
  assert.equal(pgDay.args[0].fn, 'TIMEZONE');
  assert.equal(pgDay.args[0].args[0], 'Asia/Ho_Chi_Minh');
  assert.equal((vietnamDayExpression('createdAt', 'sqlite') as any).fn, 'DATE');
  assert.equal((vietnamDayExpression('createdAt', 'mysql') as any).args[0].fn, 'CONVERT_TZ');
});
