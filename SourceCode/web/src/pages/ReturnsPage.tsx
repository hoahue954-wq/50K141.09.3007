import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Invoice, Product, ReturnSlip } from '../types';
import { formatVND, formatDateTime, formatDate } from '../utils/format';
import {
  Search,
  Plus,
  Edit2,
  ArrowLeft,
  ArrowRight,
  Check,
  Calendar,
  CheckCircle,
  Clock,
  X,
  Lock,
  FileText,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { EvidenceImageUpload } from '../components/common/EvidenceImageUpload';

type PageMode = 'list' | 'step1' | 'step2' | 'detail' | 'edit';

interface EditItemRow {
  product_barcode: string;
  product_name: string;
  bought_quantity: number;
  available_quantity: number;
  quantity: number;
  old_quantity: number;
  type: 'return' | 'exchange';
  exchange_quantity?: number;
  exchange_barcode?: string;
  exchange_name?: string;
  stock_quantity: number;
  reason: string;
}

interface SlipHistoryItem {
  id: string;
  time: string;
  author: string;
  description: string;
}

export const ReturnsPage: React.FC = () => {
  const [mode, setMode] = useState<PageMode>('list');
  const [selectedSlip, setSelectedSlip] = useState<ReturnSlip | null>(null);

  // Filter state for list
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'recorded' | 'edited'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  // Create Flow State
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [returnItems, setReturnItems] = useState<
    { barcode: string; name: string; unit: string; boughtQty: number; returnQty: number; price: number }[]
  >([]);
  const [exchangeType, setExchangeType] = useState<'return' | 'exchange'>('return');
  const [exchangeItems, setExchangeItems] = useState<
    { barcode: string; name: string; unit: string; qty: number; price: number }[]
  >([]);
  const [reason, setReason] = useState('Khách muốn đổi quy cách sản phẩm, hàng còn nguyên bao bì.');
  const [proofImageUrl, setProofImageUrl] = useState('');
  const [proofFileName, setProofFileName] = useState('');
  const [exchangeSearch, setExchangeSearch] = useState('');
  const [showExchangeDrop, setShowExchangeDrop] = useState(false);

  // Edit Flow State (Figma Sửa phiếu đổi trả)
  const [editRows, setEditRows] = useState<EditItemRow[]>([]);
  const [editHistories, setEditHistories] = useState<Record<string, SlipHistoryItem[]>>({});
  const [slipStatuses, setSlipStatuses] = useState<Record<string, 'recorded' | 'edited'>>({});
  const [editErrorMessage, setEditErrorMessage] = useState('');
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);
  const [isLoadingSlip, setIsLoadingSlip] = useState(false);

  // Modals for Edit Flow
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);

  const { isOwner, user } = useAuth();
  const { showSuccess, showError } = useToast();
  const queryClient = useQueryClient();

  const {
    data: returnSlips = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['return-slips'],
    queryFn: () => api.returnSlips.list(),
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api.invoices.list(),
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.products.list(),
  });

  const purchasedQuantity = (invoice: Invoice, barcode: string) =>
    invoice.items
      .filter((item) => item.product_barcode === barcode)
      .reduce((sum, item) => sum + item.quantity, 0);

  const previouslyReturnedQuantity = (slipId: string, invoiceCode: string, barcode: string) =>
    returnSlips
      .filter((slip) =>
        slip.id !== slipId &&
        slip.original_invoice_code === invoiceCode &&
        slip.status !== 'rejected'
      )
      .flatMap((slip) => slip.items)
      .filter((item) => item.product_barcode === barcode)
      .reduce((sum, item) => sum + item.quantity, 0);

  const availableExchangeStock = (slip: ReturnSlip, barcode: string) => {
    const stock = products.find((product) => product.barcode === barcode)?.stock_quantity ?? 0;
    const alreadyApplied = slip.status === 'approved'
      ? slip.exchange_items
          ?.filter((item) => item.product_barcode === barcode)
          .reduce((sum, item) => sum + item.quantity, 0) ?? 0
      : 0;
    return stock + alreadyApplied;
  };

  // Start Create Flow
  const handleStartCreate = () => {
    setProofImageUrl('');
    setProofFileName('');
    setSelectedInvoice(invoices[0] || null);
    if (invoices[0]) {
      setupReturnItems(invoices[0]);
    }
    setMode('step1');
  };

  const setupReturnItems = (inv: Invoice) => {
    setReturnItems(
      inv.items.map((it) => ({
        barcode: it.product_barcode,
        name: it.product_name,
        unit: it.unit || 'cái',
        boughtQty: it.quantity,
        returnQty: 1,
        price: it.unit_price,
      }))
    );
    setExchangeItems([]);
    setExchangeType('return');
  };

  const handleSelectInvoiceInStep1 = (inv: Invoice) => {
    setSelectedInvoice(inv);
    setupReturnItems(inv);
  };

  const handleAddExchangeProduct = (prod: Product) => {
    const existing = exchangeItems.find((e) => e.barcode === prod.barcode);
    if (existing) {
      setExchangeItems((prev) =>
        prev.map((e) => (e.barcode === prod.barcode ? { ...e, qty: e.qty + 1 } : e))
      );
    } else {
      setExchangeItems((prev) => [
        ...prev,
        {
          barcode: prod.barcode,
          name: prod.name,
          unit: prod.unit,
          qty: 1,
          price: prod.selling_price,
        },
      ]);
    }
    setExchangeSearch('');
    setShowExchangeDrop(false);
  };

  // Calculations for Step 2
  const totalReturnMoney = returnItems.reduce((s, it) => s + it.returnQty * it.price, 0);
  const totalExchangeMoney = exchangeItems.reduce((s, it) => s + it.qty * it.price, 0);
  const difference = totalReturnMoney - totalExchangeMoney;

  // Create Mutation
  const createMutation = useMutation({
    mutationFn: () => {
      if (!selectedInvoice) throw new Error('Chưa chọn hóa đơn gốc.');
      if (returnItems.length === 0) throw new Error('Chưa chọn sản phẩm trả lại.');
      if (!reason.trim()) throw new Error('Vui lòng nhập lý do đổi/trả hàng.');
      if (!proofImageUrl) throw new Error('Vui lòng chọn ảnh minh chứng.');

      return api.returnSlips.create({
        original_invoice_code: selectedInvoice.code,
        type: exchangeType,
        reason: reason.trim(),
        proof_image_url: proofImageUrl,
        items: returnItems.map((r) => ({
          product_barcode: r.barcode,
          product_name: r.name,
          quantity: r.returnQty,
          selling_price: r.price,
          total_amount: r.returnQty * r.price,
        })),
        exchange_items:
          exchangeType === 'exchange'
            ? exchangeItems.map((e) => ({
                product_barcode: e.barcode,
                product_name: e.name,
                quantity: e.qty,
                selling_price: e.price,
                total_amount: e.qty * e.price,
              }))
            : undefined,
      });
    },
    onSuccess: (slip) => {
      showSuccess(`Đã tạo phiếu đổi/trả ${slip.code} thành công!`);
      queryClient.invalidateQueries({ queryKey: ['return-slips'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setSelectedSlip(slip);
      setMode('detail');
    },
    onError: (err: any) => showError(err.message),
  });

  const handleViewSlip = async (slip: ReturnSlip) => {
    setSelectedSlip(slip);
    setMode('detail');
    setIsLoadingSlip(true);
    try {
      setSelectedInvoice(await api.invoices.getByCode(slip.original_invoice_code));
    } catch (error) {
      setSelectedInvoice(null);
      showError((error as Error).message);
    } finally {
      setIsLoadingSlip(false);
    }
  };

  const handleStartEdit = async (slip: ReturnSlip) => {
    setSelectedSlip(slip);
    setMode('edit');
    setIsLoadingEdit(true);
    try {
      const invoice = selectedInvoice && selectedInvoice.code === slip.original_invoice_code
        ? selectedInvoice
        : await api.invoices.getByCode(slip.original_invoice_code);
      if (!invoice) {
        throw new Error(`Không tìm thấy hóa đơn gốc ${slip.original_invoice_code}`);
      }
      setSelectedInvoice(invoice);
      setEditRows(slip.items.map((item, index) => {
        const exchangeItem = slip.exchange_items?.[index];
        const bought = purchasedQuantity(invoice, item.product_barcode);
        const previouslyReturned = previouslyReturnedQuantity(
          slip.id,
          slip.original_invoice_code,
          item.product_barcode,
        );
        return {
          product_barcode: item.product_barcode,
          product_name: item.product_name,
          bought_quantity: bought,
          available_quantity: Math.max(0, bought - previouslyReturned),
          quantity: item.quantity,
          old_quantity: item.quantity,
          type: exchangeItem ? 'exchange' : 'return',
          exchange_quantity: exchangeItem?.quantity,
          exchange_barcode: exchangeItem?.product_barcode,
          exchange_name: exchangeItem?.product_name,
          stock_quantity: exchangeItem
            ? availableExchangeStock(slip, exchangeItem.product_barcode)
            : 0,
          reason: slip.reason || '',
        };
      }));
    } catch (error) {
      setMode('detail');
      showError((error as Error).message);
    } finally {
      setIsLoadingEdit(false);
    }
  };

  // Validation kiểm tra lỗi dòng sửa
  const getRowError = (row: EditItemRow): string | null => {
    if (row.quantity <= 0) return 'Số lượng phải lớn hơn 0';
    if (row.quantity > row.available_quantity) return 'Số lượng trả vượt quá số lượng còn được phép trả';
    if (row.type === 'exchange' && !row.exchange_barcode) return 'Vui lòng chọn sản phẩm đổi';
    const exchangeQuantity = row.quantity === row.old_quantity
      ? row.exchange_quantity ?? row.quantity
      : row.quantity;
    if (row.type === 'exchange' && exchangeQuantity > row.stock_quantity) {
      return 'Sản phẩm đổi không đủ tồn kho';
    }
    return null;
  };

  const hasAnyEditError = editRows.some((r) => getRowError(r) !== null);

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!selectedSlip) throw new Error('Chưa chọn phiếu đổi/trả cần sửa.');
      const reason = editRows[0]?.reason.trim();
      if (!reason) throw new Error('Vui lòng nhập lý do đổi/trả.');
      const hasExchange = editRows.some((row) => row.type === 'exchange');
      return api.returnSlips.update(selectedSlip.id, {
        type: hasExchange ? 'exchange' : 'return',
        reason,
        items: editRows.map((row) => ({
          product_barcode: row.product_barcode,
          quantity: row.quantity,
        })),
        exchange_items: hasExchange
          ? editRows.flatMap((row) =>
              row.type === 'exchange' && row.exchange_barcode
              ? [{
                  product_barcode: row.exchange_barcode,
                  quantity: row.quantity === row.old_quantity
                    ? row.exchange_quantity ?? row.quantity
                    : row.quantity,
                }]
                : [],
            )
          : undefined,
      });
    },
    onSuccess: (slip) => {
      const history: SlipHistoryItem = {
        id: `h-${Date.now()}`,
        time: formatDateTime(new Date().toISOString()),
        author: user?.full_name || slip.creator_name,
        description: `Sửa phiếu đổi trả · ${slip.items.length} sản phẩm, tổng số lượng ${slip.items.reduce((sum, item) => sum + item.quantity, 0)}`,
      };
      setSelectedSlip(slip);
      setSlipStatuses((previous) => ({ ...previous, [slip.id]: 'edited' }));
      setEditHistories((previous) => ({
        ...previous,
        [slip.id]: [history, ...(previous[slip.id] || [{
          id: `created-${slip.id}`,
          time: formatDateTime(slip.slip_date),
          author: slip.creator_name,
          description: `Tạo phiếu đổi/trả · ${slip.items.length} sản phẩm`,
        }])],
      }));
      queryClient.invalidateQueries({ queryKey: ['return-slips'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setIsConfirmModalOpen(false);
      setIsSuccessModalOpen(true);
    },
    onError: (error) => {
      setEditErrorMessage(error.message);
      setIsErrorModalOpen(true);
      showError(error.message);
    },
  });

  const handleConfirmSaveEdit = () => {
    if (!selectedSlip) return;
    setIsConfirmModalOpen(false);
    updateMutation.mutate();
  };

  // Thống kê 3 thẻ Figma
  const totalSlipsCount = returnSlips.length;
  const exchangeSlipsCount = returnSlips.filter((s) => s.type === 'exchange').length;
  const returnSlipsCount = returnSlips.filter((s) => s.type === 'return').length;

  // Lọc danh sách
  const filteredSlips = returnSlips.filter((s) => {
    const matchSearch =
      !search ||
      s.code.toLowerCase().includes(search.toLowerCase()) ||
      s.original_invoice_code.toLowerCase().includes(search.toLowerCase()) ||
      s.creator_name.toLowerCase().includes(search.toLowerCase());
    const matchDate = !dateFilter || formatDate(s.slip_date) === dateFilter;
    const status = slipStatuses[s.id] ||
      (s.status === 'approved' || s.status === 'pending' ? 'recorded' : 'edited');
    const matchStatus = statusFilter === 'all' || status === statusFilter;
    return matchSearch && matchDate && matchStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filteredSlips.length / pageSize));
  const paginatedSlips = filteredSlips.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // --------------------------------------------------------------------------
  // BƯỚC 1: CHỌN HÓA ĐƠN GỐC (Figma: Tạo phiếu · Chọn hóa đơn gốc)
  // --------------------------------------------------------------------------
  if (mode === 'step1') {
    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
        <div>
          <button
            onClick={() => setMode('list')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--color-primary)] text-white font-medium rounded-lg text-sm shadow-sm mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Về danh sách phiếu
          </button>
          <h1 className="text-2xl font-bold text-[var(--color-primary)]">Chọn hóa đơn gốc</h1>
        </div>

        {/* Stepper header */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-center gap-8 text-xs font-semibold">
          <div className="flex items-center gap-2 text-[var(--color-primary)]">
            <span className="w-6 h-6 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center">
              1
            </span>
            <span>Chọn hóa đơn</span>
          </div>
          <span className="w-12 h-px bg-slate-200" />
          <div className="flex items-center gap-2 text-slate-400">
            <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center">
              2
            </span>
            <span>Thông tin đổi/trả</span>
          </div>
          <span className="w-12 h-px bg-slate-200" />
          <div className="flex items-center gap-2 text-slate-400">
            <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center">
              3
            </span>
            <span>Hoàn tất</span>
          </div>
        </div>

        {/* 2 Cột */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* CỘT TRÁI (8 CỘT): DANH SÁCH HÓA ĐƠN BÁN GẦN ĐÂY */}
          <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800">Hóa đơn bán gần đây</h2>
              <span className="text-xs text-slate-400">{invoices.length} hóa đơn</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase">
                  <tr>
                    <th className="py-2.5 px-3">Mã / Ngày giờ</th>
                    <th className="py-2.5 px-3 text-right">Tổng cộng</th>
                    <th className="py-2.5 px-3 text-center">Trạng thái</th>
                    <th className="py-2.5 px-3 text-right">Điều kiện đổi/trả</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.slice(0, 10).map((inv) => {
                    const isSelected = selectedInvoice?.id === inv.id;
                    return (
                      <tr
                        key={inv.id}
                        onClick={() => handleSelectInvoiceInStep1(inv)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-primary-soft' : 'hover:bg-slate-50/60'
                        }`}
                      >
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="invoice-select"
                              checked={isSelected}
                              onChange={() => handleSelectInvoiceInStep1(inv)}
                              className="text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                            />
                            <div>
                              <p className="font-mono font-bold text-slate-900">{inv.code}</p>
                              <p className="text-[11px] text-slate-400">{formatDateTime(inv.created_at)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-slate-900">
                          {formatVND(inv.total_amount)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary-soft text-primary">
                            Đã hoàn tất
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <p className="font-semibold text-[var(--color-primary)] text-[11px]">Còn 18 giờ 45 phút</p>
                          <p className="text-[10px] text-slate-400">Đủ điều kiện</p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* CỘT PHẢI (4 CỘT): HÓA ĐƠN ĐÃ CHỌN */}
          <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Hóa đơn đã chọn
            </h3>

            {selectedInvoice ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <p className="font-mono font-bold text-base text-[var(--color-primary)]">
                      {selectedInvoice.code}
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatDateTime(selectedInvoice.created_at)}
                    </p>
                  </div>
                  <CheckCircle className="w-5 h-5 text-primary" />
                </div>

                <div className="text-xs space-y-1">
                  <span className="text-slate-400 uppercase text-[10px] block">Khách hàng</span>
                  <p className="font-bold text-slate-800">
                    {selectedInvoice.customer_name || 'Khách lẻ'}
                  </p>
                </div>

                <div className="text-xs space-y-2 pt-2 border-t border-slate-100">
                  <span className="text-slate-400 uppercase text-[10px] block">
                    Sản phẩm trong hóa đơn
                  </span>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {selectedInvoice.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between">
                        <div>
                          <p className="font-medium text-slate-800">{it.product_name}</p>
                          <p className="text-[10px] text-slate-400">
                            {it.quantity} × {formatVND(it.unit_price)}
                          </p>
                        </div>
                        <span className="font-semibold text-slate-800">
                          {formatVND(it.total_amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                  <span className="text-xs font-semibold text-slate-600">Tổng cộng:</span>
                  <span className="text-lg font-bold text-[var(--color-primary)]">
                    {formatVND(selectedInvoice.total_amount)}
                  </span>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setMode('list')}
                    className="flex-1 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-lg text-xs"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('step2')}
                    className="flex-1 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    Tiếp tục
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">Vui lòng chọn một hóa đơn từ bảng bên trái.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // BƯỚC 2: THÔNG TIN ĐỔI / TRẢ (Figma: Tạo phiếu · Chỉ trả hàng / Đổi hàng)
  // --------------------------------------------------------------------------
  if (mode === 'step2' && selectedInvoice) {
    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
        <div>
          <button
            onClick={() => setMode('step1')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-lg text-sm shadow-2xs mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Về chọn hóa đơn
          </button>
          <h1 className="text-2xl font-bold text-[var(--color-primary)]">Tạo phiếu đổi / trả hàng</h1>
        </div>

        {/* Card tóm tắt hóa đơn gốc */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-base text-[var(--color-primary)]">
                {selectedInvoice.code}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary-soft text-primary">
                Đã hoàn tất
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Khách: {selectedInvoice.customer_name || 'Khách lẻ'} · Mua lúc: {formatDateTime(selectedInvoice.created_at)}
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-400 block">Tổng tiền hóa đơn</span>
            <span className="text-xl font-black text-slate-900">
              {formatVND(selectedInvoice.total_amount)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* CỘT TRÁI (8 CỘT): DANH SÁCH HÀNG TRẢ & HÀNG ĐỔI */}
          <div className="lg:col-span-8 space-y-6">
            {/* Mục Hàng trả */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800">Hàng trả</h3>
                <span className="text-xs text-slate-400">Bỏ sản phẩm không cần trả bằng dấu ×</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Sản phẩm</th>
                      <th className="py-2.5 px-2 text-center">Đã mua</th>
                      <th className="py-2.5 px-2 text-center">SL trả</th>
                      <th className="py-2.5 px-3 text-right">Đơn giá</th>
                      <th className="py-2.5 px-3 text-right">Thành tiền</th>
                      <th className="py-2.5 px-1"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {returnItems.map((item, idx) => (
                      <tr key={item.barcode}>
                        <td className="py-3 px-3">
                          <p className="font-semibold text-slate-800">{item.name}</p>
                          <p className="text-[11px] text-slate-400 font-mono">{item.barcode}</p>
                        </td>
                        <td className="py-3 px-2 text-center text-slate-500">{item.boughtQty}</td>
                        <td className="py-3 px-2 text-center">
                          <input
                            type="number"
                            min="1"
                            max={item.boughtQty}
                            value={item.returnQty}
                            onChange={(e) => {
                              const val = Math.min(item.boughtQty, Math.max(1, Number(e.target.value) || 1));
                              setReturnItems((prev) =>
                                prev.map((it, i) => (i === idx ? { ...it, returnQty: val } : it))
                              );
                            }}
                            className="w-12 text-center border border-slate-200 rounded px-1 py-0.5 text-xs font-bold"
                          />
                        </td>
                        <td className="py-3 px-3 text-right text-slate-600">{formatVND(item.price)}</td>
                        <td className="py-3 px-3 text-right font-bold text-slate-900">
                          {formatVND(item.returnQty * item.price)}
                        </td>
                        <td className="py-3 px-1 text-center">
                          <button
                            type="button"
                            onClick={() => setReturnItems((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-slate-400 hover:text-primary"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mục Hàng đổi (tùy chọn) */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800">Hàng đổi (tùy chọn)</h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setExchangeType('return')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                      exchangeType === 'return'
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Chỉ trả hàng
                  </button>
                  <button
                    type="button"
                    onClick={() => setExchangeType('exchange')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                      exchangeType === 'exchange'
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Đổi hàng
                  </button>
                </div>
              </div>

              {exchangeType === 'exchange' && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={exchangeSearch}
                      onChange={(e) => {
                        setExchangeSearch(e.target.value);
                        setShowExchangeDrop(e.target.value.length > 0);
                      }}
                      onFocus={() => setShowExchangeDrop(exchangeSearch.length > 0)}
                      placeholder="Tìm thêm sản phẩm theo mã hoặc tên..."
                      className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-[var(--color-primary)]"
                    />

                    {showExchangeDrop && (
                      <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto mt-1">
                        {products
                          .filter(
                            (p) =>
                              p.name.toLowerCase().includes(exchangeSearch.toLowerCase()) ||
                              p.barcode.includes(exchangeSearch)
                          )
                          .map((p) => (
                            <button
                              key={p.barcode}
                              type="button"
                              onClick={() => handleAddExchangeProduct(p)}
                              className="w-full text-left px-3 py-2 hover:bg-primary-soft text-xs flex justify-between items-center"
                            >
                              <span>{p.name}</span>
                              <span className="font-semibold text-slate-600">{formatVND(p.selling_price)}</span>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>

                  {exchangeItems.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 uppercase">
                          <tr>
                            <th className="py-2 px-3">Sản phẩm</th>
                            <th className="py-2 px-2 text-center">SL đổi</th>
                            <th className="py-2 px-3 text-right">Đơn giá</th>
                            <th className="py-2 px-3 text-right">Thành tiền</th>
                            <th className="py-2 px-1"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {exchangeItems.map((item, idx) => (
                            <tr key={item.barcode}>
                              <td className="py-2.5 px-3">
                                <p className="font-semibold text-slate-800">{item.name}</p>
                                <p className="text-[11px] text-slate-400 font-mono">{item.barcode}</p>
                              </td>
                              <td className="py-2.5 px-2 text-center">
                                <input
                                  type="number"
                                  min="1"
                                  value={item.qty}
                                  onChange={(e) => {
                                    const val = Math.max(1, Number(e.target.value) || 1);
                                    setExchangeItems((prev) =>
                                      prev.map((it, i) => (i === idx ? { ...it, qty: val } : it))
                                    );
                                  }}
                                  className="w-12 text-center border border-slate-200 rounded px-1 py-0.5 text-xs font-bold"
                                />
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-600">{formatVND(item.price)}</td>
                              <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                                {formatVND(item.qty * item.price)}
                              </td>
                              <td className="py-2.5 px-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => setExchangeItems((prev) => prev.filter((_, i) => i !== idx))}
                                  className="text-slate-400 hover:text-primary"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 text-center py-4">
                      Chưa có sản phẩm đổi. Hãy tìm kiếm ở trên để thêm.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* CỘT PHẢI (4 CỘT): LÝ DO & ĐỐI CHIẾU THANH TOÁN */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-800">Lý do & minh chứng</h3>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Lý do đổi/trả *
                </label>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-[var(--color-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Minh chứng *
                </label>
                <EvidenceImageUpload
                  value={proofImageUrl}
                  fileName={proofFileName}
                  onChange={(value, fileName) => {
                    setProofImageUrl(value);
                    setProofFileName(fileName);
                  }}
                  onRemove={() => {
                    setProofImageUrl('');
                    setProofFileName('');
                  }}
                  ariaLabel="Chọn ảnh minh chứng đổi trả"
                />
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-800">Đối chiếu thanh toán</h3>

              <div className="text-xs space-y-2 pb-3 border-b border-slate-100">
                <div className="flex justify-between">
                  <span className="text-slate-500">Hóa đơn gốc:</span>
                  <span className="font-semibold text-slate-800">{formatVND(selectedInvoice.total_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Tiền hàng trả:</span>
                  <span className="font-semibold text-slate-800">{formatVND(totalReturnMoney)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Tiền hàng đổi:</span>
                  <span className="font-semibold text-slate-800">{formatVND(totalExchangeMoney)}</span>
                </div>
              </div>

              {/* Hộp vàng đặc trưng Figma */}
              <div className="bg-[var(--color-primary-soft)] rounded-xl border border-[var(--border)] p-4 text-center space-y-1">
                <span className="text-xs font-medium text-slate-700 block">
                  {difference >= 0 ? 'Cần trả khách' : 'Thu thêm từ khách'}
                </span>
                <span className="text-2xl font-black text-slate-900 block">
                  {formatVND(Math.abs(difference))}
                </span>
                <span className="text-[10px] text-slate-500 block">
                  Tiền hàng trả − Tiền hàng đổi
                </span>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMode('step1')}
                  className="flex-1 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-lg text-xs"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => createMutation.mutate()}
                  disabled={createMutation.isPending}
                  className="flex-1 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1 shadow-sm"
                >
                  <Check className="w-4 h-4" />
                  Đổi/trả hàng
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // MÀN HÌNH SỬA PHIẾU ĐỔI TRẢ (Figma: Sửa phiếu đổi trả hàng)
  // --------------------------------------------------------------------------
  if (mode === 'edit' && isLoadingEdit) {
    return <LoadingSpinner message="Đang tải dữ liệu hóa đơn gốc..." />;
  }

  if (mode === 'edit' && selectedSlip) {
    const slipStatus = slipStatuses[selectedSlip.id] || 'recorded';
    const totalQty = editRows.reduce((sum, r) => sum + r.quantity, 0);

    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-primary)]">Sửa phiếu đổi trả hàng</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Cập nhật sản phẩm, số lượng và lý do đổi trả; thông tin gốc được giữ nguyên.
          </p>
        </div>

        {/* Card 1: Thông tin tóm tắt phiếu (chỉ đọc) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">Phiếu đổi trả {selectedSlip.code}</h2>
            <span
              className={`px-3 py-1 text-xs font-semibold rounded-full border ${
                slipStatus === 'edited'
                  ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary)] border-primary-soft'
                  : 'bg-[var(--color-primary-soft)] text-[var(--color-primary)] border-[var(--border)]'
              }`}
            >
              {slipStatus === 'edited' ? 'Đã chỉnh sửa' : 'Đã ghi nhận'}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <p className="text-slate-500 flex items-center gap-1">
                <span>Mã phiếu đổi trả</span>
                <Lock className="w-3 h-3 text-slate-400" />
              </p>
              <p className="font-bold text-slate-900 mt-1 font-mono text-sm">{selectedSlip.code}</p>
            </div>
            <div>
              <p className="text-slate-500 flex items-center gap-1">
                <span>Hóa đơn gốc</span>
                <Lock className="w-3 h-3 text-slate-400" />
              </p>
              <p className="font-bold text-[var(--color-primary)] mt-1 font-mono text-sm">
                {selectedSlip.original_invoice_code}
              </p>
            </div>
            <div>
              <p className="text-slate-500 flex items-center gap-1">
                <span>Ngày lập phiếu</span>
                <Lock className="w-3 h-3 text-slate-400" />
              </p>
              <p className="font-semibold text-slate-800 mt-1">
                {formatDateTime(selectedSlip.slip_date)}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Người lập phiếu</p>
              <p className="font-semibold text-slate-800 mt-1">{selectedSlip.creator_name}</p>
            </div>
          </div>
        </div>

        {/* Card 2: Danh sách sản phẩm đổi trả (bảng có thể sửa) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-800 text-sm">Danh sách sản phẩm</h2>
            <span className="text-xs text-slate-500 font-medium">
              {editRows.length} sản phẩm · Tổng số lượng: {totalQty}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--surface-muted)] text-slate-500 font-semibold border-y border-slate-100">
                <tr>
                  <th className="py-3 px-3">Sản phẩm gốc</th>
                  <th className="py-3 px-2 text-center">Đã mua</th>
                  <th className="py-3 px-3 text-center">SL đổi/trả</th>
                  <th className="py-3 px-3">Hình thức</th>
                  <th className="py-3 px-3">Sản phẩm đổi cho khách</th>
                  <th className="py-3 px-2 text-center">Tồn khả dụng</th>
                  <th className="py-3 px-3">Lý do</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {editRows.map((row, idx) => {
                  const errorMsg = getRowError(row);
                  const invoiceProducts = selectedInvoice?.items.filter((item, index, allItems) =>
                    allItems.findIndex((candidate) =>
                      candidate.product_barcode === item.product_barcode
                    ) === index
                  ) || [];
                  return (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      {/* Sản phẩm gốc */}
                      <td className="py-3 px-3">
                        <select
                          value={row.product_barcode}
                          onChange={(e) => {
                            const invoiceItem = selectedInvoice?.items.find(
                              (item) => item.product_barcode === e.target.value
                            );
                            if (invoiceItem && selectedInvoice && selectedSlip) {
                              const bought = purchasedQuantity(selectedInvoice, invoiceItem.product_barcode);
                              const previouslyReturned = previouslyReturnedQuantity(
                                selectedSlip.id,
                                selectedSlip.original_invoice_code,
                                invoiceItem.product_barcode,
                              );
                              setEditRows((prev) =>
                                prev.map((r, i) =>
                                  i === idx
                                    ? {
                                        ...r,
                                        product_barcode: invoiceItem.product_barcode,
                                        product_name: invoiceItem.product_name,
                                        bought_quantity: bought,
                                        available_quantity: Math.max(0, bought - previouslyReturned),
                                      }
                                    : r
                                )
                              );
                            }
                          }}
                          className="w-48 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 font-medium"
                        >
                          {invoiceProducts.map((item) => (
                            <option key={item.product_barcode} value={item.product_barcode}>
                              {item.product_name}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Đã mua */}
                      <td className="py-3 px-2 text-center font-semibold text-slate-700">
                        {row.bought_quantity}
                      </td>

                      {/* SL đổi/trả */}
                      <td className="py-3 px-3">
                        <div className="flex flex-col items-center">
                          <input
                            type="number"
                            value={row.quantity}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setEditRows((prev) =>
                                prev.map((r, i) => (i === idx ? { ...r, quantity: val } : r))
                              );
                            }}
                            className={`w-16 px-2 py-1.5 text-center text-xs font-bold rounded-lg border ${
                              errorMsg
                                ? 'border-[var(--border)] bg-primary-soft text-primary'
                                : 'border-slate-200 bg-white text-slate-800'
                            }`}
                          />
                          {errorMsg && (
                            <p className="text-[10px] text-primary mt-1 font-medium whitespace-nowrap text-center">
                              {errorMsg}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Hình thức */}
                      <td className="py-3 px-3">
                        <select
                          value={row.type}
                          onChange={(e) => {
                            const val = e.target.value as 'return' | 'exchange';
                            setEditRows((prev) =>
                              prev.map((r, i) => (i === idx ? { ...r, type: val } : r))
                            );
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-800"
                        >
                          <option value="exchange">Đổi hàng</option>
                          <option value="return">Trả hàng</option>
                        </select>
                      </td>

                      {/* Sản phẩm đổi cho khách */}
                      <td className="py-3 px-3">
                        {row.type === 'exchange' ? (
                          <select
                            value={row.exchange_barcode || ''}
                            onChange={(e) => {
                              const p = products.find((prod) => prod.barcode === e.target.value);
                              if (p) {
                                setEditRows((prev) =>
                                  prev.map((r, i) =>
                                    i === idx
                                      ? {
                                          ...r,
                                          exchange_barcode: p.barcode,
                                          exchange_name: p.name,
                                            stock_quantity: selectedSlip
                                              ? availableExchangeStock(selectedSlip, p.barcode)
                                              : p.stock_quantity,
                                        }
                                      : r
                                  )
                                );
                              }
                            }}
                            className="w-52 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-800"
                          >
                            <option value="">Chọn sản phẩm đổi</option>
                            {products.map((p) => (
                              <option key={p.barcode} value={p.barcode}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Tồn khả dụng */}
                      <td className="py-3 px-2 text-center font-bold text-primary">
                        {row.type === 'exchange' ? row.stock_quantity : '—'}
                      </td>

                      {/* Lý do */}
                      <td className="py-3 px-3">
                        <input
                          type="text"
                          value={row.reason}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditRows((prev) =>
                              prev.map((r) => ({ ...r, reason: val }))
                            );
                          }}
                          className="w-44 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700"
                          placeholder="Lý do đổi trả"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-slate-400 pt-2">
            Số lượng đổi/trả không vượt quá số lượng đã mua. Sản phẩm đổi cho khách không vượt tồn kho khả dụng.
          </p>
        </div>

        {/* Thông báo điều chỉnh tồn kho */}
        <div className="flex items-start gap-2 p-3 bg-primary-soft rounded-xl border border-primary-soft text-xs text-primary">
          <span className="font-bold">ⓘ</span>
          <span>
            Chỉ điều chỉnh tồn kho theo chênh lệch trước và sau khi sửa; mọi thay đổi đều được ghi nhận trong lịch sử.
          </span>
        </div>

        {/* Card 3: Lịch sử chỉnh sửa */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
          <h2 className="font-bold text-slate-800 text-sm">Lịch sử chỉnh sửa</h2>
          <div className="space-y-2">
            {(editHistories[selectedSlip.id] || []).map((h) => (
              <div
                key={h.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between text-xs py-1.5 border-b border-slate-100 last:border-0"
              >
                <div className="flex items-center gap-4">
                  <span className="font-mono text-slate-500">{h.time}</span>
                  <span className="font-semibold text-slate-800">{h.author}</span>
                </div>
                <span className="text-slate-600 mt-0.5 sm:mt-0">{h.description}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Action bar dưới cùng */}
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-slate-400">
            Mã phiếu, hóa đơn gốc và ngày lập không thể thay đổi.
          </p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMode('detail')}
              className="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-lg text-sm shadow-2xs"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={hasAnyEditError || updateMutation.isPending}
              onClick={() => setIsConfirmModalOpen(true)}
              className="px-5 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium rounded-lg text-sm shadow-sm disabled:opacity-40 flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              Lưu thay đổi
            </button>
          </div>
        </div>

        {/* MODAL 1: XÁC NHẬN LƯU THAY ĐỔI (Figma: Xác nhận lưu thay đổi phiếu đổi trả) */}
        {isConfirmModalOpen && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-xl animate-in fade-in duration-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Kiểm tra và xác nhận lưu thay đổi</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Kiểm tra nội dung điều chỉnh của phiếu đổi trả {selectedSlip.code} trước khi xác nhận.
                </p>
              </div>

              {/* Tóm tắt thông tin */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl text-xs">
                <div>
                  <span className="text-slate-400 block">Mã phiếu đổi trả</span>
                  <span className="font-bold text-slate-800 font-mono">{selectedSlip.code}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Hóa đơn gốc</span>
                  <span className="font-bold text-[var(--color-primary)] font-mono">{selectedSlip.original_invoice_code}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Ngày lập phiếu</span>
                  <span className="font-medium text-slate-700">{formatDateTime(selectedSlip.slip_date)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Người lập phiếu</span>
                  <span className="font-medium text-slate-700">{selectedSlip.creator_name}</span>
                </div>
              </div>

              {/* Bảng so sánh SL trước -> sau */}
              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--surface-muted)] text-slate-500 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Sản phẩm gốc</th>
                      <th className="py-2.5 px-2 text-center">Đã mua</th>
                      <th className="py-2.5 px-3 text-center">SL trước → sau</th>
                      <th className="py-2.5 px-3">Sản phẩm đổi tương ứng</th>
                      <th className="py-2.5 px-2 text-center">Tồn trước lưu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {editRows.map((r, i) => (
                      <tr key={i}>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">{r.product_name}</td>
                        <td className="py-2.5 px-2 text-center text-slate-500">{r.bought_quantity}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="font-bold text-[var(--color-primary)]">
                            {r.old_quantity} → {r.quantity}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">{r.exchange_name || '—'}</td>
                        <td className="py-2.5 px-2 text-center font-bold text-primary">
                          {r.stock_quantity}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Callout thông báo điều chỉnh chênh lệch */}
              <div className="p-3 bg-primary-soft rounded-xl border border-primary-soft text-xs text-primary space-y-1">
                <p className="font-bold">Chỉ điều chỉnh chênh lệch khi lưu thành công</p>
                <p className="text-[11px] text-primary">
                  {editRows.map((r) => {
                    const diff = r.quantity - r.old_quantity;
                    if (diff === 0) return `${r.product_name}: không đổi`;
                    return `${r.product_name}: ${diff > 0 ? `+${diff}` : diff} vào tồn kho`;
                  }).join('; ')}
                </p>
              </div>

              {/* Thông tin ghi nhận lịch sử */}
              <div className="text-xs text-slate-500 space-y-0.5">
                <p className="font-bold text-slate-700">Ghi nhận lịch sử chỉnh sửa</p>
                <p>Người chỉnh sửa: {user?.full_name || 'Thảo Nguyễn'} · Thời gian chỉnh sửa: thời điểm lưu thành công.</p>
                <p>Mã phiếu, hóa đơn gốc, ngày lập và người lập được giữ nguyên.</p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsConfirmModalOpen(false)}
                  className="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-lg text-sm"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSaveEdit}
                  disabled={updateMutation.isPending}
                  className="px-6 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium rounded-lg text-sm shadow-sm"
                >
                  {updateMutation.isPending ? 'Đang lưu...' : 'Xác nhận'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 2: THÔNG BÁO THÀNH CÔNG (Figma: Lưu thay đổi thành công) */}
        {isSuccessModalOpen && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-sm w-full p-6 text-center space-y-5 shadow-xl animate-in zoom-in-95 duration-150">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-800">Thông báo thành công</h3>
                <button
                  onClick={() => {
                    setIsSuccessModalOpen(false);
                    setMode('detail');
                  }}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="w-20 h-20 rounded-full border-2 border-[var(--border)] bg-primary-soft flex items-center justify-center mx-auto">
                <Check className="w-10 h-10 text-primary" />
              </div>

              <p className="text-sm font-bold text-slate-800">Sửa phiếu đổi trả hàng thành công</p>

              <button
                type="button"
                onClick={() => {
                  setIsSuccessModalOpen(false);
                  setMode('detail');
                }}
                className="w-full py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium rounded-lg text-sm shadow-sm"
              >
                Đóng
              </button>
            </div>
          </div>
        )}

        {/* MODAL 3: THÔNG BÁO LỖI (Figma: Lưu thay đổi thất bại) */}
        {isErrorModalOpen && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-sm w-full p-6 text-center space-y-5 shadow-xl animate-in zoom-in-95 duration-150">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-800">Thông báo lỗi</h3>
                <button
                  onClick={() => setIsErrorModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="w-20 h-20 rounded-full border-2 border-danger bg-primary-soft flex items-center justify-center mx-auto">
                <X className="w-10 h-10 text-primary" />
              </div>

              <p className="text-sm font-bold text-slate-800">Không thể lưu thay đổi</p>
              <p className="text-xs text-slate-600">{editErrorMessage}</p>

              <button
                type="button"
                onClick={() => setIsErrorModalOpen(false)}
                className="w-full py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium rounded-lg text-sm shadow-sm"
              >
                Thử lại
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // MÀN HÌNH CHI TIẾT PHIẾU ĐỔI TRẢ (Figma: Chi tiết phiếu đổi trả hàng)
  // --------------------------------------------------------------------------
  if (mode === 'detail' && isLoadingSlip) {
    return <LoadingSpinner message="Đang tải thông tin hóa đơn gốc..." />;
  }

  if (mode === 'detail' && selectedSlip) {
    const slipStatus = slipStatuses[selectedSlip.id] || 'recorded';
    const totalQty = selectedSlip.items.reduce((s, it) => s + it.quantity, 0) +
      (selectedSlip.exchange_items?.reduce((s, it) => s + it.quantity, 0) || 0);
    const histories = editHistories[selectedSlip.id] || [{
      id: `created-${selectedSlip.id}`,
      time: formatDateTime(selectedSlip.slip_date),
      author: selectedSlip.creator_name,
      description: `Tạo phiếu đổi/trả · ${selectedSlip.items.length} sản phẩm, tổng số lượng ${totalQty}`,
    }];

    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-primary)]">Chi tiết phiếu đổi trả hàng</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Kiểm tra thông tin đổi trả và lịch sử điều chỉnh của phiếu.
          </p>
        </div>

        {/* Card 1: Thông tin phiếu (khóa thông tin gốc) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">Phiếu đổi trả {selectedSlip.code}</h2>
            <span
              className={`px-3 py-1 text-xs font-semibold rounded-full border ${
                slipStatus === 'edited'
                  ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary)] border-primary-soft'
                  : 'bg-[var(--color-primary-soft)] text-[var(--color-primary)] border-[var(--border)]'
              }`}
            >
              {slipStatus === 'edited' ? 'Đã chỉnh sửa' : 'Đã ghi nhận'}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <p className="text-slate-500 flex items-center gap-1">
                <span>Mã phiếu đổi trả</span>
                <Lock className="w-3 h-3 text-slate-400" />
              </p>
              <p className="font-bold text-slate-900 mt-1 font-mono text-sm">{selectedSlip.code}</p>
            </div>
            <div>
              <p className="text-slate-500 flex items-center gap-1">
                <span>Hóa đơn gốc</span>
                <Lock className="w-3 h-3 text-slate-400" />
              </p>
              <p className="font-bold text-[var(--color-primary)] mt-1 font-mono text-sm">
                {selectedSlip.original_invoice_code}
              </p>
            </div>
            <div>
              <p className="text-slate-500 flex items-center gap-1">
                <span>Ngày lập phiếu</span>
                <Lock className="w-3 h-3 text-slate-400" />
              </p>
              <p className="font-semibold text-slate-800 mt-1">
                {formatDateTime(selectedSlip.slip_date)}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Người lập phiếu</p>
              <p className="font-semibold text-slate-800 mt-1">{selectedSlip.creator_name}</p>
            </div>
          </div>
        </div>

        {/* Card 2: Danh sách sản phẩm */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-800 text-sm">Danh sách sản phẩm</h2>
            <span className="text-xs text-slate-500 font-medium">
              {selectedSlip.items.length} sản phẩm · Tổng số lượng: {totalQty}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--surface-muted)] text-slate-500 font-semibold border-y border-slate-100">
                <tr>
                  <th className="py-3 px-3">Sản phẩm gốc</th>
                  <th className="py-3 px-2 text-center">Đã mua</th>
                  <th className="py-3 px-2 text-center">SL đổi/trả</th>
                  <th className="py-3 px-3">Hình thức</th>
                  <th className="py-3 px-3">Sản phẩm đổi cho khách</th>
                  <th className="py-3 px-2 text-center">Tồn khả dụng</th>
                  <th className="py-3 px-3">Lý do</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selectedSlip.items.map((it, idx) => {
                  const exItem = selectedSlip.exchange_items?.[idx];
                  return (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-3 px-3 font-semibold text-slate-800">{it.product_name}</td>
                      <td className="py-3 px-2 text-center font-medium text-slate-600">
                        {selectedInvoice
                          ? purchasedQuantity(selectedInvoice, it.product_barcode)
                          : '—'}
                      </td>
                      <td className="py-3 px-2 text-center font-bold text-slate-900">{it.quantity}</td>
                      <td className="py-3 px-3 text-slate-700">
                        {selectedSlip.type === 'exchange' ? 'Đổi hàng' : 'Trả hàng'}
                      </td>
                      <td className="py-3 px-3 text-slate-700">
                        {exItem?.product_name || '—'}
                      </td>
                      <td className="py-3 px-2 text-center font-bold text-primary">
                        {exItem ? availableExchangeStock(selectedSlip, exItem.product_barcode) : '—'}
                      </td>
                      <td className="py-3 px-3 text-slate-600">{selectedSlip.reason || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-slate-400 pt-2">
            Số lượng đổi/trả không vượt quá số lượng đã mua. Sản phẩm đổi cho khách không vượt tồn kho khả dụng.
          </p>
        </div>

        {/* Thông báo điều chỉnh tồn kho */}
        <div className="flex items-start gap-2 p-3 bg-primary-soft rounded-xl border border-primary-soft text-xs text-primary">
          <span className="font-bold">ⓘ</span>
          <span>
            Chỉ điều chỉnh tồn kho theo chênh lệch trước và sau khi sửa; mọi thay đổi đều được ghi nhận trong lịch sử.
          </span>
        </div>

        {/* Card 3: Lịch sử chỉnh sửa */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
          <h2 className="font-bold text-slate-800 text-sm">Lịch sử chỉnh sửa</h2>
          <div className="space-y-2">
            {histories.map((h) => (
              <div
                key={h.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between text-xs py-1.5 border-b border-slate-100 last:border-0"
              >
                <div className="flex items-center gap-4">
                  <span className="font-mono text-slate-500">{h.time}</span>
                  <span className="font-semibold text-slate-800">{h.author}</span>
                </div>
                <span className="text-slate-600 mt-0.5 sm:mt-0">{h.description}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Action bar dưới cùng */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={() => setMode('list')}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-lg text-sm shadow-2xs"
          >
            <ArrowLeft className="w-4 h-4" /> Về danh sách
          </button>

          <p className="text-xs text-slate-400">Chỉ chủ cửa hàng được chỉnh sửa phiếu.</p>

          {isOwner && (
            <button
              type="button"
              onClick={() => handleStartEdit(selectedSlip)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium rounded-lg text-sm shadow-sm transition-colors"
            >
              <Edit2 className="w-4 h-4" />
              Sửa phiếu
            </button>
          )}
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // MÀN HÌNH DANH SÁCH PHIẾU ĐỔI / TRẢ (Figma: Danh sách phiếu đổi trả hàng)
  // --------------------------------------------------------------------------
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-primary)]">Phiếu đổi / trả hàng</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Tra cứu và theo dõi các phiếu đổi, trả hàng của khách hàng.
          </p>
        </div>

        <button
          onClick={handleStartCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium rounded-lg text-sm shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Tạo phiếu đổi/trả hàng
        </button>
      </div>

      {/* 3 Thẻ thống kê chỉ hiển thị trong màn hình chủ cửa hàng */}
      {isOwner && <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Thẻ 1: Tổng phiếu đổi trả */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary-soft text-[var(--color-primary)] flex items-center justify-center shrink-0">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Tổng phiếu đổi trả</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">{totalSlipsCount}</p>
          </div>
        </div>

        {/* Thẻ 2: Phiếu đổi hàng */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary-soft text-primary flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Phiếu đổi hàng</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">{exchangeSlipsCount}</p>
          </div>
        </div>

        {/* Thẻ 3: Phiếu trả hàng */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary-soft text-primary flex items-center justify-center shrink-0">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Phiếu trả hàng</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">{returnSlipsCount}</p>
          </div>
        </div>
      </div>}

      {/* Filter Box Figma */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Tìm theo mã phiếu đổi trả..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
          />
        </div>

        <div className="relative w-full md:w-56">
          <input
            type="text"
            value={dateFilter}
            onChange={(e) => {
              setDateFilter(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Ngày lập phiếu"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)] text-slate-700"
          />
          <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as any);
            setCurrentPage(1);
          }}
          className="w-full md:w-52 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)] text-slate-700 bg-white"
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="recorded">Đã ghi nhận</option>
          <option value="edited">Đã chỉnh sửa</option>
        </select>
      </div>

      {isLoading && <LoadingSpinner message="Đang tải danh sách phiếu đổi/trả..." />}
      {isError && (
        <ErrorState
          title="Không tải được phiếu đổi/trả"
          message={(error as Error)?.message}
          onRetry={refetch}
        />
      )}

      {!isLoading && !isError && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {paginatedSlips.length === 0 ? (
            <EmptyState
              title="Không có phiếu đổi/trả nào"
              description="Chưa có phiếu đổi/trả nào phù hợp với bộ lọc."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="ui-table w-full text-left text-sm">
                <thead className="bg-[var(--color-primary-soft)] text-slate-500 text-xs font-semibold border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-4">Mã phiếu đổi trả</th>
                    <th className="py-3 px-4">Hóa đơn gốc</th>
                    <th className="py-3 px-4">Ngày lập</th>
                    {isOwner && <th className="py-3 px-4">Người lập phiếu</th>}
                    {isOwner && <th className="py-3 px-4">Hình thức</th>}
                    {isOwner && <th className="py-3 px-4 text-right">Chênh lệch</th>}
                    {!isOwner && <th className="py-3 px-4 text-center">Số sản phẩm</th>}
                    <th className="py-3 px-4 text-center">Trạng thái</th>
                    <th className="py-3 px-4 text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedSlips.map((s) => {
                    const status = slipStatuses[s.id] || (s.status === 'approved' ? 'recorded' : 'edited');
                    const isEdited = status === 'edited';
                    const itemsCount = s.items.length + (s.exchange_items?.length || 0);

                    return (
                      <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3.5 px-4">
                          <button
                            onClick={() => handleViewSlip(s)}
                            className="font-mono font-bold text-[var(--color-primary)] hover:underline"
                          >
                            {s.code}
                          </button>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-700">
                          {s.original_invoice_code}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 text-xs">
                          {formatDateTime(s.slip_date)}
                        </td>
                        {isOwner && <td className="py-3.5 px-4 text-slate-700 font-medium">{s.creator_name}</td>}
                        {isOwner && (
                          <td className="py-3.5 px-4 text-slate-700">
                            {s.type === 'return' ? 'Trả hàng' : 'Đổi hàng'}
                          </td>
                        )}
                        {isOwner && (
                          <td className="py-3.5 px-4 text-right font-medium text-slate-800">
                            {formatVND(s.difference_amount ?? s.total_refund)}
                          </td>
                        )}
                        {!isOwner && (
                          <td className="py-3.5 px-4 text-center font-semibold text-slate-800">
                            {itemsCount}
                          </td>
                        )}
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              isEdited
                                ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary)]'
                                : 'bg-[color-mix(in_srgb,var(--color-success)_10%,white)] text-[var(--color-success)]'
                            }`}
                          >
                            {isEdited ? 'Đã chỉnh sửa' : 'Đã ghi nhận'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={() => handleViewSlip(s)}
                            className="text-[var(--color-primary)] hover:underline text-xs font-medium"
                          >
                            {isOwner ? 'Xem' : 'Xem chi tiết'}
                          </button>
                          {isOwner && (
                            <button
                              onClick={() => handleStartEdit(s)}
                              className="ml-3 text-slate-500 hover:text-[var(--color-primary)] text-xs font-medium"
                            >
                              Sửa
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Phân trang chuẩn Figma: Hiển thị 1–8 trong 36 phiếu đổi trả  8 dòng / trang  < 1 2 3 ... 5 > */}
          <div className="px-5 py-3.5 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-white text-xs text-slate-500">
            <span>
              Hiển thị {filteredSlips.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredSlips.length)} trong {filteredSlips.length} phiếu đổi trả
            </span>

            <div className="flex items-center gap-4">
              <span className="text-slate-500">8 dòng / trang</span>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 text-slate-400"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
                  <button
                    key={pg}
                    onClick={() => setCurrentPage(pg)}
                    className={`w-6 h-6 rounded text-xs font-medium ${
                      currentPage === pg
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {pg}
                  </button>
                ))}

                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 text-slate-400"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
