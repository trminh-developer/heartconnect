export const ALGORITHM_VERSION = 'heartconnect-v1';
export const WEIGHTS = { interests: 0.4, goal: 0.3, distance: 0.2, activity: 0.1 } as const;
export const LOCATION_MAX_AGE_DAYS = 30;

export interface Preference {
  preferred_gender?: unknown;
  age_min?: number | null;
  age_max?: number | null;
  max_distance?: number | null;
  distance_required?: boolean | null;
  distance_half_life?: number | null;
  relationship_goal?: string | null;
  accepted_goals?: unknown;
  goal_required?: boolean | null;
}
export interface DatingProfile {
  id: string;
  gender?: string | null;
  date_of_birth?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_updated_at?: string | Date | null;
  city?: string | null;
  country?: string | null;
  relationship_goal?: string | null;
  last_active?: string | Date | null;
  status?: string;
  role?: string;
  dating_visible?: boolean;
  createdAt?: string | Date;
  UserPreference?: Preference | null;
  interests?: { id?: string; name: string }[];
}
const normalize = (value?: string | null) => value?.trim().toLocaleLowerCase('vi') || '';
export const normalizeGender = (value: string) => value.trim().toLowerCase();
const goalAliases: Record<string, string> = {
  'mối quan hệ nghiêm túc': 'LONG_TERM', 'hẹn hò thử': 'SHORT_TERM',
  'kết bạn': 'FRIENDSHIP', 'chưa xác định': 'NOT_SURE',
};
export const normalizeGoal = (value: string) => goalAliases[normalize(value)] || value.trim().toUpperCase();

// Legacy seed IDs collide with the UI catalogue. Normalize known synonyms to stable semantic IDs.
const interestAliases: Record<string, string> = {
  'du lịch': 'travel', 'đi du lịch': 'travel', travel: 'travel',
  'nghe nhạc': 'music', 'âm nhạc': 'music', music: 'music',
  'cà phê': 'coffee', 'uống cafe': 'coffee', coffee: 'coffee',
  'chụp ảnh': 'photography', 'nhiếp ảnh': 'photography', photography: 'photography',
};
export const interestKey = (name: string) => interestAliases[normalize(name)] || normalize(name).normalize('NFC');
export const interestSet = (profile: DatingProfile) => new Set((profile.interests || []).map(i => interestKey(i.name)).filter(Boolean));

export function ageOn(dateOfBirth: string | null | undefined, now = new Date()): number | null {
  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return null;
  const birth = new Date(dateOfBirth + 'T00:00:00Z');
  if (!Number.isFinite(birth.getTime()) || birth.toISOString().slice(0, 10) !== dateOfBirth) return null;
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  if (now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}
export function coordinates(profile: DatingProfile, now = new Date()): [number, number] | null {
  const { latitude, longitude } = profile;
  // Legacy coordinates without a recorded update time are unknown, not fresh GPS.
  const updated = profile.location_updated_at ? new Date(profile.location_updated_at).getTime() : NaN;
  const age = now.getTime() - updated;
  if (!Number.isFinite(age) || age < 0 || age > LOCATION_MAX_AGE_DAYS * 86400000) return null;
  return typeof latitude === 'number' && Number.isFinite(latitude) && Math.abs(latitude) <= 90 &&
    typeof longitude === 'number' && Number.isFinite(longitude) && Math.abs(longitude) <= 180
    ? [latitude, longitude] : null;
}
export function distanceKm(a: DatingProfile, b: DatingProfile, now = new Date()): number | null {
  const origin = coordinates(a, now), destination = coordinates(b, now);
  if (!origin || !destination) return null;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const h = Math.sin(radians(destination[0] - origin[0]) / 2) ** 2 +
    Math.cos(radians(origin[0])) * Math.cos(radians(destination[0])) *
    Math.sin(radians(destination[1] - origin[1]) / 2) ** 2;
  const bounded = Math.min(1, Math.max(0, h));
  return 2 * 6371 * Math.atan2(Math.sqrt(bounded), Math.sqrt(1 - bounded));
}
function arrayValue(value: unknown): string[] {
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return []; } }
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
export const preferredGenders = (preference?: Preference | null) => arrayValue(preference?.preferred_gender).map(normalizeGender);
export function goalScore(viewer: DatingProfile, other: DatingProfile): number | null {
  const wanted = normalizeGoal(viewer.UserPreference?.relationship_goal || viewer.relationship_goal || 'NOT_SURE');
  const actual = normalizeGoal(other.relationship_goal || 'NOT_SURE');
  if (wanted === 'NOT_SURE' || actual === 'NOT_SURE') return null;
  if (wanted === actual) return 1;
  return arrayValue(viewer.UserPreference?.accepted_goals).map(normalizeGoal).includes(actual) ? 0.5 : 0;
}
function accepts(viewer: DatingProfile, other: DatingProfile, age: number, distance: number | null): boolean {
  const preference = viewer.UserPreference;
  const genders = preferredGenders(preference);
  if (genders.length && !genders.includes(normalizeGender(other.gender || ''))) return false;
  if (age < (preference?.age_min ?? 18) || age > (preference?.age_max ?? 100)) return false;
  if (preference?.distance_required && distance === null) return false;
  if (distance !== null && distance > (preference?.max_distance ?? 100)) return false;
  const goal = goalScore(viewer, other);
  if (preference?.goal_required && (goal === null || goal === 0)) return false;
  return true;
}
export function mutuallyEligible(a: DatingProfile, b: DatingProfile, now = new Date()): boolean {
  if (a.id === b.id) return false;
  if (a.status && a.status !== 'ACTIVE') return false;
  if (b.status && b.status !== 'ACTIVE') return false;
  if (b.role && b.role !== 'USER') return false;
  if (b.dating_visible === false) return false;
  const isStaff = a.role === 'ADMIN' || a.role === 'CENSOR';
  if (!isStaff) {
    if (a.role && a.role !== 'USER') return false;
    if (a.dating_visible === false) return false;
  }
  const ageA = ageOn(a.date_of_birth, now), ageB = ageOn(b.date_of_birth, now);
  if (ageA === null || ageB === null || ageA < 18 || ageB < 18 || ageA > 100 || ageB > 100) return false;
  const distance = distanceKm(a, b, now);
  if (!accepts(a, b, ageB, distance)) return false;
  if (isStaff) return true;
  return accepts(b, a, ageA, distance);
}
export function activityScore(profile: DatingProfile, now = new Date()): number | null {
  const activeAt = profile.last_active ? new Date(profile.last_active).getTime() : NaN;
  const days = (now.getTime() - activeAt) / 86400000;
  return Number.isFinite(days) && days >= 0 ? 2 ** (-days / 7) : null;
}
export const harmonicMean = (a: number, b: number) => a + b === 0 ? 0 : 2 * a * b / (a + b);

