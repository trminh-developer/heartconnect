import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useAdmin } from '../../components/admin/AdminContext';
import { useAdminData } from '../../hooks/useAdminData';
import { AdminAnalytics } from '../../services/adminService';
import { BankReconciliation } from '../../features/payment/presentation/components/BankReconciliation';
import { AdminBadge, AdminChart, AdminEmpty, AdminError, AdminHeader, AdminLoading, AdminMetric, AdminPeriod, AdminPersona, AdminSectionTitle, RefreshButton, date, money, number } from '../../components/admin/AdminUI';
const planName = (plan: string) => ({ '1_month': '1 tháng', '6_months': '6 tháng', '12_months': '12 tháng' }[plan] || plan);
function Analytics() {
  const [days, setDays] = useState(30), state = useAdminData<AdminAnalytics>('/admin/analytics?days=' + days);
  const { refreshOverview } = useAdmin();
  const data = state.data;
  const refreshAll = () => { state.refresh(); refreshOverview(true); };
  return <>
    <AdminHeader title="Doanh thu & Premium" description="Theo dõi giao dịch đã xác nhận và các gói Premium trên nền tảng."><AdminPeriod value={days} onChange={setDays} /><RefreshButton onClick={refreshAll} busy={state.loading} /></AdminHeader>
    {state.error && <AdminError message={state.error} retry={state.refresh} />}
    <div className="admin-metrics">
      <AdminMetric label="Doanh thu đã xác nhận" value={money(data?.revenue)} icon="wallet2" detail={'Giao dịch thành công trong ' + days + ' ngày'} />
      <AdminMetric label="Giao dịch thành công" value={number(data?.successful)} icon="credit-card" tone="green" detail={data ? number(data.pending) + ' giao dịch đang chờ · ' + number(data.failed) + ' thất bại' : 'Đơn hàng được máy chủ xác nhận'} />
      <AdminMetric label="Premium đang hoạt động" value={number(data?.premium)} icon="stars" tone="amber" detail="Tài khoản có gói còn hiệu lực" />
      <AdminMetric label="Sắp hết hạn" value={number(data?.expiring)} icon="calendar3" tone="blue" detail="Gói Premium hết hạn trong 7 ngày tới" />
    </div>
    <div className="admin-dashboard-grid"><section className="admin-panel padded"><AdminSectionTitle title="Doanh thu theo ngày" description="Chỉ tính giao dịch thành công. Đơn vị: VNĐ." />{state.loading ? <AdminLoading /> : data ? <AdminChart points={data.trend} lines={[{ key: 'revenue', name: 'Doanh thu', color: '#d85c7d' }]} label="Doanh thu giao dịch thành công theo ngày" currency /> : <AdminEmpty />}</section>
      <section className="admin-panel padded"><AdminSectionTitle title="Các gói được lựa chọn" description={'Giao dịch thành công trong ' + days + ' ngày.'} />
        {state.loading ? <AdminLoading /> : data?.plans.length ? <div className="admin-distribution">{data.plans.map(plan => <div key={plan.planId} className="admin-distribution-row"><div className="admin-distribution-label"><span>Premium {planName(plan.planId)}</span><strong>{number(Number(plan.count))} lượt</strong></div><div className="admin-bar"><span style={{ width: Number(plan.count) / Math.max(1, data.successful) * 100 + '%' }} /></div><p className="admin-note mt-2">{money(Number(plan.amount))}</p></div>)}</div> : <AdminEmpty title="Chưa có giao dịch thành công" description="Các gói được mua sẽ được tổng hợp tại đây." icon="credit-card" />}
      </section></div>
    <BankReconciliation onConfirmed={refreshAll} />
    <section className="admin-panel"><div className="admin-panel-heading"><AdminSectionTitle title="Giao dịch gần đây" description="10 giao dịch mới nhất trong khoảng thời gian đã chọn." /></div>
      {state.loading ? <AdminLoading /> : data?.transactions.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Thành viên</th><th>Gói Premium</th><th>Cổng thanh toán</th><th>Số tiền</th><th>Trạng thái</th><th>Thời gian</th></tr></thead><tbody>{data.transactions.map(tx => <tr key={tx.id}><td><AdminPersona user={tx.user} /></td><td>{planName(tx.planId)}</td><td>{tx.provider === 'BANK' ? 'Chuyển khoản QR' : tx.provider.toUpperCase()}</td><td className="nowrap">{money(tx.amount)}</td><td><AdminBadge value={tx.status} /></td><td className="nowrap">{date(tx.createdAt, true)}</td></tr>)}</tbody></table></div> : <AdminEmpty title="Chưa có giao dịch trong giai đoạn này" icon="credit-card" />}
    </section>
  </>;
}
export default function AdminAnalyticsView() { const { user } = useAuth(); return user?.role === 'ADMIN' ? <Analytics /> : <AdminEmpty title="Khu vực dành cho quản trị viên" description="Tài khoản kiểm duyệt không có quyền xem doanh thu." icon="shield-lock" />; }
