import { createHash } from 'node:crypto';
import { Op, literal } from 'sequelize';
import { DiscoveryImpression, DiscoverySession, Interest, User, sequelize } from '../../models';
import { ageOn, ALGORITHM_VERSION, compatibility, coordinates, DatingProfile, interestSet, interestKey, mutuallyEligible, preferredGenders, scoreRecommendations, RankedCandidate, topK } from './compatibility';
import { profileIncludes, publicProfile, publicProfileAttributes } from './profiles';
import { datingError } from './swipes';

export const FEED_TTL_MS = 30 * 60 * 1000;
const numberOption = (value: string | undefined, fallback: number, max: number) => Math.min(max, Math.max(50, Number(value) || fallback));
export const CANDIDATE_BATCH_SIZE = numberOption(process.env.DISCOVERY_CANDIDATE_BATCH_SIZE, 500, 2000);
export const MAX_CANDIDATES = Math.max(CANDIDATE_BATCH_SIZE, numberOption(process.env.DISCOVERY_MAX_CANDIDATES, 1500, 5000));
const featureAttributes = ['id', 'gender', 'date_of_birth', 'latitude', 'longitude', 'location_updated_at',
  'dating_visible', 'status', 'role', 'city', 'country', 'relationship_goal', 'last_active', 'createdAt'];
