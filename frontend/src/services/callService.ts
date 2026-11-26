import apiClient from './apiClient';

export type CallMode = 'audio' | 'video';
export interface CallSession {
  id: string;
  conversationId: string;
  callerId: string;
  calleeId: string;
  mode: CallMode;
  status: 'ringing' | 'accepted' | 'ended' | 'missed' | 'declined';
  reason?: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
  endedAt?: string;
  calleeOnline: boolean;
  ringingAt?: string;
  peer?: { id: string; username: string; firstName?: string; lastName?: string; avatar?: string };
}
export type CallSignal = { seq: number; type: 'offer' | 'answer'; payload: RTCSessionDescriptionInit }
  | { seq: number; type: 'candidate'; payload: RTCIceCandidateInit };
export type OutgoingSignal = { type: 'offer' | 'answer'; payload: RTCSessionDescriptionInit }
  | { type: 'candidate'; payload: RTCIceCandidateInit };

const options = { timeout: 10000 };
export const callIsActive = (call: CallSession | null) => !!call && ['ringing', 'accepted'].includes(call.status);
export const callService = {
  async presence(deviceId: string) { await apiClient.post('/calls/presence', { deviceId }, options); },
  async offline(deviceId: string) { await apiClient.delete('/calls/presence', { ...options, data: { deviceId } }); },
  async config(): Promise<{ iceServers: RTCIceServer[]; relayConfigured: boolean }> { return (await apiClient.get('/calls/config', options)).data; },
  async incoming(): Promise<{ call: CallSession | null }> { return (await apiClient.get('/calls/incoming', options)).data; },
  async create(id: string, conversationId: string, mode: CallMode): Promise<CallSession> {
    return (await apiClient.post('/calls', { id, conversationId, mode }, options)).data;
  },
  async get(id: string, after = 0, details = false): Promise<{ call: CallSession; signals: CallSignal[] }> {
    return (await apiClient.get(`/calls/${id}`, { ...options, params: { after, ...(details ? { details: '1' } : {}) } })).data;
  },
  async accept(id: string): Promise<CallSession> { return (await apiClient.post(`/calls/${id}/accept`, {}, options)).data; },
  async end(id: string, reason: 'hangup' | 'declined' | 'failed' = 'hangup'): Promise<CallSession> {
    return (await apiClient.post(`/calls/${id}/end`, { reason }, options)).data;
  },
  async signal(callId: string, signal: OutgoingSignal) {
    const body = { id: crypto.randomUUID(), ...signal };
    for (let attempt = 0; ; attempt++) {
      try { await apiClient.post(`/calls/${callId}/signals`, body, options); return; }
      catch (error: any) {
        if (attempt >= 2 || (error.response?.status && error.response.status < 500)) throw error;
        await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
      }
    }
  },
};
