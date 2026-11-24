import { useState, useEffect, useCallback } from 'react';
import { feedService } from '../services';
import { Status, StatusComment } from '../models';
import { useAuth } from './useAuth';
import { uploadOptimizedImage } from '../utils/helpers';
import { useAlert } from '../contexts/AlertContext';

export const useFeed = (userId?: string) => {
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  const loadStatuses = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await feedService.getStatuses(userId);
      setStatuses(data || []);
    } catch (error) {
      console.error('Error loading statuses:', error);
      setStatuses([]);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadStatuses();
  }, [loadStatuses]);

  const uploadMedia = async (file: File): Promise<string | null> => {
    if (!user) return null;
    return await uploadOptimizedImage(file, 'status_media', user.id);
  };

  const createStatus = async (content: string, files: File[]) => {
    if (!user) return null;
    setIsUploading(true);

    const mediaUrls: string[] = [];
    for (const file of files) {
      const url = await uploadMedia(file);
      if (url) mediaUrls.push(url);
    }

    try {
      const newStatus = await feedService.createStatus(user.id, content, mediaUrls);
      
      if (newStatus) {
        setStatuses(prev => [newStatus, ...prev]);
      }
      
      setIsUploading(false);
      return newStatus;
    } catch (error: any) {
      setIsUploading(false);
      throw error;
    }
  };

  const toggleLike = async (statusId: string) => {
    if (!user) return;
    
    const status = statuses.find(s => s.id === statusId);
    if (!status) return;

    // Optimistic UI update
    const isLiked = status.hasLiked;
    setStatuses(prev => prev.map(s => {
      if (s.id === statusId) {
        return {
          ...s,
          hasLiked: !isLiked,
          likesCount: isLiked ? s.likesCount - 1 : s.likesCount + 1
        };
      }
      return s;
    }));

    // Real API call
    try {
      await feedService.toggleLike(statusId, user.id, isLiked || false);
    } catch (error: any) {
      setStatuses(prev => prev.map(s => {
        if (s.id === statusId) {
          return {
            ...s,
            hasLiked: isLiked,
            likesCount: isLiked ? s.likesCount + 1 : s.likesCount - 1
          };
        }
        return s;
      }));
      showAlert(error.response?.data?.error || 'Không thể cập nhật lượt thích.', 'error');
    }
  };

  const getComments = async (statusId: string) => {
    return await feedService.getComments(statusId);
  };

  const addComment = async (statusId: string, content: string) => {
    if (!user) return null;
    
    const response = await feedService.addComment(statusId, user.id, content);
    
    if (response && response.success && response.comment) {
      setStatuses(prev => prev.map(s => {
        if (s.id === statusId) {
          return { ...s, commentsCount: (s.commentsCount || 0) + 1 };
        }
        return s;
      }));

      // Map the returned comment to include user info for the UI
      return {
        id: response.comment.id,
        statusId: response.comment.statusId,
        userId: user.id,
        content: response.comment.content,
        createdAt: response.comment.createdAt,
        user: {
          id: user.id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar
        }
      };
    }
    
    return null;
  };

  const updateStatus = async (statusId: string, content: string) => {
    try {
      await feedService.updateStatus(statusId, content);
      setStatuses(prev => prev.map(s => (s.id === statusId ? { ...s, content } : s)));
      showAlert('Cập nhật bài viết thành công!', 'success');
    } catch (error: any) {
      showAlert(error.response?.data?.error || 'Không thể cập nhật bài viết.', 'error');
      throw error;
    }
  };

  const deleteStatus = async (statusId: string) => {
    try {
      await feedService.deleteStatus(statusId);
      setStatuses(prev => prev.filter(s => s.id !== statusId));
      showAlert('Đã xóa bài viết thành công!', 'success');
    } catch (error: any) {
      showAlert(error.response?.data?.error || 'Không thể xóa bài viết.', 'error');
      throw error;
    }
  };

  return {
    statuses,
    isLoading,
    isUploading,
    loadStatuses,
    createStatus,
    toggleLike,
    getComments,
    addComment,
    updateStatus,
    deleteStatus,
  };
};
