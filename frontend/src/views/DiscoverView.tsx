import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DiscoverCard, MatchModal } from '../components/dating';
import { Button, Loading, EmptyState, SEO, AuthPromptModal } from '../components/common';
import { useMatches } from '../hooks/useMatches';
import { useAuth } from '../hooks/useAuth';
import { userService } from '../services';
import { useAlert } from '../contexts/AlertContext';
import { useDiscoveryFeed } from '../hooks/useDiscoveryFeed';

const DiscoverView = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAuthPromptModal, setShowAuthPromptModal] = useState(false);
  const feed = useDiscoveryFeed(currentUser);
  const { users, isLoading, loadError, loadMore, refresh, hasMore, isLoadingMore, locationRequired } = feed;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitting = useRef(false);
  const { showAlert } = useAlert();
  const actionGeneration = useRef(0);
  const cardElement = useRef<HTMLDivElement>(null);
  const { likeUser, dislikeUser, superLikeUser, showMatchModal, newMatch, closeMatchModal } = useMatches();

  useEffect(() => {
    setCurrentIndex(0);
    actionGeneration.current++;
    submitting.current = false;
    setIsSubmitting(false);
  }, [feed.key, feed.revision]);

  useEffect(() => {
    if (hasMore && !loadError && currentIndex >= users.length - 4) void loadMore();
  }, [currentIndex, users.length, hasMore, loadError, loadMore]);

  const currentCard = users[currentIndex] || null;
  useEffect(() => {
    const element = cardElement.current;
    if (!element || !currentCard?.discoverySessionId || showMatchModal || !('IntersectionObserver' in window)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let recorded = false;
    const observer = new IntersectionObserver(entries => {
      if (timer) clearTimeout(timer);
      if (entries[0]?.isIntersecting && entries[0].intersectionRatio >= 0.6 && !recorded) {
        timer = setTimeout(() => {
          recorded = true;
          void userService.recordDiscoveryImpression(currentCard.discoverySessionId!, currentCard.id)
            .catch(() => { recorded = false; });
        }, 500);
      }
    }, { threshold: [0, 0.6] });
    observer.observe(element);
    return () => { observer.disconnect(); if (timer) clearTimeout(timer); };
  }, [currentCard?.id, currentCard?.discoverySessionId, showMatchModal, isLoading]);

  const handleNext = () => {
    setCurrentIndex(prev => prev + 1);
  };

  const handleAction = async (action: (id: string) => Promise<unknown>) => {
    if (!currentUser) {
      setShowAuthPromptModal(true);
      return;
    }
    const user = users[currentIndex];
    if (!user || submitting.current) return;
    submitting.current = true;
    const generation = ++actionGeneration.current;
    setIsSubmitting(true);
    try {
      await action(user.id);
      if (generation === actionGeneration.current) handleNext();
    } catch (error: any) {
      if (generation === actionGeneration.current) showAlert(error.response?.data?.error || t('discover.action_error'), 'error');
    } finally {
      if (generation === actionGeneration.current) { submitting.current = false; setIsSubmitting(false); }
    }
  };

  const handleLike = () => handleAction(likeUser);
  const handleDislike = () => handleAction(dislikeUser);
  const handleSuperLike = () => handleAction(superLikeUser);

  if (isLoading) return <Loading text={t('discover.loading')} />;


  return (
    <div className="discover-view fade-in d-flex flex-column align-items-center justify-content-center h-100 py-3">
      <SEO title={t('discover.title')} description={t('discover.seo_desc')} />
      {currentUser && <button className="btn btn-link mb-2" onClick={() => navigate('/settings')}>
        <i className="bi bi-sliders me-2" />{t('discover.preferences')}
      </button>}
      {currentCard ? (
        <div ref={cardElement} className="discover-container d-flex flex-column align-items-center" style={{ maxWidth: '420px', width: '100%' }}>
          <DiscoverCard 
            key={currentCard.id}
            disabled={isSubmitting}
            user={currentCard} 
            onLike={handleLike}
            onDislike={handleDislike}
            onSuperLike={handleSuperLike}
            onViewProfile={() => {
              if (!currentUser) {
                setShowAuthPromptModal(true);
              } else {
                navigate(`/profile/${currentCard.username || currentCard.id}`);
              }
            }}
          />
          
          {/* Thanh tương tác */}
          <div className="discover-actions d-flex align-items-center justify-content-center gap-3 mt-4 w-100">
            <button 
              className="btn btn-light shadow-sm rounded-circle p-3 text-secondary border hover-shadow"
              title={t('discover.rewind')}
              onClick={() => {
                if (currentIndex > 0) setCurrentIndex(prev => prev - 1);
              }}
              disabled={currentIndex === 0 || isSubmitting}
            >
              <i className="bi bi-arrow-counterclockwise fs-4"></i>
            </button>

            <button 
              className="btn btn-light text-danger shadow-sm rounded-circle p-3 border hover-shadow"
              title={t('common.pass')}
              onClick={handleDislike}
              disabled={isSubmitting}
            >
              <i className="bi bi-x-lg fs-4"></i>
            </button>

            <Button 
              className="btn-info rounded-circle shadow p-3 text-white" 
              title="Super Like"
              onClick={handleSuperLike}
              disabled={isSubmitting}
            >
              <i className="bi bi-star-fill fs-4 text-white"></i>
            </Button>

            <Button 
              className="btn-danger rounded-circle shadow p-3 text-white" 
              title={t('discover.like_btn')}
              style={{ background: 'linear-gradient(45deg, #ff4b2b, #ff416c)', border: 'none' }}
              onClick={handleLike}
              disabled={isSubmitting}
            >
              <i className="bi bi-heart-fill fs-4"></i>
            </Button>
          </div>
        </div>
      ) : isLoadingMore ? <Loading text={t('discover.loading')} /> : (
        <div className="text-center">
          <EmptyState
            icon={loadError ? 'bi bi-wifi-off' : 'bi bi-heartbreak'}
            title={t(loadError ? 'discover.load_error' : 'discover.no_more_users')}
            description={t(loadError ? 'discover.load_error_desc' : locationRequired ? 'discover.location_required' : 'discover.no_more_users_desc')}
          />
          <Button onClick={() => { setCurrentIndex(0); if (hasMore) void loadMore(); else refresh(); }}>{t('discover.refresh')}</Button>
        </div>
      )}

      {/* Modal chúc mừng tương hợp */}
      {showMatchModal && newMatch && (
        <MatchModal 
          isOpen={showMatchModal}
          match={newMatch} 
          onClose={closeMatchModal}
          onSendMessage={() => { closeMatchModal(); navigate('/messages'); }}
          onKeepDiscovering={closeMatchModal}
        />
      )}

      {/* Modal yêu cầu Guest Đăng nhập/Đăng ký khi quẹt thẻ hoặc thả tim */}
      <AuthPromptModal 
        isOpen={showAuthPromptModal}
        onClose={() => setShowAuthPromptModal(false)}
        title={t('auth_prompt.title')}
        description={t('auth_prompt.desc')}
      />
    </div>
  );
};

export default DiscoverView;
