import { User } from './User';

export enum NotificationType {
  LIKE = 'LIKE',
  MATCH = 'MATCH',
  MESSAGE = 'MESSAGE',
  PROFILE_VIEW = 'PROFILE_VIEW',
  SUPER_LIKE = 'SUPER_LIKE',
  SYSTEM = 'SYSTEM'
}

export interface Notification {
  id: string;
  type: NotificationType;
  userId: string;
  fromUser: User | null;
  message: string;
  timestamp: string;
  isRead: boolean;
  actionUrl?: string;
}

