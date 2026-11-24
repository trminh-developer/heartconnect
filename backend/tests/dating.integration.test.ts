import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.USE_MOCK_DB = 'true';
process.env.SQLITE_STORAGE = ':memory:';
process.env.JWT_SECRET = 'dating-integration-test-only';

let models: typeof import('../src/models');
let server: Server;
let baseUrl: string;

before(async () => {
  models = await import('../src/models');
  assert.equal(models.sequelize.options.storage, ':memory:');
  const [{ default: users }, { default: matches }, { initAuthModule }, { default: messages }] = await Promise.all([
    import('../src/features/user/UserModule'), import('../src/features/match/MatchModule'), import('../src/features/auth/AuthModule'),
    import('../src/features/message/MessageModule'),
  ]);
  const app = express();
  app.use(express.json(), cookieParser(), users, matches, messages);
  app.use('/api/auth', initAuthModule());
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  baseUrl = `http://127.0.0.1:${address.port}/api`;
});

beforeEach(async () => {
  assert.equal(models.sequelize.options.storage, ':memory:');
  await models.sequelize.sync({ force: true });
  (await import('../src/features/match/recommendations')).clearInterestCatalogueCache();
});

after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  if (models) await models.sequelize.close();
});

async function user(label: string, overrides: Record<string, unknown> = {}) {
  return (await models.User.create({
    email: `${label}@example.test`, username: label, password: 'test-hash', first_name: label,
    date_of_birth: '2000-01-01', gender: 'male', role: 'USER', status: 'ACTIVE', ...overrides,
    location_updated_at: new Date(),
  })).toJSON();
}

