import React, { useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { formatVND, formatDate } from '../utils/format';
import {
  Calendar,
  Upload,
  AlertCircle,
  CheckCircle,
  FileX,
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

type ReportTab = 'revenue' | 'profit';
type RevenuePeriod = 'today' | '7days' | 'month' | 'custom';
type ProfitPeriod = 'this_month' | 'last_month' | 'custom';

function parseVNDateString(dStr: string): Date | null {
  if (!dStr) return null;
  const trimmed = dStr.trim();
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/');
    if (parts.length === 3) {
      const day = Number(parts[0]);
      const month = Number(parts[1]);
      const year = Number(parts[2]);
      if (day > 0 && month > 0 && year > 0) return new Date(year, month - 1, day);
    }
  } else if (trimmed.includes('-')) {
    const parts = trimmed.split('-');
    if (parts.length === 3) {
      const year = Number(parts[0]);
      const month = Number(parts[1]);
      const day = Number(parts[2]);
      if (day > 0 && month > 0 && year > 0) return new Date(year, month - 1, day);
    }
  }
  return null;
}

export const ReportsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const tabParam = (searchParams.get('tab') as ReportTab) || 'revenue';
  const activeTab: ReportTab = tabParam === 'profit' ? 'profit' : 'revenue';

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Doanh thu filters
  const [revenuePeriod, setRevenuePeriod] = useState<RevenuePeriod>('today');
  const [fromDate, setFromDate] = useState(() => formatDate(new Date()));
  const [toDate, setToDate] = useState(() => formatDate(new Date()));

  const fromDateInputRef = useRef<HTMLInputElement>(null);
  const toDateInputRef = useRef<HTMLInputElement>(null);

  // Lợi nhuận filters
  const [profitPeriod, setProfitPeriod] = useState<ProfitPeriod>('this_month');
  const [selectedProfitMonth, setSelectedProfitMonth] = useState(currentMonth);
  const [selectedProfitYear, setSelectedProfitYear] = useState(currentYear);

  const [costMonth, setCostMonth] = useState(`${String(currentMonth).padStart(2, '0')}/${currentYear}`);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelError, setExcelError] = useState<string | null>(null);
  const [excelSuccess, setExcelSuccess] = useState<string | null>(null);

  const costMonthInputRef = useRef<HTMLInputElement>(null);
  const profitMonthInputRef = useRef<HTMLInputElement>(null);

  const { showSuccess, showError } = useToast();
  const queryClient = useQueryClient();

  const todayApiStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  // Kiểm tra ngày bắt đầu > ngày kết thúc (Mục 17)
  const parsedFrom = parseVNDateString(fromDate);
  const parsedTo = parseVNDateString(toDate);
  const isDateRangeInvalid =
    revenuePeriod === 'custom' &&
    parsedFrom !== null &&
    parsedTo !== null &&
    parsedFrom.getTime() > parsedTo.getTime();

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
    enabled: !isDateRangeInvalid,
  });

  const {
    data: dailyReport,
    refetch: refetchDaily,
  } = useQuery({
    queryKey: ['daily-report', queryFrom],
    queryFn: () => api.reports.getDailyReport(queryFrom),
    enabled: !isDateRangeInvalid,
  });

  // Kiểm tra tháng báo cáo lợi nhuận > tháng hiện tại (Mục 24)
  const isFutureReportMonth =
    selectedProfitYear > currentYear ||
    (selectedProfitYear === currentYear && selectedProfitMonth > currentMonth);

  // Kiểm tra tháng nhập chi phí Excel > tháng hiện tại (Mục 25)
  const parseCostMonth = () => {
    if (!costMonth) return { m: currentMonth, y: currentYear, isFuture: false };
    const parts = costMonth.includes('/') ? costMonth.split('/') : costMonth.split('-');
    let m = Number(parts[0]);
    let y = Number(parts[1]);
    if (parts[0] && parts[0].length === 4) {
      y = Number(parts[0]);
      m = Number(parts[1]);
    } else if (y < 100) {
      y = 2000 + y;
    }
    const isFuture = !isNaN(m) && !isNaN(y) && (y > currentYear || (y === currentYear && m > currentMonth));
    return { m, y, isFuture };
  };
  const { isFuture: isCostMonthFuture } = parseCostMonth();

  // Query dữ liệu lợi nhuận tháng từ API
  const {
    data: monthlyReport,
    refetch: refetchMonthly,
  } = useQuery({
    queryKey: ['monthly-report', selectedProfitYear, selectedProfitMonth],
    queryFn: () => api.reports.getMonthlyReport(selectedProfitYear, selectedProfitMonth),
    enabled: !isFutureReportMonth,
  });

  // Query chi tiết lợi nhuận từng ngày từ API profit
  const profitFrom = `${selectedProfitYear}-${String(selectedProfitMonth).padStart(2, '0')}-01`;
  const profitLastDayNum = new Date(Date.UTC(selectedProfitYear, selectedProfitMonth, 0)).getUTCDate();
  const profitTo = `${selectedProfitYear}-${String(selectedProfitMonth).padStart(2, '0')}-${String(profitLastDayNum).padStart(2, '0')}`;

  const {
    data: profitReport,
  } = useQuery({
    queryKey: ['profit-report', profitFrom, profitTo],
    queryFn: () => api.reports.getProfitReport(profitFrom, profitTo, 'day'),
    enabled: !isFutureReportMonth,
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!excelFile) {
        throw new Error('Vui lòng chọn tệp Excel để nhập chi phí.');
      }
      if (!excelFile.name.toLowerCase().endsWith('.xlsx')) {
        throw new Error('File Excel không hợp lệ, vui lòng kiểm tra lại!');
      }
      if (isCostMonthFuture) {
        throw new Error('Tháng lựa chọn không hợp lệ, vui lòng chọn lại!');
      }
      return api.reports.importExpenses(excelFile, costMonth.trim() || undefined);
    },
    onSuccess: (data) => {
      setExcelError(null);
      setExcelSuccess('Nhập chi phí thành công');
      showSuccess(data.message || 'Nhập chi phí thành công');
      setExcelFile(null);
      queryClient.invalidateQueries({ queryKey: ['monthly-report'] });
      queryClient.invalidateQueries({ queryKey: ['profit-report'] });
      queryClient.invalidateQueries({ queryKey: ['revenue-report'] });
    },
    onError: (err: any) => {
      setExcelSuccess(null);
      setExcelError(err.message || 'File Excel không hợp lệ, vui lòng kiểm tra lại!');
      showError(err.message);
    },
  });

  const handleUploadExcel = (e: React.FormEvent) => {
    e.preventDefault();
    setExcelError(null);
    setExcelSuccess(null);
    if (isCostMonthFuture) {
      setExcelError('Tháng lựa chọn không hợp lệ, vui lòng chọn lại!');
      return;
    }
    importMutation.mutate();
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

  // Mục 16: Tổng các ngày trong biểu đồ phải BẰNG tổng doanh thu hiển thị trên thẻ
  const calculatedChartSum = currentRevenueData.reduce((sum, item) => sum + item.value, 0);
  const totalRevenueVal = isDateRangeInvalid
    ? 0
    : revenueReport?.data && revenueReport.data.length > 0
    ? calculatedChartSum
    : revenueReport?.summary?.total_revenue ?? (revenuePeriod === 'today' ? (dailyReport?.totalRevenue ?? 0) : 0);

  const totalOrdersVal = isDateRangeInvalid
    ? 0
    : revenueReport?.summary?.invoice_count ?? (revenuePeriod === 'today' ? (dailyReport?.invoices?.length ?? 0) : 0);

  const totalItemsVal = isDateRangeInvalid
    ? 0
    : revenuePeriod === 'today'
    ? (dailyReport?.invoices ?? []).reduce((sum, inv) => sum + (inv.items ?? []).reduce((s, it) => s + it.quantity, 0), 0)
    : (monthlyReport?.soldProducts ?? []).reduce((sum, p) => sum + p.quantity, 0);

  const currentRevenueStats = {
    total: totalRevenueVal,
    orders: totalOrdersVal,
    items: totalItemsVal,
  };

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

  // Kiểm tra tháng có dữ liệu kinh doanh không (Mục 23)
  const hasMonthlyBusinessData =
    !isFutureReportMonth &&
    (monthlyRevenue > 0 || monthlyCost > 0 || monthlyProfit > 0 || monthlyExpenses > 0);

  const handleSelectRevenuePeriod = (period: RevenuePeriod) => {
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

  const handleSelectProfitPeriod = (period: 'this_month' | 'last_month') => {
    setProfitPeriod(period);
    if (period === 'this_month') {
      setSelectedProfitMonth(currentMonth);
      setSelectedProfitYear(currentYear);
    } else {
      setSelectedProfitMonth(currentMonth === 1 ? 12 : currentMonth - 1);
      setSelectedProfitYear(currentMonth === 1 ? currentYear - 1 : currentYear);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-[var(--color-primary)]">
          {activeTab === 'revenue' ? 'Báo cáo doanh thu' : 'Báo cáo lợi nhuận'}
        </h1>
      </div>

      {/* ==================================================================== */}
      {/* 1. TAB BÁO CÁO DOANH THU (Mục 14-18) */}
      {/* ==================================================================== */}
      {activeTab === 'revenue' && (
        <div className="space-y-6">
          {/* Card Bộ lọc thời gian chuẩn (Mục 14, 15 - image23) */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-2">
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
                    onClick={() => handleSelectRevenuePeriod(t.id)}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
                      revenuePeriod === t.id
                        ? 'bg-amber-100 text-amber-900 border border-amber-300 font-bold'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Hàng chọn ngày (Mục 14, 15) */}
            <div className="flex flex-col sm:flex-row items-end gap-3 pt-1">
              <div className="flex-1 w-full sm:w-auto">
                <label className="block text-xs text-slate-500 mb-1 font-medium">Từ ngày</label>
                <div className="relative">
                  <input
                    type="text"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className={`w-full px-3 py-2 pr-9 rounded-xl border text-sm outline-none ${
                      isDateRangeInvalid ? 'border-red-500 bg-red-50/20' : 'border-slate-200 focus:border-blue-600'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      fromDateInputRef.current?.showPicker?.();
                      fromDateInputRef.current?.focus();
                    }}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    <Calendar className="w-4 h-4" />
                  </button>
                  <input
                    type="date"
                    ref={fromDateInputRef}
                    className="sr-only"
                    onChange={(e) => {
                      if (e.target.value) {
                        const [y, m, d] = e.target.value.split('-');
                        setFromDate(`${d}/${m}/${y}`);
                        setRevenuePeriod('custom');
                      }
                    }}
                  />
                </div>
              </div>

              <div className="flex-1 w-full sm:w-auto">
                <label className="block text-xs text-slate-500 mb-1 font-medium">Đến ngày</label>
                <div className="relative">
                  <input
                    type="text"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="w-full px-3 py-2 pr-9 rounded-xl border border-slate-200 text-sm focus:border-blue-600 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      toDateInputRef.current?.showPicker?.();
                      toDateInputRef.current?.focus();
                    }}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    <Calendar className="w-4 h-4" />
                  </button>
                  <input
                    type="date"
                    ref={toDateInputRef}
                    className="sr-only"
                    onChange={(e) => {
                      if (e.target.value) {
                        const [y, m, d] = e.target.value.split('-');
                        setToDate(`${d}/${m}/${y}`);
                        setRevenuePeriod('custom');
                      }
                    }}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  refetchRevenue();
                  refetchDaily();
                }}
                className="w-full sm:w-auto px-6 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-sm font-bold rounded-xl shadow-xs transition-colors shrink-0"
              >
                Xem báo cáo
              </button>
            </div>

            {/* Thông báo lỗi khi ngày bắt đầu > ngày kết thúc (Mục 17 - image25) */}
            {isDateRangeInvalid && (
              <p className="mt-2 text-xs font-semibold text-red-600 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Khoảng thời gian lựa chọn không hợp lệ, vui lòng chọn lại!
              </p>
            )}
          </div>

          {/* Khi ngày hợp lệ: hiển thị các thẻ thống kê và biểu đồ */}
          {!isDateRangeInvalid && (
            <>
              {/* 3 Thẻ thống kê */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Card 1: Tổng doanh thu (màu vàng nhạt đặc trưng) */}
                <div className="bg-amber-100/70 rounded-xl border border-amber-200/80 p-5">
                  <p className="text-xs text-slate-600 font-semibold">Tổng doanh thu</p>
                  <p className="text-3xl font-black text-[var(--color-primary)] mt-1">
                    {formatVND(currentRevenueStats.total)}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-2">
                    Tổng tiền hóa đơn đã thanh toán
                  </p>
                </div>

                {/* Card 2: Số lượng đơn hàng */}
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <p className="text-xs text-slate-600 font-semibold">Số lượng đơn hàng</p>
                  <p className="text-3xl font-bold text-slate-900 mt-1">
                    {currentRevenueStats.orders}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-2">
                    Đơn hàng thanh toán thành công
                  </p>
                </div>

                {/* Card 3: Sản phẩm đã bán */}
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <p className="text-xs text-slate-600 font-semibold">Sản phẩm đã bán</p>
                  <p className="text-3xl font-bold text-slate-900 mt-1">
                    {currentRevenueStats.items.toLocaleString('vi-VN')}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-2">
                    Tổng số lượng sản phẩm
                  </p>
                </div>
              </div>

              {/* Biểu đồ Doanh thu (Mục 16 & Mục 18) */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-800">
                    {revenuePeriod === 'today' ? 'Doanh thu trong ngày' : 'Doanh thu theo ngày'}
                  </h2>
                  <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                    <span className="w-3 h-3 bg-[var(--color-primary)] rounded-xs inline-block" />
                    <span>Doanh thu (VNĐ)</span>
                  </div>
                </div>

                {/* Trạng thái không có dữ liệu doanh thu (Mục 18 - image26) */}
                {currentRevenueData.length === 0 || maxRevenue === 0 ? (
                  <div className="h-80 w-full flex flex-col items-center justify-center text-center gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                      <FileX className="w-7 h-7" />
                    </div>
                    <p className="font-bold text-slate-800 text-sm">
                      Không có dữ liệu doanh thu trong khoảng thời gian này
                    </p>
                  </div>
                ) : (
                  <div className="h-80 w-full pt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={currentRevenueData}
                        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis
                          dataKey="time"
                          stroke="#64748B"
                          fontSize={11}
                          tickLine={false}
                        />
                        <YAxis
                          stroke="#64748B"
                          fontSize={12}
                          tickLine={false}
                          tickFormatter={(val) =>
                            val === 0
                              ? '0 tr'
                              : `${(val / 1000000).toFixed(val >= 1000000 ? 1 : 2).replace('.0', '')} tr`
                          }
                        />
                        <Tooltip
                          formatter={(value: any) => [formatVND(Number(value) || 0), 'Doanh thu']}
                          labelFormatter={(label) => `Thời gian: ${label}`}
                        />
                        <Bar
                          dataKey="value"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={revenuePeriod === 'month' ? 18 : 36}
                        >
                          {currentRevenueData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={entry.isPeak ? '#024E82' : '#60A5FA'}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. TAB BÁO CÁO LỢI NHUẬN (Mục 19-25) */}
      {/* ==================================================================== */}
      {activeTab === 'profit' && (
        <div className="space-y-6">
          {/* Card 1: Nhập dữ liệu chi phí từ Excel (Mục 19, 22, 25 - image28, 34, 35, 36, 39) */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
            <h2 className="text-sm font-bold text-slate-800">Nhập dữ liệu chi phí</h2>
            <form onSubmit={handleUploadExcel} className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Ô chọn tháng/năm có icon cuốn lịch bên TRÁI (Mục 19 - image28) */}
                <div className="relative w-full sm:w-40 shrink-0">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="text"
                    value={costMonth}
                    onChange={(e) => {
                      setCostMonth(e.target.value);
                      setExcelError(null);
                    }}
                    placeholder="mm/yy"
                    className={`w-full pl-9 pr-3 py-2 rounded-xl border text-sm outline-none ${
                      isCostMonthFuture
                        ? 'border-red-500 bg-red-50/20'
                        : 'border-slate-200 focus:border-blue-600'
                    }`}
                  />
                  <input
                    type="month"
                    ref={costMonthInputRef}
                    className="sr-only"
                    onChange={(e) => {
                      if (e.target.value) {
                        const [y, m] = e.target.value.split('-');
                        setCostMonth(`${m}/${y}`);
                        setExcelError(null);
                      }
                    }}
                  />
                </div>

                {/* Khung kéo thả file Excel (Mục 19 & 22) */}
                <label
                  className={`flex-1 border rounded-xl px-4 py-2 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                    excelError
                      ? 'border-dashed border-red-500 bg-red-50/20 text-red-600'
                      : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  <span className="truncate">
                    {excelFile
                      ? `${excelFile.name} • ${Math.round(excelFile.size / 1024)} KB`
                      : 'Kéo thả file Excel hoặc chọn tệp để nhập dữ liệu chi phí'}
                  </span>
                  <Upload className="w-4 h-4 text-slate-400 ml-2 shrink-0" />
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

                {/* Nút Nhập Excel với icon Upload (Mục 19 - image28) */}
                <button
                  type="submit"
                  disabled={importMutation.isPending}
                  className="inline-flex items-center justify-center gap-1.5 px-6 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-sm font-bold rounded-xl shadow-xs transition-colors shrink-0 disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  <span>{importMutation.isPending ? 'Đang nhập...' : 'Nhập Excel'}</span>
                </button>
              </div>

              {/* Thông báo lỗi khi chọn tháng lớn hơn hiện tại (Mục 25 - image39) */}
              {isCostMonthFuture && (
                <p className="text-xs text-red-600 font-semibold flex items-center gap-1.5 pt-1">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  Tháng lựa chọn không hợp lệ, vui lòng chọn lại!
                </p>
              )}

              {/* Thông báo lỗi file Excel (Mục 22 - image36) */}
              {excelError && !isCostMonthFuture && (
                <p className="text-xs text-red-600 font-semibold flex items-center gap-1.5 pt-1">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{excelError}</span>
                </p>
              )}

              {/* Thông báo thành công dưới ô tháng/năm (Mục 22 - image35) */}
              {excelSuccess && (
                <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1.5 pt-1">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>{excelSuccess}</span>
                </p>
              )}
            </form>
          </div>

          {/* Card 2: Lọc thời gian báo cáo (Mục 20 - image30: Nút Tháng này/Tháng trước cùng dòng) */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center gap-4">
              <label className="text-xs font-bold text-slate-800">
                Thời gian báo cáo
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectProfitPeriod('this_month')}
                  className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                    profitPeriod === 'this_month'
                      ? 'bg-amber-100 text-amber-900 border border-amber-300 font-bold'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Tháng này
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectProfitPeriod('last_month')}
                  className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                    profitPeriod === 'last_month'
                      ? 'bg-amber-100 text-amber-900 border border-amber-300 font-bold'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Tháng trước
                </button>
              </div>
            </div>

            {/* Dòng chọn tháng: icon Calendar bên TRÁI, nút Xem báo cáo bên cạnh */}
            <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
              <div className="relative w-full sm:w-64">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="text"
                  value={`Tháng ${selectedProfitMonth}, ${selectedProfitYear}`}
                  readOnly
                  onClick={() => profitMonthInputRef.current?.showPicker?.()}
                  className={`w-full pl-9 pr-3 py-2 rounded-xl border text-sm bg-white cursor-pointer ${
                    isFutureReportMonth
                      ? 'border-red-500 text-red-600'
                      : 'border-slate-200 text-slate-800'
                  }`}
                />
                <input
                  type="month"
                  ref={profitMonthInputRef}
                  className="sr-only"
                  onChange={(e) => {
                    if (e.target.value) {
                      const [y, m] = e.target.value.split('-').map(Number);
                      setSelectedProfitYear(y);
                      setSelectedProfitMonth(m);
                      setProfitPeriod('custom');
                    }
                  }}
                />
              </div>

              <button
                type="button"
                onClick={() => refetchMonthly()}
                className="w-full sm:w-auto px-6 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-sm font-bold rounded-xl shadow-xs transition-colors shrink-0"
              >
                Xem báo cáo
              </button>
            </div>

            {/* Thông báo lỗi khi chọn thời gian báo cáo lớn hơn hiện tại (Mục 24 - image38) */}
            {isFutureReportMonth && (
              <p className="text-xs font-semibold text-red-600 flex items-center gap-1.5 pt-1">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Khoảng thời gian lựa chọn không hợp lệ, vui lòng chọn lại!
              </p>
            )}
          </div>

          {/* Khi thời gian hợp lệ: kiểm tra xem có dữ liệu kinh doanh hay không */}
          {!isFutureReportMonth && (
            <>
              {/* Mục 23: Không có dữ liệu kinh doanh trong tháng (image37) */}
              {!hasMonthlyBusinessData ? (
                <div className="bg-white rounded-xl border border-slate-200 p-16 flex flex-col items-center justify-center text-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <FileX className="w-7 h-7" />
                  </div>
                  <p className="font-bold text-slate-800 text-sm">
                    Không có dữ liệu lợi nhuận trong tháng này
                  </p>
                </div>
              ) : (
                <>
                  {/* 4 Thẻ thống kê Lợi nhuận (Mục 21 - image31) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Card 1: Tổng lợi nhuận / Lợi nhuận tạm tính */}
                    <div className="bg-amber-100/70 rounded-xl border border-amber-200/80 p-5">
                      <p className="text-xs text-slate-600 font-semibold">
                        {monthlyExpenses > 0 ? 'Tổng lợi nhuận' : 'Lợi nhuận tạm tính'}
                      </p>
                      <p className="text-2xl font-black text-[var(--color-primary)] mt-1">
                        {formatVND(monthlyProfit)}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-2">
                        {monthlyExpenses > 0
                          ? 'Sau giá vốn và chi phí vận hành'
                          : 'Chưa trừ chi phí vận hành'}
                      </p>
                    </div>

                    {/* Card 2: Tổng doanh thu */}
                    <div className="bg-white rounded-xl border border-slate-200 p-5">
                      <p className="text-xs text-slate-600 font-semibold">Tổng doanh thu</p>
                      <p className="text-2xl font-bold text-slate-900 mt-1">
                        {formatVND(monthlyRevenue)}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-2">
                        Đơn hàng đã thanh toán thành công
                      </p>
                    </div>

                    {/* Card 3: Tổng giá vốn */}
                    <div className="bg-white rounded-xl border border-slate-200 p-5">
                      <p className="text-xs text-slate-600 font-semibold">Tổng giá vốn</p>
                      <p className="text-2xl font-bold text-slate-900 mt-1">
                        {formatVND(monthlyCost)}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-2">
                        Tổng giá nhập sản phẩm đã bán
                      </p>
                    </div>

                    {/* Card 4: Chi phí vận hành (Mục 21: Nếu chưa nhập = 0 đ) */}
                    <div className="bg-white rounded-xl border border-slate-200 p-5">
                      <p className="text-xs text-slate-600 font-semibold">Chi phí vận hành</p>
                      <p className="text-2xl font-bold text-slate-900 mt-1">
                        {formatVND(monthlyExpenses)}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-2">
                        {monthlyExpenses > 0
                          ? `Dữ liệu chi phí Excel • tháng ${selectedProfitMonth}/${selectedProfitYear}`
                          : 'Chưa nhập chi phí'}
                      </p>
                    </div>
                  </div>

                  {/* Biểu đồ Lợi nhuận từng ngày */}
                  <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-bold text-slate-800">Lợi nhuận từng ngày</h2>
                      <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                        <span className="w-3 h-3 bg-[var(--color-primary)] rounded-xs inline-block" />
                        <span>Lợi nhuận (VNĐ)</span>
                      </div>
                    </div>

                    {dailyProfitData.length === 0 || maxProfit === 0 ? (
                      <div className="h-80 w-full flex flex-col items-center justify-center text-slate-400 text-sm gap-2">
                        <FileX className="w-8 h-8 text-slate-300" />
                        <p>Chưa có dữ liệu lợi nhuận trong tháng này.</p>
                      </div>
                    ) : (
                      <div className="h-80 w-full pt-4">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={dailyProfitData}
                            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                            <XAxis
                              dataKey="day"
                              stroke="#64748B"
                              fontSize={11}
                              tickLine={false}
                            />
                            <YAxis
                              stroke="#64748B"
                              fontSize={12}
                              tickLine={false}
                              tickFormatter={(val) =>
                                val === 0
                                  ? '0 tr'
                                  : `${(val / 1000000).toFixed(1)} tr`
                              }
                            />
                            <Tooltip
                              formatter={(value: any) => [
                                formatVND(Number(value) || 0),
                                'Lợi nhuận',
                              ]}
                              labelFormatter={(label) => `Ngày ${label}/${selectedProfitMonth}`}
                            />
                            <Bar dataKey="profit" radius={[3, 3, 0, 0]} maxBarSize={20}>
                              {dailyProfitData.map((entry, index) => (
                                <Cell
                                  key={`profit-cell-${index}`}
                                  fill={entry.isPeak ? '#024E82' : '#60A5FA'}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
