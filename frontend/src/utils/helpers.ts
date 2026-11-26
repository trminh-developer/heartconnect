import imageCompression from "browser-image-compression";
import { RelationshipGoal } from '../models';

export const calculateAge = (dateOfBirth?: string): number | string => {
  if (!dateOfBirth) return '?';
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  if (isNaN(birthDate.getTime())) return '?';
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

export const formatTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "Vừa xong";

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes} phút trước`;

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours} giờ trước`;

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays === 1) return "Hôm qua";
  if (diffInDays < 7) return `${diffInDays} ngày trước`;

  return date.toLocaleDateString();
};

export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
};

export const uploadOptimizedImage = async (
  file: File,
  bucketName: string,
  userId: string,
): Promise<string | null> => {
  try {
    // 1. Kiểm tra dung lượng file gốc (Chặn nếu > 15MB)
    if (file.size > 15 * 1024 * 1024) {
      alert("Kích thước file quá lớn. Tối đa 15MB!");
      return null;
    }

    // Nếu là GIF hoặc SVG -> Đọc trực tiếp Base64 không nén
    if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
      });
    }

    // 2. Nén ảnh ngay trên trình duyệt
    const options = {
      maxSizeMB: 1, // Ép dung lượng tối đa xuống 1MB
      maxWidthOrHeight: 1200,
      useWebWorker: true,
    };

    try {
      const compressedFile = await imageCompression(file, options);
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(compressedFile);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
      });
    } catch (compressionErr) {
      console.warn("Nén ảnh thất bại, sử dụng file gốc:", compressionErr);
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
      });
    }
  } catch (error) {
    console.error("Lỗi upload ảnh:", error);
    return null;
  }
};

export const mapUser = (u: any): any => {
  if (!u) return u;
  const { password: _password, ...profile } = u;
  const preference = u.UserPreference || u.userPreference || u.datingPreference || {};
  const goals: Record<string, RelationshipGoal> = {
    LONG_TERM: RelationshipGoal.LONG_TERM, SHORT_TERM: RelationshipGoal.SHORT_TERM,
    FRIENDSHIP: RelationshipGoal.FRIENDSHIP, NOT_SURE: RelationshipGoal.NOT_SURE,
  };
  const goal = (value: string) => goals[value] || value || RelationshipGoal.NOT_SURE;
  let genders = preference.preferred_gender ?? preference.preferredGender ?? [];
  if (typeof genders === 'string') {
    try { genders = JSON.parse(genders); } catch { genders = []; }
  }
  let acceptedGoals = preference.accepted_goals ?? preference.acceptedGoals ?? [];
  if (typeof acceptedGoals === 'string') {
    try { acceptedGoals = JSON.parse(acceptedGoals); } catch { acceptedGoals = []; }
  }
  let photos = u.photos ?? [];
  if (typeof photos === 'string') {
    try { photos = JSON.parse(photos); } catch { photos = []; }
  }
  photos = Array.isArray(photos) ? photos.filter((photo: unknown) => typeof photo === 'string') : [];
  return {
    ...profile,
    firstName: u.first_name || u.firstName || u.username || 'Người dùng',
    lastName: u.last_name || u.lastName || '',
    avatar: u.avatar || photos[0] || '',
    photos,
    coverPhoto: u.cover_photo || u.coverPhoto || '',
    dateOfBirth: u.date_of_birth || u.dateOfBirth || '',
    gender: u.gender?.toUpperCase(),
    interests: u.interests || [],
    relationshipGoal: goal(u.relationship_goal || u.relationshipGoal),
    locationUpdatedAt: u.location_updated_at ?? u.locationUpdatedAt,
    datingVisible: u.dating_visible ?? u.datingVisible ?? true,
    matchPercentage: u.match_percentage ?? u.matchPercentage ?? u.compatibility?.score ?? null,
    compatibility: u.compatibility ? {
      score: u.compatibility.score ?? null,
      coldStart: u.compatibility.coldStart ?? u.compatibility.cold_start ?? false,
      reasons: Array.isArray(u.compatibility.reasons) ? u.compatibility.reasons : [],
      sharedInterests: Array.isArray(u.compatibility.sharedInterests)
        ? u.compatibility.sharedInterests
        : (Array.isArray(u.compatibility.shared_interests) ? u.compatibility.shared_interests : []),
      distanceKm: u.compatibility.distanceKm ?? u.compatibility.distance_km ?? null
    } : undefined,
    isVerified: u.is_verified !== undefined ? u.is_verified : u.isVerified,
    isOnline: u.is_online !== undefined ? u.is_online : u.isOnline,
    isPremium: u.is_premium ?? u.isPremium ?? false,
    premiumExpiresAt: u.premium_expires_at ?? u.premiumExpiresAt,
    premiumPlanId: u.premium_plan_id ?? u.premiumPlanId,
    appLogo: u.app_logo ?? u.appLogo ?? null,
    nameChangedAt: u.name_changed_at ?? u.nameChangedAt,
    usernameChangedAt: u.username_changed_at ?? u.usernameChangedAt,
    lastActive: u.last_active || u.lastActive,
    location: {
      city: u.city || u.location?.city || '',
      country: u.country || u.location?.country || '',
      latitude: u.latitude ?? u.location?.latitude,
      longitude: u.longitude ?? u.location?.longitude
    },
    datingPreference: {
      preferredGender: Array.isArray(genders) ? genders.filter((gender: unknown) => typeof gender === 'string').map((gender: string) => gender.toUpperCase()) : [],
      ageRange: { min: preference.age_min ?? preference.ageMin ?? preference.ageRange?.min ?? 18,
        max: preference.age_max ?? preference.ageMax ?? preference.ageRange?.max ?? 100 },
      maxDistance: preference.max_distance ?? preference.maxDistance ?? 100,
      relationshipGoal: goal(preference.relationship_goal || preference.relationshipGoal || u.relationship_goal || u.relationshipGoal),
      acceptedGoals: Array.isArray(acceptedGoals) ? acceptedGoals.filter((value: unknown) => typeof value === 'string').map(goal) : [],
      goalRequired: preference.goal_required ?? preference.goalRequired ?? false,
      distanceRequired: preference.distance_required ?? preference.distanceRequired ?? false,
      distanceHalfLife: preference.distance_half_life ?? preference.distanceHalfLife ?? 10,
    }
  };
};