export function scoreDirection(viewer: DatingProfile, other: DatingProfile, now = new Date()) {
  const interestsA = interestSet(viewer), interestsB = interestSet(other);
  const shared = [...interestsA].filter(key => interestsB.has(key));
  const unionSize = new Set([...interestsA, ...interestsB]).size;
  const distance = distanceKm(viewer, other, now);
  const signals = {
    interests: interestsA.size && interestsB.size ? shared.length / unionSize : null,
    goal: goalScore(viewer, other),
    distance: distance === null ? null : 2 ** (-distance / Math.max(0.1, viewer.UserPreference?.distance_half_life ?? 10)),
    activity: activityScore(other, now),
  };
  let total = 0, weight = 0;
  for (const key of Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]) {
    const value = signals[key];
    if (value !== null) { total += WEIGHTS[key] * value; weight += WEIGHTS[key]; }
  }
  // Activity or distance alone is insufficient evidence of personal compatibility.
  const enoughPreferenceData = signals.interests !== null || signals.goal !== null;
  return { score: weight > 0 ? total / weight : null, signals, enoughPreferenceData };
}
export function compatibility(a: DatingProfile, b: DatingProfile, now = new Date()) {
  const forward = scoreDirection(a, b, now), reverse = scoreDirection(b, a, now);
  const coldStart = !forward.enoughPreferenceData || !reverse.enoughPreferenceData;
  const score = coldStart || forward.score === null || reverse.score === null ? null : 100 * harmonicMean(forward.score, reverse.score);
  const sharedKeys = [...interestSet(a)].filter(key => interestSet(b).has(key));
  const sharedInterests = sharedKeys.map(key => a.interests!.find(i => interestKey(i.name) === key)!.name.trim());
  const distance = distanceKm(a, b, now);
  const reasons: string[] = [];
  if (sharedKeys.length) reasons.push('shared_interests');
  if (forward.signals.goal === 1 && reverse.signals.goal === 1) reasons.push('same_relationship_goal');
  if (distance !== null && distance <= 10) reasons.push('nearby');
  if (mutuallyEligible(a, b, now)) reasons.push('mutual_preferences');
  return {
    score, cold_start: coldStart, reasons, shared_interests: sharedInterests,
    distance_km: distance === null ? null : Math.round(distance * 10) / 10,
    forward: forward.signals, reverse: reverse.signals, algorithm_version: ALGORITHM_VERSION,
  };
}
export function scoreRecommendations(viewer: DatingProfile, candidates: DatingProfile[], now = new Date()) {
  return candidates.filter(candidate => mutuallyEligible(viewer, candidate, now)).map(profile => {
    const details = compatibility(viewer, profile, now);
    return { profile, compatibility: details, rank: details.score ?? -1, activity: activityScore(profile, now) ?? -1 };
  });
}
export function rankRecommendations(viewer: DatingProfile, candidates: DatingProfile[], _incoming = new Map<string, string>(), now = new Date()) {
  return scoreRecommendations(viewer, candidates, now).sort((a, b) => b.rank - a.rank || b.activity - a.activity || a.profile.id.localeCompare(b.profile.id));
}
export type RankedCandidate = ReturnType<typeof rankRecommendations>[number];

// A bounded min-heap retains only K winners while scoring a candidate batch.
export function topK(candidates: RankedCandidate[], limit: number): RankedCandidate[] {
  const better = (a: RankedCandidate, b: RankedCandidate) => a.rank - b.rank || a.activity - b.activity || b.profile.id.localeCompare(a.profile.id);
  const heap: RankedCandidate[] = [];
  for (const candidate of candidates) {
    if (heap.length < limit) {
      heap.push(candidate);
      let child = heap.length - 1;
      while (child > 0) {
        const parent = Math.floor((child - 1) / 2);
        if (better(heap[child], heap[parent]) >= 0) break;
        [heap[child], heap[parent]] = [heap[parent], heap[child]];
        child = parent;
      }
    } else if (limit > 0 && better(candidate, heap[0]) > 0) {
      heap[0] = candidate;
      let parent = 0;
      while (2 * parent + 1 < heap.length) {
        let child = 2 * parent + 1;
        if (child + 1 < heap.length && better(heap[child + 1], heap[child]) < 0) child++;
        if (better(heap[parent], heap[child]) <= 0) break;
        [heap[parent], heap[child]] = [heap[child], heap[parent]];
        parent = child;
      }
    }
  }
  return heap.sort((a, b) => better(b, a));
}
