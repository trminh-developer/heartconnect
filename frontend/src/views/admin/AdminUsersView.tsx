import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAdmin } from '../../components/admin/AdminContext';
import { useAdminList } from '../../hooks/useAdminData';
import { AdminUser, adminService } from '../../services/adminService';
import { AdminBadge, AdminDialog, AdminEmpty, AdminError, AdminHeader, AdminLoading, AdminMetric, AdminPagination, AdminPersona, AdminSearch, AdminSelect, RefreshButton, date, number, personName, useAdminAction } from '../../components/admin/AdminUI';

export default function AdminUsersView() {
  const list = useAdminList<AdminUser>('/admin/users'), { overview } = useAdmin(), { user } = useAuth();
  const [selected, setSelected] = useState<AdminUser | null>(null), [role, setRole] = useState('USER');
  const action = useAdminAction(() => { list.refresh(); setSelected(null); });
  const manageable = selected && selected.id !== user?.id && selected.role !== 'ADMIN' && selected.status !== 'DELETED' && (user?.role === 'ADMIN' || selected.role === 'USER');
  return <>
    <AdminHeader title="Quản lý thành viên" description="Tìm kiếm, theo dõi và quản lý các thành viên trong cộng đồng."><RefreshButton onClick={list.refresh} busy={list.loading} /></AdminHeader>
    <div className="admin-metrics">
      <AdminMetric label="Tổng thành viên" value={number(overview?.users.total)} icon="people" detail="Tài khoản trên nền tảng" />
      <AdminMetric label="Đang hoạt động" value={number(overview?.users.active)} icon="person-check" detail="Tài khoản được phép truy cập" tone="green" />
      <AdminMetric label="Đã xác thực" value={number(overview?.users.verified)} icon="patch-check" detail="Danh tính được phê duyệt" tone="blue" />
      <AdminMetric label="Đang bị khóa" value={number(overview?.users.banned)} icon="person-lock" detail="Tài khoản đã bị hạn chế" tone="amber" />
    </div>
    {list.error && <AdminError message={list.error} retry={list.refresh} />}
    <section className="admin-panel">
      <div className="admin-toolbar"><AdminSearch value={list.query} onChange={list.setQuery} placeholder="Tìm theo tên, username, email…" />
        <AdminSelect label="Lọc phân quyền" value={list.filter('role')} onChange={value => list.setFilter('role', value)} options={[['ALL', 'Tất cả vai trò'], ['USER', 'Thành viên'], ['CENSOR', 'Kiểm duyệt viên'], ['ADMIN', 'Quản trị viên']]} />
        <AdminSelect label="Lọc trạng thái tài khoản" value={list.filter('status')} onChange={value => list.setFilter('status', value)} options={[['ALL', 'Mọi trạng thái'], ['ACTIVE', 'Đang hoạt động'], ['BANNED', 'Đã khóa'], ['DELETED', 'Đã xóa']]} />
        <AdminSelect label="Lọc xác thực" value={list.filter('verified')} onChange={value => list.setFilter('verified', value)} options={[['ALL', 'Mọi xác thực'], ['true', 'Đã xác thực'], ['false', 'Chưa xác thực']]} />
      </div>
      <div className="admin-result-count"><span>Danh sách thành viên <strong>({number(list.data?.total)})</strong></span><button className="admin-text-button" onClick={list.clear}>Xóa bộ lọc</button></div>
      {list.loading ? <AdminLoading /> : list.data?.items.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Thành viên</th><th>Vai trò</th><th>Trạng thái</th><th>Xác thực</th><th>Vi phạm</th><th>Ngày tham gia</th><th /></tr></thead><tbody>{list.data.items.map(member => <tr key={member.id}>
        <td><AdminPersona user={member} email /></td><td><AdminBadge value={member.role} /></td><td><AdminBadge value={member.status} /></td>
        <td>{member.isVerified ? <span className="admin-badge green"><i className="bi bi-patch-check-fill" />Đã xác thực</span> : <span className="admin-note">Chưa xác thực</span>}</td>
        <td><span className={member.violationCount ? 'admin-badge amber' : 'admin-note'}>{number(member.violationCount || 0)} lần</span></td>
        <td className="nowrap">{date(member.createdAt)}</td><td><button className="admin-button secondary small" onClick={() => { setSelected(member); setRole(member.role); }}>Chi tiết<i className="bi bi-arrow-up-right" /></button></td>
      </tr>)}</tbody></table></div> : <AdminEmpty title={list.error ? 'Chưa tải được danh sách' : 'Không tìm thấy thành viên'} description="Thử tên hoặc email khác, hoặc xóa bộ lọc để xem lại danh sách." icon="people" />}
      <AdminPagination data={list.data} busy={list.loading} onChange={list.setFilter} />
    </section>
    {selected && <AdminDialog title="Hồ sơ thành viên" onClose={() => setSelected(null)} busy={action.busy} footer={<>
      <Link className="admin-button secondary" to={'/profile/' + selected.username} target="_blank" rel="noreferrer">Mở hồ sơ <i className="bi bi-arrow-up-right" /></Link>
      <button className="admin-button secondary" onClick={() => setSelected(null)} disabled={action.busy}>Đóng</button>
    </>}>
      <AdminPersona user={selected} email />
      <dl className="admin-profile-details"><div><dt>Username</dt><dd>@{selected.username}</dd></div><div><dt>Trạng thái</dt><dd><AdminBadge value={selected.status} /></dd></div><div><dt>Ngày tham gia</dt><dd>{date(selected.createdAt, true)}</dd></div><div><dt>Hoạt động gần nhất</dt><dd>{date(selected.lastActive, true)}</dd></div><div><dt>Vi phạm đã ghi nhận</dt><dd>{number(selected.violationCount || 0)} lần</dd></div><div><dt>Premium</dt><dd>{selected.isPremium && selected.premiumExpiresAt && new Date(selected.premiumExpiresAt) > new Date() ? 'Có hiệu lực đến ' + date(selected.premiumExpiresAt) : 'Chưa có gói còn hiệu lực'}</dd></div></dl>
      {user?.role === 'ADMIN' && selected.id !== user.id && selected.email !== 'admin@heartconnect.com' && selected.status !== 'DELETED' && <div className="admin-control-section"><h3>Phân quyền truy cập</h3><div className="admin-actions"><AdminSelect label="Vai trò mới" value={role} onChange={setRole} options={[['USER', 'Thành viên'], ['CENSOR', 'Kiểm duyệt viên'], ['ADMIN', 'Quản trị viên']]} />
        <button className="admin-button secondary" disabled={role === selected.role || action.busy} onClick={() => action.ask({ title: 'Thay đổi phân quyền?', description: 'Cập nhật quyền truy cập cho ' + personName(selected) + '.', label: 'Cập nhật vai trò', action: () => adminService.role(selected.id, role), success: 'Đã cập nhật phân quyền.' })}>Lưu vai trò</button></div></div>}
      {manageable && <div className="admin-control-section"><h3>Quản lý tài khoản</h3><div className="admin-actions">
        <button className={'admin-button ' + (selected.status === 'ACTIVE' ? 'danger' : 'secondary')} disabled={action.busy} onClick={() => action.ask({ title: selected.status === 'ACTIVE' ? 'Khóa tài khoản này?' : 'Mở lại tài khoản?', description: selected.status === 'ACTIVE' ? personName(selected) + ' sẽ không thể đăng nhập hay xuất hiện trong gợi ý khi bị khóa.' : 'Khôi phục quyền truy cập cho ' + personName(selected) + '.', label: selected.status === 'ACTIVE' ? 'Khóa tài khoản' : 'Mở khóa', danger: selected.status === 'ACTIVE', action: () => adminService.status(selected.id, selected.status === 'ACTIVE' ? 'BANNED' : 'ACTIVE'), success: 'Đã cập nhật trạng thái tài khoản.' })}>{selected.status === 'ACTIVE' ? 'Khóa tài khoản' : 'Mở khóa'}</button>
        {selected.violationCount > 0 && <button className="admin-button secondary" disabled={action.busy} onClick={() => action.ask({ title: 'Đặt lại vi phạm?', description: 'Đặt số vi phạm của ' + personName(selected) + ' về 0. Trạng thái khóa không tự thay đổi.', label: 'Đặt lại vi phạm', action: () => adminService.resetViolations(selected.id), success: 'Đã đặt lại số vi phạm.' })}>Đặt lại vi phạm</button>}
        {selected.isVerified && <button className="admin-button secondary" disabled={action.busy} onClick={() => action.ask({ title: 'Thu hồi xác thực danh tính?', description: 'Thu hồi xác thực của ' + personName(selected) + '. Gói Premium hiện có vẫn giữ nguyên.', label: 'Thu hồi xác thực', danger: true, action: () => adminService.revokeVerification(selected.id), success: 'Đã thu hồi xác thực danh tính.' })}>Thu hồi xác thực</button>}
      </div></div>}
      {user?.role === 'ADMIN' && selected.id !== user.id && selected.email !== 'admin@heartconnect.com' && <div className="admin-control-section"><h3>Vùng nguy hiểm</h3><div className="admin-actions">
        <button className="admin-button danger" disabled={action.busy} onClick={() => action.ask({ title: 'Xóa vĩnh viễn tài khoản và dữ liệu?', description: 'Thao tác này sẽ xóa hoàn toàn tài khoản của ' + personName(selected) + ', bao gồm bài viết, tin nhắn, ảnh, lượt tương thích và mọi dữ liệu liên quan. Hành động này KHÔNG THỂ hoàn tác.', label: 'Xóa vĩnh viễn tài khoản', danger: true, action: () => adminService.deleteUser(selected.id), success: 'Đã xóa hoàn toàn tài khoản và dữ liệu người dùng.' })}><i className="bi bi-trash-fill me-1" />Xóa tài khoản & dữ liệu</button>
      </div></div>}
    </AdminDialog>}
    {action.dialog}
  </>;
}
