import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Invoice } from '../types';
import { formatVND, formatDateTime } from '../utils/format';
import {
  Search,
  Eye,
  Trash2,
  Printer,
  Banknote,
  QrCode,
  FileText,
  Edit2,
  ArrowLeft,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  Delete,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Modal } from '../components/common/Modal';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';

type PageMode = 'list' | 'detail';

interface InvoiceSettlementModalProps {
  invoice: Invoice | null;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (method: 'cash' | 'transfer', amountReceived: number) => void;
}

const InvoiceSettlementModal: React.FC<InvoiceSettlementModalProps> = ({
  invoice,
  isPending,
  onClose,
  onSubmit,
}) => {
  const [method, setMethod] = useState<'cash' | 'transfer'>('cash');
  const [receivedInput, setReceivedInput] = useState('');
  const [hasConfirmed, setHasConfirmed] = useState(false);
  const [showInvalidAmount, setShowInvalidAmount] = useState(false);

  useEffect(() => {
    if (!invoice) return;
    setMethod('cash');
    setReceivedInput('');
    setHasConfirmed(false);
    setShowInvalidAmount(false);
  }, [invoice?.id, invoice?.total_amount]);

  if (!invoice) return null;

  const amountReceived = Number(receivedInput) || 0;
  const amountIsValid = amountReceived >= invoice.total_amount;
  const setDigit = (digit: string) => {
    setReceivedInput((current) => `${current}${digit}`.replace(/^0+(?=\d)/, ''));
    setHasConfirmed(false);
    setShowInvalidAmount(false);
  };
  const confirmAmount = () => {
    if (!amountIsValid) {
      setShowInvalidAmount(true);
      setHasConfirmed(false);
      return;
    }
    setShowInvalidAmount(false);
    setHasConfirmed(true);
  };

  return (
    <Modal isOpen onClose={onClose} title="Cập nhật trạng thái hóa đơn" maxWidth="2xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <section className="rounded-xl border border-slate-200 p-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500 uppercase">Hóa đơn bán hàng</p>
              <p className="text-xl font-bold text-[var(--color-primary)] mt-1">{invoice.code}</p>
            </div>
            <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
              Chưa thanh toán
            </span>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-slate-800">{invoice.customer_name || 'Khách lẻ'}</p>
            <p className="text-xs text-slate-500 mt-1">Ngày lập: {formatDateTime(invoice.created_at)}</p>
          </div>
          <div className="space-y-2 max-h-52 overflow-y-auto">
            {invoice.items.map((item, index) => (
              <div key={`${item.product_barcode}-${index}`} className="flex justify-between gap-3 border-b border-slate-100 pb-2 text-xs">
                <span className="text-slate-700">{item.product_name} · {item.quantity} {item.unit}</span>
                <span className="shrink-0 font-semibold text-slate-800">{formatVND(item.quantity * item.unit_price)}</span>
              </div>
            ))}
          </div>
          <div className="bg-highlight rounded-lg px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold">Tổng tiền</span>
            <span className="text-xl font-bold text-slate-900">{formatVND(invoice.total_amount)}</span>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 p-4 space-y-4">
          <h3 className="font-semibold text-slate-800">Phương thức thanh toán</h3>
          <div className="grid grid-cols-2 gap-2">
            {(['cash', 'transfer'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setMethod(value);
                  if (value === 'transfer') setReceivedInput(String(invoice.total_amount));
                  setHasConfirmed(false);
                  setShowInvalidAmount(false);
                }}
                className={`min-h-14 py-2 px-3 rounded-lg text-sm font-medium border flex items-center justify-center gap-1.5 transition-colors ${
                  method === value
                    ? 'bg-primary-soft border-[var(--color-primary)] text-[var(--color-primary)]'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {value === 'cash' ? <Banknote className="w-4 h-4" /> : <QrCode className="w-4 h-4" />}
                {value === 'cash' ? 'Tiền mặt' : 'Mã QR'}
              </button>
            ))}
          </div>
          {method === 'cash' ? (
            <div>
              <label className={`block rounded-lg border p-3 text-xs ${showInvalidAmount ? 'border-red-500 bg-red-50 text-red-600' : 'border-slate-200 bg-white text-slate-600'}`}>
                Tiền khách đưa *
                <span className="mt-1 flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={receivedInput ? Number(receivedInput).toLocaleString('vi-VN') : ''}
                    onChange={(event) => {
                      setReceivedInput(event.target.value.replace(/\D/g, ''));
                      setHasConfirmed(false);
                      setShowInvalidAmount(false);
                    }}
                    className={`w-full bg-transparent text-2xl font-bold outline-none ${showInvalidAmount ? 'text-red-600' : 'text-slate-800'}`}
                    aria-label="Tiền khách đưa"
                  />
                  <span>đ</span>
                </span>
              </label>
              {showInvalidAmount && (
                <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Số tiền không hợp lệ!
                </p>
              )}
              <div className="mt-3 grid grid-cols-3 gap-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    onClick={() => setDigit(digit)}
                    className="h-11 rounded-lg border border-slate-200 bg-white text-lg font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    {digit}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setReceivedInput((current) => current.slice(0, -1));
                    setHasConfirmed(false);
                    setShowInvalidAmount(false);
                  }}
                  aria-label="Xóa chữ số cuối"
                  className="h-11 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-700 hover:bg-slate-50"
                >
                  <Delete className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={confirmAmount}
                  className="h-11 rounded-lg bg-[var(--color-primary)] text-white font-semibold hover:bg-[var(--color-primary-hover)]"
                >
                  Xác nhận
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              Số tiền cần thanh toán
              <p className="mt-1 text-right text-xl font-bold text-slate-900">{formatVND(invoice.total_amount)}</p>
              <button
                type="button"
                onClick={confirmAmount}
                className="mt-3 w-full rounded-lg bg-[var(--color-primary)] py-2 text-white font-semibold"
              >
                Xác nhận
              </button>
            </div>
          )}
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            Khách cần trả
            <p className="text-right text-xl font-bold text-slate-900 mt-1">{formatVND(invoice.total_amount)}</p>
          </div>
          <div className={`rounded-lg p-3 text-xs ${hasConfirmed ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            Tiền thừa
            <p className="text-right text-xl font-bold mt-1">
              {hasConfirmed ? formatVND(Math.max(0, amountReceived - invoice.total_amount)) : '—'}
            </p>
            {!hasConfirmed && <p>Chưa thể xác nhận thanh toán</p>}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-lg text-sm"
            >
              Hủy
            </button>
            <button
              onClick={() => onSubmit(method, amountReceived)}
              disabled={!hasConfirmed || isPending}
              className="flex-1 py-2.5 bg-[var(--color-success)] hover:bg-[var(--color-success-hover)] text-white font-medium rounded-lg text-sm shadow-sm disabled:opacity-70"
            >
              {isPending ? 'Đang xử lý...' : 'Thanh toán hoàn tất'}
            </button>
          </div>
        </section>
      </div>
    </Modal>
  );
};

const paymentLabel = (m: string) =>
  m === 'cash' ? 'Tiền mặt' : m === 'transfer' ? 'Chuyển khoản' : 'Ghi nợ';

const PaymentIcon = ({ method }: { method: string }) => {
  if (method === 'transfer') return <QrCode className="w-3.5 h-3.5" />;
  return <Banknote className="w-3.5 h-3.5" />;
};

export const InvoicesPage: React.FC = () => {
  const [mode, setMode] = useState<PageMode>('list');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<string | null>(null);
  const [settleInvoice, setSettleInvoice] = useState<Invoice | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const { isOwner } = useAuth();
  const { showSuccess, showError } = useToast();
  const queryClient = useQueryClient();

  const { data: invoices = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['invoices', search],
    queryFn: () => api.invoices.list({ search }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.invoices.delete(id),
    onSuccess: () => {
      showSuccess('Đã xóa hóa đơn và hoàn lại tồn kho thành công!');
      setDeleteInvoiceId(null);
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: (err: any) => showError(err.message),
  });

  const settleMutation = useMutation({
    mutationFn: ({ id, method, amountReceived }: { id: string; method: 'cash' | 'transfer'; amountReceived: number }) =>
      api.invoices.settleDebt(id, method, amountReceived),
    onSuccess: (inv) => {
      showSuccess(`Đã gạch nợ hóa đơn ${inv.code} thành công!`);
      setSettleInvoice(null);
      // Update selected invoice if visible
      if (selectedInvoice?.id === inv.id) setSelectedInvoice(inv);
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: (err: any) => showError(err.message),
  });

  const handleViewDetail = (inv: Invoice) => {
    setSelectedInvoice(inv);
    setMode('detail');
  };

  const handleBackToList = () => {
    setMode('list');
    setSelectedInvoice(null);
  };

  const debtCount = invoices.filter((inv) => inv.status === 'unpaid').length;
  const totalPages = Math.ceil(invoices.length / PAGE_SIZE);
  const paged = invoices.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ─── MÀN HÌNH CHI TIẾT HÓA ĐƠN (Figma "5 - Chi tiết hóa đơn") ──────────────
  if (mode === 'detail' && selectedInvoice) {
    const isPaid = selectedInvoice.status === 'paid';
    const totalQty = selectedInvoice.items.reduce((s, i) => s + i.quantity, 0);

    return (
      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
        {/* Tiêu đề */}
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-primary)]">Chi tiết hóa đơn</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Mã hóa đơn và trạng thái thanh toán được lấy từ cùng một hóa đơn đã lưu.
          </p>
        </div>

        {/* Nút về danh sách */}
        <button
          onClick={handleBackToList}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-semibold rounded-xl text-sm shadow-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Về danh sách hóa đơn
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Cột chính: sản phẩm */}
          <div className="lg:col-span-2 space-y-4">
            {/* Header hóa đơn */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-slate-500" />
                  <span className="text-lg font-black text-slate-900 font-mono">{selectedInvoice.code}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-400 text-xs mb-1">Khách hàng</p>
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-semibold text-slate-800">
                      {selectedInvoice.customer_name || 'Khách lẻ'}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-slate-400 text-xs mb-1">Thời gian bán</p>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-semibold text-slate-800">
                      {formatDateTime(selectedInvoice.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bảng sản phẩm */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-bold text-slate-800">Sản phẩm trong hóa đơn</h2>
                <span className="text-xs text-slate-500">{selectedInvoice.items.length} sản phẩm</span>
              </div>
              <div className="overflow-x-auto">
                <table className="ui-table w-full text-sm text-left">
                  <thead className="bg-[var(--color-primary-soft)] text-[var(--color-primary)] text-xs font-semibold">
                    <tr>
                      <th className="py-3 px-6">Tên sản phẩm</th>
                      <th className="py-3 px-4 text-center">Số lượng</th>
                      <th className="py-3 px-4 text-right">Đơn giá</th>
                      <th className="py-3 px-4 text-right">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedInvoice.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-3.5 px-6">
                          <p className="font-medium text-slate-800">{item.product_name}</p>
                          <p className="text-xs text-slate-400">Đơn vị: {item.unit}</p>
                        </td>
                        <td className="py-3.5 px-4 text-center font-semibold text-slate-700">{item.quantity}</td>
                        <td className="py-3.5 px-4 text-right text-slate-500 text-xs">{formatVND(item.unit_price)}</td>
                        <td className="py-3.5 px-4 text-right font-bold text-slate-800">{formatVND(item.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50/50">
                      <td colSpan={3} className="py-3 px-6 text-sm text-slate-500">
                        Tổng số lượng
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-800">{totalQty}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>

          {/* Cột phụ: thông tin thanh toán */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
              <h2 className="font-bold text-slate-800">Thông tin thanh toán</h2>

              <div>
                <p className="text-xs text-slate-400 mb-1">Phương thức thanh toán</p>
                <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                  <PaymentIcon method={selectedInvoice.payment_method} />
                  {paymentLabel(selectedInvoice.payment_method)}
                </div>
              </div>

              <div>
                <p className="text-xs text-slate-400 mb-1">Trạng thái</p>
                <div className={`flex items-center gap-1.5 font-bold ${isPaid ? 'text-[var(--color-success)]' : 'text-[var(--color-primary)]'}`}>
                  {isPaid
                    ? <CheckCircle2 className="w-4 h-4" />
                    : <AlertCircle className="w-4 h-4" />
                  }
                  {isPaid ? 'Đã thanh toán' : 'Chưa thanh toán'}
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <p className="text-xs text-slate-400 mb-1">Tiền hàng</p>
                <p className="font-semibold text-slate-700">{formatVND(selectedInvoice.total_amount)}</p>
              </div>

              {/* Tổng tiền nổi bật */}
              <div className="bg-[var(--color-primary-soft)] border border-[var(--border)] rounded-xl p-4">
                <p className="text-xs text-slate-500 mb-1">Tổng tiền</p>
                <p className="text-2xl font-black text-slate-900">{formatVND(selectedInvoice.total_amount)}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {/* Chữ số tiền bằng chữ - đơn giản */}
                  {selectedInvoice.total_amount.toLocaleString('vi-VN')} đồng
                </p>
              </div>

              {/* Hành động */}
              <div className="space-y-2 pt-2">
                <button
                  onClick={() => window.print()}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-sm"
                >
                  <Printer className="w-4 h-4" />
                  In hóa đơn
                </button>

                {!isPaid && (
                  <button
                    onClick={() => setSettleInvoice(selectedInvoice)}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-semibold rounded-xl text-sm"
                  >
                    <Edit2 className="w-4 h-4" />
                    Sửa
                  </button>
                )}

                {isOwner && (
                  <button
                    onClick={() => setDeleteInvoiceId(selectedInvoice.id)}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-white border border-[var(--border)] hover:bg-primary-soft text-primary font-semibold rounded-xl text-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                    Xóa hóa đơn
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <InvoiceSettlementModal
          invoice={settleInvoice}
          isPending={settleMutation.isPending}
          onClose={() => setSettleInvoice(null)}
          onSubmit={(method, amountReceived) => settleMutation.mutate({
            id: settleInvoice!.id,
            method,
            amountReceived,
          })}
        />

        {/* Confirm xóa */}
        <ConfirmModal
          isOpen={!!deleteInvoiceId}
          onClose={() => setDeleteInvoiceId(null)}
          onConfirm={() => {
            if (deleteInvoiceId) {
              deleteMutation.mutate(deleteInvoiceId);
              handleBackToList();
            }
          }}
          title="Xác nhận xóa hóa đơn?"
          message="Hóa đơn sẽ bị xóa. Số lượng tồn kho của các mặt hàng trong hóa đơn sẽ được hoàn trả lại vào kho tự động."
          confirmText="Xóa hóa đơn"
          cancelText="Giữ lại"
          type="danger"
          isLoading={deleteMutation.isPending}
        />
      </div>
    );
  }

  // ─── MÀN HÌNH DANH SÁCH HÓA ĐƠN ─────────────────────────────────────────────
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-primary)]">Danh sách hóa đơn</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Tra cứu hóa đơn, trạng thái thanh toán và thông tin ghi nợ.
        </p>
      </div>

      {/* Tìm kiếm + Thẻ nợ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Tìm kiếm hóa đơn */}
        <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-[var(--color-primary)] mb-3">Tìm kiếm hóa đơn</h2>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { setSearch(searchInput); setPage(1); } }}
                placeholder="Nhập mã hóa đơn..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>
            <button
              onClick={() => { setSearch(searchInput); setPage(1); }}
              className="px-5 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-sm font-medium rounded-lg shadow-sm"
            >
              Tìm kiếm
            </button>
          </div>
        </div>

        {/* Thẻ hóa đơn nợ */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-primary">Hóa đơn nợ</h2>
            <p className="text-4xl font-bold text-slate-800 mt-2">{debtCount}</p>
          </div>
          <FileText className="w-8 h-8 text-primary" />
        </div>
      </div>

      {isLoading && <LoadingSpinner message="Đang tải danh sách hóa đơn..." />}
      {isError && (
        <ErrorState title="Không tải được hóa đơn" message={(error as Error)?.message} onRetry={refetch} />
      )}

      {!isLoading && !isError && (
        <>
          {invoices.length === 0 ? (
            <EmptyState
              title="Không tìm thấy hóa đơn nào"
              description="Chưa có hóa đơn nào phù hợp với bộ lọc tìm kiếm."
            />
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-semibold text-slate-800">Hóa đơn bán hàng</h2>
                <span className="text-xs text-slate-500">Mới nhất trước</span>
              </div>
              <div className="overflow-x-auto">
                <table className="ui-table w-full text-sm text-left">
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
                    {paged.map((inv) => {
                      const isPaid = inv.status === 'paid';
                      return (
                        <tr key={inv.id} className="hover:bg-slate-50/60">
                          <td className="py-3.5 px-4">
                            <button
                              onClick={() => handleViewDetail(inv)}
                              className="font-semibold text-[var(--color-primary)] hover:underline font-mono"
                            >
                              {inv.code}
                            </button>
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`text-xs font-semibold ${
                                isPaid ? 'text-[var(--color-success)]' : 'text-[var(--color-primary)]'
                              }`}
                            >
                              {isPaid ? 'Đã thanh toán' : 'Chưa thanh toán'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-700">
                            {inv.customer_name || 'Khách lẻ'}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                              <PaymentIcon method={inv.payment_method} />
                              {paymentLabel(inv.payment_method)}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right font-semibold text-slate-800">
                            {formatVND(inv.total_amount)}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleViewDetail(inv)}
                                className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"
                              >
                                <Eye className="w-3.5 h-3.5" /> Xem
                              </button>
                              {isOwner && (
                                <button
                                  onClick={() => setDeleteInvoiceId(inv.id)}
                                  className="inline-flex items-center gap-1 text-xs text-danger hover:underline"
                                >
                                  <Trash2 className="w-3.5 h-3.5" /> Xóa
                                </button>
                              )}
                              {!isPaid && (
                                <button
                                  onClick={() => { setSettleInvoice(inv); }}
                                  className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"
                                >
                                  <Edit2 className="w-3.5 h-3.5" /> Sửa
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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
                        page === pg ? 'bg-[var(--color-primary)] text-white' : 'hover:bg-slate-200 text-slate-600'
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
        </>
      )}

      {mode === 'list' && (
        <InvoiceSettlementModal
          invoice={settleInvoice}
          isPending={settleMutation.isPending}
          onClose={() => setSettleInvoice(null)}
          onSubmit={(method, amountReceived) => {
            if (settleInvoice) settleMutation.mutate({ id: settleInvoice.id, method, amountReceived });
          }}
        />
      )}

      {/* Confirm xóa */}
      <ConfirmModal
        isOpen={!!deleteInvoiceId}
        onClose={() => setDeleteInvoiceId(null)}
        onConfirm={() => deleteInvoiceId && deleteMutation.mutate(deleteInvoiceId)}
        title="Xác nhận xóa hóa đơn?"
        message="Hóa đơn sẽ bị xóa. Số lượng tồn kho của các mặt hàng trong hóa đơn sẽ được hoàn trả lại vào kho tự động. Bạn chắc chắn chứ?"
        confirmText="Xóa hóa đơn"
        cancelText="Giữ lại"
        type="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
};
