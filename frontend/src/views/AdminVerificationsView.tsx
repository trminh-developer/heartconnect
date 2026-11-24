import React, { useState } from 'react';
import { useAdmin } from '../components/admin/AdminContext';
import { useAdminData, useAdminList } from '../hooks/useAdminData';
import { AdminVerification, adminService } from '../services/adminService';
import { AdminBadge, AdminDialog, AdminEmpty, AdminError, AdminHeader, AdminLoading, AdminPagination, AdminPersona, AdminSearch, AdminSelect, RefreshButton, date, number, useAdminAction } from '../components/admin/AdminUI';

export default function AdminVerificationsView() {
  const list = useAdminList<AdminVerification>('/admin/verifications', { status: 'PENDING' });
  const { refreshOverview } = useAdmin();
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState<{ source: string; label: string } | null>(null);
  const detail = useAdminData<AdminVerification>(selected ? '/admin/verifications/' + selected : null);
  const action = useAdminAction(() => { list.refresh(); setSelected(null); });
  const request = detail.data;
  const review = (approve: boolean) => {
    if (!request) return;
    action.ask({ title: approve ? 'Phê duyệt xác thực danh tính?' : 'Từ chối yêu cầu xác thực?', description: approve ? 'Xác nhận bạn đã kiểm tra giấy tờ và hình ảnh đối chiếu. Thành viên sẽ nhận trạng thái đã xác thực danh tính.' : 'Thành viên sẽ được thông báo để kiểm tra và gửi lại hình ảnh xác thực.',
      label: approve ? 'Phê duyệt xác thực' : 'Từ chối yêu cầu', danger: !approve, action: () => adminService.review(request.id, approve), success: approve ? 'Đã phê duyệt xác thực danh tính.' : 'Đã từ chối yêu cầu xác thực.' });
  };
  return <>
    <AdminHeader title="Xác thực danh tính" description="Đối chiếu giấy tờ và hình ảnh để xây dựng một cộng đồng đáng tin cậy."><RefreshButton onClick={() => { list.refresh(); detail.refresh(); refreshOverview(true); }} busy={list.loading} /></AdminHeader>
    {list.error && <AdminError message={list.error} retry={list.refresh} />}
    <section className="admin-panel"><div className="admin-toolbar"><AdminSearch value={list.query} onChange={list.setQuery} placeholder="Tìm tên, username hoặc email…" /><AdminSelect label="Trạng thái xác thực" value={list.filter('status')} onChange={value => list.setFilter('status', value)} options={[['PENDING', 'Đang chờ duyệt'], ['ALL', 'Tất cả yêu cầu'], ['APPROVED', 'Đã phê duyệt'], ['REJECTED', 'Đã từ chối']]} /><button className="admin-text-button" onClick={list.clear}>Đặt lại bộ lọc</button></div>
      <div className="admin-result-count"><span>{number(list.data?.total)} yêu cầu xác thực</span><span>Ảnh đối chiếu được mở trong từng hồ sơ.</span></div>
      {list.loading ? <AdminLoading /> : list.data?.items.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Thành viên</th><th>Username</th><th>Ngày gửi</th><th>Trạng thái</th><th /></tr></thead><tbody>{list.data.items.map(item => <tr key={item.id}><td><AdminPersona user={item.user} email /></td><td>@{item.user?.username || '—'}</td><td>{date(item.createdAt, true)}</td><td><AdminBadge value={item.status} /></td><td><button className="admin-button secondary small" onClick={() => setSelected(item.id)}>Xem hồ sơ<i className="bi bi-arrow-up-right" /></button></td></tr>)}</tbody></table></div> : <AdminEmpty title="Không có yêu cầu cần duyệt" description="Bạn đã xem hết các yêu cầu trong bộ lọc này. Những hồ sơ mới sẽ xuất hiện tại đây." icon="patch-check" />}
      <AdminPagination data={list.data} busy={list.loading} onChange={list.setFilter} />
    </section>
    {selected && <AdminDialog title="Hồ sơ xác thực danh tính" wide onClose={() => setSelected(null)} busy={action.busy} footer={request?.status === 'PENDING' && !detail.loading ? <><button className="admin-button secondary" disabled={action.busy} onClick={() => review(false)}>Từ chối</button><button className="admin-button primary" disabled={action.busy || !request.idCardImage || !request.selfieImage} onClick={() => review(true)}><i className="bi bi-patch-check" />Phê duyệt xác thực</button></> : <button className="admin-button secondary" onClick={() => setSelected(null)}>Đóng</button>}>
      {detail.loading ? <AdminLoading /> : detail.error ? <AdminError message={detail.error} retry={detail.refresh} /> : request && <>
        <AdminPersona user={request.user} email /><p className="admin-note mt-2">Gửi lúc {date(request.createdAt, true)}</p><AdminBadge value={request.status} />
        <div className="admin-media-grid">{[['Giấy tờ tùy thân', request.idCardImage], ['Hình ảnh / video đối chiếu', request.selfieImage]].map(([label, source]) => <figure key={label}><figcaption>{label}</figcaption>{source ? source.startsWith('data:video') ? <video src={source} controls playsInline preload="metadata" /> : <button type="button" className="admin-image-button" onClick={() => setZoom({ source, label: label || 'Ảnh đối chiếu' })} aria-label={'Phóng to ' + label}><img src={source} alt={label} /></button> : <AdminEmpty title="Chưa có hình ảnh" description="Hãy yêu cầu thành viên gửi lại hồ sơ." icon="image" />}</figure>)}</div>
        <p className="admin-note"><i className="bi bi-info-circle me-1" />Kiểm tra hình ảnh rõ nét, thông tin trên giấy tờ và khuôn mặt đối chiếu trước khi phê duyệt.</p>
      </>}
    </AdminDialog>}
    {zoom && <AdminDialog title={zoom.label} onClose={() => setZoom(null)} wide><img className="admin-proof-image" src={zoom.source} alt={zoom.label} /></AdminDialog>}
    {action.dialog}
  </>;
}
