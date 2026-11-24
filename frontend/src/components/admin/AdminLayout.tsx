import React, { useEffect, useRef, useState } from 'react';
import { Outlet, Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../contexts/ThemeContext';
import { AdminProvider, useAdmin } from './AdminContext';
import { AdminPersona } from './AdminUI';
import './admin.css';

const navigation = [
  { path: '/admin', label: 'Tổng quan', icon: 'grid-1x2', group: 'KHÔNG GIAN LÀM VIỆC' },
  { path: '/admin/users', label: 'Thành viên', icon: 'people' },
  { path: '/admin/verifications', label: 'Xác thực danh tính', icon: 'patch-check', badge: 'verifications' },
  { path: '/admin/feed', label: 'Bài viết', icon: 'collection', group: 'QUẢN LÝ CỘNG ĐỒNG' },
  { path: '/admin/reports', label: 'Báo cáo vi phạm', icon: 'flag', badge: 'reports' },
  { path: '/admin/analytics', label: 'Doanh thu & Premium', icon: 'bar-chart-line', group: 'VẬN HÀNH', admin: true },
  { path: '/admin/settings', label: 'Cài đặt', icon: 'sliders2', admin: true },
];
function AdminShell() {
  const location = useLocation(), navigate = useNavigate();
  const { user, logout } = useAuth(), { isDarkMode, toggleTheme } = useTheme();
  const { overview } = useAdmin();
  const [open, setOpen] = useState(false), [search, setSearch] = useState('');
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 1023px)').matches);
  const menuButton = useRef<HTMLButtonElement>(null), sidebar = useRef<HTMLElement>(null);
  const current = navigation.find(item => item.path === location.pathname)?.label || 'Quản trị';
  useEffect(() => { document.title = current + ' · HeartConnect Admin'; setOpen(false); }, [current, location.pathname]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const update = () => setCompact(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!open || !compact) return;
    const trigger = menuButton.current;
    sidebar.current?.querySelector<HTMLAnchorElement>('a')?.focus();
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); trigger?.focus(); };
  }, [open, compact]);
  return <div className={'hc-admin' + (isDarkMode ? ' admin-dark' : '')}>
    <a className="admin-skip-link" href="#admin-content">Đến nội dung chính</a>
    {open && compact && <button className="admin-sidebar-backdrop" onClick={() => setOpen(false)} aria-label="Đóng điều hướng" />}
    <aside ref={sidebar} id="admin-navigation" className={'admin-sidebar' + (open ? ' open' : '')} inert={compact && !open}>
      <Link to="/admin" className="admin-brand"><span><i className="bi bi-heart-fill" aria-hidden="true" /></span><div>HeartConnect<small>ADMIN WORKSPACE</small></div></Link>
      <button className="admin-sidebar-close admin-icon-button" aria-label="Đóng menu" onClick={() => setOpen(false)}><i className="bi bi-x-lg" /></button>
      <div className="admin-workspace-label"><span className="admin-workspace-dot" />Quản lý nền tảng<span>HC</span></div>
      <nav aria-label="Điều hướng quản trị">{navigation.filter(item => !item.admin || user?.role === 'ADMIN').map(item => {
        const count = item.badge === 'reports' ? overview?.moderation.pendingReports : item.badge === 'verifications' ? overview?.moderation.pendingVerifications : undefined;
        return <React.Fragment key={item.path}>{item.group && <p className="admin-nav-group">{item.group}</p>}
          <NavLink to={item.path} end={item.path === '/admin'} className={({ isActive }) => 'admin-nav-link' + (isActive ? ' active' : '')}>
            <i className={'bi bi-' + item.icon} aria-hidden="true" /><span>{item.label}</span>{!!count && <b>{count > 99 ? '99+' : count}</b>}
          </NavLink></React.Fragment>;
      })}</nav>
      <div className="admin-sidebar-bottom"><p>Mỗi kết nối tốt đẹp<br />bắt đầu từ một cộng đồng an toàn.</p>
        <Link to="/"><i className="bi bi-arrow-up-right-square" aria-hidden="true" />Mở ứng dụng<i className="bi bi-arrow-up-right" aria-hidden="true" /></Link>
        <div className="admin-sidebar-account"><AdminPersona user={user} /><small>{user?.role === 'ADMIN' ? 'Quản trị viên' : 'Kiểm duyệt viên'}</small></div>
      </div>
    </aside>
    <div className="admin-main" inert={compact && open}>
      <header className="admin-topbar"><div className="admin-breadcrumb"><button ref={menuButton} className="admin-icon-button admin-menu-button" aria-label="Mở menu quản trị" aria-expanded={open} aria-controls="admin-navigation" onClick={() => setOpen(!open)}><i className="bi bi-list" /></button><span>Không gian quản trị</span><i className="bi bi-chevron-right" aria-hidden="true" /><strong>{current}</strong></div>
        <div className="admin-topbar-actions"><form className="admin-quick-search" onSubmit={event => { event.preventDefault(); navigate('/admin/users?q=' + encodeURIComponent(search.trim())); }}><i className="bi bi-search" aria-hidden="true" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm thành viên…" aria-label="Tìm thành viên trên toàn hệ thống" maxLength={150} /></form>
          <button className="admin-icon-button" onClick={toggleTheme} aria-label={isDarkMode ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}><i className={'bi bi-' + (isDarkMode ? 'sun' : 'moon')} /></button>
          <Link to="/admin/reports?status=PENDING" className="admin-icon-button admin-notification" aria-label={'Báo cáo đang chờ: ' + (overview?.moderation.pendingReports ?? 0)}><i className="bi bi-bell" />{!!overview?.moderation.pendingReports && <span />}</Link>
          <button className="admin-logout" onClick={() => void logout()} title="Đăng xuất"><i className="bi bi-box-arrow-right" /><span>Đăng xuất</span></button>
        </div></header>
      <main id="admin-content" className="admin-content" tabIndex={-1}><Outlet /></main>
      <footer className="admin-footer"><span>HeartConnect · Quản trị cộng đồng</span><span>Kết nối có ý nghĩa, cộng đồng an toàn.</span></footer>
    </div>
  </div>;
}
export default function AdminLayout() { return <AdminProvider><AdminShell /></AdminProvider>; }
