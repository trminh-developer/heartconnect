import { User } from '../models';
import apiClient from './apiClient';
import type { UserProfileUpdate } from '../models';

import { mapUser } from '../utils/helpers';

export const getUsers = async (): Promise<User[]> => {
  const res = await apiClient.get('/users');
  return res.data.map ? res.data.map(mapUser) : mapUser(res.data);
};

export const getUserById = async (id: string): Promise<User | null> => {
  try {
    const res = await apiClient.get(`/users/${id}`);
    return res.data.map ? res.data.map(mapUser) : mapUser(res.data);
  } catch (e) {
    return null;
  }
};

export const getUserByUsername = async (username: string): Promise<User | null> => {
  try {
    const res = await apiClient.get(`/users/username/${username}`);
    return res.data.map ? res.data.map(mapUser) : mapUser(res.data);
  } catch (e) {
    return null;
  }
};

export const getRecommendedUsers = async (currentUserId: string, limit = 10): Promise<User[]> => {
  const res = await apiClient.get('/users/recommended', { params: { limit } });
  return res.data.map ? res.data.map(mapUser) : mapUser(res.data);
};

export interface DiscoveryPage {
  users: User[];
  sessionId: string;
  nextCursor: string | null;
  locationRequired: boolean;
}

export const getDiscoveryFeed = async (cursor?: string): Promise<DiscoveryPage> => {
  const res = await apiClient.get('/users/discover', { params: { limit: 20, ...(cursor ? { cursor } : {}) } });
  const sessionId = res.data.sessionId || res.data.session_id || '';
  const nextCursor = res.data.nextCursor ?? res.data.next_cursor ?? null;
  const locationRequired = res.data.locationRequired ?? res.data.location_required ?? false;
  return {
    ...res.data,
    sessionId,
    nextCursor,
    locationRequired,
    users: (res.data.users || []).map((user: any) => ({ ...mapUser(user), discoverySessionId: sessionId }))
  };
};

export const recordDiscoveryImpression = async (sessionId: string, targetId: string): Promise<void> => {
  await apiClient.post(`/users/discover/${sessionId}/impressions`, { targetId });
};

export const getNearbyUsers = async (currentUserId?: string, limit = 10, maxDistance?: number): Promise<User[]> => {
  const res = await apiClient.get('/users/nearby', { params: { limit, maxDistance, ...(currentUserId ? { currentUserId } : {}) } });
  return res.data.map ? res.data.map(mapUser) : mapUser(res.data);
};

export interface UserSearchFilters {
  gender?: string;
  ageMin?: number;
  ageMax?: number;
  onlineStatus?: string;
  limit?: number;
  offset?: number;
}

export const searchUsers = async (query: string, filters: UserSearchFilters = {}, signal?: AbortSignal): Promise<User[]> => {
  const res = await apiClient.get('/users/search', { params: { q: query, ...filters }, signal });
  return res.data.map(mapUser);
};

export const blockUser = async (blockerId: string, blockedId: string): Promise<void> => {
  await apiClient.post('/users/block', { blockerId, blockedId });
};

export const reportUser = async (reporterId: string, reportedId: string, reason: string, details?: string): Promise<void> => {
  await apiClient.post('/users/report', { reporterId, reportedId, reason, details });
};

export const updateProfile = async (id: string, data: UserProfileUpdate): Promise<User> => {
  const res = await apiClient.put(`/users/${id}`, data);
  return mapUser(res.data.user);
};




