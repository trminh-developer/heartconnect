import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { User } from '../../models';
import { calculateAge } from '../../utils/helpers';
import InterestBadge from '../user/InterestBadge';
import UserBadge from '../user/UserBadge';

interface DiscoverCardProps {
  user: User;
  disabled?: boolean;
  onLike: () => void;
  onDislike: () => void;
  onSuperLike?: () => void;
  onViewProfile: () => void;
}

export const DiscoverCard: React.FC<DiscoverCardProps> = ({ 
  user, 
  disabled = false,
  onLike, 
  onDislike, 
  onSuperLike, 
  onViewProfile 
}) => {
  const { t } = useTranslation();
  const age = calculateAge(user.dateOfBirth);
  const mainPhoto = user.photos?.[0] || user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80';

  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const startPos = useRef({ x: 0, y: 0 });
  const isPointerDown = useRef(false);
  const settling = useRef(false);
  const swipeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { if (swipeTimer.current) clearTimeout(swipeTimer.current); }, []);

  const SWIPE_THRESHOLD = 90; // Khoảng cách pixel để xác nhận quẹt

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || settling.current) return;
    isPointerDown.current = true;
    startPos.current = { x: e.clientX, y: e.clientY };
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDown.current) return;
    const deltaX = e.clientX - startPos.current.x;
    const deltaY = e.clientY - startPos.current.y;
    setDragOffset({ x: deltaX, y: deltaY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDown.current) return;
    isPointerDown.current = false;
    setIsDragging(false);

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // The browser may release pointer capture before a cancellation event.
    }

    const deltaX = e.clientX - startPos.current.x;
    const deltaY = e.clientY - startPos.current.y;

    if (disabled || e.type === 'pointercancel') { setDragOffset({ x: 0, y: 0 }); return; }
    // Nếu chỉ nhấp chuột nhẹ (không kéo) -> mở xem hồ sơ
    if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) {
      setDragOffset({ x: 0, y: 0 });
      onViewProfile();
      return;
    }

    // Quẹt sang phải -> LIKE
    if (deltaX > SWIPE_THRESHOLD) {
      setDragOffset({ x: 500, y: deltaY });
      settling.current = true;
      swipeTimer.current = setTimeout(() => {
        settling.current = false;
        setDragOffset({ x: 0, y: 0 });
        onLike();
      }, 200);
      return;
    }

    // Quẹt sang trái -> BỎ QUA (PASS)
    if (deltaX < -SWIPE_THRESHOLD) {
      setDragOffset({ x: -500, y: deltaY });
      settling.current = true;
      swipeTimer.current = setTimeout(() => {
        settling.current = false;
        setDragOffset({ x: 0, y: 0 });
        onDislike();
      }, 200);
      return;
    }

    // Thả tay khi chưa đủ ngưỡng -> Nảy về vị trí cũ
    setDragOffset({ x: 0, y: 0 });
  };

  // Tính toán độ mờ của tem tương tác
  const likeOpacity = Math.min(Math.max((dragOffset.x - 20) / 70, 0), 1);
  const passOpacity = Math.min(Math.max((-dragOffset.x - 20) / 70, 0), 1);
  const rotationDeg = dragOffset.x * 0.08;

  return (
    <div 
      className="discover-card position-relative w-100 overflow-hidden rounded-4 shadow-lg bg-dark"
      style={{ 
        height: '70vh', 
        maxHeight: '600px',
        transform: `translate(${dragOffset.x}px, ${dragOffset.y}px) rotate(${rotationDeg}deg)`,
        transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'none',
        userSelect: 'none'
      }} 
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <img 
        src={mainPhoto} 
        alt={(user.firstName || user.username)} 
        className="w-100 h-100 object-fit-cover pointer-events-none" 
        draggable={false}
      />
      
      {/* Tem phản hồi thị giác: THÍCH (kéo sang phải) */}
      <div 
        className="position-absolute top-0 start-0 m-4 px-3 py-2 border border-3 border-success text-success rounded-3 fw-bold fs-3 text-uppercase shadow"
        style={{
          transform: 'rotate(-20deg)',
          opacity: likeOpacity,
          pointerEvents: 'none',
          backgroundColor: 'rgba(25, 135, 84, 0.15)',
          letterSpacing: '2px',
          zIndex: 10
        }}
      >
        <i className="bi bi-heart-fill me-2"></i> {t('common.like').toUpperCase()}
      </div>

      {/* Tem phản hồi thị giác: BỎ QUA (kéo sang trái) */}
      <div 
        className="position-absolute top-0 end-0 m-4 px-3 py-2 border border-3 border-danger text-danger rounded-3 fw-bold fs-3 text-uppercase shadow"
        style={{
          transform: 'rotate(20deg)',
          opacity: passOpacity,
          pointerEvents: 'none',
          backgroundColor: 'rgba(220, 53, 69, 0.15)',
          letterSpacing: '2px',
          zIndex: 10
        }}
      >
        <i className="bi bi-x-circle me-2"></i> {t('common.pass').toUpperCase()}
      </div>

      {user.matchPercentage != null && (
        <div 
          className="position-absolute top-0 start-0 m-3 px-3 py-1 bg-primary text-white rounded-pill fw-bold shadow-sm" 
          style={{ backdropFilter: 'blur(4px)', backgroundColor: 'rgba(233, 64, 87, 0.9) !important', opacity: isDragging ? 0 : 1 }}
        >
          {t('discover.compatibility', { score: user.matchPercentage.toFixed(2) })}
        </div>
      )}
      {user.compatibility?.coldStart && <div className="position-absolute top-0 start-0 m-3 badge bg-secondary rounded-pill">
        {t('discover.cold_start')}
      </div>}

      {/* Overlay thông tin người dùng */}
      <div className="discover-card-overlay position-absolute bottom-0 start-0 w-100 p-4 text-white pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)' }}>
        <h2 className="fw-bold mb-1 d-flex align-items-center gap-2 text-white">
          {(user.firstName || user.username)}, {age}
          <UserBadge user={user} />
        </h2>
        
        <p className="mb-2 fs-6 opacity-75">
          <i className="bi bi-geo-alt me-1"></i> {[user.location?.city, user.location?.country].filter(Boolean).join(', ') || t('discover.location_unknown')}
          {user.compatibility?.distanceKm != null && <> · {user.compatibility.distanceKm} km</>}
        </p>

        {user.profession && (
          <p className="mb-2 fs-6 opacity-75">
            <i className="bi bi-briefcase me-1"></i> {user.profession}
          </p>
        )}

        {user.interests && user.interests.length > 0 && (
          <div className="d-flex flex-wrap gap-2 mb-2">
            {user.interests.slice(0, 3).map(interest => (
              <InterestBadge key={interest.id} interest={interest} variant="light" />
            ))}
          </div>
        )}

        {user.compatibility && (
          <div className="small mb-2" aria-label={t('discover.why_recommended')}>
            {Array.isArray(user.compatibility.sharedInterests) && user.compatibility.sharedInterests.length > 0 && <div>
              <i className="bi bi-heart me-1" />{t('discover.shared_interests', { interests: user.compatibility.sharedInterests.slice(0, 3).join(', ') })}
            </div>}
            {Array.isArray(user.compatibility.reasons) && user.compatibility.reasons.includes('same_relationship_goal') && <div>
              <i className="bi bi-bullseye me-1" />{t('discover.same_goal')}
            </div>}
          </div>
        )}

        {/* Hướng dẫn cử chỉ */}
        <div className="text-center mt-2 text-white-50 small">
          <i className="bi bi-arrow-left-right me-1"></i> {t('discover.swipe_hint')}
        </div>
      </div>
    </div>
  );
};

export default DiscoverCard;
