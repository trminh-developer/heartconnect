import { User } from '../models';
import apiClient, { getApiErrorMessage } from './apiClient';
import type { UserProfileUpdate } from '../models';

import { mapUser } from '../utils/helpers';

export const login = async (email: string, password: string): Promise<User> => {
  try {
    const res = await apiClient.post('/auth/login', { email, password });
            return mapUser(res.data.user);
  } catch (err: any) {
    throw new Error(getApiErrorMessage(err, 'Login failed'), { cause: err });
  }
};

export const register = async (data: any): Promise<User> => {
  try {
    const res = await apiClient.post('/auth/register', data);
            return mapUser(res.data.user);
  } catch (err: any) {
    throw new Error(getApiErrorMessage(err, 'Registration failed'), { cause: err });
  }
};

export const logout = async (): Promise<void> => {
  await apiClient.post('/auth/logout', {});
};

export const refreshUser = async (id: string): Promise<User | null> => {
  try {
    const res = await apiClient.get('/auth/me');
    return mapUser(res.data);
  } catch (e) {
    return null;
  }
};

export const getCurrentUser = (): User | null => {
  try {
    const userStr = localStorage.getItem('currentUser');
    const cached: unknown = userStr ? JSON.parse(userStr) : null;
    return cached && typeof cached === 'object' && 'id' in cached && typeof cached.id === 'string'
      ? mapUser(cached) : null;
  } catch {
    return null;
  }
};

export const setCurrentUser = (user: User | null): void => {
  if (user) {
    localStorage.setItem('currentUser', JSON.stringify(user));
  } else {
    localStorage.removeItem('currentUser');
  }
};

export const updateUserInList = async (id: string, changes: UserProfileUpdate): Promise<User> => {
  const res = await apiClient.put(`/users/${id}`, changes);
  return mapUser(res.data.user);
};

async function recoveryRequest(path: string, body: Record<string, string>) {
  try { await apiClient.post('/auth/' + path, body); }
  catch (error: any) { throw new Error(getApiErrorMessage(error, 'Password recovery is unavailable.'), { cause: error }); }
}
export const forgotPassword = (email: string) => recoveryRequest('forgot-password', { email });
export const verifyOTP = (email: string, otp: string) => recoveryRequest('verify-otp', { email, otp });
export const resetPassword = (email: string, password: string) => recoveryRequest('reset-password', { email, password });


