import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { formatVND, formatDate, formatDateTime } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorState } from '../components/common/ErrorState';

export const DashboardPage: React.FC = () => {
  const { isOwner, user } = useAuth();
  const [currentPage, setCurrentPage] = useState(1);

  const {
    data: stats,
    isLoading: isStatsLoading,
    isError: isStatsError,
    error: statsError,
    refetch,
  } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.reports.getDashboardStats(),
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api.invoices.list(),
  });

  if (isStatsLoading) {
    return <LoadingSpinner message="Đang tải dữ liệu tổng quan..." />;
  }

  if (isStatsError) {
    return (
      <div className="p-6">
        <ErrorState
          title="Không tải được dữ liệu tổng quan"
          message={(statsError as Error)?.message || 'Vui lòng thử lại.'}
          onRetry={refetch}
        />
      </div>
    );
  }

  const isStaffDashboard = stats !== undefined && 'shift' in stats;
  const staffShift = isStaffDashboard ? stats.shift : undefined;
  const ownerStats = stats && 'todayRevenue' in stats ? stats : undefined;
  const visibleInvoices = isOwner
    ? invoices
    : invoices.filter((invoice) => invoice.seller_id === user?.id);

  // Danh sách hóa đơn phân trang (Figma)
  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(visibleInvoices.length / pageSize));
  const paginatedInvoices = visibleInvoices.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Tiêu đề chào mừng theo chuẩn Figma 5 & 6 */}
      <h1 className="text-2xl md:text-3xl font-bold text-[var(--color-primary)] tracking-tight">
        {isOwner ? 'Xin chào Chủ cửa hàng!' : 'Xin chào nhân viên!'}
      </h1>

      {/* 2 Thẻ lớn trên cùng theo đúng layout Figma */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Thẻ 1: Doanh thu hôm nay hoặc doanh thu trong ca */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs">
          <p className="text-xs font-semibold text-slate-500">
            {isOwner ? 'Doanh thu hôm nay' : 'Doanh thu ca bán của bạn'}
          </p>
          <p className="text-3xl md:text-4xl font-black text-slate-900 mt-2">
            {formatVND(isOwner ? ownerStats?.todayRevenue ?? 0 : staffShift?.sales_amount ?? 0)}
          </p>
          {isOwner && ownerStats && (
            <div className="mt-4 grid grid-cols-3 gap-2 text-[11px] text-slate-500">
              <p>Tiền mặt <span className="block font-semibold text-slate-800">{formatVND(ownerStats.todayCash)}</span></p>
              <p>Chuyển khoản <span className="block font-semibold text-slate-800">{formatVND(ownerStats.todayTransfer)}</span></p>
              <p>Ghi nợ <span className="block font-semibold text-slate-800">{formatVND(ownerStats.todayDebt)}</span></p>
            </div>
          )}
          {!isOwner && staffShift && (
            <div className="mt-4 space-y-1 text-[11px] text-slate-500">
              <p>Ngày: {formatDate(isStaffDashboard ? stats.date : new Date())}</p>
              <p>
                Ca bán: {staffShift.first_sale_at ? formatDateTime(staffShift.first_sale_at) : 'Chưa có đơn'}
                {staffShift.last_sale_at && ` – ${formatDateTime(staffShift.last_sale_at)}`}
              </p>
            </div>
          )}
        </div>

        {/* Thẻ 2: Hóa đơn đã bán */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs">
          <p className="text-xs font-semibold text-slate-500">
            {isOwner ? 'Hóa đơn đã bán hôm nay' : 'Hóa đơn trong ca'}
          </p>
          <p className="text-3xl md:text-4xl font-black text-slate-900 mt-2">
            {isOwner ? ownerStats?.todayInvoiceCount ?? 0 : staffShift?.invoice_count ?? 0}
          </p>
          {isOwner && ownerStats && (
            <p className="mt-4 text-[11px] text-slate-500">
              Sản phẩm cần nhập kho: <span className="font-semibold text-slate-800">{ownerStats.lowStockCount}</span>
            </p>
          )}
        </div>
      </div>

      {/* Sản phẩm bán chạy chỉ hiển thị khi dashboard có dữ liệu từ server */}
      {isOwner && ownerStats?.topSellingProducts && ownerStats.topSellingProducts.length > 0 && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
          <h2 className="text-base font-bold text-slate-900">
            Hàng hóa bán chạy nhất trong tuần
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {ownerStats.topSellingProducts.map((product) => (
              <div
                key={product.barcode}
                className="bg-[var(--surface-muted)] p-4 rounded-xl border border-slate-200/70 flex items-center gap-3"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800 truncate">{product.name}</p>
                  <span className="inline-block mt-1 text-[11px] font-bold text-[var(--color-primary)] bg-primary-soft px-2 py-0.5 rounded-md">
                    {product.quantity} sản phẩm
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section: Hóa đơn gần đây của bạn (Figma) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">Hóa đơn gần đây của bạn</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs md:text-sm">
            <thead className="bg-[var(--surface-muted)] text-slate-500 text-xs font-semibold">
              <tr>
                <th className="py-3 px-6">Mã hóa đơn</th>
                <th className="py-3 px-6">Thời gian</th>
                <th className="py-3 px-6">Khách hàng</th>
                <th className="py-3 px-6 text-right">Tổng tiền</th>
                <th className="py-3 px-6 text-center">Thanh toán</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-6 font-bold text-[var(--color-primary)]">{inv.code}</td>
                  <td className="py-3.5 px-6 text-slate-600">
                    <p className="font-medium">{formatDate(inv.created_at)}</p>
                    <p className="text-[11px] text-slate-400">
                      {new Date(inv.created_at).toLocaleTimeString('vi-VN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </td>
                  <td className="py-3.5 px-6 font-medium text-slate-800">
                    {inv.customer_name || 'Khách lẻ'}
                  </td>
                  <td className="py-3.5 px-6 text-right font-black text-slate-900">
                    {formatVND(inv.total_amount)}
                  </td>
                  <td className="py-3.5 px-6 text-center text-xs text-slate-600">
                    {inv.payment_method === 'cash'
                      ? 'Tiền mặt'
                      : inv.payment_method === 'transfer'
                        ? 'Chuyển khoản'
                        : 'Ghi nợ'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Phân trang Figma: < 1 2 3 4 5 > */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-1.5">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30 text-xs"
          >
            ‹
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              onClick={() => setCurrentPage(page)}
              className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${currentPage === page
                  ? 'bg-[var(--color-primary)] text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
                }`}
            >
              {page}
            </button>
          ))}
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30 text-xs"
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
};
