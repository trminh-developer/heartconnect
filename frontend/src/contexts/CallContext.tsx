import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import apiClient from '../services/apiClient';
import { callService, callIsActive, type CallMode, type CallSession } from '../services/callService';
import { CallConnection } from '../utils/callConnection';
import { useCallTone, unlockCallAudio } from '../hooks/useCallTone';
import '../views/CallView.css';

export interface CallContextValue {
  call: CallSession | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  connectionState: RTCPeerConnectionState;
  connectedAt: number | null;
  busy: boolean;
  muted: boolean;
  cameraOff: boolean;
  error: string;
  audioBlocked: boolean;
  start: (conversationId: string, mode: CallMode) => Promise<void>;
  accept: () => Promise<void>;
  end: (reason?: 'hangup' | 'declined' | 'failed') => Promise<void>;
  open: (id: string) => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => void;
  playAudio: () => void;
}
export const CallContext = createContext<CallContextValue | undefined>(undefined);

function mediaError(error: any) {
  if (['NotAllowedError', 'SecurityError'].includes(error?.name)) return 'calls.permission_denied';
  if (error?.name === 'NotFoundError') return 'calls.device_missing';
  if (error?.name === 'NotReadableError') return 'calls.device_busy';
  if (error?.response?.status === 409) return 'calls.busy_error';
  return 'calls.connection_error';
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth(), { t } = useTranslation(), navigate = useNavigate(), location = useLocation();
  const [call, setCall] = useState<CallSession | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false), [muted, setMuted] = useState(false), [cameraOff, setCameraOff] = useState(false);
  const [error, setError] = useState(''), [audioBlocked, setAudioBlocked] = useState(false);
  const callRef = useRef<CallSession | null>(null), streamRef = useRef<MediaStream | null>(null);
  const engineRef = useRef<CallConnection | null>(null), iceRef = useRef<RTCIceServer[]>([]);
  const cursorRef = useRef(0), busyRef = useRef(false), endingRef = useRef(false), mounted = useRef(true);
  const audioRef = useRef<HTMLAudioElement>(null), deviceId = useRef(crypto.randomUUID());
  const userId = user?.id;

  const publish = useCallback((next: CallSession) => {
    if (!mounted.current) return;
    const previous = callRef.current;
    if (previous?.id !== next.id) { cursorRef.current = 0; setConnectedAt(null); }
    const merged = previous?.id === next.id ? { ...previous, ...next } : next;
    callRef.current = merged;
    setCall(merged);
  }, []);
  const stopMedia = useCallback(() => {
    engineRef.current?.close(); engineRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null;
    if (mounted.current) { setLocalStream(null); setRemoteStream(null); setConnectionState('closed'); }
  }, []);
  const end = useCallback(async (reason: 'hangup' | 'declined' | 'failed' = 'hangup') => {
    const current = callRef.current;
    if (!current || endingRef.current) return;
    endingRef.current = true;
    stopMedia();
    // Stop ringing immediately even if the signaling server is temporarily unreachable.
    publish({ ...current, status: reason === 'declined' ? 'declined' : 'ended', reason });
    try { publish(await callService.end(current.id, reason)); }
    catch { if (mounted.current) setError('calls.signaling_error'); }
    finally { endingRef.current = false; }
  }, [publish, stopMedia]);

  const prepareMedia = useCallback(async (mode: CallMode) => {
    unlockCallAudio();
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) throw new Error('unsupported');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true },
      video: mode === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false });
    if (!mounted.current) { stream.getTracks().forEach(track => track.stop()); throw new Error('unmounted'); }
    streamRef.current = stream; setLocalStream(stream); setMuted(false); setCameraOff(false); setConnectionState('new');
    iceRef.current = (await callService.config()).iceServers;
    if (!mounted.current) throw new Error('unmounted');
  }, []);

  const start = useCallback(async (conversationId: string, mode: CallMode) => {
    if (busyRef.current || callIsActive(callRef.current)) { setError('calls.busy_error'); return; }
    busyRef.current = true; setBusy(true); setError('');
    const id = crypto.randomUUID();
    try {
      await prepareMedia(mode);
      const created = await callService.create(id, conversationId, mode);
      publish(created); navigate(`/call/${created.id}`);
    } catch (failure) {
      stopMedia(); setError(mediaError(failure));
      void callService.end(id).catch(() => {});
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }, [navigate, prepareMedia, publish, stopMedia]);

  const accept = useCallback(async () => {
    const incoming = callRef.current;
    if (!incoming || incoming.calleeId !== userId || busyRef.current || incoming.status !== 'ringing') return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      await prepareMedia(incoming.mode);
      const accepted = await callService.accept(incoming.id);
      publish(accepted); navigate(`/call/${accepted.id}`);
    } catch (failure) { stopMedia(); setError(mediaError(failure)); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }, [navigate, prepareMedia, publish, stopMedia, userId]);

  const open = useCallback(async (id: string) => {
    if (callRef.current?.id === id) return;
    if (callIsActive(callRef.current)) { navigate(`/call/${callRef.current!.id}`, { replace: true }); return; }
    try {
      const result = await callService.get(id, 0, true);
      if (!mounted.current || callIsActive(callRef.current)) return;
      publish(result.call);
      // A reload loses the original peer connection. End it instead of showing a fake connected state.
      if (result.call.status === 'accepted' || (result.call.status === 'ringing' && result.call.callerId === userId)) {
        setError('calls.reload_ended'); await end();
      }
    } catch { setError('calls.not_found'); }
  }, [end, navigate, publish, userId]);

  useEffect(() => {
    mounted.current = true;
    if (!userId) return;
    const currentDeviceId = deviceId.current;
    let cancelled = false, timer: ReturnType<typeof setTimeout>;
    let lastPresence = 0, lastSuccess = Date.now();
    const unlock = () => unlockCallAudio();
    document.addEventListener('pointerdown', unlock, { once: true });
    const pageHide = () => {
      const base = String(apiBase());
      void fetch(`${base}/calls/presence`, { method: 'DELETE', credentials: 'include', keepalive: true,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: currentDeviceId }) }).catch(() => {});
      const current = callRef.current;
      if (callIsActive(current)) {
        // A short authenticated request lets the peer stop promptly on tab close.
        void fetch(`${base}/calls/${current!.id}/end`, { method: 'POST', credentials: 'include', keepalive: true,
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'hangup' }) }).catch(() => {});
      }
    };
    window.addEventListener('pagehide', pageHide);
    async function tick() {
      try {
        if (Date.now() - lastPresence > 10000) { await callService.presence(currentDeviceId); lastPresence = Date.now(); }
        if (cancelled) return;
        const current = callRef.current;
        if (callIsActive(current)) {
          const result = await callService.get(current!.id, cursorRef.current);
          if (cancelled || callRef.current?.id !== current!.id || !callIsActive(callRef.current)) return;
          publish(result.call);
          if (!callIsActive(result.call)) stopMedia();
          else if (result.call.status === 'accepted' && !busyRef.current) {
            if (!engineRef.current) {
              if (!streamRef.current) throw new Error('missing-media');
              const id = result.call.id;
              engineRef.current = new CallConnection(streamRef.current, iceRef.current, {
                signal: signal => callService.signal(id, signal),
                stream: stream => { if (mounted.current && callRef.current?.id === id) setRemoteStream(stream); },
                state: state => {
                  if (!mounted.current || callRef.current?.id !== id) return;
                  setConnectionState(state);
                  if (state === 'connected') setConnectedAt(value => value ?? Date.now());
                  if (state === 'failed') { setError('calls.connection_error'); void end('failed'); }
                },
                error: () => { if (callRef.current?.id === id) { setError('calls.signaling_error'); void end('failed'); } },
              });
            }
            const connection = engineRef.current;
            if (result.call.callerId === userId) await connection.offer();
            for (const signal of result.signals) { await connection.receive(signal); cursorRef.current = signal.seq; }
          }
        } else if (!busyRef.current) {
          const incoming = await callService.incoming();
          if (!cancelled && incoming.call && !callIsActive(callRef.current) && !busyRef.current) { setError(''); publish(incoming.call); }
        }
        lastSuccess = Date.now();
      } catch {
        if (!cancelled && callIsActive(callRef.current) && Date.now() - lastSuccess > 25000) {
          setError('calls.signaling_error'); await end('failed');
        }
      } finally { if (!cancelled) timer = setTimeout(tick, callIsActive(callRef.current) ? 1000 : 2500); }
    }
    void tick();
    return () => {
      cancelled = true; mounted.current = false; clearTimeout(timer);
      document.removeEventListener('pointerdown', unlock); window.removeEventListener('pagehide', pageHide);
      stopMedia(); void callService.offline(currentDeviceId).catch(() => {});
    };
  }, [end, publish, stopMedia, userId]);

  useEffect(() => {
    if (call?.status !== 'accepted' || connectionState === 'connected') return;
    const timer = setTimeout(() => { setError('calls.connection_error'); void end('failed'); }, 35000);
    return () => clearTimeout(timer);
  }, [call?.status, connectionState, end]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.srcObject = remoteStream;
    if (remoteStream) void audioRef.current.play().then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));
  }, [remoteStream]);

  const incoming = call?.status === 'ringing' && call.calleeId === userId;
  useCallTone(call?.status === 'ringing' ? incoming ? 'incoming' : call.calleeOnline ? 'ringing' : 'dialing' : null);
  const playAudio = () => { unlockCallAudio(); void audioRef.current?.play().then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true)); };
  const toggleMute = () => { const value = !muted; streamRef.current?.getAudioTracks().forEach(track => { track.enabled = !value; }); setMuted(value); };
  const toggleCamera = () => { const value = !cameraOff; streamRef.current?.getVideoTracks().forEach(track => { track.enabled = !value; }); setCameraOff(value); };
  const onCallPage = location.pathname === `/call/${call?.id}`;
  const name = [call?.peer?.firstName, call?.peer?.lastName].filter(Boolean).join(' ') || call?.peer?.username;

  return <CallContext.Provider value={{ call, localStream, remoteStream, connectionState, connectedAt, busy, muted, cameraOff, error, audioBlocked,
    start, accept, end, open, toggleMute, toggleCamera, playAudio }}>
    {children}
    <audio ref={audioRef} autoPlay />
    {incoming && !onCallPage && <div className="call-incoming-backdrop">
      <section className="call-incoming" role="dialog" aria-modal="true" aria-labelledby="incoming-call-title">
        <i className={`bi bi-${call.mode === 'video' ? 'camera-video' : 'telephone'} call-incoming-icon`} aria-hidden="true" />
        <h2 id="incoming-call-title">{name}</h2><p>{t(call.mode === 'video' ? 'calls.incoming_video' : 'calls.incoming_audio')}</p>
        {error && <p className="call-error" role="alert">{t(error)}</p>}
        <div className="call-incoming-actions">
          <button className="btn btn-outline-danger" disabled={busy} onClick={() => void end('declined')}>{t('calls.decline')}</button>
          <button className="btn btn-success" autoFocus disabled={busy} onClick={() => void accept()}>{t(busy ? 'calls.preparing' : 'calls.accept')}</button>
        </div>
      </section>
    </div>}
    {callIsActive(call) && !incoming && !onCallPage && <button className="call-return-banner" onClick={() => navigate(`/call/${call!.id}`)}>
      <i className="bi bi-telephone-fill" aria-hidden="true" /> {t('calls.return_to_call')}
    </button>}
  </CallContext.Provider>;
}

// Use the same origin/proxy as all other authenticated APIs, including Dev Tunnels.
const apiBase = () => apiClient.defaults.baseURL || '/api';
