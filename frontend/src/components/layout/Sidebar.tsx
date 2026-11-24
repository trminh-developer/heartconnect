import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useNotifications } from '../../hooks/useNotifications';
import { useChat } from '../../hooks/useChat';
import Badge from '../common/Badge';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';

interface SidebarProps {
  onNavClick?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onNavClick }) => {
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const { conversations } = useChat();
  const { t } = useTranslation();

  const unreadMessagesCount = conversations.reduce((total, conversation) => total + conversation.unreadCount, 0);

  return (
    <aside className="app-sidebar bg-white border-end d-flex flex-column py-4">
      <div className="sidebar-section mb-4 px-3">
        <h6 className="sidebar-section-title text-muted text-uppercase fs-7 fw-bold mb-3 px-3">{t('sidebar.main')}</h6>
        <nav className="sidebar-nav d-flex flex-column gap-1">
          <NavLink to="/" onClick={onNavClick} className={({ isActive }) => `sidebar-nav-link text-decoration-none d-flex align-items-center gap-3 px-3 py-2 rounded-3 ${isActive ? 'active bg-danger text-white' : 'text-dark hover-bg-light'}`}>
            <i className="bi bi-house fs-5"></i>
            <span className="fw-medium">{t('nav.home')}</span>
          </NavLink>
          <NavLink to="/discover" onClick={onNavClick} className={({ isActive }) => `sidebar-nav-link text-decoration-none d-flex align-items-center gap-3 px-3 py-2 rounded-3 ${isActive ? 'active bg-danger text-white' : 'text-dark hover-bg-light'}`}>
            <i className="bi bi-compass fs-5"></i>
            <span className="fw-medium">{t('nav.discover')}</span>
          </NavLink>
          <NavLink to="/search" onClick={onNavClick} className={({ isActive }) => `sidebar-nav-link text-decoration-none d-flex align-items-center gap-3 px-3 py-2 rounded-3 ${isActive ? 'active bg-danger text-white' : 'text-dark hover-bg-light'}`}>
            <i className="bi bi-search fs-5"></i>
            <span className="fw-medium">{t('common.search')}</span>
          </NavLink>
        </nav>
      </div>

      {user && (
        <>
          <div className="sidebar-section mb-4 px-3">
            <h6 className="sidebar-section-title text-muted text-uppercase fs-7 fw-bold mb-3 px-3">{t('sidebar.social')}</h6>
            <nav className="sidebar-nav d-flex flex-column gap-1">
              <NavLink to="/feed" onClick={onNavClick} className={({ isActive }) => `sidebar-nav-link text-decoration-none d-flex align-items-center gap-3 px-3 py-2 rounded-3 ${isActive ? 'active bg-danger text-white' : 'text-dark hover-bg-light'}`}>
                <i className="bi bi-journal-text fs-5"></i>
                <span className="fw-medium">{t('nav.feed')}</span>
              </NavLink>
              <NavLink to="/matches" onClick={onNavClick} className={({ isActive }) => `sidebar-nav-link text-decoration-none d-flex align-items-center gap-3 px-3 py-2 rounded-3 ${isActive ? 'active bg-danger text-white' : 'text-dark hover-bg-light'}`}>
                <i className="bi bi-heart fs-5"></i>
                <span className="fw-medium">{t('nav.matches')}</span>
              </NavLink>
              <NavLink to="/likes" onClick={onNavClick} className={({ isActive }) => `sidebar-nav-link text-decoration-none d-flex align-items-center gap-3 px-3 py-2 rounded-3 ${isActive ? 'active bg-danger text-white' : 'text-dark hover-bg-light'}`}>
                <i className="bi bi-stars fs-5 text-warning"></i>
                <span className="fw-medium">{t('nav.likes')}</span>
              </NavLink>
              <NavLink to="/messages" onClick={onNavClick} className={({ isActive }) => `sidebar-nav-link text-decoration-none d-flex align-items-center justify-content-between px-3 py-2 rounded-3 ${isActive ? 'active bg-danger text-white' : 'text-dark hover-bg-light'}`}>
                <div className="d-flex align-items-center gap-3">
                  <i className="bi bi-chat-dots fs-5"></i>
                  <span className="fw-medium">{t('nav.messages')}</span>
                </div>
                {unreadMessagesCount > 0 && <Badge variant="primary" text={unreadMessagesCount.toString()} />}
              </NavLink>
              <NavLink to="/notifications" onClick={onNavClick} className={({ isActive }) => `sidebar-nav-link text-decoration-none d-flex align-items-center justify-content-between px-3 py-2 rounded-3 ${isActive ? 'active bg-danger text-white' : 'text-dark hover-bg-light'}`}>
                <div className="d-flex align-items-center gap-3">
                  <i className="bi bi-bell fs-5"></i>
                  <span className="fw-medium">{t('nav.notifications')}</span>
                </div>
                {unreadCount > 0 && <Badge variant="danger" text={unreadCount.toString()} />}
              </NavLink>
            </nav>
          </div>

          <div className="sidebar-section mt-auto px-3">
            <h6 className="sidebar-section-title text-muted text-uppercase fs-7 fw-bold mb-3 px-3">{t('sidebar.account')}</h6>
            <nav className="sidebar-nav d-flex flex-column gap-1">
              <NavLink to="/profile" onClick={onNavClick} className={({ isActive }) => `sidebar-nav-link text-decoration-none d-flex align-items-center gap-3 px-3 py-2 rounded-3 ${isActive ? 'active bg-danger text-white' : 'text-dark hover-bg-light'}`}>
                <i className="bi bi-person fs-5"></i>
                <span className="fw-medium">{t('nav.profile')}</span>
              </NavLink>
              <NavLink to="/settings" onClick={onNavClick} className={({ isActive }) => `sidebar-nav-link text-decoration-none d-flex align-items-center gap-3 px-3 py-2 rounded-3 ${isActive ? 'active bg-danger text-white' : 'text-dark hover-bg-light'}`}>
                <i className="bi bi-gear fs-5"></i>
                <span className="fw-medium">{t('nav.settings')}</span>
              </NavLink>
              <NavLink to="/premium" onClick={onNavClick} className={({ isActive }) => `sidebar-nav-link text-decoration-none d-flex align-items-center gap-3 px-3 py-2 rounded-3 ${isActive ? 'active bg-warning text-white' : 'text-dark hover-bg-light'}`}>
                <i className="bi bi-gem fs-5 text-warning"></i>
                <span className="fw-medium fw-bold text-warning">{t('nav.premium')}</span>
              </NavLink>
            </nav>
          </div>
        </>
      )}

      {!user && (
        <div className="sidebar-section mt-auto px-3">
          <div className="p-3 bg-light rounded-4 text-center border">
            <div className="rounded-circle bg-danger bg-opacity-10 text-danger p-2 d-inline-flex mb-2">
              <i className="bi bi-heart-pulse-fill fs-4"></i>
            </div>
            <h6 className="fw-bold mb-1">{t('sidebar.join_title')}</h6>
            <p className="text-muted fs-8 mb-3">{t('sidebar.join_desc')}</p>
            <div className="d-flex flex-column gap-2">
              <Link to="/login" onClick={onNavClick} className="btn btn-sm btn-danger fw-semibold rounded-pill py-2">
                {t('sidebar.login_btn')}
              </Link>
              <Link to="/register" onClick={onNavClick} className="btn btn-sm btn-outline-danger fw-semibold rounded-pill py-2">
                {t('sidebar.register_btn')}
              </Link>
            </div>
          </div>
        </div>
      )}

    </aside>
  );
};
