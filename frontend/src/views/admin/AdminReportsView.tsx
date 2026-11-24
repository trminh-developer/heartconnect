import React, { useState } from 'react';
import { useAdmin } from '../../components/admin/AdminContext';
import { useAdminList } from '../../hooks/useAdminData';
import { AdminReport, adminService } from '../../services/adminService';
import { AdminBadge, AdminDialog, AdminEmpty, AdminError, AdminHeader, AdminLoading, AdminPagination, AdminPersona, AdminSearch, AdminSelect, RefreshButton, date, number, useAdminAction } from '../../components/admin/AdminUI';

export default function AdminReportsView() {
  const list = useAdminList<AdminReport>('/admin/reports', { status: 'PENDING' });
  const { refreshOverview } = useAdmin();
  const [selected, setSelected] = useState<AdminReport | null>(null);
  const active = selected ? list.data?.items.find(item => item.id === selected.id) || selected : null;
  const action = useAdminAction(() => { list.refresh(); setSelected(null); });
  const resolve = (report: AdminReport, status: 'RESOLVED' | 'DISMISSED', penalize = false) => action.ask({
    title: penalize ? 'Xác nhận vi phạm?' : status === 'DISMISSED' ? 'Bỏ qua báo cáo này?' : 'Đóng báo cáo đã xử lý?',
    description: penalize ? 'Tài khoản bị báo cáo sẽ nhận thêm 1 vi phạm. Chính sách khóa tài khoản tự động sẽ được áp dụng nếu đạt ngưỡng.' : status === 'DISMISSED' ? 'Báo cáo được đóng mà không xử phạt tài khoản bị báo cáo.' : 'Đánh dấu đã kiểm tra và xử lý, không cộng vi phạm.',
    label: penalize ? 'Xác nhận & xử phạt' : status === 'DISMISSED' ? 'Bỏ qua báo cáo' : 'Đánh dấu đã xử lý', danger: penalize,
    action: () => adminService.report(report.id, status, penalize), success: penalize ? 'Đã xử lý báo cáo và áp dụng chính sách vi phạm.' : 'Đã cập nhật báo cáo.',
  });
  return <>
    <AdminHeader title="Báo cáo vi phạm" description="Xem xét phản ánh của thành viên và xử lý nội dung không phù hợp."><RefreshButton onClick={() => { list.refresh(); refreshOverview(true); }} busy={list.loading} /></AdminHeader>
    {list.error && <AdminError message={list.error} retry={list.refresh} />}
    <section className="admin-panel"><div className="admin-toolbar"><AdminSearch value={list.query} onChange={list.setQuery} placeholder="Tìm lý do, mô tả hoặc username…" />
      <AdminSelect label="Trạng thái báo cáo" value={list.filter('status')} onChange={value => list.setFilter('status', value)} options={[['PENDING', 'Đang chờ xử lý'], ['ALL', 'Tất cả báo cáo'], ['RESOLVED', 'Đã xử lý'], ['DISMISSED', 'Đã bỏ qua']]} /><button className="admin-text-button" onClick={list.clear}>Đặt lại bộ lọc</button></div>
      <div className="admin-result-count"><span>{number(list.data?.total)} báo cáo</span><span>Kiểm tra chi tiết trước khi xác nhận vi phạm.</span></div>
      {list.loading ? <AdminLoading /> : list.data?.items.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Người gửi</th><th>Đối tượng báo cáo</th><th>Lý do</th><th>Trạng thái</th><th>Ngày gửi</th><th /></tr></thead><tbody>{list.data.items.map(report => <tr key={report.id}><td><AdminPersona user={report.Reporter} /></td><td><AdminPersona user={report.ReportedUser || report.ReportedStatus?.User} /></td><td><strong>{report.reason}</strong><div className="admin-post-excerpt admin-note">{report.description || 'Không có mô tả bổ sung'}</div></td><td><AdminBadge value={report.status} /></td><td className="nowrap">{date(report.createdAt, true)}</td><td><button className="admin-button secondary small" onClick={() => setSelected(report)}>{report.status === 'PENDING' ? 'Xem xét' : 'Chi tiết'}<i className="bi bi-arrow-up-right" /></button></td></tr>)}</tbody></table></div> : <AdminEmpty title="Không có báo cáo cần xem xét" description="Cộng đồng đang được chăm sóc. Bạn có thể xem lại các báo cáo đã xử lý bằng bộ lọc." icon="shield-check" />}
      <AdminPagination data={list.data} busy={list.loading} onChange={list.setFilter} />
    </section>
    {active && <AdminDialog title="Xem xét báo cáo" onClose={() => setSelected(null)} wide busy={action.busy} footer={active.status === 'PENDING' ? <>
      <button className="admin-button secondary" disabled={action.busy} onClick={() => resolve(active, 'DISMISSED')}>Bỏ qua</button>
      <button className="admin-button secondary" disabled={action.busy} onClick={() => resolve(active, 'RESOLVED')}>Đã xử lý, không phạt</button>
      <button className="admin-button danger" disabled={action.busy || !(active.ReportedUser || active.ReportedStatus?.User)} onClick={() => resolve(active, 'RESOLVED', true)}>Xác nhận vi phạm (+1)</button>
    </> : <button className="admin-button secondary" onClick={() => setSelected(null)}>Đóng</button>}>
      <div className="admin-profile-details"><div><span className="admin-note">Người gửi báo cáo</span><AdminPersona user={active.Reporter} /></div><div><span className="admin-note">Tài khoản bị báo cáo</span><AdminPersona user={active.ReportedUser || active.ReportedStatus?.User} /></div></div>
      <AdminBadge value={active.status} /><p className="admin-note mt-2">Gửi lúc {date(active.createdAt, true)}</p><h3 className="fs-6 mt-4">{active.reason}</h3><p className="admin-post-content">{active.description || 'Không có mô tả bổ sung.'}</p>
      {active.ReportedStatus && <div className="admin-policy-example"><h3>Nội dung được báo cáo</h3><p className="admin-post-content">{active.ReportedStatus.content || 'Bài viết không có nội dung văn bản.'}</p></div>}
    </AdminDialog>}
    {action.dialog}
  </>;
}
