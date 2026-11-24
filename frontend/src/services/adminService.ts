import apiClient from './apiClient';

export interface AdminPerson {
  id: string; username: string; firstName?: string; lastName?: string; avatar?: string; email?: string;
}
export interface AdminUser extends AdminPerson {
  role: 'ADMIN' | 'CENSOR' | 'USER'; status: 'ACTIVE' | 'BANNED' | 'DELETED';
  isVerified: boolean; violationCount: number; createdAt: string; lastActive?: string;
  isPremium: boolean; premiumExpiresAt?: string;
}
export interface AdminPost {
  id: string; content: string; mediaUrls: string[]; createdAt: string; isHidden: boolean; User?: AdminPerson;
}
export interface AdminReport {
  id: string; reason: string; description?: string; status: 'PENDING' | 'RESOLVED' | 'DISMISSED'; createdAt: string;
  Reporter?: AdminPerson; ReportedUser?: AdminPerson; ReportedStatus?: AdminPost;
}
export interface AdminVerification {
  id: string; userId: string; user?: AdminPerson; status: 'PENDING' | 'APPROVED' | 'REJECTED'; createdAt: string;
  idCardImage?: string; selfieImage?: string;
}
export interface AdminPage<T> { items: T[]; page: number; pageSize: number; total: number; totalPages: number }
export interface AdminOverview {
  days: number; updatedAt: string; users: { total: number; active: number; banned: number; verified: number; premium: number; newInPeriod: number; activeWeek: number };
  moderation: { pendingReports: number; pendingVerifications: number; visiblePosts: number };
  matchesInPeriod: number; revenue?: number; trend: { date: string; users: number; matches: number }[];
  recentUsers: AdminUser[]; reportQueue: AdminReport[]; verificationQueue: AdminVerification[];
}
export interface AdminTransaction {
  id: string; planId: string; provider: string; amount: number; status: string; createdAt: string; user?: AdminPerson;
}
export interface AdminAnalytics {
  days: number; revenue: number; successful: number; pending: number; failed: number; premium: number; expiring: number;
  providers: { provider: string; count: number; amount: number }[];
  plans: { planId: string; count: number; amount: number }[];
  trend: { date: string; revenue: number }[]; transactions: AdminTransaction[];
}
export interface AdminSettings { MAX_VIOLATIONS: string; AUTO_BAN_ENABLED: string; WARNING_NOTIFICATION_ENABLED: string }
export const adminService = {
  role: (id: string, role: string) => apiClient.put(`/admin/users/${id}/role`, { role }),
  status: (id: string, status: string) => apiClient.put(`/admin/users/${id}/status`, { status }),
  resetViolations: (id: string) => apiClient.put(`/admin/users/${id}/reset-violations`),
  revokeVerification: (id: string) => apiClient.put(`/admin/users/${id}/verification/revoke`),
  visibility: (id: string, hidden: boolean) => apiClient.put(`/admin/feed/${id}/visibility`, { hidden }),
  report: (id: string, status: string, penalize = false) => apiClient.put(`/admin/reports/${id}`, { status, penalize }),
  verification: async (id: string): Promise<AdminVerification> => (await apiClient.get(`/admin/verifications/${id}`)).data,
  review: (id: string, approve: boolean) => apiClient.post(`/admin/verifications/${id}/${approve ? 'approve' : 'reject'}`),
  settings: (settings: AdminSettings) => apiClient.put('/admin/settings', { settings }),
  deleteUser: (id: string) => apiClient.delete(`/admin/users/${id}`),
};
