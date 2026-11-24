import React from 'react';
import { useTranslation } from 'react-i18next';
import { Match } from '../../models';
import Button from '../common/Button';
import Avatar from '../common/Avatar';
import { useAuth } from '../../hooks/useAuth';

interface MatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  match: Match | null;
  onSendMessage: () => void;
  onKeepDiscovering: () => void;
}

export const MatchModal: React.FC<MatchModalProps> = ({ isOpen, onClose, match, onSendMessage, onKeepDiscovering }) => {
  const { user } = useAuth();
  const { t } = useTranslation();
  if (!isOpen || !match || !user) return null;

  const partner = match.matchedUser || (match as any).matched_user || {};
  const partnerName = partner.firstName || partner.first_name || partner.username || 'Đối phương';
  const partnerAvatar = partner.avatar || partner.photos?.[0] || '';

  return (
    <div className="match-modal-overlay position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-75 d-flex align-items-center justify-content-center z-index-modal">
      <div className="match-modal-content text-center p-4">
        <h1 className="text-white fw-bold fst-italic mb-5 display-4" style={{ fontFamily: 'serif' }}>
          {t('matches.matched_title')}
        </h1>
        
        <p className="text-white fs-5 mb-5">
          {t('matches.matched_desc', { name: partnerName })}
        </p>

        <div className="d-flex justify-content-center align-items-center gap-4 mb-5">
          <div className="position-relative">
            <Avatar src={user.avatar || ''} alt="You" size="xl" className="border border-3 border-white shadow-lg" style={{ width: '120px', height: '120px' }} />
          </div>
          <div className="position-relative">
            <Avatar src={partnerAvatar} alt={partnerName} size="xl" className="border border-3 border-white shadow-lg" style={{ width: '120px', height: '120px' }} />
            <div className="position-absolute bottom-0 end-0 bg-danger text-white rounded-circle d-flex align-items-center justify-content-center border border-2 border-white" style={{ width: '40px', height: '40px', right: '-10px', bottom: '-10px' }}>
              <i className="bi bi-heart-fill"></i>
            </div>
          </div>
        </div>

        <div className="d-flex flex-column gap-3 w-100 max-w-sm mx-auto" style={{ maxWidth: '300px' }}>
          <Button variant="primary" className="rounded-pill py-3 fw-bold" onClick={onSendMessage}>
            {t('matches.send_message_now')}
          </Button>
          <Button variant="outline" className="rounded-pill py-3 fw-bold text-white border-white hover-bg-light hover-text-dark" onClick={onKeepDiscovering}>
            {t('matches.keep_discovering')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MatchModal;
