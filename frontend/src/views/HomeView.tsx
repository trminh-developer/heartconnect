import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useMatches } from '../hooks/useMatches';
import { useChat } from '../hooks/useChat';
import { useTranslation } from 'react-i18next';
import { userService } from '../services';
import { User } from '../models';
import { UserCard } from '../components/user';
import { MatchCard } from '../components/dating';
import { Loading, EmptyState, SEO, AuthPromptModal } from '../components/common';

const HomeView = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const { matches, isLoading: matchesLoading, loadMatches } = useMatches();
  const { conversations, isLoading: chatLoading, loadConversations } = useChat();
  const [recommendedUsers, setRecommendedUsers] = useState<User[]>([]);
  const [nearbyUsers, setNearbyUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [recUsers, nearUsers] = await Promise.all([
          userService.getRecommendedUsers(user?.id || ''),
          userService.getNearbyUsers(user?.id || '')
        ]);
        setRecommendedUsers(recUsers || []);
        setNearbyUsers((nearUsers || []).filter(u => u.id !== user?.id));
        
        // Chỉ tải matches và chat khi đã đăng nhập
        if (user?.id) {
          if (matches.length === 0) loadMatches();
          if (conversations.length === 0) loadConversations();
        }
      } catch (error) {
        console.error("Error loading home data", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadData();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || (user && (matchesLoading || chatLoading))) {
    return <Loading text={t('common.loading')} />;
  }

  const handleCardClick = (targetUser: User) => {
    if (!user) {
      setShowAuthModal(true);
    } else {
      navigate(`/profile/${targetUser.username || targetUser.id}`);
    }
  };

  return (
    <div className="home-view fade-in">
      <SEO title={t('nav.home')} description="HeartConnect Dating App" />
      
      {/* Banner chào mừng dành cho Guest hoặc User */}
      {!user ? (
        <div className="card border-0 rounded-4 text-white p-4 p-md-5 mb-4 shadow-sm" style={{ background: 'linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)' }}>
          <div className="row align-items-center">
            <div className="col-lg-8">
              <span className="badge bg-white text-danger px-3 py-1 rounded-pill mb-2 fw-bold text-uppercase" style={{ fontSize: '0.75rem' }}>HeartConnect Dating</span>
              <h2 className="fw-bold mb-2">{t('home.guest_title')}</h2>
              <p className="mb-4 opacity-90 fs-6">{t('home.guest_desc')}</p>
              <div className="d-flex flex-wrap gap-2">
                <Link to="/register" className="btn btn-light text-danger fw-bold rounded-pill px-4 py-2 shadow-sm">
                  <i className="bi bi-person-plus me-1"></i> {t('home.create_account')}
                </Link>
                <Link to="/login" className="btn btn-outline-light fw-medium rounded-pill px-4 py-2">
                  <i className="bi bi-box-arrow-in-right me-1"></i> {t('home.login_btn')}
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="row mb-4 slide-in-up">
          <div className="col-12">
            <h2>{t('home.welcome_back')}, {user.firstName || user.username} 👋</h2>
            <p className="text-muted">{new Date().toLocaleDateString(i18n.language?.startsWith('en') ? 'en-US' : 'vi-VN')}</p>
          </div>
        </div>
      )}

      {/* Thống kê nhanh (Chỉ hiển thị khi đã đăng nhập) */}
      {user && (
        <div className="row mb-4 slide-in-up">
          <div className="col-md-3 col-6 mb-3">
            <div className="hc-card stat-card p-3 text-center">
              <h4>120</h4>
              <p className="text-muted mb-0">{t('home.profile_views')}</p>
            </div>
          </div>
          <div className="col-md-3 col-6 mb-3">
            <div className="hc-card stat-card p-3 text-center">
              <h4>{matches?.length || 0}</h4>
              <p className="text-muted mb-0">{t('home.matches_stat')}</p>
            </div>
          </div>
          <div className="col-md-3 col-6 mb-3">
            <div className="hc-card stat-card p-3 text-center">
              <h4>45</h4>
              <p className="text-muted mb-0">{t('home.likes_stat')}</p>
            </div>
          </div>
          <div className="col-md-3 col-6 mb-3">
            <div className="hc-card stat-card p-3 text-center">
              <h4>{conversations?.length || 0}</h4>
              <p className="text-muted mb-0">{t('home.messages_stat')}</p>
            </div>
          </div>
        </div>
      )}


      {/* Gợi ý thành viên (Recommended) */}
      <div className="row mb-4 slide-in-up">
        <div className="col-12">
          <div className="hc-card">
            <div className="hc-card-header d-flex justify-content-between align-items-center">
              <h5 className="mb-0">
                <i className="bi bi-fire text-danger me-2"></i>{t('home.recommended')}
              </h5>
              <Link to="/discover" className="text-danger text-decoration-none fw-medium">
                {t('nav.discover')} <i className="bi bi-arrow-right"></i>
              </Link>
            </div>
            <div className="hc-card-body">
              <div className="row">
                {recommendedUsers.length > 0 ? (
                  recommendedUsers.slice(0, 8).map(u => (
                    <div key={u.id} className="col-md-3 col-6 mb-3">
                      <UserCard user={u} onClick={() => handleCardClick(u)} />
                    </div>
                  ))
                ) : (
                  <EmptyState icon="bi bi-people" title={t('search.no_results')} description="" />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Những người ở gần (Nearby Users) */}
      {nearbyUsers.length > 0 && (
        <div className="row mb-4 slide-in-up">
          <div className="col-12">
            <div className="hc-card">
              <div className="hc-card-header d-flex justify-content-between align-items-center">
                <h5 className="mb-0">
                  <i className="bi bi-geo-alt text-primary me-2"></i>{t('home.nearby')}
                </h5>
                <Link to="/map" className="text-primary text-decoration-none fw-medium">
                  {t('nav.map') || 'Bản đồ'} <i className="bi bi-arrow-right"></i>
                </Link>
              </div>
              <div className="hc-card-body">
                <div className="row">
                  {nearbyUsers.slice(0, 8).map(u => (
                    <div key={u.id} className="col-md-3 col-6 mb-3">
                      <UserCard user={u} onClick={() => handleCardClick(u)} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tương hợp mới (New Matches - Chỉ cho User) */}
      {user && (
        <div className="row mb-4 slide-in-up">
          <div className="col-12">
            <div className="hc-card">
              <div className="hc-card-header">
                <h5 className="mb-0">{t('home.matches_stat')}</h5>
              </div>
              <div className="hc-card-body">
                <div className="d-flex overflow-auto">
                  {matches && matches.length > 0 ? (
                    matches.map(m => (
                      <div key={m.id} className="me-3" style={{ minWidth: '150px' }}>
                        <MatchCard 
                          match={m} 
                          onMessage={() => navigate('/messages')} 
                          onClick={() => navigate(`/profile/${m.matchedUser?.username || m.matchedUser?.id}`)} 
                        />
                      </div>
                    ))
                  ) : (
                    <EmptyState icon="bi bi-heartbreak" title={t('matches.empty_title')} description="" />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal yêu cầu Guest đăng nhập */}
      <AuthPromptModal 
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        title={t('auth_prompt.title')}
        description={t('auth_prompt.desc')}
      />
    </div>
  );
};

export default HomeView;
