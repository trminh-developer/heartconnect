import React, { createContext, useReducer, useEffect, ReactNode } from 'react';
import { User, UserProfileUpdate } from '../models';
import { authService } from '../services';
import { useRef } from 'react';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
}

type AuthAction =
  | { type: 'INIT_START' }
  | { type: 'INIT_FINISH'; payload?: User }
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; payload: User }
  | { type: 'LOGIN_FAILURE' }
  | { type: 'LOGOUT' }
  | { type: 'UPDATE_USER'; payload: User };

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isInitialized: false,
};

const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'INIT_START':
      return { ...state, isInitialized: false };
    case 'INIT_FINISH':
      return { 
        ...state, 
        user: action.payload || null, 
        isAuthenticated: !!action.payload, 
        isInitialized: true 
      };
    case 'LOGIN_START':
      return { ...state, isLoading: true };
    case 'LOGIN_SUCCESS':
      return { ...state, user: action.payload, isAuthenticated: true, isLoading: false };
    case 'LOGIN_FAILURE':
    case 'LOGOUT':
      return { ...state, user: null, isAuthenticated: false, isLoading: false };
    case 'UPDATE_USER':
      return { ...state, user: action.payload };
    default:
      return state;
  }
};

export interface AuthContextType extends AuthState {
  login: (email: string, password: string, rememberMe?: boolean) => Promise<any>;
  register: (data: any) => Promise<any>;
  logout: () => Promise<void>;
  updateUser: (changes: UserProfileUpdate) => Promise<User>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

// localStorage chỉ lưu userId để biết đang đăng nhập, KHÔNG lưu data user
const SESSION_KEY = 'hc_session_uid';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const authRevision = useRef(0);

  // A late session read must not overwrite a profile that was just saved.
  useEffect(() => {
    let cancelled = false;
    const revision = authRevision.current;
    const isCurrent = () => !cancelled && authRevision.current === revision;
    const initAuth = async () => {
      const cachedUser = authService.getCurrentUser();
      const userId = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);

      // Render ngay lap tuc neu da co thong tin user (Zero-delay render)
      if (cachedUser && cachedUser.id === userId) {
        dispatch({ type: 'INIT_FINISH', payload: cachedUser });
      } else {
        dispatch({ type: 'INIT_START' });
      }
      if (userId) {
        try {
          const freshUser = await authService.refreshUser(userId);
          if (!isCurrent()) return;
          if (freshUser) {
            authService.setCurrentUser(freshUser);
            dispatch({ type: 'INIT_FINISH', payload: freshUser });
          } else {
            localStorage.removeItem(SESSION_KEY);
            sessionStorage.removeItem(SESSION_KEY);
            authService.setCurrentUser(null);
            dispatch({ type: 'INIT_FINISH' });
          }
        } catch (err) {
          if (!isCurrent()) return;
          console.error('Lỗi kết nối server:', err);
          authService.setCurrentUser(null);
          dispatch({ type: 'INIT_FINISH' });
        }
      } else {
        authService.setCurrentUser(null);
        dispatch({ type: 'INIT_FINISH' });
      }
    };
    initAuth();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!state.user?.isPremium || !state.user.premiumExpiresAt) return;
    const remaining = new Date(state.user.premiumExpiresAt).getTime() - Date.now();
    if (!Number.isFinite(remaining)) return;
    const timer = window.setTimeout(() => {
      if (remaining > 2147483647) {
        dispatch({ type: 'UPDATE_USER', payload: { ...state.user! } });
      } else {
        const expiredUser = { ...state.user!, isPremium: false };
        authService.setCurrentUser(expiredUser);
        dispatch({ type: 'UPDATE_USER', payload: expiredUser });
      }
    }, Math.max(0, Math.min(remaining, 2147483647)));
    return () => window.clearTimeout(timer);
  }, [state.user]);

  const login = async (email: string, password: string, rememberMe: boolean = false) => {
      authRevision.current++;
      dispatch({ type: 'LOGIN_START' });
      try {
        const user = await authService.login(email, password);
      // Chỉ lưu userId, KHÔNG lưu toàn bộ data
      if (rememberMe) {
        localStorage.setItem(SESSION_KEY, user.id);
      } else {
        sessionStorage.setItem(SESSION_KEY, user.id);
      }
      authService.setCurrentUser(user);
      dispatch({ type: 'LOGIN_SUCCESS', payload: user });
        return user;
      } catch (error) {
      dispatch({ type: 'LOGIN_FAILURE' });
      throw error;
    }
  };

  const register = async (data: any) => {
    authRevision.current++;
    dispatch({ type: 'LOGIN_START' });
    try {
      const user = await authService.register(data);
      localStorage.setItem(SESSION_KEY, user.id);
      authService.setCurrentUser(user);
      dispatch({ type: 'LOGIN_SUCCESS', payload: user });
        return user;
      } catch (error) {
      dispatch({ type: 'LOGIN_FAILURE' });
      throw error;
    }
  };

  const logout = async () => {
    authRevision.current++;
    await authService.logout();
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    // Hủy token ở client (OAuth 2.0 Security)
    localStorage.removeItem('hc_access_token');
    localStorage.removeItem('hc_refresh_token');
    sessionStorage.removeItem('hc_access_token');
    sessionStorage.removeItem('hc_refresh_token');
    
    // Xóa cả key cũ nếu còn sót
    localStorage.removeItem('currentUser');
    sessionStorage.removeItem('currentUser');
    authService.setCurrentUser(null);
    dispatch({ type: 'LOGOUT' });
  };

  // Update the cache after the API has committed the profile transaction.
  const updateUser = async (changes: UserProfileUpdate) => {
    if (!state.user) throw new Error('Vui lòng đăng nhập để cập nhật thông tin.');
    authRevision.current++;
    try {
      const savedUser = await authService.updateUserInList(state.user.id, changes);
      authService.setCurrentUser(savedUser);
      dispatch({ type: 'UPDATE_USER', payload: savedUser });
      return savedUser;
    } catch (err) {
      console.error('Lỗi lưu dữ liệu lên server:', err);
      throw err;
    }
  };

  const refreshUser = async () => {
    if (!state.user) return;
    const revision = authRevision.current;
    const freshUser = await authService.refreshUser(state.user.id);
    if (authRevision.current !== revision) return;
    if (!freshUser) throw new Error('Không thể tải lại thông tin tài khoản.');
    authService.setCurrentUser(freshUser);
    dispatch({ type: 'UPDATE_USER', payload: freshUser });
  };

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, updateUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