let catalogueCache: { expires: number; items: { id: string; name: string }[] } | undefined;
export function clearInterestCatalogueCache() { catalogueCache = undefined; }
async function catalogue() {
  if (!catalogueCache || catalogueCache.expires <= Date.now()) {
    const rows = await Interest.findAll({ attributes: ['id', 'name'] });
    catalogueCache = { expires: Date.now() + 60000, items: rows.map(row => row.toJSON() as { id: string; name: string }) };
  }
  return catalogueCache.items;
}
export function feedFingerprint(profile: DatingProfile) {
  const p = profile.UserPreference;
  return createHash('sha256').update(JSON.stringify({
    version: ALGORITHM_VERSION, id: profile.id, gender: profile.gender, birth: profile.date_of_birth,
    visible: profile.dating_visible, goal: profile.relationship_goal, location: [profile.latitude, profile.longitude, profile.location_updated_at],
    interests: [...interestSet(profile)].sort(),
    preference: p && [preferredGenders(p).sort(), p.age_min, p.age_max, p.max_distance, p.distance_required,
      p.distance_half_life, p.relationship_goal, p.accepted_goals, p.goal_required],
  })).digest('hex');
}
function candidateWhere(viewer: DatingProfile, skip: string[] = [], now = new Date(), excludeImpressions = true) {
  const id = sequelize.escape(viewer.id), timestamp = sequelize.escape(now);
  const qi = sequelize.getQueryInterface();
  const userCol = qi.quoteIdentifier('User') + '.' + qi.quoteIdentifier('id');
  const clauses: any[] = [];
  const activeSwipe = '(s.action <> \'pass\' OR s.expires_at IS NULL OR s.expires_at > ' + timestamp + ')';
  clauses.push(literal('NOT EXISTS (SELECT 1 FROM user_swipes s WHERE ((s.user_id = ' + id + ' AND s.target_id = ' + userCol + ') OR (s.target_id = ' + id + ' AND s.user_id = ' + userCol + ' AND s.action = \'pass\')) AND ' + activeSwipe + ')'));
  clauses.push(literal('NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.user_id = ' + id + ' AND b.target_id = ' + userCol + ') OR (b.target_id = ' + id + ' AND b.user_id = ' + userCol + '))'));
  clauses.push(literal('NOT EXISTS (SELECT 1 FROM matches m WHERE (m.user1_id = ' + id + ' AND m.user2_id = ' + userCol + ') OR (m.user2_id = ' + id + ' AND m.user1_id = ' + userCol + '))'));
  clauses.push(literal('NOT EXISTS (SELECT 1 FROM pair_states p WHERE p.state IN (\'unmatched\', \'blocked\') AND ((p.user_low_id = ' + id + ' AND p.user_high_id = ' + userCol + ') OR (p.user_high_id = ' + id + ' AND p.user_low_id = ' + userCol + ')))'));
  if (excludeImpressions) {
    clauses.push(literal('NOT EXISTS (SELECT 1 FROM discovery_impressions i WHERE i.user_id = ' + id + ' AND i.target_id = ' + userCol + ' AND i.shown_at > ' + sequelize.escape(new Date(now.getTime() - 86400000)) + ')'));
  }
  const minAge = viewer.UserPreference?.age_min ?? 18, maxAge = viewer.UserPreference?.age_max ?? 100;
  // Broad DOB boundaries support leap dates; exact birthday checks happen in mutuallyEligible.
  const oldest = new Date(Date.UTC(now.getUTCFullYear() - maxAge - 1, now.getUTCMonth(), now.getUTCDate()));
  const youngest = new Date(Date.UTC(now.getUTCFullYear() - minAge, now.getUTCMonth(), now.getUTCDate() + 1));
  const genders = preferredGenders(viewer.UserPreference);
  const origin = coordinates(viewer, now);
  if (origin) {
    const radius = viewer.UserPreference?.max_distance ?? 100;
    const deltaLat = radius / 110.574;
    const latitude = { [Op.between]: [Math.max(-90, origin[0] - deltaLat), Math.min(90, origin[0] + deltaLat)] };
    const deltaLon = radius / Math.max(0.001, 111.32 * Math.cos(Math.min(89.999, Math.abs(origin[0]) + deltaLat) * Math.PI / 180));
    const geo: any[] = [{ latitude }, { location_updated_at: { [Op.gte]: new Date(now.getTime() - 30 * 86400000), [Op.lte]: now } }];
    if (deltaLon < 180) {
      const low = origin[1] - deltaLon, high = origin[1] + deltaLon;
      geo.push(low < -180 ? { [Op.or]: [{ longitude: { [Op.gte]: low + 360 } }, { longitude: { [Op.lte]: high } }] } :
        high > 180 ? { [Op.or]: [{ longitude: { [Op.gte]: low } }, { longitude: { [Op.lte]: high - 360 } }] } :
        { longitude: { [Op.between]: [low, high] } });
    }
    const unknownLocation = { [Op.or]: [{ latitude: null }, { longitude: null }, { location_updated_at: null },
      { location_updated_at: { [Op.lt]: new Date(now.getTime() - 30 * 86400000) } }] };
    clauses.push(viewer.UserPreference?.distance_required ? { [Op.and]: geo } : { [Op.or]: [{ [Op.and]: geo }, unknownLocation] });
  } else if (viewer.UserPreference?.distance_required) clauses.push(literal('1 = 0'));
  return {
    id: { [Op.notIn]: [viewer.id, ...skip] }, status: 'ACTIVE', role: 'USER', dating_visible: true,
    date_of_birth: { [Op.between]: [oldest.toISOString().slice(0, 10), youngest.toISOString().slice(0, 10)] },
    ...(genders.length ? { gender: { [Op.in]: [...genders, ...genders.map(g => g.toUpperCase())] } } : {}),
    [Op.and]: clauses,
  };
}
async function loadViewer(userId: string): Promise<DatingProfile> {
  const user = await User.findByPk(userId, { attributes: featureAttributes, include: profileIncludes() });
  if (!user) throw datingError('User not found', 404);
  return user.toJSON() as DatingProfile;
}
async function retrieveRanked(viewer: DatingProfile, limit: number, now: Date, excludeImpressions = true) {
  const isStaff = viewer.role === 'ADMIN' || viewer.role === 'CENSOR';
  if (viewer.status !== 'ACTIVE' || (!isStaff && viewer.dating_visible === false) || ageOn(viewer.date_of_birth, now) === null) return [];
  const interestIds = (await catalogue()).filter(interest => interestSet(viewer).has(interestKey(interest.name))).map(interest => interest.id);
  const qi = sequelize.getQueryInterface();
  const userCol = qi.quoteIdentifier('User') + '.' + qi.quoteIdentifier('id');
  const sharedInterests = interestIds.length ? literal('EXISTS (SELECT 1 FROM user_interests ui WHERE ui.user_id = ' + userCol + ' AND ui.interest_id IN (' + interestIds.map(id => sequelize.escape(id)).join(',') + '))') : null;
  const seen = new Set<string>();
  let shortlist: RankedCandidate[] = [];
  for (let round = 0; round < 3 && seen.size < MAX_CANDIDATES; round++) {
    const sourceLimit = Math.min(Math.ceil(CANDIDATE_BATCH_SIZE / 3), Math.floor((MAX_CANDIDATES - seen.size) / 3));
    if (sourceLimit < 1) break;
    const base = candidateWhere(viewer, [...seen], now, excludeImpressions);
    // Three bounded sources: related interests, recently active people, and newcomers.
    const sources = [
      User.findAll({ attributes: ['id'], where: sharedInterests ? { [Op.and]: [base, sharedInterests] } : base, order: [['last_active', 'DESC'], ['id', 'ASC']], limit: sourceLimit }),
      User.findAll({ attributes: ['id'], where: base, order: [['last_active', 'DESC'], ['id', 'ASC']], limit: sourceLimit }),
      User.findAll({ attributes: ['id'], where: base, order: [['createdAt', 'DESC'], ['id', 'ASC']], limit: sourceLimit }),
    ];
    const batches = await Promise.all(sources);
    const ids = [...new Set(batches.flat().map(user => user.get('id') as string))].filter(id => !seen.has(id));
    if (!ids.length) break;
    ids.forEach(id => seen.add(id));
    const profiles = await User.findAll({ attributes: featureAttributes, where: { id: { [Op.in]: ids } }, include: profileIncludes() });
    // Keep full precision; only the UI rounds scores.
    const ranked = scoreRecommendations(viewer, profiles.map(profile => profile.toJSON() as DatingProfile), now);
    shortlist = topK([...shortlist, ...ranked], limit);
    if (shortlist.length >= limit) break;
  }
  return shortlist;
}
async function finalize(viewer: DatingProfile, entries: { id: string; compatibility: ReturnType<typeof compatibility> }[], offset: number, limit: number, excludeImpressions = true) {
  const output: any[] = [];
  let next = offset;
  // Validate oversampled cached IDs against current preferences, blocks, matches and account visibility.
  while (next < entries.length && output.length < limit) {
    const chunk = entries.slice(next, next + Math.max(limit * 3, 20));
    const users = await User.findAll({
      attributes: [...new Set([...featureAttributes, ...publicProfileAttributes])],
      where: { [Op.and]: [candidateWhere(viewer, [], new Date(), excludeImpressions), { id: { [Op.in]: chunk.map(entry => entry.id) } }] },
      include: profileIncludes(),
    });
    const byId = new Map(users.map(user => [user.get('id') as string, user.toJSON() as DatingProfile]));
    for (const entry of chunk) {
      next++;
      const profile = byId.get(entry.id);
      if (profile && mutuallyEligible(viewer, profile)) {
        output.push({ ...publicProfile(profile), match_percentage: entry.compatibility.score, compatibility: entry.compatibility });
      }
      if (output.length === limit) break;
    }
  }
  return { users: output, next };
}
export async function recommendUsers(userId: string | undefined, limit: number) {
  if (!userId) {
    const now = new Date();
    const adultCutoff = new Date(Date.UTC(now.getUTCFullYear() - 18, now.getUTCMonth(), now.getUTCDate()));
    const users = await User.findAll({
      where: { status: 'ACTIVE', role: 'USER', dating_visible: true, date_of_birth: { [Op.lte]: adultCutoff.toISOString().slice(0, 10) } },
      attributes: publicProfileAttributes, include: [profileIncludes()[0]],
      order: [['last_active', 'DESC'], ['id', 'ASC']], limit,
    });
    return users.filter(user => { const age = ageOn(user.get('date_of_birth') as string); return age !== null && age >= 18 && age <= 100; }).map(publicProfile);
  }
  const viewer = await loadViewer(userId);
  const ranked = await retrieveRanked(viewer, limit * 3, new Date(), false);
  return (await finalize(await loadViewer(userId), ranked.map(item => ({ id: item.profile.id, compatibility: item.compatibility })), 0, limit, false)).users;
}
export async function discoveryFeed(userId: string, limit: number, cursor?: string) {
  const viewer = await loadViewer(userId);
  const fingerprint = feedFingerprint(viewer);
  let session: any, offset = 0;
  if (cursor) {
    const parts = /^([0-9a-f-]{36}):(\d+)$/.exec(cursor);
    if (!parts || !Number.isSafeInteger(Number(parts[2]))) throw datingError('Cursor không hợp lệ.');
    session = await DiscoverySession.findByPk(parts[1]);
    if (!session || session.user_id !== userId) throw datingError('Phiên khám phá không tồn tại.', 404);
    if (session.fingerprint !== fingerprint || new Date(session.expires_at).getTime() <= Date.now()) {
      throw datingError('Thiết lập hoặc phiên khám phá đã thay đổi. Hãy tải lại gợi ý.', 409, 'REFRESH_FEED');
    }
    offset = Number(parts[2]);
    if (offset > session.entries.length) throw datingError('Cursor không hợp lệ.');
  } else {
    let ranked = await retrieveRanked(viewer, Math.min(200, Math.max(60, limit * 3)), new Date(), true);
    if (ranked.length === 0) {
      ranked = await retrieveRanked(viewer, Math.min(200, Math.max(60, limit * 3)), new Date(), false);
    }
    // Reject a build raced by a settings change rather than returning a mismatched cached feed.
    if (feedFingerprint(await loadViewer(userId)) !== fingerprint) throw datingError('Thiết lập vừa thay đổi.', 409, 'REFRESH_FEED');
    session = await DiscoverySession.create({
      user_id: userId, fingerprint, expires_at: new Date(Date.now() + FEED_TTL_MS),
      entries: ranked.map(item => ({ id: item.profile.id, compatibility: item.compatibility })),
    });
  }
  const page = await finalize(await loadViewer(userId), session.entries, offset, limit, false);
  const delivered = Math.max(Number(session.delivered_count), page.next);
  await DiscoverySession.update({ delivered_count: delivered }, { where: { id: session.id, delivered_count: { [Op.lt]: delivered } } });
  const nextCursor = page.next < session.entries.length ? session.id + ':' + page.next : null;
  const locationRequired = !!viewer.UserPreference?.distance_required && !coordinates(viewer);
  return {
    users: page.users,
    session_id: session.id,
    sessionId: session.id,
    next_cursor: nextCursor,
    nextCursor,
    algorithm_version: ALGORITHM_VERSION,
    expires_at: session.expires_at,
    location_required: locationRequired,
    locationRequired,
  };
}
export async function recordImpression(userId: string, sessionId: string, targetId: unknown) {
  const session: any = await DiscoverySession.findByPk(sessionId);
  if (!session || session.user_id !== userId || new Date(session.expires_at).getTime() <= Date.now()) throw datingError('Phiên khám phá không tồn tại.', 404);
  const index = session.entries.findIndex((entry: any) => entry.id === targetId);
  if (index < 0 || index >= session.delivered_count) throw datingError('Hồ sơ chưa được gửi trong phiên này.');
  await DiscoveryImpression.findOrCreate({
    where: { session_id: sessionId, target_id: targetId },
    defaults: { user_id: userId, algorithm_version: ALGORITHM_VERSION, features: session.entries[index].compatibility },
  });
}
