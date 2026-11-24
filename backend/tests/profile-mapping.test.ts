import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapConversation, mapMatch, mapMessage, mapNotification, mapUser } from '../../frontend/src/utils/helpers';

test('profile mapping preserves preferences, zero coordinates and zero compatibility through camelized API responses', () => {
  const user = mapUser({
    id: 'viewer', gender: 'female', latitude: 0, longitude: 0, matchPercentage: 0,
    relationshipGoal: 'LONG_TERM',
    UserPreference: {
      preferredGender: ['male'], ageMin: 24, ageMax: 33, maxDistance: 12,
      relationshipGoal: 'LONG_TERM', acceptedGoals: ['FRIENDSHIP'],
      distanceRequired: true, goalRequired: true,
    },
  });
  assert.equal(user.gender, 'FEMALE');
  assert.deepEqual(user.datingPreference.preferredGender, ['MALE']);
  assert.deepEqual(user.datingPreference.ageRange, { min: 24, max: 33 });
  assert.equal(user.datingPreference.maxDistance, 12);
  assert.equal(user.datingPreference.distanceRequired, true);
  assert.equal(user.datingPreference.goalRequired, true);
  assert.equal(user.datingPreference.acceptedGoals[0], 'Kết bạn');
  assert.equal(user.relationshipGoal, 'Mối quan hệ nghiêm túc');
  assert.equal(user.location.latitude, 0);
  assert.equal(user.location.longitude, 0);
  assert.equal(user.matchPercentage, 0);
});

test('legacy JSON strings map without leaking cached password hashes or inventing locations', () => {
  const user = mapUser({
    id: 'legacy', password: 'legacy-hash', gender: 'MALE',
    UserPreference: { preferred_gender: '["FEMALE"]', accepted_goals: '["SHORT_TERM"]', age_min: 20, age_max: 40 },
  });
  assert.equal(user.password, undefined);
  assert.equal(user.location.city, '');
  assert.deepEqual(user.datingPreference.preferredGender, ['FEMALE']);
  assert.deepEqual(user.datingPreference.acceptedGoals, ['Hẹn hò thử']);
});

test('match mapping distinguishes cold start null from a valid zero score', () => {
  assert.equal(mapMatch({ id: 'a', match_percentage: null }).matchPercentage, null);
  assert.equal(mapMatch({ id: 'a', matchPercentage: 0 }).matchPercentage, 0);
});

test('message and conversation mapping normalize server enums, timestamps, participants and deletion state', () => {
  const message = { id: 'message', conversation_id: 'conversation', sender_id: 'sender', content: 'Hello', created_at: '2026-01-01T00:00:00Z', type: 'image', status: 'seen', deleted_for: '["other"]' };
  const mapped = mapMessage(message);
  assert.equal(mapped.type, 'IMAGE');
  assert.equal(mapped.status, 'SEEN');
  assert.equal(mapped.timestamp, message.created_at);
  assert.deepEqual(mapped.deletedFor, ['other']);
  const conversation = mapConversation({ id: 'conversation', participants: [{ id: 'sender', first_name: 'Sender' }], last_message: message, unread_count: 0, updated_at: message.created_at });
  assert.equal(conversation.lastMessage.type, 'IMAGE');
  assert.equal(conversation.lastMessage.timestamp, message.created_at);
  assert.equal(conversation.participants[0].firstName, 'Sender');
  assert.equal(conversation.unreadCount, 0);
  assert.deepEqual(mapMessage({ deleted_for: 'invalid' }).deletedFor, []);
});

test('notification mapping handles camelized dates, read flags and system notifications without a sender', () => {
  const notification = mapNotification({ id: 'notification', type: 'message', userId: 'receiver', createdAt: '2026-01-01T00:00:00Z', isRead: false, fromUser: null });
  assert.equal(notification.type, 'MESSAGE');
  assert.equal(notification.timestamp, '2026-01-01T00:00:00Z');
  assert.equal(notification.isRead, false);
  assert.equal(notification.fromUser, null);
});

test('profile mapping normalizes legacy photos and premium fields and rejects malformed list entries', () => {
  const profile = mapUser({ id: 'user', photos: '["photo.png"]', is_premium: true, premium_expires_at: '2027-01-01', premium_plan_id: 'premium_1', UserPreference: { preferred_gender: [null, 'female'], accepted_goals: [false, 'LONG_TERM'] } });
  assert.deepEqual(profile.photos, ['photo.png']);
  assert.equal(profile.avatar, 'photo.png');
  assert.equal(profile.isPremium, true);
  assert.equal(profile.premiumExpiresAt, '2027-01-01');
  assert.deepEqual(profile.datingPreference.preferredGender, ['FEMALE']);
  assert.deepEqual(profile.datingPreference.acceptedGoals, ['Mối quan hệ nghiêm túc']);
  assert.deepEqual(mapUser({ id: 'user', photos: 'invalid' }).photos, []);
});
