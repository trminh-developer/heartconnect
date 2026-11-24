import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import apiClient, { getApiErrorMessage } from '../services/apiClient';
import { AdminPage } from '../services/adminService';

export const adminErrorMessage = (error: unknown) => {
  const failure = error as { response?: { data?: { error?: unknown; message?: unknown } } };
  const hasServerPayload = failure?.response?.data?.error !== undefined || failure?.response?.data?.message !== undefined;
  return hasServerPayload ? getApiErrorMessage(error, 'Không thể kết nối máy chủ. Vui lòng thử lại.') : 'Không thể kết nối máy chủ. Vui lòng thử lại.';
};
export function useAdminData<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const silentNext = useRef(false);
  const lastFetchedAt = useRef(0);
  const refresh = useCallback((silent = false) => {
    if (!url) return;
    silentNext.current = silent;
    setRevision(value => value + 1);
  }, [url]);
  const silentRefresh = useCallback(() => refresh(true), [refresh]);
  useEffect(() => {
    if (!url) { setData(null); setLoading(false); silentNext.current = false; return; }
    const controller = new AbortController();
    const isSilent = silentNext.current;
    silentNext.current = false;
    if (!isSilent) setLoading(true);
    setError('');
    void apiClient.get<T>(url, { signal: controller.signal }).then(response => {
      if (!controller.signal.aborted) {
        setData(response.data);
        lastFetchedAt.current = Date.now();
      }
    }).catch(failure => {
      if (!controller.signal.aborted && !isSilent) setError(adminErrorMessage(failure));
    }).finally(() => { if (!controller.signal.aborted && !isSilent) setLoading(false); });
    return () => controller.abort();
  }, [url, revision]);
  useEffect(() => {
    if (!url) return;
    const syncIfStale = () => {
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - lastFetchedAt.current < 1500) return;
      silentRefresh();
    };
    window.addEventListener('focus', syncIfStale);
    document.addEventListener('visibilitychange', syncIfStale);
    return () => {
      window.removeEventListener('focus', syncIfStale);
      document.removeEventListener('visibilitychange', syncIfStale);
    };
  }, [url, silentRefresh]);
  return { data, loading, error, refresh, silentRefresh };
}

export function useAdminList<T>(path: string, defaults: Record<string, string> = {}) {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const [query, setQuery] = useState(q);
  const setFilter = useCallback((key: string, value: string) => {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value); else next.delete(key);
      if (key !== 'page') next.set('page', '1');
      return next;
    }, { replace: true });
  }, [setParams]);
  useEffect(() => { setQuery(q); }, [q]);
  useEffect(() => {
    if (query === q) return;
    const timer = setTimeout(() => setFilter('q', query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query, q, setFilter]);
  const request = new URLSearchParams(defaults);
  params.forEach((value, key) => request.set(key, value));
  const state = useAdminData<AdminPage<T>>(path + '?' + request.toString());
  useEffect(() => {
    if (state.data && !state.loading && state.data.page > state.data.totalPages) setFilter('page', String(state.data.totalPages));
  }, [state.data, state.loading, setFilter]);
  return { ...state, query, setQuery, setFilter,
    filter: (key: string) => params.get(key) || defaults[key] || 'ALL',
    clear: () => { setQuery(''); setParams({}, { replace: true }); },
  };
}
