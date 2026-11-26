import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCall } from '../hooks/useCall';
import { useAuth } from '../hooks/useAuth';
import { callIsActive } from '../services/callService';
import './CallView.css';

function StreamVideo({ stream, label, className = '' }: { stream: MediaStream | null; label: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => {});
    return () => { video.srcObject = null; };
  }, [stream]);
  // Audio is played once, by the provider's audio element.
  return <video ref={ref} autoPlay playsInline muted aria-label={label} className={className} />;
}

export default function CallView() {
  const { callId = '' } = useParams(), { t } = useTranslation(), { user } = useAuth();
  const { call, open, accept, end, busy, localStream, remoteStream, connectionState, connectedAt,
    muted, cameraOff, toggleMute, toggleCamera, error, audioBlocked, playAudio } = useCall();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { void open(callId); }, [callId, open]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const current = call?.id === callId ? call : null;
  const incoming = current?.status === 'ringing' && current.calleeId === user?.id;
  const active = callIsActive(current);
  const name = [current?.peer?.firstName, current?.peer?.lastName].filter(Boolean).join(' ') || current?.peer?.username || t('calls.title');
  const seconds = connectedAt ? Math.max(0, Math.floor((now - connectedAt) / 1000)) : 0;
  const duration = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const status = !current ? 'calls.loading' : current.status === 'ringing' ? incoming ? 'calls.incoming' : current.calleeOnline ? 'calls.ringing' : 'calls.waiting_offline'
    : current.status === 'accepted' ? connectionState === 'connected' ? 'calls.connected' : connectionState === 'disconnected' ? 'calls.reconnecting' : 'calls.connecting'
      : current.status === 'missed' ? 'calls.no_answer' : current.status === 'declined' ? 'calls.declined' : 'calls.ended';

  return <main className="call-page" data-call-state={connectionState}>
    <header className="call-page-header"><Link to="/messages" className="call-back"><i className="bi bi-arrow-left" aria-hidden="true" /> {t('calls.back_to_messages')}</Link>
      <span><i className={`bi bi-${current?.mode === 'video' ? 'camera-video' : 'telephone'}`} aria-hidden="true" /> {t(current?.mode === 'video' ? 'calls.video' : 'calls.audio')}</span>
    </header>
    <section className="call-stage" aria-labelledby="call-peer-name">
      {current?.mode === 'video' && remoteStream && active && <StreamVideo stream={remoteStream} label={t('calls.remote_video')} className="call-remote-video" />}
      <div className={`call-identity ${remoteStream && current?.mode === 'video' && active ? 'call-identity-overlay' : ''}`}>
        {!(remoteStream && current?.mode === 'video' && active) && <div className="call-avatar">
          {current?.peer?.avatar ? <img src={current.peer.avatar} alt="" /> : <span>{name.slice(0, 1).toLocaleUpperCase()}</span>}
        </div>}
        <h1 id="call-peer-name">{name}</h1>
        {current?.peer?.username && <p className="call-username">@{current.peer.username}</p>}
        <p className="call-status" role="status">{t(status)}{connectionState === 'connected' && active ? ` · ${duration}` : ''}</p>
        {current?.status === 'ringing' && !incoming && <p className="call-hint">{t('calls.wait_hint')}</p>}
      </div>
      {current?.mode === 'video' && localStream && active && <div className={`call-local-preview ${cameraOff ? 'camera-off' : ''}`}>
        <StreamVideo stream={localStream} label={t('calls.local_video')} />
        {cameraOff && <i className="bi bi-camera-video-off" aria-hidden="true" />}<span>{t('calls.you')}</span>
      </div>}
    </section>
    {error && <p className="call-error" role="alert">{t(error)}</p>}
    {audioBlocked && active && <button className="btn btn-warning call-audio-unlock" onClick={playAudio}>{t('calls.enable_audio')}</button>}
    <footer className="call-controls">
      {incoming ? <>
        <button className="call-control call-control-end" disabled={busy} onClick={() => void end('declined')}><i className="bi bi-telephone-x-fill" aria-hidden="true" /><span>{t('calls.decline')}</span></button>
        <button className="call-control call-control-accept" disabled={busy} onClick={() => void accept()}><i className="bi bi-telephone-fill" aria-hidden="true" /><span>{t(busy ? 'calls.preparing' : 'calls.accept')}</span></button>
      </> : active ? <>
        <button className={`call-control ${muted ? 'is-disabled' : ''}`} aria-pressed={muted} onClick={toggleMute} disabled={!localStream}>
          <i className={`bi bi-mic${muted ? '-mute' : ''}-fill`} aria-hidden="true" /><span>{t(muted ? 'calls.unmute' : 'calls.mute')}</span></button>
        {current?.mode === 'video' && <button className={`call-control ${cameraOff ? 'is-disabled' : ''}`} aria-pressed={cameraOff} onClick={toggleCamera} disabled={!localStream}>
          <i className={`bi bi-camera-video${cameraOff ? '-off' : ''}-fill`} aria-hidden="true" /><span>{t(cameraOff ? 'calls.camera_on' : 'calls.camera_off')}</span></button>}
        <button className="call-control call-control-end" onClick={() => void end()}><i className="bi bi-telephone-x-fill" aria-hidden="true" /><span>{t('calls.hangup')}</span></button>
      </> : <Link to="/messages" className="btn btn-hc-primary">{t('calls.back_to_messages')}</Link>}
    </footer>
  </main>;
}
