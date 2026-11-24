import { Story } from '../models';
import apiClient from './apiClient';
import { mapUser } from '../utils/helpers';

export const getFeedStories = async (): Promise<{ [userId: string]: Story[] }> => {
  const response = await apiClient.get<Story[]>('/stories');
  const grouped: Record<string, Story[]> = Object.create(null);
  for (const story of response.data) {
    (grouped[story.userId] ??= []).push({ ...story, user: mapUser(story.user) });
  }
  return grouped;
};

export const createStory = async (
  userId: string, 
  mediaType: 'text' | 'image' | 'video', 
  mediaUrl?: string, 
  textContent?: string,
  backgroundColor?: string
): Promise<Story | null> => {
  const response = await apiClient.post<Story>('/stories', { mediaType, mediaUrl, textContent, backgroundColor });
  return { ...response.data, user: mapUser(response.data.user) };
};