export const mapMatch = (m: any): any => {
  if (!m) return m;
  const rawUser = m.matchedUser || m.matched_user || m.User2 || m.User1 || {};
  const mappedUser = mapUser(rawUser);

  return {
    ...m,
    id: String(m.id || ''),
    userId: String(m.userId || m.user_id || ''),
    matchedUserId: String(m.matchedUserId || m.matched_user_id || mappedUser?.id || ''),
    matchedUser: mappedUser,
    matchPercentage: (m.matchPercentage ?? m.match_percentage) == null ? null : Number(m.matchPercentage ?? m.match_percentage),
    matchedAt: m.matchedAt || m.matched_at || new Date().toISOString(),
    isNew: m.isNew !== undefined ? Boolean(m.isNew) : (m.is_new !== undefined ? Boolean(m.is_new) : false),
    lastMessage: m.lastMessage || m.last_message || ''
  };
};

export const mapMessage = (m: any): any => {
  if (!m) return m;
  let deletedFor = m.deleted_for ?? m.deletedFor ?? [];
  if (typeof deletedFor === 'string') {
    try { deletedFor = JSON.parse(deletedFor); } catch { deletedFor = []; }
  }
  return {
    ...m,
    id: String(m.id || ''),
    conversationId: m.conversation_id || m.conversationId,
    senderId: m.sender_id || m.senderId,
    timestamp: m.created_at || m.createdAt || m.timestamp,
    type: String(m.message_type || m.type || 'TEXT').toUpperCase(),
    status: String(m.status || 'SENT').toUpperCase(),
    isDeleted: m.is_deleted !== undefined ? Boolean(m.is_deleted) : Boolean(m.isDeleted),
    isRecalled: m.is_recalled !== undefined ? Boolean(m.is_recalled) : Boolean(m.isRecalled),
    deletedFor: Array.isArray(deletedFor) ? deletedFor.filter((id: unknown) => typeof id === 'string') : [],
  };
};

export const mapConversation = (c: any): any => {
  if (!c) return c;
  return {
    ...c,
    participants: Array.isArray(c.participants) ? c.participants.map(mapUser) : [],
    lastMessage: c.lastMessage || c.last_message ? mapMessage(c.lastMessage || c.last_message) : undefined,
    unreadCount: Number(c.unread_count ?? c.unreadCount ?? 0),
    updatedAt: c.updated_at ?? c.updatedAt,
  };
};

export const mapNotification = (n: any): any => {
  if (!n) return n;
  return {
    ...n,
    userId: n.user_id ?? n.userId,
    type: String(n.type || 'SYSTEM').toUpperCase(),
    timestamp: n.created_at || n.createdAt || n.timestamp,
    isRead: n.is_read ?? n.isRead ?? false,
    fromUserId: n.from_user_id || n.fromUserId,
    fromUser: n.fromUser ? mapUser(n.fromUser) : null
  };
};

export const mapStatus = (s: any): any => {
  if (!s) return s;
  const rawUser = s.user || s.User || {};
  return {
    ...s,
    id: String(s.id || ''),
    userId: String(s.userId || s.user_id || ''),
    user: mapUser(rawUser),
    content: s.content || '',
    mediaUrls: Array.isArray(s.mediaUrls) ? s.mediaUrls : (Array.isArray(s.media_urls) ? s.media_urls : []),
    likesCount: Number(s.likesCount || s.likes_count || 0),
    commentsCount: Number(s.commentsCount || s.comments_count || 0),
    hasLiked: Boolean(s.hasLiked),
    createdAt: s.createdAt || s.created_at || new Date().toISOString()
  };
};

