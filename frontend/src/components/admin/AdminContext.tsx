import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAdminData } from '../../hooks/useAdminData';
import { AdminOverview } from '../../services/adminService';

interface AdminContextValue {
  overview: AdminOverview | null; loading: boolean; error: string; refreshOverview: (silent?: boolean) => void;
  notify: (message: string, tone?: 'success' | 'error') => void;
}
const AdminContext = createContext<AdminContextValue | null>(null);
export const useAdmin = () => {
  const value = useContext(AdminContext);
  if (!value) throw new Error('AdminProvider is required');
  return value;
};
export function AdminProvider({ children }: { children: React.ReactNode }) {
  const state = useAdminData<AdminOverview>('/admin/overview');
  const { silentRefresh } = state;
  const { pathname } = useLocation();
  const previousPath = useRef(pathname);
  const [toast, setToast] = useState<{ message: string; tone: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    clearTimeout(timer.current);
    setToast({ message, tone });
    timer.current = setTimeout(() => setToast(null), 5000);
  }, []);
  useEffect(() => {
    if (previousPath.current !== pathname) {
      previousPath.current = pathname;
      silentRefresh();
    }
  }, [pathname, silentRefresh]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return <AdminContext.Provider value={{ overview: state.data, loading: state.loading, error: state.error, refreshOverview: state.refresh, notify }}>
    {children}
    {toast && <div className={`admin-toast ${toast.tone}`} role="status">
      <i className={`bi bi-${toast.tone === 'success' ? 'check-circle-fill' : 'exclamation-circle-fill'}`} aria-hidden="true" />
      <span>{toast.message}</span><button aria-label="Đóng thông báo" onClick={() => setToast(null)}><i className="bi bi-x-lg" /></button>
    </div>}
  </AdminContext.Provider>;
}
