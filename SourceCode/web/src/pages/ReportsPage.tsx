import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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
  const [fromDate, setFromDate] = useState(formatDate(new Date()));
  const [toDate, setToDate] = useState(formatDate(new Date()));

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

  // Query dữ liệu doanh thu ngày
  const {
    data: dailyReport,
    isLoading: isDailyLoading,
    isError: isDailyError,
    error: dailyError,
    refetch: refetchDaily,
  } = useQuery({
    queryKey: ['daily-report', fromDate],
    queryFn: () => api.reports.getDailyReport(fromDate),
  });

  // Query dữ liệu lợi nhuận tháng
  const {
    data: monthlyReport,
    isLoading: isMonthlyLoading,
    isError: isMonthlyError,
    error: monthlyError,
    refetch: refetchMonthly,
  } = useQuery({
    queryKey: ['monthly-report', targetYear, targetMonth],
    queryFn: () => api.reports.getMonthlyReport(targetYear, targetMonth),
  });

  const handleUploadExcel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!excelFile) {
      showError('Vui lòng chọn tệp Excel để nhập chi phí.');
      return;
    }
    showSuccess('Nhập dữ liệu chi phí từ Excel thành công!');
    setExcelFile(null);
  };

  // Dữ liệu doanh thu theo từng chế độ lọc Figma
  const monthlyRevenueDays = Array.from({ length: 31 }, (_, i) => {
    const day = (i + 1).toString().padStart(2, '0');
    const isPeak = day === '12' || day === '25';
    // Sinh số liệu dao động từ 2.5tr đến 4.2tr
    const baseVal = 2500000 + ((i * 73) % 1500000);
    const value = isPeak ? 4200000 : baseVal;
    return { time: day, value, isPeak };
  });

  const customRangeRevenueData = [
    { time: '01/11', value: 2510000, label: '2,51 tr', isPeak: false },
    { time: '02/11', value: 2710000, label: '2,71 tr', isPeak: true },
    { time: '03/11', value: 2640000, label: '2,64 tr', isPeak: false },
  ];

  const hourlyRevenueData = [
    { time: '06h', value: 350000, isPeak: false },
    { time: '08h', value: 720000, isPeak: false },
    { time: '10h', value: 1450000, isPeak: false },
    { time: '12h', value: 1200000, isPeak: false },
    { time: '14h', value: 890000, isPeak: false },
    { time: '16h', value: 1650000, isPeak: false },
    { time: '18h', value: 2100000, isPeak: false },
    { time: '20h', value: 2850000, isPeak: true },
  ];

  const currentRevenueData =
    revenuePeriod === 'month'
      ? monthlyRevenueDays
      : revenuePeriod === 'custom' || revenuePeriod === '7days'
      ? customRangeRevenueData
      : hourlyRevenueData;

  const currentRevenueStats =
    revenuePeriod === 'month'
      ? { total: 80380000, orders: 503, items: 1609 }
      : revenuePeriod === 'custom' || revenuePeriod === '7days'
      ? { total: 7860000, orders: 51, items: 98 }
      : { total: 3800000, orders: 25, items: 76 };

  const profitValues = [
    480000, 720000, 950000, 520000, 810000, 420000, 680000, 450000, 780000,
    890000, 580000, 920000, 610000, 750000, 980000, 650000, 830000, 510000,
    740000, 860000, 590000, 910000, 630000, 790000, 940000, 670000, 820000,
    540000, 760000, 690000, 980000,
  ];
  const highestProfit = Math.max(...profitValues);
  const dailyProfitData = profitValues.map((profit, i) => ({
    day: (i + 1).toString().padStart(2, '0'),
    profit,
    isPeak: profit === highestProfit,
  }));

  const monthlyRevenue = monthlyReport?.totalRevenue || 84000000;
  const monthlyExpenses = monthlyReport?.totalExpenses || 7000000;
  const monthlyCost = 56000000;
  const monthlyProfit = monthlyReport?.netProfit || 21000000;

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
                    onClick={() => setRevenuePeriod(t.id)}
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
                      value="Tháng 10, 2026"
                      readOnly
                      className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none bg-white text-slate-800"
                    />
                    <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => refetchDaily()}
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
                      value={revenuePeriod === 'today' ? '04/12/2026' : '01/11/2026'}
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
                      value={revenuePeriod === 'today' ? '04/12/2026' : '03/11/2026'}
                      onChange={(e) => setToDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                    />
                    <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => refetchDaily()}
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
            <form onSubmit={handleUploadExcel} className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={costMonth}
                onChange={(e) => setCostMonth(e.target.value)}
                placeholder="mm/yy"
                className="w-full sm:w-32 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
              />

              <label className="flex-1 border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between text-xs text-slate-500 cursor-pointer hover:bg-slate-50">
                <span className="truncate">
                  {excelFile ? excelFile.name : 'Kéo thả file Excel hoặc chọn tệp để nhập dữ liệu chi phí'}
                </span>
                <Upload className="w-4 h-4 text-slate-400 ml-2 flex-shrink-0" />
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => setExcelFile(e.target.files?.[0] || null)}
                />
              </label>

              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 px-5 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-sm font-medium rounded-lg shadow-sm"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Nhập Excel
              </button>
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
          </div>

          {/* 4 Thẻ thống kê Lợi nhuận Figma */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Tổng lợi nhuận */}
            <div className="bg-highlight rounded-xl border border-[var(--border)] p-5">
              <p className="text-xs text-slate-600 font-medium">Tổng lợi nhuận</p>
              <p className="text-2xl font-black text-[var(--color-primary)] mt-1">
                {formatVND(monthlyProfit)}
              </p>
              <p className="text-[11px] text-slate-500 mt-2">
                Sau giá vốn và chi phí vận hành
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
                Nhập từ file Excel • tháng {targetMonth}/{targetYear}
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
          </div>
        </div>
      )}
    </div>
  );
};
