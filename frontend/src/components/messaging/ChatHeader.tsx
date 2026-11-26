import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { User } from '../../models';
import Avatar from '../common/Avatar';
import { useAlert } from '../../contexts/AlertContext';

interface ChatHeaderProps {
  user: User;
  onBack?: () => void;
  onCall?: () => void;
  onVideoCall?: () => void;
  callDisabled?: boolean;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({ user, onBack, onCall, onVideoCall, callDisabled }) => {
  const { t } = useTranslation();
  const { showAlert } = useAlert();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  return (
    <div className="chat-header p-3 bg-white border-bottom d-flex align-items-center gap-3 shadow-sm z-index-1">
      {onBack && (
        <button className="btn btn-link text-dark p-0 d-md-none" onClick={onBack}>
          <i className="bi bi-chevron-left fs-4"></i>
        </button>
      )}
      
      <Avatar src={user.avatar || ''} alt={user.firstName} size="md" isOnline={user.isOnline} />
      
      <div className="flex-grow-1" style={{ minWidth: 0 }}>
        <h6 className="mb-0 fw-bold">{user.firstName} {user.lastName}</h6>
        {user.isOnline ? (
          <small className="text-success">{t('common.online')}</small>
        ) : (
          <small className="text-muted">{t('common.offline')}</small>
        )}
      </div>

      <button className="btn btn-light rounded-circle text-primary flex-shrink-0" disabled={callDisabled || !onCall} onClick={onCall} title={t('calls.audio')} aria-label={t('calls.audio')}>
        <i className="bi bi-telephone-fill fs-5"></i>
      </button>

      <button className="btn btn-light rounded-circle text-primary flex-shrink-0" disabled={callDisabled || !onVideoCall} onClick={onVideoCall} title={t('calls.video')} aria-label={t('calls.video')}>
        <i className="bi bi-camera-video-fill fs-5"></i>
      </button>

      <div className="dropdown" ref={menuRef} onKeyDown={event => { if (event.key === 'Escape') setMenuOpen(false); }}>
        <button className="btn btn-link text-muted p-2" type="button" aria-label={t('calls.chat_options')} aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}>
          <i className="bi bi-three-dots-vertical fs-5"></i>
        </button>
        <ul className={`dropdown-menu dropdown-menu-end shadow border-0 ${menuOpen ? 'show' : ''}`} onClick={() => setMenuOpen(false)} style={{ minWidth: '240px', borderRadius: '12px', right: 0 }}>
          <li><button className="dropdown-item py-2 fw-medium" onClick={() => showAlert(t('messages.view_profile'), 'info')}><i className="bi bi-person-circle fs-5 me-3 text-secondary"></i> {t('messages.view_profile')}</button></li>
          <li><button className="dropdown-item py-2 fw-medium" onClick={() => showAlert(t('messages.mute_notifications'), 'success')}><i className="bi bi-bell-slash fs-5 me-3 text-secondary"></i> {t('messages.mute_notifications')}</button></li>
          <li><button className="dropdown-item py-2 fw-medium" onClick={() => showAlert(t('messages.theme'), 'info')}><i className="bi bi-palette fs-5 me-3 text-secondary"></i> {t('messages.theme')}</button></li>
          <li><button className="dropdown-item py-2 fw-medium" onClick={() => showAlert(t('messages.search_in_chat'), 'info')}><i className="bi bi-search fs-5 me-3 text-secondary"></i> {t('messages.search_in_chat')}</button></li>
          <li><hr className="dropdown-divider" /></li>
          <li><button className="dropdown-item py-2 fw-medium" onClick={() => showAlert(t('messages.block_user'), 'warning')}><i className="bi bi-dash-circle fs-5 me-3 text-secondary"></i> {t('messages.block_user')}</button></li>
          <li><button className="dropdown-item py-2 text-danger fw-medium" onClick={() => showAlert(t('messages.report_user'), 'warning')}><i className="bi bi-exclamation-triangle fs-5 me-3"></i> {t('messages.report_user')}</button></li>
        </ul>
      </div>
    </div>
  );
};

export default ChatHeader;
