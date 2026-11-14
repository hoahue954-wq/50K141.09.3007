import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { Invoice } from '../types';
import { formatVND, formatDateTime, formatDate, numberToWordsVietnamese } from '../utils/format';
import {
  Search,
  Eye,
  Trash2,
  Printer,
  Banknote,
  Landmark,
  CreditCard,
  Edit2,
  ArrowLeft,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  Check,
  X,
  Database,
  RefreshCw,
  Receipt,
  Delete,
  QrCode,
  ShieldCheck,
  SearchX,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinner } from '../components/common/LoadingSpinner';

const paymentLabel = (m: string) => {
  if (m === 'cash') return 'Tiền mặt';
  if (m === 'transfer') return 'Chuyển khoản';
  return 'Ghi nợ';
};

const PaymentIcon = ({ method }: { method: string }) => {
  if (method === 'transfer') return <Landmark className="w-4 h-4 text-slate-500" />;
  if (method === 'debt') return <CreditCard className="w-4 h-4 text-slate-500" />;
  return <Banknote className="w-4 h-4 text-slate-500" />;
};

const capitalizeFirst = (str?: string) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export const InvoicesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  // Alerts & Modals
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [deleteSuccessBanner, setDeleteSuccessBanner] = useState(false);
  const [settleSuccessPopup, setSettleSuccessPopup] = useState(false);
  const [settleErrorPopup, setSettleErrorPopup] = useState(false);

  // Settlement Form State (cho màn hình Cập nhật trạng thái hóa đơn - Mục 18)
  const [settleMethod, setSettleMethod] = useState<'cash' | 'transfer'>('cash');
  const [receivedInput, setReceivedInput] = useState('');
  const [hasConfirmedCash, setHasConfirmedCash] = useState(false);
  const [hasAttemptedCash, setHasAttemptedCash] = useState(false);

  const { isOwner } = useAuth();
  const queryClient = useQueryClient();

  const detailId = searchParams.get('detail');
  const settleId = searchParams.get('settle');

  const {
    data: invoices = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['invoices', search],
    queryFn: () => api.invoices.list({ search }),
  });

  const selectedInvoice = invoices.find(
    (inv) => inv.id === detailId || inv.code === detailId
  ) || null;

  const settleInvoice = invoices.find(
    (inv) => inv.id === settleId || inv.code === settleId
  ) || null;

  // Khi mở màn hình cập nhật trạng thái nợ, khởi tạo số tiền gợi ý
  useEffect(() => {
    if (settleInvoice) {
      setSettleMethod('cash');
      setReceivedInput(String(settleInvoice.total_amount));
      setHasConfirmedCash(true);
      setHasAttemptedCash(false);
    }
  }, [settleInvoice?.id]);

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.invoices.delete(id),
    onSuccess: () => {
      setDeleteTarget(null);
      setDeleteSuccessBanner(true);
      if (detailId) {
        setSearchParams({});
      }
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: () => {
      setDeleteTarget(null);
      setSettleErrorPopup(true);
    },
  });

  const settleMutation = useMutation({
    mutationFn: ({
      id,
      method,
      amountReceived,
    }: {
      id: string;
      method: 'cash' | 'transfer';
      amountReceived: number;
    }) => api.invoices.settleDebt(id, method, amountReceived),
    onSuccess: () => {
      setSearchParams({});
      setSettleSuccessPopup(true);
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: () => {
      setSettleErrorPopup(true);
    },
  });

  const debtCount = invoices.filter((inv) => inv.status === 'unpaid').length;
  const totalPages = Math.ceil(invoices.length / PAGE_SIZE);
  const paged = invoices.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ──────────────────────────────────────────────────────────────────────────
  // 1. MÀN HÌNH CẬP NHẬT TRẠNG THÁI HÓA ĐƠN (Mục 18 - image75 -> image78)
  // ──────────────────────────────────────────────────────────────────────────
  if (settleInvoice) {
    const total = settleInvoice.total_amount;
    const amountReceived = Number(receivedInput) || 0;
    const isAmountValid = amountReceived >= total;
    const changeAmount = Math.max(0, amountReceived - total);

    const handleDigitClick = (digit: string) => {
      setReceivedInput((prev) => `${prev}${digit}`.replace(/^0+(?=\d)/, ''));
      setHasConfirmedCash(false);
      setHasAttemptedCash(false);
    };

    const handleBackspace = () => {
      setReceivedInput((prev) => prev.slice(0, -1));
      setHasConfirmedCash(false);
      setHasAttemptedCash(false);
    };

    const handleConfirmCashInput = () => {
      setHasAttemptedCash(true);
      if (isAmountValid) {
        setHasConfirmedCash(true);
      } else {
        setHasConfirmedCash(false);
      }
    };

    const handleFinishSettle = () => {
      if (settleMethod === 'cash') {
        if (!isAmountValid) {
          setHasAttemptedCash(true);
          return;
        }
        settleMutation.mutate({
          id: settleInvoice.id,
          method: 'cash',
          amountReceived,
        });
      } else {
        settleMutation.mutate({
          id: settleInvoice.id,
          method: 'transfer',
          amountReceived: total,
        });
      }
    };

    const customerName =
      settleInvoice.customer_name === 'Khách quen mẫu'
        ? 'Trần Văn Bình'
        : settleInvoice.customer_name || 'Khách lẻ';

    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
        {/* Header màn hình */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[var(--color-primary)]">
            Cập nhật trạng thái hóa đơn
          </h1>
          <button
            onClick={() => setSearchParams({})}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-[var(--color-primary)] font-semibold rounded-xl text-sm shadow-2xs transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Quay lại danh sách
          </button>
        </div>

        {/* Bố cục 2 cột theo chuẩn Figma / image75 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* CỘT TRÁI (5 cột): TÓM TẮT HÓA ĐƠN BÁN HÀNG */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Hóa đơn bán hàng
                </p>
                <h2 className="text-2xl font-bold text-[var(--color-primary)] mt-1">
                  {settleInvoice.code}
                </h2>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-600">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                Chưa thanh toán
              </span>
            </div>

            {/* Thông tin khách hàng */}
            <div className="bg-slate-50 rounded-xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                <User className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">{customerName}</p>
                <p className="text-xs text-slate-500">Khách hàng · {settleInvoice.code}</p>
              </div>
            </div>

            <div className="flex justify-between text-xs text-slate-500 pt-1">
              <span>Ngày lập: {formatDate(settleInvoice.created_at)}</span>
              <span>Người lập: Thu Hằng</span>
            </div>

            {/* Danh sách sản phẩm */}
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <div className="flex justify-between text-xs font-bold text-slate-500 uppercase">
                <span>Sản phẩm · {settleInvoice.items.length} mặt hàng</span>
                <span>Thành tiền</span>
              </div>
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {settleInvoice.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-start text-xs">
                    <div>
                      <p className="font-semibold text-slate-800">{item.product_name}</p>
                      <p className="text-slate-400 text-[11px]">
                        {item.product_barcode} · {item.quantity} {item.unit?.toLowerCase()} ×{' '}
                        {formatVND(item.unit_price)}
                      </p>
                    </div>
                    <span className="font-bold text-slate-800">
                      {formatVND(item.total_amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Tạm tính</span>
                <span className="font-bold text-slate-800">{formatVND(total)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Đã thanh toán</span>
                <span className="font-bold text-slate-800">0 đ</span>
              </div>
            </div>

            {/* Hộp tổng tiền màu vàng */}
            <div className="bg-amber-100/70 rounded-xl p-4 flex items-center justify-between">
              <span className="font-bold text-slate-800 text-sm">Tổng tiền</span>
              <span className="text-2xl font-black text-slate-900">{formatVND(total)}</span>
            </div>
          </div>

          {/* CỘT PHẢI (7 cột): PHƯƠNG THỨC THANH TOÁN */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
            <h2 className="text-base font-bold text-slate-900">Phương thức thanh toán</h2>

            {/* Chọn Tiền mặt / Mã QR */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setSettleMethod('cash');
                  setReceivedInput(String(total));
                  setHasConfirmedCash(true);
                  setHasAttemptedCash(false);
                }}
                className={`py-3 px-4 rounded-xl text-sm font-bold border flex items-center justify-center gap-2 transition-colors ${
                  settleMethod === 'cash'
                    ? 'border-blue-600 bg-blue-50/60 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Banknote className="w-4 h-4" />
                <span>Tiền mặt</span>
                {settleMethod === 'cash' && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
              </button>

              <button
                type="button"
                onClick={() => {
                  setSettleMethod('transfer');
                }}
                className={`py-3 px-4 rounded-xl text-sm font-bold border flex items-center justify-center gap-2 transition-colors ${
                  settleMethod === 'transfer'
                    ? 'border-blue-600 bg-blue-50/60 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <QrCode className="w-4 h-4" />
                <span>Mã QR</span>
                {settleMethod === 'transfer' && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
              </button>
            </div>

            {/* NỘI DUNG TIỀN MẶT */}
            {settleMethod === 'cash' && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Tiền khách đưa *
                  </label>
                  <div
                    className={`rounded-xl border px-4 py-3 flex items-center justify-between ${
                      hasAttemptedCash && !isAmountValid
                        ? 'border-red-500 bg-red-50/30'
                        : 'border-blue-600 bg-white'
                    }`}
                  >
                    <input
                      type="text"
                      value={receivedInput ? Number(receivedInput).toLocaleString('vi-VN') : ''}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        setReceivedInput(val);
                        setHasConfirmedCash(false);
                        setHasAttemptedCash(false);
                      }}
                      className={`w-full text-2xl font-black bg-transparent outline-none ${
                        hasAttemptedCash && !isAmountValid ? 'text-red-600' : 'text-slate-900'
                      }`}
                      placeholder="0"
                    />
                    <span
                      className={`text-base font-bold ${
                        hasAttemptedCash && !isAmountValid ? 'text-red-600' : 'text-slate-500'
                      }`}
                    >
                      đ
                    </span>
                  </div>

                  {/* Thông báo lỗi khi số tiền không hợp lệ */}
                  {hasAttemptedCash && !isAmountValid && (
                    <p className="mt-1.5 text-xs font-semibold text-red-600 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4" />
                      Số tiền không hợp lệ!
                    </p>
                  )}
                </div>

                {/* Phím số nhanh */}
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => handleDigitClick(String(n))}
                      className="py-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl font-bold text-lg text-slate-800 shadow-2xs"
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleDigitClick('0')}
                    className="py-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl font-bold text-lg text-slate-800 shadow-2xs"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={handleBackspace}
                    className="py-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center text-slate-700 shadow-2xs"
                  >
                    <Delete className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmCashInput}
                    className="py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-bold rounded-xl shadow-2xs"
                  >
                    Xác nhận
                  </button>
                </div>

                {/* Các nút gợi ý số tiền nhanh */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setReceivedInput(String(total));
                      setHasConfirmedCash(true);
                      setHasAttemptedCash(false);
                    }}
                    className="py-2.5 bg-blue-50/70 hover:bg-blue-100 text-blue-700 font-bold rounded-xl text-xs border border-blue-200"
                  >
                    {formatVND(total)}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReceivedInput('200000');
                      setHasConfirmedCash(true);
                      setHasAttemptedCash(false);
                    }}
                    className="py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-xs border border-slate-200"
                  >
                    200.000 đ
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReceivedInput('500000');
                      setHasConfirmedCash(true);
                      setHasAttemptedCash(false);
                    }}
                    className="py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-xs border border-slate-200"
                  >
                    500.000 đ
                  </button>
                </div>

                <div className="flex justify-between items-center text-sm font-semibold text-slate-600 pt-2">
                  <span>Khách cần trả</span>
                  <span className="text-xl font-black text-slate-900">{formatVND(total)}</span>
                </div>

                {/* Hộp Tiền thừa */}
                <div
                  className={`rounded-xl p-4 ${
                    isAmountValid && hasConfirmedCash
                      ? 'bg-red-50/60 text-red-600'
                      : 'bg-red-50 text-red-600'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-600">Tiền thừa</span>
                    <span className="text-xl font-black text-red-600">
                      {isAmountValid && hasConfirmedCash ? formatVND(changeAmount) : '—'}
                    </span>
                  </div>
                  {(!isAmountValid || !hasConfirmedCash) && (
                    <p className="text-xs text-red-500 mt-1">Chưa thể xác nhận thanh toán</p>
                  )}
                </div>

                {/* Nút Thanh toán hoàn tất */}
                <button
                  type="button"
                  disabled={!isAmountValid || !hasConfirmedCash || settleMutation.isPending}
                  onClick={handleFinishSettle}
                  className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors ${
                    isAmountValid && hasConfirmedCash
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <Check className="w-5 h-5" />
                  {settleMutation.isPending ? 'Đang xử lý...' : 'Thanh toán hoàn tất'}
                </button>
              </div>
            )}

            {/* NỘI DUNG MÃ QR */}
            {settleMethod === 'transfer' && (
              <div className="space-y-4 text-center">
                <div className="inline-block px-3 py-1 bg-amber-100 text-amber-800 text-[11px] font-bold rounded-full uppercase tracking-wider">
                  Mã minh họa · Không dùng chuyển tiền
                </div>

                <div className="flex justify-center py-2">
                  <div className="p-4 bg-white border-2 border-slate-900 rounded-2xl shadow-sm inline-block">
                    {/* Minh họa mã QR */}
                    <svg
                      viewBox="0 0 160 160"
                      className="w-40 h-40"
                      fill="currentColor"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <rect x="10" y="10" width="40" height="40" fill="#0f172a" />
                      <rect x="20" y="20" width="20" height="20" fill="white" />
                      <rect x="110" y="10" width="40" height="40" fill="#0f172a" />
                      <rect x="120" y="20" width="20" height="20" fill="white" />
                      <rect x="10" y="110" width="40" height="40" fill="#0f172a" />
                      <rect x="20" y="120" width="20" height="20" fill="white" />
                      <rect x="60" y="20" width="10" height="30" fill="#0f172a" />
                      <rect x="80" y="10" width="20" height="10" fill="#0f172a" />
                      <rect x="70" y="60" width="30" height="30" fill="#0f172a" />
                      <rect x="20" y="60" width="30" height="10" fill="#0f172a" />
                      <rect x="30" y="80" width="20" height="20" fill="#0f172a" />
                      <rect x="110" y="60" width="20" height="40" fill="#0f172a" />
                      <rect x="60" y="110" width="30" height="20" fill="#0f172a" />
                      <rect x="110" y="110" width="40" height="20" fill="#0f172a" />
                      <rect x="130" y="140" width="20" height="10" fill="#0f172a" />
                      <rect x="60" y="140" width="20" height="10" fill="#0f172a" />
                      <text
                        x="80"
                        y="85"
                        textAnchor="middle"
                        fill="white"
                        fontSize="9"
                        fontWeight="bold"
                      >
                        MINH HỌA
                      </text>
                    </svg>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-xl p-4 text-xs space-y-2 text-left">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Hóa đơn / khách hàng</span>
                    <span className="font-bold text-slate-800">
                      {settleInvoice.code} · {customerName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Nội dung thanh toán</span>
                    <span className="font-bold text-slate-800">
                      THANH TOAN {settleInvoice.code}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-200">
                    <span className="text-slate-500">Số tiền cần thanh toán</span>
                    <span className="font-black text-slate-900 text-base">
                      {formatVND(total)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={settleMutation.isPending}
                  onClick={handleFinishSettle}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
                >
                  <Check className="w-5 h-5" />
                  {settleMutation.isPending ? 'Đang xử lý...' : 'Thanh toán hoàn tất'}
                </button>

                <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5 pt-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                  Sau xác nhận: chuyển sang Đã thanh toán và lưu lịch sử cập nhật.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Modal lỗi kết nối CSDL (image 78) */}
        {settleErrorPopup && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-center relative animate-in fade-in zoom-in-95">
              <button
                type="button"
                onClick={() => setSettleErrorPopup(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center text-red-500 mx-auto mb-4">
                <Database className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-red-600">Lỗi kết nối cơ sở dữ liệu</h3>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. MÀN HÌNH CHI TIẾT HÓA ĐƠN (Mục 10-15 - image60 -> image70)
  // ──────────────────────────────────────────────────────────────────────────
  if (selectedInvoice) {
    const isPaid = selectedInvoice.status === 'paid';
    const totalQty = selectedInvoice.items.reduce((s, i) => s + i.quantity, 0);
    const customerName =
      selectedInvoice.customer_name === 'Khách quen mẫu'
        ? 'Trần Văn Bình'
        : selectedInvoice.customer_name || 'Khách lẻ';

    return (
      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
        {/* Header: Chỉ hiện tiêu đề và nút về danh sách (BỎ dòng mô tả phụ theo Mục 10) */}
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-primary)]">Chi tiết hóa đơn</h1>
        </div>

        <button
          onClick={() => setSearchParams({})}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-semibold rounded-xl text-sm shadow-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Về danh sách hóa đơn
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* CỘT CHÍNH (2 cột): HEADER & BẢNG SẢN PHẨM */}
          <div className="lg:col-span-2 space-y-4">
            {/* Khung mã hóa đơn & thông tin ngày khách (Mục 12 - image64) */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-3">
                <Receipt className="w-5 h-5 text-[var(--color-primary)]" />
                <span className="text-xl font-bold text-[var(--color-primary)] font-mono">
                  {selectedInvoice.code}
                </span>
              </div>

              <hr className="my-4 border-slate-100" />

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-400 text-xs mb-1">Khách hàng</p>
                  <div className="flex items-center gap-1.5">
                    <User className="w-4 h-4 text-blue-600" />
                    <span className="font-bold text-slate-800">{customerName}</span>
                  </div>
                </div>

                <div>
                  <p className="text-slate-400 text-xs mb-1">Thời gian bán</p>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <span className="font-bold text-slate-800">
                      {formatDate(selectedInvoice.created_at)} ·{' '}
                      {formatDateTime(selectedInvoice.created_at).slice(-5)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bảng sản phẩm trong hóa đơn (Mục 13 - image66) */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-bold text-slate-800">Sản phẩm trong hóa đơn</h2>
                <span className="text-xs text-slate-500">
                  {selectedInvoice.items.length} sản phẩm
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-[var(--color-primary-soft)] text-[var(--color-primary)] text-xs font-semibold">
                    <tr>
                      <th className="py-3 px-6 text-left">Tên sản phẩm</th>
                      <th className="py-3 px-4 text-right">Số lượng</th>
                      <th className="py-3 px-4 text-right">Đơn giá</th>
                      <th className="py-3 px-6 text-right">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedInvoice.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-3.5 px-6">
                          <p className="font-semibold text-slate-800">{item.product_name}</p>
                          <p className="text-xs text-slate-400">
                            Đơn vị: {capitalizeFirst(item.unit)}
                          </p>
                        </td>
                        <td className="py-3.5 px-4 text-right font-medium text-slate-700">
                          {item.quantity}
                        </td>
                        <td className="py-3.5 px-4 text-right text-slate-600">
                          {formatVND(item.unit_price)}
                        </td>
                        <td className="py-3.5 px-6 text-right font-bold text-slate-900">
                          {formatVND(item.total_amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50/50">
                      <td colSpan={3} className="py-3 px-6 text-sm text-slate-500">
                        Tổng số lượng
                      </td>
                      <td className="py-3 px-6 text-right font-bold text-slate-800">
                        {totalQty}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>

          {/* CỘT PHỤ (1 cột): THÔNG TIN THANH TOÁN (Mục 14 & 15 - image68 & image70) */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
              <h2 className="font-bold text-slate-800 text-base">Thông tin thanh toán</h2>

              <div>
                <p className="text-xs text-slate-400 mb-1">Phương thức thanh toán</p>
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <PaymentIcon method={selectedInvoice.payment_method} />
                  <span>{paymentLabel(selectedInvoice.payment_method)}</span>
                </div>
              </div>

              <div>
                <p className="text-xs text-slate-400 mb-1">Trạng thái</p>
                <div
                  className={`flex items-center gap-1.5 font-bold ${
                    isPaid ? 'text-emerald-600' : 'text-blue-700'
                  }`}
                >
                  {isPaid ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-blue-700" />
                  )}
                  <span>{isPaid ? 'Đã thanh toán' : 'Chưa thanh toán'}</span>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
                <span className="text-xs text-slate-400">Tiền hàng</span>
                <span className="font-bold text-slate-800">
                  {formatVND(selectedInvoice.total_amount)}
                </span>
              </div>

              {/* Hộp tổng tiền màu vàng chuẩn Figma */}
              <div className="bg-amber-100/70 p-5 rounded-2xl space-y-1">
                <p className="text-xs text-amber-900/80 font-bold">Tổng tiền</p>
                <p className="text-2xl font-black text-slate-900">
                  {formatVND(selectedInvoice.total_amount)}
                </p>
                <p className="text-xs text-amber-900/80 pt-1">
                  {numberToWordsVietnamese(selectedInvoice.total_amount)}
                </p>
              </div>

              {/* Các nút hành động khi chưa thanh toán (Mục 15 - image69 & image70) */}
              {!isPaid && (
                <div className="space-y-2 pt-2">
                  <button
                    onClick={() => window.print()}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-sm"
                  >
                    <Printer className="w-4 h-4" />
                    In hóa đơn
                  </button>

                  <button
                    onClick={() => setSearchParams({ settle: selectedInvoice.id })}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-semibold rounded-xl text-sm"
                  >
                    <Edit2 className="w-4 h-4" />
                    Cập nhật thanh toán
                  </button>

                  {isOwner && (
                    <button
                      onClick={() => setDeleteTarget(selectedInvoice)}
                      className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-white border border-slate-200 hover:bg-red-50 text-red-600 font-semibold rounded-xl text-sm"
                    >
                      <Trash2 className="w-4 h-4" />
                      Xóa hóa đơn
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal xác nhận xóa chuẩn (Mục 16 - image72) */}
        {deleteTarget && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 text-center animate-in fade-in zoom-in-95">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 mx-auto mb-3">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Xác nhận xóa hóa đơn?</h3>
              <p className="text-sm font-semibold text-red-600 mb-6">
                Bạn có chắc chắn muốn xóa hóa đơn này?
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-sm"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(deleteTarget.id)}
                  disabled={deleteMutation.isPending}
                  className="px-6 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-bold rounded-xl text-sm shadow-sm disabled:opacity-50"
                >
                  {deleteMutation.isPending ? 'Đang xóa...' : 'Đồng ý'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. MÀN HÌNH DANH SÁCH HÓA ĐƠN
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-primary)]">Danh sách hóa đơn</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Tra cứu hóa đơn, trạng thái thanh toán và thông tin ghi nợ.
        </p>
      </div>

      {/* Banner thông báo xóa thành công (Mục 17 - image73) */}
      {deleteSuccessBanner && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-sm text-emerald-700">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>Đã xóa hóa đơn thành công</span>
          </div>
          <button
            onClick={() => setDeleteSuccessBanner(false)}
            className="text-emerald-500 hover:text-emerald-700 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tìm kiếm + Thẻ đơn nợ (Mục 1 & 2 - image43 & image45) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Tìm kiếm hóa đơn */}
        <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-[var(--color-primary)] mb-3">
            Tìm kiếm hóa đơn
          </h2>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setSearch(searchInput);
                    setPage(1);
                  }
                }}
                placeholder="Nhập mã hóa đơn"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>
            <button
              onClick={() => {
                setSearch(searchInput);
                setPage(1);
              }}
              className="px-5 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-sm font-medium rounded-lg shadow-sm"
            >
              Tìm kiếm
            </button>
          </div>
        </div>

        {/* Thẻ hóa đơn nợ (Mục 2 - image45: Tiêu đề đỏ, Icon Receipt đỏ) */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-red-600">Hóa đơn nợ</h2>
            <p className="text-4xl font-bold text-slate-800 mt-2">{debtCount}</p>
          </div>
          <Receipt className="w-8 h-8 text-red-600" />
        </div>
      </div>

      {isLoading && <LoadingSpinner message="Đang tải danh sách hóa đơn..." />}

      {/* Lỗi kết nối CSDL (Mục 9 - image58) */}
      {isError && (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-white rounded-2xl border border-slate-200">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center text-red-500 mb-4">
            <Database className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-red-600 mb-4">Lỗi kết nối cơ sở dữ liệu</h3>
          {refetch && (
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] transition-colors shadow-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Thử lại
            </button>
          )}
        </div>
      )}

      {!isLoading && !isError && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Hóa đơn bán hàng</h2>
            <span className="text-xs text-slate-500">
              {search ? 'Kết quả tìm kiếm' : 'Mới nhất trước'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-[var(--color-primary-soft)] text-slate-500 text-xs">
                <tr>
                  <th className="py-3 px-4 font-medium">Mã hóa đơn</th>
                  <th className="py-3 px-4 font-medium">Trạng thái</th>
                  <th className="py-3 px-4 font-medium">Khách hàng</th>
                  <th className="py-3 px-4 font-medium">Thanh toán</th>
                  <th className="py-3 px-4 font-medium text-right">Tổng tiền</th>
                  <th className="py-3 px-4 font-medium text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.length === 0 ? (
                  /* Không tìm thấy hóa đơn (Mục 8 - image57) */
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center text-red-500 mx-auto mb-3">
                        <SearchX className="w-7 h-7" />
                      </div>
                      <p className="font-bold text-slate-800 text-base">
                        Không tìm thấy hóa đơn bán phù hợp!
                      </p>
                    </td>
                  </tr>
                ) : (
                  paged.map((inv) => {
                    const isPaid = inv.status === 'paid';
                    const customerName =
                      inv.customer_name === 'Khách quen mẫu'
                        ? 'Trần Văn Bình'
                        : inv.customer_name || 'Khách lẻ';

                    return (
                      <tr key={inv.id} className="hover:bg-slate-50/60">
                        <td className="py-3.5 px-4">
                          <button
                            onClick={() => setSearchParams({ detail: inv.id })}
                            className="font-bold text-[var(--color-primary)] hover:underline font-mono"
                          >
                            {inv.code}
                          </button>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`text-xs font-semibold ${
                              isPaid ? 'text-emerald-600' : 'text-red-600'
                            }`}
                          >
                            {isPaid ? 'Đã thanh toán' : 'Chưa thanh toán'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-700">{customerName}</td>
                        <td className="py-3.5 px-4">
                          {isPaid ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                              <PaymentIcon method={inv.payment_method} />
                              {paymentLabel(inv.payment_method)}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                          {formatVND(inv.total_amount)}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-2.5 text-xs">
                            <button
                              onClick={() => setSearchParams({ detail: inv.id })}
                              className="inline-flex items-center gap-1 text-[var(--color-primary)] hover:underline font-medium"
                            >
                              <Eye className="w-3.5 h-3.5" /> Xem
                            </button>

                            {/* Nút Xóa: Chỉ OWNER */}
                            {isOwner && (
                              <button
                                onClick={() => setDeleteTarget(inv)}
                                className="inline-flex items-center gap-1 text-red-600 hover:underline font-medium"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Xóa
                              </button>
                            )}

                            {/* Nút Sửa: Cả OWNER và STAFF với đơn Chưa thanh toán (Mục 6 & 7) */}
                            {!isPaid && (
                              <button
                                onClick={() => setSearchParams({ settle: inv.id })}
                                className="inline-flex items-center gap-1 text-slate-600 hover:text-[var(--color-primary)] hover:underline font-medium"
                              >
                                <Edit2 className="w-3.5 h-3.5" /> Sửa
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Phân trang */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-end gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30 text-slate-500"
              >
                ‹
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((pg) => (
                <button
                  key={pg}
                  onClick={() => setPage(pg)}
                  className={`w-7 h-7 rounded-lg text-xs font-medium ${
                    page === pg
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'hover:bg-slate-200 text-slate-600'
                  }`}
                >
                  {pg}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30 text-slate-500"
              >
                ›
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal xác nhận xóa hóa đơn (Mục 16 - image72) */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 text-center animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 mx-auto mb-3">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Xác nhận xóa hóa đơn?</h3>
            <p className="text-sm font-semibold text-red-600 mb-6">
              Bạn có chắc chắn muốn xóa hóa đơn này?
            </p>
            <div className="flex gap-3 justify-center">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-sm"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                className="px-6 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-bold rounded-xl text-sm shadow-sm disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Đang xóa...' : 'Đồng ý'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal thông báo cập nhật nợ thành công (Mục 18 - image79) */}
      {settleSuccessPopup && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-center relative animate-in fade-in zoom-in-95">
            <button
              type="button"
              onClick={() => setSettleSuccessPopup(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mx-auto mb-3">
              <Check className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-800">Cập nhật trạng thái nợ thành công</h3>
          </div>
        </div>
      )}
    </div>
  );
};
