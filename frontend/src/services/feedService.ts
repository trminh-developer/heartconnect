import apiClient from './apiClient';
import { mapStatus } from '../utils/helpers';

export const getStatuses = async (userId?: string) => {
  const url = userId ? `/feed/${userId}` : '/feed/all';
  const res = await apiClient.get(url);
  return Array.isArray(res.data) ? res.data.map(mapStatus) : [];
};

export const createStatus = async (userId: string, content: string, mediaUrls?: string[]) => {
  const res = await apiClient.post('/feed', { userId, content, mediaUrls });
  const rawStatus = res.data?.status || res.data;
  return mapStatus(rawStatus);
};

export const toggleLike = async (statusId: string, userId: string, isLiked: boolean) => {
  const res = await apiClient.post('/feed/like', { statusId, userId, isLiked: !isLiked });
  return res.data;
};

export const getComments = async (statusId: string) => {
  const res = await apiClient.get(`/feed/${statusId}/comments`);
  return res.data;
};

export const addComment = async (statusId: string, userId: string, content: string) => {
  const res = await apiClient.post('/feed/comment', { statusId, userId, content });
  return res.data;
};

export const updateStatus = async (statusId: string, content: string, mediaUrls?: string[]) => {
  const res = await apiClient.put(`/feed/${statusId}`, { content, mediaUrls });
  return res.data;
};

export const deleteStatus = async (statusId: string) => {
  const res = await apiClient.delete(`/feed/${statusId}`);
  return res.data;
};

export const reportStatus = async (statusId: string, reason: string, details?: string) => {
  const res = await apiClient.post(`/feed/${statusId}/report`, { reason, details });
  return res.data;
};