async function request(path: string, actor?: string, method = 'GET', body?: unknown) {
  const response = await fetch(baseUrl + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: `Bearer ${jwt.sign({ id: actor }, process.env.JWT_SECRET!)}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, data: await response.json() as any };
}

test('a single like stays pending; reciprocal likes create exactly one match and conversation', async () => {
  const a = await user('alice');
  const b = await user('bob');
  const initial = await request('/matches/like', a.id, 'POST', { targetId: b.id, userId: b.id });
  assert.equal(initial.status, 200);
  assert.equal(initial.data.matched, false);
  assert.equal(await models.Match.count(), 0);
  assert.equal(await models.Conversation.count(), 0);
  assert.equal((await request('/matches/who-liked-me/' + b.id, b.id)).data[0].id, a.id);
  assert.equal((await request('/matches/who-i-liked/' + a.id, a.id)).data[0].id, b.id);
  await request('/matches/like', a.id, 'POST', { targetId: b.id });
  assert.equal(await models.Notification.count(), 1);
  const result = await request('/matches/superlike', b.id, 'POST', { targetId: a.id });
  assert.equal(result.data.matched, true);
  assert.equal(result.data.match.is_new, true);
  assert.equal(result.data.match.match_percentage, null);
  assert.equal(result.data.match.matched_user.password, undefined);
  const repeated = await request('/matches/like', b.id, 'POST', { targetId: a.id });
  assert.equal(repeated.data.match.is_new, false);
  assert.equal(await models.Match.count(), 1);
  assert.equal(await models.Conversation.count(), 1);
  assert.equal(await models.Notification.count(), 3);
  assert.equal((await request('/matches/' + a.id, a.id)).data[0].match_percentage, null);
  assert.equal((await request('/users/recommended', a.id)).data.length, 0);
});

test('recommendations remember decisions and exclude matches, blocks, suspended users and reciprocal rejection', async () => {
  const a = await user('viewer');
  const passed = await user('passed');
  const liked = await user('liked');
  const rejected = await user('rejected');
  const blocked = await user('blocked');
  const blocker = await user('blocker');
  const matched = await user('matched');
  const eligible = await user('eligible');
  await user('banned', { status: 'BANNED' });
  await user('deleted', { status: 'DELETED' });
  await user('admin', { role: 'ADMIN' });
  await user('minor', { date_of_birth: '2015-01-01' });
  await user('unknown-birthday', { date_of_birth: null });
  await request('/matches/pass', a.id, 'POST', { targetId: passed.id });
  await request('/matches/like', a.id, 'POST', { targetId: liked.id });
  await request('/matches/pass', rejected.id, 'POST', { targetId: a.id });
  await request('/users/block', a.id, 'POST', { blockedId: blocked.id });
  await request('/users/block', blocker.id, 'POST', { blockedId: a.id, blockerId: a.id });
  await models.Match.create({ user1_id: matched.id, user2_id: a.id, match_percentage: 99 });
  const result = await request('/users/recommended', a.id);
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.map((profile: any) => profile.id), [eligible.id]);
  for (const key of ['password', 'email', 'latitude', 'longitude', 'UserPreference']) assert.equal(result.data[0][key], undefined);
  assert.equal((await request('/matches/like', a.id, 'POST', { targetId: blocker.id })).status, 403);
  assert.equal((await request('/matches/like', a.id, 'POST', { targetId: a.id })).status, 400);
  assert.equal((await request('/matches/like', a.id, 'POST', { targetId: 'missing' })).status, 404);
  assert.equal((await request('/matches/who-liked-me/' + a.id, eligible.id)).status, 403);
});

test('preferences persist, normalize UI enums, reload in auth and filter in both directions', async () => {
  const a = await user('viewer');
  const b = await user('suitable', { gender: 'female', latitude: 0, longitude: 0.01 });
  await user('wrong-gender');
  const unwilling = await user('unwilling', { gender: 'female' });
  await models.UserPreference.create({ user_id: unwilling.id, preferred_gender: ['female'] });
  const far = await user('far', { gender: 'female', latitude: 0, longitude: 0.2 });
  const saved = await request('/users/' + a.id, a.id, 'PUT', {
    location: { latitude: 0, longitude: 0 }, relationshipGoal: 'Mối quan hệ nghiêm túc',
    datingPreference: { preferredGender: ['FEMALE'], ageRange: { min: 24, max: 30 }, maxDistance: 10, relationshipGoal: 'Mối quan hệ nghiêm túc' },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.user.password, undefined);
  assert.deepEqual(saved.data.user.UserPreference.preferred_gender, ['female']);
  assert.equal(saved.data.user.UserPreference.relationship_goal, 'LONG_TERM');
  const reloaded = await request('/auth/me', a.id);
  assert.equal(reloaded.data.UserPreference.age_max, 30);
  assert.equal(reloaded.data.latitude, 0);
  assert.deepEqual((await request('/users/recommended', a.id)).data.map((profile: any) => profile.id), [b.id]);
  assert.equal((await request('/matches/like', a.id, 'POST', { targetId: far.id })).status, 400);
  assert.equal((await request('/users/' + a.id, a.id, 'PUT', { datingPreference: { ageRange: { min: 40 } } })).status, 400);
  assert.equal((await models.UserPreference.findOne({ where: { user_id: a.id } }))?.get('age_min'), 24);
  for (const datingPreference of [{ maxDistance: -1 }, { ageRange: { min: 17 } }, { preferredGender: ['invalid'] }]) {
    assert.equal((await request('/users/' + a.id, a.id, 'PUT', { datingPreference })).status, 400);
  }
});

test('profile and settings saves accept the unset app logo returned by the API', async () => {
  const a = await user('editor');
  const original = await request('/auth/me', a.id);
  assert.equal(original.data.app_logo, null);

  for (const changes of [
    { bio: 'Updated profile', profession: 'Developer' },
    { isOnline: false },
    { datingPreference: { preferredGender: ['FEMALE'], maxDistance: 25 } },
  ]) {
    const saved = await request('/users/' + a.id, a.id, 'PUT', { ...changes, appLogo: original.data.app_logo });
    assert.equal(saved.status, 200, saved.data.error);
    assert.equal(saved.data.user.app_logo, null);
    assert.equal(saved.data.user.password, undefined);
  }

  const reloaded = await request('/auth/me', a.id);
  assert.equal(reloaded.data.bio, 'Updated profile');
  assert.equal(reloaded.data.profession, 'Developer');
  assert.equal(reloaded.data.is_online, false);
  assert.deepEqual(reloaded.data.UserPreference.preferred_gender, ['female']);
  assert.equal(reloaded.data.UserPreference.max_distance, 25);
});

test('partial profile edits preserve identity cooldowns, GPS and unrelated preferences', async () => {
  const changedAt = new Date();
  const a = await user('editor', { name_changed_at: changedAt, username_changed_at: changedAt, latitude: 0, longitude: 0 });
  await models.UserPreference.create({ user_id: a.id, age_min: 24, age_max: 35, max_distance: 100, preferred_gender: ['female'] });

  const saved = await request('/users/' + a.id, a.id, 'PUT', { bio: 'Bio during cooldown', location: { city: 'HCM' } });
  assert.equal(saved.status, 200, saved.data.error);
  assert.equal(saved.data.user.first_name, 'editor');
  assert.equal(saved.data.user.username, 'editor');
  assert.equal(saved.data.user.name_changed_at, changedAt.toISOString());
  assert.equal(saved.data.user.username_changed_at, changedAt.toISOString());
  assert.equal(saved.data.user.latitude, 0);
  assert.equal(saved.data.user.longitude, 0);

  const preference = await request('/users/' + a.id, a.id, 'PUT', { datingPreference: { maxDistance: 15 } });
  assert.equal(preference.status, 200, preference.data.error);
  assert.equal(preference.data.user.UserPreference.max_distance, 15);
  assert.equal(preference.data.user.UserPreference.age_min, 24);
  assert.equal(preference.data.user.UserPreference.age_max, 35);
  assert.deepEqual(preference.data.user.UserPreference.preferred_gender, ['female']);

  const renamed = await request('/users/' + a.id, a.id, 'PUT', { firstName: 'Changed' });
  assert.equal(renamed.status, 429);
  assert.equal(renamed.data.field, 'name');
  assert.equal((await request('/users/' + a.id, a.id, 'PUT', { username: 'changed' })).status, 429);
});

test('ranking precedes limit, exposes shared evidence and refills without replaying earlier cards', async () => {
  const a = await user('viewer', { relationship_goal: 'LONG_TERM' });
  const music = await models.Interest.create({ name: 'Music' });
  await models.UserInterest.create({ user_id: a.id, interest_id: music.get('id') });
  for (let i = 0; i < 24; i++) await user(`ordinary-${i}`, { relationship_goal: 'SHORT_TERM' });
  const best = await user('best', { relationship_goal: 'LONG_TERM' });
  await models.UserInterest.create({ user_id: best.id, interest_id: music.get('id') });
  const top = await request('/users/recommended?limit=1&userId=' + best.id, a.id);
  assert.equal(top.data[0].id, best.id);
  assert.deepEqual(top.data[0].compatibility.shared_interests, ['Music']);
  const first = (await request('/users/recommended?limit=20', a.id)).data;
  for (const profile of first) await request('/matches/pass', a.id, 'POST', { targetId: profile.id });
  const second = (await request('/users/recommended?limit=20', a.id)).data;
  assert.equal(second.length, 5);
  assert.equal(second.some((profile: any) => first.some((old: any) => old.id === profile.id)), false);
  assert.equal((await request('/users/recommended?limit=-1', a.id)).status, 400);
  const guests = await request('/users/recommended?limit=1');
  assert.equal(guests.data.length, 1);
  assert.equal(guests.data[0].match_percentage, undefined);
});

test('unmatching removes the conversation and prevents historical matches returning to Discover', async () => {
  const a = await user('alice');
  const b = await user('bob');
  const match = await models.Match.create({ user1_id: a.id, user2_id: b.id });
  const conversation = await models.Conversation.create({ match_id: match.get('id') });
  await models.Message.create({ conversation_id: conversation.get('id'), sender_id: a.id, content: 'hello' });
  assert.equal((await request('/matches/' + match.get('id'), a.id, 'DELETE')).status, 200);
  assert.equal(await models.Match.count(), 0);
  assert.equal(await models.Message.count(), 0);
  assert.equal(await models.Conversation.count(), 0);
  assert.equal((await request('/users/recommended', a.id)).data.length, 0);
});

test('additive preference migration preserves existing values and is safe to repeat', async () => {
  const a = await user('alice');
  await models.UserPreference.create({ user_id: a.id, age_min: 23, age_max: 35 });
  await models.sequelize.getQueryInterface().removeColumn('user_preferences', 'relationship_goal');
  const { ensureUserColumns } = await import('../src/config/ensureUserColumns');
  await ensureUserColumns();
  await ensureUserColumns();
  assert.equal((await models.UserPreference.findOne({ where: { user_id: a.id } }))?.get('age_min'), 23);
});

test('concurrent reciprocal likes and retries are serialized by the unique pair state', async () => {
  const a = await user('alice');
  const b = await user('bob');
  const c = await user('carol');
  const responses = await Promise.all([
    request('/matches/like', a.id, 'POST', { targetId: b.id, requestId: 'alice-like-bob' }),
    request('/matches/superlike', b.id, 'POST', { targetId: a.id, requestId: 'bob-like-alice' }),
    request('/matches/like', a.id, 'POST', { targetId: b.id, requestId: 'alice-like-bob' }),
  ]);
  assert.deepEqual(responses.map(response => response.status), [200, 200, 200]);
  assert.equal(await models.Match.count(), 1);
  assert.equal(await models.Conversation.count(), 1);
  assert.equal(await models.PairState.count(), 1);
  assert.equal(await models.DatingRequest.count(), 2);
  assert.equal(await models.DatingEvent.count({ where: { type: 'match' } }), 1);
  assert.equal((await request('/matches/pass', a.id, 'POST', { targetId: b.id, requestId: 'alice-like-bob' })).status, 409);
  assert.equal((await request('/matches/like', a.id, 'POST', { targetId: c.id, requestId: 'alice-like-bob' })).status, 409);
  assert.equal(await models.Match.count(), 1);
});

test('unmatch is a permanent pair decision and replaying an old like cannot recreate it', async () => {
  const a = await user('alice');
  const b = await user('bob');
  await request('/matches/like', a.id, 'POST', { targetId: b.id, requestId: 'old-like' });
  const matched = await request('/matches/like', b.id, 'POST', { targetId: a.id, requestId: 'old-reciprocal' });
  await request('/matches/' + matched.data.match.id, a.id, 'DELETE');
  const replayed = await request('/matches/like', b.id, 'POST', { targetId: a.id, requestId: 'old-reciprocal' });
  assert.equal(replayed.status, 200);
  assert.equal(replayed.data.replayed, true);
  assert.equal(await models.Match.count(), 0);
  assert.equal((await request('/matches/like', a.id, 'POST', { targetId: b.id, requestId: 'new-like' })).status, 409);
  assert.equal((await request('/users/discover', a.id)).data.users.length, 0);
});

test('pass cooldown expires; likes and unmatch do not expire with it', async () => {
  const a = await user('alice');
  const b = await user('bob');
  await request('/matches/pass', a.id, 'POST', { targetId: b.id });
  assert.equal((await request('/users/recommended', a.id)).data.length, 0);
  await models.UserSwipe.update({ expires_at: new Date(Date.now() - 1000) }, { where: { user_id: a.id, target_id: b.id } });
  assert.equal((await request('/users/recommended', a.id)).data[0].id, b.id);
});

test('stable feed cursors do not repeat profiles and validate late blocks, visibility and preference changes', async () => {
  const a = await user('viewer');
  for (let i = 0; i < 45; i++) await user('candidate-' + i);
  const first = await request('/users/discover', a.id);
  assert.equal(first.status, 200);
  assert.equal(first.data.users.length, 20);
  assert.ok(first.data.next_cursor);
  const stored: any = await models.DiscoverySession.findByPk(first.data.session_id);
  const blockedId = stored.entries[20].id;
  const hiddenId = stored.entries[21].id;
  await request('/users/block', a.id, 'POST', { blockedId });
  await models.User.update({ dating_visible: false }, { where: { id: hiddenId } });
  const second = await request('/users/discover?cursor=' + first.data.next_cursor, a.id);
  assert.equal(second.status, 200);
  assert.equal(second.data.users.length, 20);
  const priorIds = new Set(first.data.users.map((profile: any) => profile.id));
  assert.equal(second.data.users.some((profile: any) => priorIds.has(profile.id) || profile.id === blockedId || profile.id === hiddenId), false);
  assert.deepEqual(second.data.users.map((profile: any) => profile.id), stored.entries.slice(22, 42).map((entry: any) => entry.id));
  assert.equal((await request('/users/discover?cursor=' + first.data.next_cursor, blockedId)).status, 404);
  await request('/users/' + a.id, a.id, 'PUT', { datingPreference: { ageRange: { min: 30, max: 40 } } });
  const outdated = await request('/users/discover?cursor=' + second.data.next_cursor, a.id);
  assert.equal(outdated.status, 409);
  assert.equal(outdated.data.code, 'REFRESH_FEED');
});

test('impressions count displayed profiles once, exclude repeats and reject undelivered IDs', async () => {
  const a = await user('viewer');
  for (let i = 0; i < 25; i++) await user('candidate-' + i);
  const page = await request('/users/discover', a.id);
  assert.equal(await models.DiscoveryImpression.count(), 0);
  const firstId = page.data.users[0].id;
  const path = '/users/discover/' + page.data.session_id + '/impressions';
  assert.equal((await request(path, a.id, 'POST', { targetId: firstId })).status, 200);
  assert.equal((await request(path, a.id, 'POST', { targetId: firstId })).status, 200);
  assert.equal(await models.DiscoveryImpression.count(), 1);
  const session: any = await models.DiscoverySession.findByPk(page.data.session_id);
  assert.equal((await request(path, a.id, 'POST', { targetId: session.entries[21].id })).status, 400);
  const refreshed = await request('/users/discover', a.id);
  assert.equal(refreshed.data.users.some((profile: any) => profile.id === firstId), false);
  const impression: any = await models.DiscoveryImpression.findOne();
  assert.equal(impression.algorithm_version, 'heartconnect-v1');
  assert.equal(impression.features.cold_start, true);
});

test('required GPS returns actionable empty feed for missing or old locations', async () => {
  const a = await user('viewer', { latitude: 0, longitude: 0 });
  await user('candidate', { latitude: 0, longitude: 0.01 });
  await models.UserPreference.create({ user_id: a.id, distance_required: true, max_distance: 10 });
  const valid = await request('/users/discover', a.id);
  assert.equal(valid.data.users.length, 1);
  await models.User.update({ location_updated_at: new Date(Date.now() - 31 * 86400000) }, { where: { id: a.id } });
  const expired = await request('/users/discover', a.id);
  assert.equal(expired.status, 200);
  assert.equal(expired.data.location_required, true);
  assert.equal(expired.data.users.length, 0);
});

test('blocking an existing match prevents messages as well as likes and recommendations', async () => {
  const a = await user('alice');
  const b = await user('bob');
  await request('/matches/like', a.id, 'POST', { targetId: b.id });
  await request('/matches/like', b.id, 'POST', { targetId: a.id });
  const conversation: any = await models.Conversation.findOne();
  assert.equal((await request('/messages', a.id, 'POST', { conversationId: conversation.id, content: 'hello' })).status, 200);
  await request('/users/block', b.id, 'POST', { blockedId: a.id });
  assert.equal((await request('/messages', a.id, 'POST', { conversationId: conversation.id, content: 'blocked' })).status, 403);
  assert.equal(await models.Message.count(), 1);
});

test('unrelated profile edits do not refresh old GPS; an explicit GPS refresh does', async () => {
  const a = await user('viewer', { latitude: 0, longitude: 0 });
  const stale = new Date(Date.now() - 31 * 86400000);
  await models.User.update({ location_updated_at: stale }, { where: { id: a.id } });
  const edited = await request('/users/' + a.id, a.id, 'PUT', { bio: 'new bio', location: { latitude: 0, longitude: 0 } });
  assert.equal(edited.status, 200);
  assert.equal(new Date(edited.data.user.location_updated_at).getTime(), stale.getTime());
  const refreshed = await request('/users/' + a.id, a.id, 'PUT', { location: { latitude: 0, longitude: 0 }, refreshLocation: true });
  assert.ok(new Date(refreshed.data.user.location_updated_at).getTime() > stale.getTime());
});

test('the geographic prefilter includes nearby profiles across the date line', async () => {
  const a = await user('west', { latitude: 0, longitude: 179.99 });
  const b = await user('east', { latitude: 0, longitude: -179.99 });
  await models.UserPreference.create({ user_id: a.id, distance_required: true, max_distance: 10 });
  const page = await request('/users/discover', a.id);
  assert.equal(page.data.users[0].id, b.id);
  assert.ok(page.data.users[0].compatibility.distance_km < 3);
});
