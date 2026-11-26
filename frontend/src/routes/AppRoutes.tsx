import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { MainLayout } from '../components/layout';
import { Loading } from '../components/common';
import { useAuth } from '../hooks/useAuth';

const LoginView = lazy(() => import('../views/auth/LoginView'));
const RegisterView = lazy(() => import('../views/auth/RegisterView'));
const ForgotPasswordView = lazy(() => import('../views/auth/ForgotPasswordView'));
const HomeView = lazy(() => import('../views/HomeView'));
const DiscoverView = lazy(() => import('../views/DiscoverView'));
const SearchView = lazy(() => import('../views/SearchView'));
const MatchesView = lazy(() => import('../views/MatchesView'));
const LikesView = lazy(() => import('../views/LikesView'));
const MessagesView = lazy(() => import('../views/MessagesView'));
const CallView = lazy(() => import('../views/CallView'));
const ProfileView = lazy(() => import('../views/ProfileView'));
const NotificationsView = lazy(() => import('../views/NotificationsView'));
const SettingsView = lazy(() => import('../views/SettingsView'));
const FeedView = lazy(() => import('../views/FeedView'));
const PremiumView = lazy(() => import('../views/PremiumView'));
const PaymentView = lazy(() => import('../features/payment/presentation/views/PaymentView'));
const PaymentResultView = lazy(() => import('../features/payment/presentation/views/PaymentResultView'));
const BankPaymentView = lazy(() => import('../features/payment/presentation/views/BankPaymentView'));

// Admin
const AdminLoginView = lazy(() => import('../views/admin/AdminLoginView'));
const AdminLayout = lazy(() => import('../components/admin/AdminLayout'));
const AdminDashboardView = lazy(() => import('../views/admin/AdminDashboardView'));
const AdminUsersView = lazy(() => import('../views/admin/AdminUsersView'));
const AdminVerificationsView = lazy(() => import('../views/AdminVerificationsView'));
const AdminFeedView = lazy(() => import('../views/admin/AdminFeedView'));
const AdminReportsView = lazy(() => import('../views/admin/AdminReportsView'));
const AdminAnalyticsView = lazy(() => import('../views/admin/AdminAnalyticsView'));
const AdminSettingsView = lazy(() => import('../views/admin/AdminSettingsView'));

const ProtectedRoute = () => {
  const { isAuthenticated, isInitialized } = useAuth();
  if (!isInitialized) return <Loading text="Đang tải..." />;
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

const ProtectedAdminRoute = () => {
  const { user, isAuthenticated, isInitialized } = useAuth();
  if (!isInitialized) return <Loading text="Đang tải..." />;
  if (!isAuthenticated) return <Navigate to="/admin/login" replace />;
  if (user?.role !== 'ADMIN' && user?.role !== 'CENSOR') return <Navigate to="/" replace />;
  return <Outlet />;
};

const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isInitialized } = useAuth();
  if (!isInitialized) return <Loading text="Đang tải..." />;
  return isAuthenticated ? <Navigate to="/" replace /> : <>{children}</>;
};

const AppRoutes = () => (
  <Suspense fallback={<Loading text="Đang tải..." />}>
    <Routes>
      <Route path="/login" element={<AuthRoute><LoginView /></AuthRoute>} />
      <Route path="/register" element={<AuthRoute><RegisterView /></AuthRoute>} />
      <Route path="/forgot-password" element={<AuthRoute><ForgotPasswordView /></AuthRoute>} />
      <Route element={<ProtectedRoute />}>
        <Route path="/call/:callId" element={<CallView />} />
      </Route>
      
      {/* Admin Login Route */}
      <Route path="/admin/login" element={<AdminLoginView />} />
      
      {/* Admin Protected Routes */}
      <Route path="/admin" element={<ProtectedAdminRoute />}>
        <Route element={<AdminLayout />}>
          <Route index element={<AdminDashboardView />} />
          <Route path="users" element={<AdminUsersView />} />
          <Route path="verifications" element={<AdminVerificationsView />} />
          <Route path="feed" element={<AdminFeedView />} />
          <Route path="reports" element={<AdminReportsView />} />
          <Route path="analytics" element={<AdminAnalyticsView />} />
          <Route path="settings" element={<AdminSettingsView />} />
        </Route>
      </Route>

      <Route element={<MainLayout />}>
        {/* Công khai cho cả Guest và User */}
        <Route path="/" element={<HomeView />} />
        <Route path="/discover" element={<DiscoverView />} />
        <Route path="/search" element={<SearchView />} />

        {/* Riêng tư: Yêu cầu đăng nhập */}
        <Route element={<ProtectedRoute />}>
          <Route path="/matches" element={<MatchesView />} />
          <Route path="/likes" element={<LikesView />} />
          <Route path="/messages" element={<MessagesView />} />
          <Route path="/feed" element={<FeedView />} />
          <Route path="/profile" element={<ProfileView />} />
          <Route path="/profile/:id" element={<ProfileView />} />
          <Route path="/notifications" element={<NotificationsView />} />
          <Route path="/settings" element={<SettingsView />} />
          
          <Route path="/premium" element={<PremiumView />} />
          <Route path="/payment" element={<PaymentView />} />
          <Route path="/payment/result" element={<PaymentResultView />} />
          <Route path="/payment/bank/:orderId" element={<BankPaymentView />} />
        </Route>
      </Route>
      
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </Suspense>
);

export default AppRoutes;
