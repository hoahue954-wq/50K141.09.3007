import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { formatVND, formatDate } from '../utils/format';
import {
  Calendar,
  Upload,
  FileSpreadsheet,
  TrendingUp,
  DollarSign,
  Package,
  Receipt,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { useToast } from '../context/ToastContext';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorState } from '../components/common/ErrorState';

type ReportTab = 'revenue' | 'profit';
type RevenuePeriod = 'today' | '7days' | 'month' | 'custom';
type ProfitPeriod = 'this_month' | 'last_month';

export const ReportsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = (searchParams.get('tab') as ReportTab) || 'revenue';
  const activeTab: ReportTab = tabParam === 'profit' ? 'profit' : 'revenue';

  const setActiveTab = (tab: ReportTab) => {
    setSearchParams({ tab });
  };

  // Doanh thu filters
  const [revenuePeriod, setRevenuePeriod] = useState<RevenuePeriod>('today');
  const [fromDate, setFromDate] = useState(() => formatDate(new Date()));
  const [toDate, setToDate] = useState(() => formatDate(new Date()));

  // Lợi nhuận filters
  const [profitPeriod, setProfitPeriod] = useState<ProfitPeriod>('this_month');
  const [costMonth, setCostMonth] = useState('11/2026');
  const [excelFile, setExcelFile] = useState<File | null>(null);

  const { showSuccess, showError } = useToast();

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const targetMonth = profitPeriod === 'this_month' ? currentMonth : currentMonth === 1 ? 12 : currentMonth - 1;
  const targetYear = profitPeriod === 'this_month' ? currentYear : currentMonth === 1 ? currentYear - 1 : currentYear;

  const todayApiStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  const getEffectiveRange = () => {
    if (revenuePeriod === 'today') {
      return { from: todayApiStr, to: todayApiStr, groupBy: 'day' as const };
    }
    if (revenuePeriod === '7days') {
      const d = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      const from7 = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
      return { from: from7, to: todayApiStr, groupBy: 'day' as const };
    }
    if (revenuePeriod === 'month') {
      const firstDay = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
      const lastDayNum = new Date(Date.UTC(currentYear, currentMonth, 0)).getUTCDate();
      const lastDay = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;
      return { from: firstDay, to: lastDay, groupBy: 'day' as const };
    }
    const f = fromDate.includes('/') ? fromDate.split('/').reverse().join('-') : fromDate || todayApiStr;
    const t = toDate.includes('/') ? toDate.split('/').reverse().join('-') : toDate || todayApiStr;
    return { from: f, to: t, groupBy: 'day' as const };
  };

  const { from: queryFrom, to: queryTo, groupBy: queryGroupBy } = getEffectiveRange();

  // Query dữ liệu doanh thu từ API
  const {
    data: revenueReport,
    refetch: refetchRevenue,
  } = useQuery({
    queryKey: ['revenue-report', queryFrom, queryTo, queryGroupBy],
    queryFn: () => api.reports.getRevenueReport(queryFrom, queryTo, queryGroupBy),
  });

  // Query dữ liệu doanh thu ngày (để lấy danh sách đơn & sản phẩm)
  const {
    data: dailyReport,
    refetch: refetchDaily,
  } = useQuery({
    queryKey: ['daily-report', queryFrom],
    queryFn: () => api.reports.getDailyReport(queryFrom),
  });

  // Query dữ liệu lợi nhuận tháng từ API
  const {
    data: monthlyReport,
    refetch: refetchMonthly,
  } = useQuery({
    queryKey: ['monthly-report', targetYear, targetMonth],
    queryFn: () => api.reports.getMonthlyReport(targetYear, targetMonth),
  });

  // Query chi tiết lợi nhuận từng ngày từ API profit
  const profitFrom = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
  const profitLastDayNum = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const profitTo = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(profitLastDayNum).padStart(2, '0')}`;

  const {
    data: profitReport,
  } = useQuery({
    queryKey: ['profit-report', profitFrom, profitTo],
    queryFn: () => api.reports.getProfitReport(profitFrom, profitTo, 'day'),
  });

  const queryClient = useQueryClient();
  const [excelError, setExcelError] = useState<string | null>(null);
  const [excelSuccess, setExcelSuccess] = useState<string | null>(null);

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!excelFile) {
        throw new Error('Vui lòng chọn tệp Excel để nhập chi phí.');
      }
      if (!excelFile.name.toLowerCase().endsWith('.xlsx')) {
        throw new Error('File Excel không hợp lệ, vui lòng kiểm tra lại!');
      }
      if (costMonth) {
        const parts = costMonth.includes('/') ? costMonth.split('/') : costMonth.split('-');
        let m = Number(parts[0]);
        let y = Number(parts[1]);
        if (parts[0] && parts[0].length === 4) {
          y = Number(parts[0]);
          m = Number(parts[1]);
        } else if (y < 100) {
          y = 2000 + y;
        }
        if (!isNaN(m) && !isNaN(y)) {
          if (y > currentYear || (y === currentYear && m > currentMonth)) {
            throw new Error('Tháng lựa chọn không hợp lệ, vui lòng chọn lại!');
          }
        }
      }
      return api.reports.importExpenses(excelFile, costMonth.trim() || undefined);
    },
    onSuccess: (data) => {
      setExcelError(null);
      setExcelSuccess(data.message || 'Nhập chi phí thành công');
      showSuccess(data.message || 'Nhập dữ liệu chi phí từ Excel thành công!');
      setExcelFile(null);
      queryClient.invalidateQueries({ queryKey: ['monthly-report'] });
      queryClient.invalidateQueries({ queryKey: ['profit-report'] });
      queryClient.invalidateQueries({ queryKey: ['revenue-report'] });
    },
    onError: (err: any) => {
      setExcelSuccess(null);
      setExcelError(err.message);
      showError(err.message);
    },
  });

  const handleUploadExcel = (e: React.FormEvent) => {
    e.preventDefault();
    setExcelError(null);
    setExcelSuccess(null);
    importMutation.mutate();
  };

  // Tính toán số liệu thống kê thực tế từ API (không hardcode)
  const totalRevenueVal = revenueReport?.summary?.total_revenue ?? (revenuePeriod === 'today' ? (dailyReport?.totalRevenue ?? 0) : 0);
  const totalOrdersVal = revenueReport?.summary?.invoice_count ?? (revenuePeriod === 'today' ? (dailyReport?.invoices?.length ?? 0) : 0);
  const totalItemsVal = revenuePeriod === 'today'
    ? (dailyReport?.invoices ?? []).reduce((sum, inv) => sum + (inv.items ?? []).reduce((s, it) => s + it.quantity, 0), 0)
    : (monthlyReport?.soldProducts ?? []).reduce((sum, p) => sum + p.quantity, 0);

  const currentRevenueStats = {
    total: totalRevenueVal,
    orders: totalOrdersVal,
    items: totalItemsVal,
  };

  // Dữ liệu biểu đồ doanh thu từ API
  const rawRevenueData = (revenueReport?.data ?? []).map((item) => {
    const label = revenuePeriod === 'month' ? item.period.slice(-2) : item.period.slice(5).replace('-', '/');
    return {
      time: label,
      value: item.revenue,
      isPeak: false,
    };
  });
  const maxRevenue = Math.max(0, ...rawRevenueData.map((d) => d.value));
  const currentRevenueData = rawRevenueData.map((d) => ({
    ...d,
    isPeak: maxRevenue > 0 && d.value === maxRevenue,
  }));

  // Dữ liệu lợi nhuận từng ngày từ API
  const rawProfitData = (profitReport?.data ?? []).map((item) => ({
    day: item.period.slice(-2),
    profit: item.net_profit,
    isPeak: false,
  }));
  const maxProfit = Math.max(0, ...rawProfitData.map((d) => d.profit));
  const dailyProfitData = rawProfitData.map((d) => ({
    ...d,
    isPeak: maxProfit > 0 && d.profit === maxProfit,
  }));

  const monthlyRevenue = monthlyReport?.totalRevenue ?? profitReport?.summary?.revenue ?? 0;
  const monthlyExpenses = monthlyReport?.totalExpenses ?? profitReport?.summary?.expenses ?? 0;
  const monthlyCost = profitReport?.summary?.cost_of_goods_sold ?? 0;
  const monthlyProfit = monthlyReport?.netProfit ?? profitReport?.summary?.net_profit ?? 0;

  const handleSelectPeriod = (period: RevenuePeriod) => {
    setRevenuePeriod(period);
    if (period === 'today') {
      const todayFormatted = formatDate(new Date());
      setFromDate(todayFormatted);
      setToDate(todayFormatted);
    } else if (period === '7days') {
      const d = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      setFromDate(formatDate(d));
      setToDate(formatDate(new Date()));
    } else if (period === 'month') {
      const first = new Date(currentYear, currentMonth - 1, 1);
      const last = new Date(currentYear, currentMonth, 0);
      setFromDate(formatDate(first));
      setToDate(formatDate(last));
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header chuẩn Figma: Tiêu đề xanh đậm, không tab ở header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-[var(--color-primary)]">
          {activeTab === 'revenue' ? 'Báo cáo doanh thu' : 'Báo cáo lợi nhuận'}
        </h1>
      </div>

      {/* ==================================================================== */}
      {/* 1. TAB BÁO CÁO DOANH THU (Figma 01, 02, 03) */}
      {/* ==================================================================== */}
      {activeTab === 'revenue' && (
        <div className="space-y-6">
          {/* Card Bộ lọc thời gian chuẩn Figma */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Thời gian báo cáo
              </label>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { id: 'today', label: 'Hôm nay' },
                    { id: '7days', label: '7 ngày qua' },
                    { id: 'month', label: 'Theo tháng' },
                    { id: 'custom', label: 'Tùy chọn' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleSelectPeriod(t.id)}
                    className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                      revenuePeriod === t.id
                        ? 'bg-highlight text-[var(--color-primary)] font-bold border border-[var(--border)]'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Hàng chọn ngày/tháng tùy theo bộ lọc */}
            {revenuePeriod === 'month' ? (
              <div className="flex flex-col sm:flex-row items-end gap-3 pt-2">
                <div className="w-full sm:w-64">
                  <label className="block text-xs text-slate-500 mb-1">Tháng</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={`Tháng ${currentMonth}, ${currentYear}`}
                      readOnly
                      className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none bg-white text-slate-800"
                    />
                    <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    refetchRevenue();
                    refetchDaily();
                  }}
                  className="w-full sm:w-auto px-6 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-sm font-medium rounded-lg shadow-sm"
                >
                  Xem báo cáo
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-end gap-3 pt-2">
                <div className="flex-1 w-full sm:w-auto">
                  <label className="block text-xs text-slate-500 mb-1">Từ ngày</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                    />
                    <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                  </div>
                </div>

                <div className="flex-1 w-full sm:w-auto">
                  <label className="block text-xs text-slate-500 mb-1">Đến ngày</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                    />
                    <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    refetchRevenue();
                    refetchDaily();
                  }}
                  className="w-full sm:w-auto px-6 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-sm font-medium rounded-lg shadow-sm"
                >
                  Xem báo cáo
                </button>
              </div>
            )}
          </div>

          {/* 3 Thẻ thống kê Figma */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Card 1: Tổng doanh thu (màu vàng nhạt đặc trưng Figma) */}
            <div className="bg-highlight rounded-xl border border-[var(--border)] p-5">
              <p className="text-xs text-slate-600 font-medium">Tổng doanh thu</p>
              <p className="text-3xl font-black text-[var(--color-primary)] mt-1">
                {formatVND(currentRevenueStats.total)}
              </p>
              <p className="text-[11px] text-slate-500 mt-2">
                Tổng tiền hóa đơn đã thanh toán
              </p>
            </div>

            {/* Card 2: Số lượng đơn hàng */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs text-slate-600 font-medium">Số lượng đơn hàng</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">
                {currentRevenueStats.orders}
              </p>
              <p className="text-[11px] text-slate-500 mt-2">
                Đơn hàng thanh toán thành công
              </p>
            </div>

            {/* Card 3: Sản phẩm đã bán */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs text-slate-600 font-medium">Sản phẩm đã bán</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">
                {currentRevenueStats.items.toLocaleString('vi-VN')}
              </p>
              <p className="text-[11px] text-slate-500 mt-2">
                Tổng số lượng sản phẩm
              </p>
            </div>
          </div>

          {/* Biểu đồ Doanh thu Figma */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">
                {revenuePeriod === 'today' ? 'Doanh thu trong ngày' : 'Doanh thu theo ngày'}
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span className="w-3 h-3 bg-[var(--color-primary)] rounded-xs inline-block" />
                <span>Doanh thu (VNĐ)</span>
              </div>
            </div>

            {currentRevenueData.length === 0 || maxRevenue === 0 ? (
              <div className="h-80 w-full flex flex-col items-center justify-center text-slate-400 text-sm gap-2">
                <AlertCircle className="w-8 h-8 text-slate-300" />
                <p>Chưa có dữ liệu doanh thu trong khoảng thời gian này.</p>
              </div>
            ) : (
              <div className="h-80 w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={currentRevenueData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={11} tickLine={false} />
                    <YAxis
                      stroke="var(--text-muted)"
                      fontSize={12}
                      tickLine={false}
                      tickFormatter={(val) => `${(val / 1000000).toFixed(val >= 1000000 ? 1 : 2).replace('.0', '')} tr`}
                    />
                    <Tooltip
                      formatter={(value: any) => [formatVND(Number(value) || 0), 'Doanh thu']}
                      labelFormatter={(label) => `Thời gian: ${label}`}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={revenuePeriod === 'month' ? 18 : 45}>
                      {currentRevenueData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.isPeak ? 'var(--color-primary)' : 'var(--color-primary-soft)'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. TAB BÁO CÁO LỢI NHUẬN (Figma 1. Báo cáo lợi nhuận tháng hiện tại) */}
      {/* ==================================================================== */}
      {activeTab === 'profit' && (
        <div className="space-y-6">
          {/* Card 1: Nhập dữ liệu chi phí từ Excel */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
            <h2 className="text-sm font-bold text-slate-800">Nhập dữ liệu chi phí</h2>
            <form onSubmit={handleUploadExcel} className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative w-full sm:w-36">
                  <input
                    type="text"
                    value={costMonth}
                    onChange={(e) => {
                      setCostMonth(e.target.value);
                      setExcelError(null);
                    }}
                    placeholder="mm/yy"
                    className="w-full pl-3 pr-8 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                  />
                  <Calendar className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                </div>

                <label className={`flex-1 border rounded-lg px-3 py-2 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                  excelError
                    ? 'border-red-300 bg-red-50/20 text-red-600'
                    : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}>
                  <span className="truncate">
                    {excelFile ? `${excelFile.name} • ${Math.round(excelFile.size / 1024)} KB` : 'Kéo thả file Excel hoặc chọn tệp để nhập dữ liệu chi phí'}
                  </span>
                  <Upload className="w-4 h-4 text-slate-400 ml-2 flex-shrink-0" />
                  <input
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    onChange={(e) => {
                      setExcelFile(e.target.files?.[0] || null);
                      setExcelError(null);
                      setExcelSuccess(null);
                    }}
                  />
                </label>

                <button
                  type="submit"
                  disabled={importMutation.isPending}
                  className="inline-flex items-center justify-center gap-1.5 px-5 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-sm font-medium rounded-lg shadow-sm disabled:opacity-50"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  {importMutation.isPending ? 'Đang nhập...' : 'Nhập Excel'}
                </button>
              </div>

              {excelError && (
                <div className="flex items-start gap-1.5 text-xs text-red-500 font-medium pt-1">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span className="whitespace-pre-line">{excelError}</span>
                </div>
              )}

              {excelSuccess && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium pt-1">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{excelSuccess}</span>
                </div>
              )}
            </form>
          </div>

          {/* Card 2: Lọc thời gian báo cáo */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Thời gian báo cáo
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setProfitPeriod('this_month')}
                  className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                    profitPeriod === 'this_month'
                      ? 'bg-highlight text-[var(--color-primary)] font-bold border border-[var(--border)]'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Tháng này
                </button>
                <button
                  type="button"
                  onClick={() => setProfitPeriod('last_month')}
                  className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                    profitPeriod === 'last_month'
                      ? 'bg-highlight text-[var(--color-primary)] font-bold border border-[var(--border)]'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Tháng trước
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-end gap-3 pt-2">
              <div className="flex-1 w-full sm:w-auto">
                <div className="relative">
                  <input
                    type="text"
                    value={`Tháng ${targetMonth}, ${targetYear}`}
                    readOnly
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none bg-slate-50 text-slate-700"
                  />
                  <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                </div>
              </div>

              <button
                type="button"
                onClick={() => refetchMonthly()}
                className="w-full sm:w-auto px-6 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-sm font-medium rounded-lg shadow-sm"
              >
                Xem báo cáo
              </button>
            </div>

            {monthlyExpenses === 0 && (
              <div className="flex items-center gap-1.5 text-xs text-red-500 font-medium pt-1">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>Chưa có dữ liệu chi phí của tháng này, vui lòng nhập chi phí!</span>
              </div>
            )}
          </div>

          {/* 4 Thẻ thống kê Lợi nhuận Figma */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Tổng lợi nhuận */}
            <div className="bg-highlight rounded-xl border border-[var(--border)] p-5">
              <p className="text-xs text-slate-600 font-medium">
                {monthlyExpenses > 0 ? 'Tổng lợi nhuận' : 'Lợi nhuận tạm tính'}
              </p>
              <p className="text-2xl font-black text-[var(--color-primary)] mt-1">
                {formatVND(monthlyProfit)}
              </p>
              <p className="text-[11px] text-slate-500 mt-2">
                {monthlyExpenses > 0 ? 'Sau giá vốn và chi phí vận hành' : 'Chưa trừ chi phí vận hành'}
              </p>
            </div>

            {/* Card 2: Tổng doanh thu */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs text-slate-600 font-medium">Tổng doanh thu</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {formatVND(monthlyRevenue)}
              </p>
              <p className="text-[11px] text-slate-500 mt-2">
                Đơn hàng đã thanh toán thành công
              </p>
            </div>

            {/* Card 3: Tổng giá vốn */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs text-slate-600 font-medium">Tổng giá vốn</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {formatVND(monthlyCost)}
              </p>
              <p className="text-[11px] text-slate-500 mt-2">
                Tổng giá nhập sản phẩm đã bán
              </p>
            </div>

            {/* Card 4: Chi phí vận hành */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs text-slate-600 font-medium">Chi phí vận hành</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {formatVND(monthlyExpenses)}
              </p>
              <p className="text-[11px] text-slate-500 mt-2">
                {monthlyExpenses > 0
                  ? `Dữ liệu chi phí Excel • tháng ${targetMonth}/${targetYear}`
                  : 'Chưa nhập chi phí'}
              </p>
            </div>
          </div>

          {/* Biểu đồ Lợi nhuận từng ngày */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">Lợi nhuận từng ngày</h2>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span className="w-3 h-3 bg-[var(--color-primary)] rounded-xs inline-block" />
                <span>Lợi nhuận (VNĐ)</span>
              </div>
            </div>

            {dailyProfitData.length === 0 || maxProfit === 0 ? (
              <div className="h-80 w-full flex flex-col items-center justify-center text-slate-400 text-sm gap-2">
                <AlertCircle className="w-8 h-8 text-slate-300" />
                <p>Chưa có dữ liệu lợi nhuận trong tháng này.</p>
              </div>
            ) : (
              <div className="h-80 w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyProfitData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="day" stroke="var(--text-muted)" fontSize={11} tickLine={false} />
                    <YAxis
                      stroke="var(--text-muted)"
                      fontSize={12}
                      tickLine={false}
                      tickFormatter={(val) => `${(val / 1000000).toFixed(1)} tr`}
                    />
                    <Tooltip
                      formatter={(value: any) => [formatVND(Number(value) || 0), 'Lợi nhuận']}
                      labelFormatter={(label) => `Ngày ${label}/${targetMonth}`}
                    />
                    <Bar dataKey="profit" radius={[3, 3, 0, 0]} maxBarSize={20}>
                      {dailyProfitData.map((entry, index) => (
                        <Cell
                          key={`profit-cell-${index}`}
                          fill={entry.isPeak ? 'var(--color-primary)' : 'var(--color-primary-soft)'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
