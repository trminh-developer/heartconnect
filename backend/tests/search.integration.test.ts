import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { once } from 'node:events';
import type { Server } from 'node:http';

process.env.NODE_ENV = 'test';
process.env.USE_MOCK_DB = 'true';
process.env.SQLITE_STORAGE = ':memory:';

let models: typeof import('../src/models'), server: Server, baseUrl: string;

before(async () => {
  models = await import('../src/models');
  assert.equal(models.sequelize.options.storage, ':memory:');
  const { createApp } = await import('../src/app');
  server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  baseUrl = `http://127.0.0.1:${address.port}/api/users/search`;
});
beforeEach(async () => { await models.sequelize.sync({ force: true }); });
after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  if (models) await models.sequelize.close();
});

async function make(username: string, overrides: Record<string, unknown> = {}) {
  return models.User.create({ username, email: username + '@example.test', password: 'unused-test-hash',
    first_name: username, gender: 'male', date_of_birth: '2000-01-01', ...overrides });
}
async function search(params: Record<string, string> = {}) {
  const response = await fetch(baseUrl + '?' + new URLSearchParams(params));
  assert.equal(response.status, 200);
  const users = await response.json() as any[];
  assert.ok(Array.isArray(users));
  return users;
}

test('combined filters apply before the 50-profile limit and accept legacy uppercase gender values', async () => {
  await models.User.bulkCreate(Array.from({ length: 55 }, (_, index) => ({
    username: 'a' + String(index).padStart(2, '0'), email: index + '@example.test', password: 'unused',
    gender: 'male', date_of_birth: '2000-01-01', is_online: true,
  })));
  const wanted = await make('z-wanted', { gender: 'FEMALE', is_online: true });
  await make('z-offline', { gender: 'female', is_online: false });
  await make('z-banned', { gender: 'female', is_online: true, status: 'BANNED' });
  await make('z-admin', { gender: 'female', is_online: true, role: 'ADMIN' });
  await make('z-unknown-age', { gender: 'female', is_online: true, date_of_birth: null });
  const users = await search({ gender: 'female', ageMin: '18', ageMax: '60', onlineStatus: 'online' });
  assert.deepEqual(users.map(user => user.id), [wanted.get('id')]);
  for (const field of ['password', 'email', 'latitude', 'longitude', 'UserPreference']) assert.equal(users[0][field], undefined);
  assert.equal((await search()).length, 50);
  assert.ok((await search({ gender: 'FEMALE' })).some(user => user.username === 'z-unknown-age'));
});

test('search matches Vietnamese names across fields and treats SQL wildcard characters literally', async () => {
  const person = await make('duc-minh', { first_name: 'Đức', last_name: 'Minh', bio: 'Chào mọi người' });
  const literal = await make('literal', { first_name: '100%_match\\test' });
  await make('unrelated', { bio: 'Đức Minh' });
  for (const q of ['đỨc MINH', '  Minh   Đức ', 'ĐỨC'.normalize('NFD'), '@DUC-MINH']) {
    assert.deepEqual((await search({ q })).map(user => user.id), [person.get('id')], q);
  }
  for (const q of ['%', '_', '\\']) assert.deepEqual((await search({ q })).map(user => user.id), [literal.get('id')], q);
  assert.deepEqual(await search({ q: 'CHÀO' }), []);
  assert.deepEqual(await search({ q: "' OR 1=1 --" }), []);
});

test('exact age filters include birthdays today and exclude people just outside the range', async () => {
  const today = new Date();
  const date = (age: number, days: number) => {
    const value = new Date(Date.UTC(today.getUTCFullYear() - age, today.getUTCMonth(), today.getUTCDate()));
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  };
  await make('today', { date_of_birth: date(25, 0) });
  await make('still-25', { date_of_birth: date(26, 1) });
  await make('still-24', { date_of_birth: date(25, 1) });
  await make('already-26', { date_of_birth: date(26, 0) });
  await make('unknown', { date_of_birth: null });
  assert.deepEqual((await search({ ageMin: '25', ageMax: '25' })).map(user => user.username), ['still-25', 'today']);
  const { birthdayCutoff } = await import('../src/features/user/search');
  assert.equal(birthdayCutoff(18, new Date('2028-02-29T10:00:00Z')), '2010-02-28');
});

test('pagination is stable with joined interests and offline includes legacy null status', async () => {
  const a = await make('a', { is_online: null });
  const b = await make('b', { is_online: false });
  await make('c', { is_online: false });
  await make('online', { is_online: true });
  const interest = await models.Interest.create({ name: 'Music' });
  await (a as any).addInterest(interest);
  const params = { onlineStatus: 'offline', limit: '2' };
  const first = await search(params), second = await search({ ...params, offset: '2' });
  assert.deepEqual(first.map(user => user.id), [a.get('id'), b.get('id')]);
  assert.equal(first[0].interests[0].name, 'Music');
  assert.deepEqual(second.map(user => user.username), ['c']);
  assert.deepEqual(await search({ ...params, offset: '3' }), []);
});

test('invalid filters, repeated parameters and reversed age ranges return 400 JSON errors', async () => {
  for (const query of ['ageMin=0', 'ageMax=101', 'ageMin=30&ageMax=20', 'ageMin=20.5', 'ageMin=',
    'gender=invalid', 'onlineStatus=false', 'limit=0', 'limit=51', 'limit=2&limit=3',
    'offset=-1', 'offset=1000001', 'q=one&q=two', 'q=' + 'a'.repeat(151)]) {
    const response = await fetch(baseUrl + '?' + query);
    assert.equal(response.status, 400, query);
    assert.equal(typeof (await response.json() as any).error, 'string', query);
  }
});
