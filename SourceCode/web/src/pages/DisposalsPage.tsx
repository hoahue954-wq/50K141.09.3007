import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { DisposalSlip, Product } from '../types';
import { formatVND, formatDateTime, formatDate } from '../utils/format';
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  Check,
  Eye,
  Paperclip,
  ArrowLeft,
  Barcode,
  Minus,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { EvidenceImageUpload } from '../components/common/EvidenceImageUpload';

type PageMode = 'list' | 'create' | 'edit' | 'detail';

interface CreateItemRow {
  product: Product;
  quantity: number;
  reason: string;
  proof_file_name: string;
  proof_image_url: string;
}

export const DisposalsPage: React.FC = () => {
  const [mode, setMode] = useState<PageMode>('list');
  const [selectedSlip, setSelectedSlip] = useState<DisposalSlip | null>(null);
  const [approveSlipId, setApproveSlipId] = useState<string | null>(null);
  const [rejectSlipId, setRejectSlipId] = useState<string | null>(null);
  const [deleteSlipId, setDeleteSlipId] = useState<string | null>(null);

  // Filter & Search
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved'>('all');

  // Form state
  const [createSearch, setCreateSearch] = useState('');
  const [showSearchDrop, setShowSearchDrop] = useState(false);
  const [createItems, setCreateItems] = useState<CreateItemRow[]>([]);
  const [formError, setFormError] = useState('');

  const { isOwner, isStaff, user } = useAuth();
  const { showSuccess, showError } = useToast();
  const queryClient = useQueryClient();

  const {
    data: slips = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['disposal-slips'],
    queryFn: () => api.disposalSlips.list(),
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.products.list(),
  });

  // Mutations
  const approveMutation = useMutation({
    mutationFn: (id: string) => api.disposalSlips.approve(id),
    onSuccess: (slip) => {
      showSuccess(`Đã duyệt phiếu hủy ${slip.code}, kho hàng đã được trừ tự động!`);
      setApproveSlipId(null);
      setSelectedSlip(slip);
      queryClient.invalidateQueries({ queryKey: ['disposal-slips'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stats'] });
    },
    onError: (err: any) => showError(err.message),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.disposalSlips.reject(id),
    onSuccess: (slip) => {
      showSuccess(`Đã từ chối phiếu hủy ${slip.code}!`);
      setRejectSlipId(null);
      setSelectedSlip(slip);
      queryClient.invalidateQueries({ queryKey: ['disposal-slips'] });
    },
    onError: (err: any) => showError(err.message),
  });

  const createMutation = useMutation({
    mutationFn: (asPending: boolean) => {
      setFormError('');
      if (createItems.length === 0) {
        throw new Error('Vui lòng thêm ít nhất một sản phẩm cần hủy.');
      }
      for (const item of createItems) {
        if (item.quantity > item.product.stock_quantity) {
          throw new Error(
            `Số lượng hủy "${item.product.name}" vượt quá tồn kho (${item.product.stock_quantity} ${item.product.unit}).`
          );
        }
        if (!item.reason.trim()) {
          throw new Error(`Vui lòng nhập lý do hủy cho "${item.product.name}".`);
        }
      }
      if (!createItems.some((item) => item.proof_image_url)) {
        throw new Error('Vui lòng đính kèm ít nhất một ảnh minh chứng cho phiếu hủy.');
      }

      // Tổng hợp lý do và ảnh minh chứng
      const reasons = createItems.map((i) => i.reason).join('; ');
      const proofUrl = createItems.find((item) => item.proof_image_url)?.proof_image_url;

      return api.disposalSlips.create({
        reason: reasons,
        proof_image_url: proofUrl || undefined,
        items: createItems.map((i) => ({
          product_barcode: i.product.barcode,
          product_name: i.product.name,
          unit: i.product.unit,
          quantity: i.quantity,
          cost_price: i.product.cost_price || 0,
        })),
      });
    },
    onSuccess: (slip) => {
      showSuccess(`Đã tạo phiếu hủy ${slip.code} thành công!`);
      queryClient.invalidateQueries({ queryKey: ['disposal-slips'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setSelectedSlip(slip);
      setMode('detail');
    },
    onError: (err: any) => {
      setFormError(err.message);
      showError(err.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!selectedSlip) throw new Error('Không tìm thấy phiếu hủy cần sửa.');
      if (createItems.length === 0) throw new Error('Phiếu cần ít nhất một sản phẩm.');
      for (const item of createItems) {
        if (item.quantity > item.product.stock_quantity) {
          throw new Error(
            `Số lượng hủy "${item.product.name}" vượt quá tồn kho (${item.product.stock_quantity} ${item.product.unit}).`
          );
        }
        if (!item.reason.trim()) {
          throw new Error(`Vui lòng nhập lý do hủy cho "${item.product.name}".`);
        }
        if (item.quantity <= 0) {
          throw new Error(`Số lượng hủy của "${item.product.name}" phải lớn hơn 0.`);
        }
      }
      if (!createItems.some((item) => item.proof_image_url)) {
        throw new Error('Vui lòng đính kèm ít nhất một ảnh minh chứng cho phiếu hủy.');
      }

      return api.disposalSlips.update(selectedSlip.id, {
        reason: createItems.map((item) => item.reason.trim()).join('; '),
        proof_image_url: createItems.find((item) => item.proof_image_url)?.proof_image_url,
        items: createItems.map((item) => ({
          product_barcode: item.product.barcode,
          product_name: item.product.name,
          unit: item.product.unit,
          quantity: item.quantity,
        })),
      });
    },
    onSuccess: (slip) => {
      showSuccess(`Đã cập nhật phiếu hủy ${slip.code} thành công!`);
      queryClient.invalidateQueries({ queryKey: ['disposal-slips'] });
      setSelectedSlip(slip);
      setMode('detail');
    },
    onError: (err: any) => {
      setFormError(err.message);
      showError(err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.disposalSlips.delete(id),
    onSuccess: () => {
      showSuccess('Đã xóa phiếu hủy thành công!');
      setDeleteSlipId(null);
      queryClient.invalidateQueries({ queryKey: ['disposal-slips'] });
    },
    onError: (err: any) => showError(err.message),
  });

  const handleOpenEdit = (slip: DisposalSlip) => {
    const reasons = slip.reason.split(';').map((reason) => reason.trim());
    setSelectedSlip(slip);
    setCreateItems(
      slip.items.map((item, index) => ({
        product: products.find((product) => product.barcode === item.product_barcode) || {
          barcode: item.product_barcode,
          name: item.product_name,
          unit: item.unit,
          category_id: '',
          selling_price: 0,
          stock_quantity: 0,
          min_stock: 0,
        },
        quantity: item.quantity,
        reason: reasons[index] || slip.reason,
        proof_file_name: index === 0 && slip.proof_image_url ? 'Minh chứng hiện có' : '',
        proof_image_url: index === 0 ? slip.proof_image_url || '' : '',
      }))
    );
    setFormError('');
    setMode('edit');
  };

  const handleAddProductToCreate = (prod: Product) => {
    const existing = createItems.find((i) => i.product.barcode === prod.barcode);
    if ((existing?.quantity || 0) >= prod.stock_quantity) {
      showError(
        prod.stock_quantity <= 0
          ? `"${prod.name}" đã hết hàng.`
          : `Tồn kho "${prod.name}" chỉ còn ${prod.stock_quantity} ${prod.unit}.`
      );
      return;
    }
    if (existing) {
      setCreateItems((prev) =>
        prev.map((i) =>
          i.product.barcode === prod.barcode ? { ...i, quantity: i.quantity + 1 } : i
        )
      );
    } else {
      setCreateItems((prev) => [
        ...prev,
        {
          product: prod,
          quantity: 1,
          reason: 'Hết hạn sử dụng',
          proof_file_name: '',
          proof_image_url: '',
        },
      ]);
    }
    setCreateSearch('');
    setShowSearchDrop(false);
  };

  const totalCreateValue = createItems.reduce(
    (s, i) => s + (i.product.cost_price || 0) * i.quantity,
    0
  );

  const pendingCount = slips.filter((s) => s.status === 'pending').length;
  const approvedCount = slips.filter((s) => s.status === 'approved').length;

  const filteredSlips = slips.filter((s) => {
    const matchSearch =
      s.code.toLowerCase().includes(search.toLowerCase()) ||
      s.creator_name.toLowerCase().includes(search.toLowerCase()) ||
      s.reason.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // --------------------------------------------------------------------------
  // MÀN HÌNH TẠO PHIẾU HỦY (Figma UC 9.1)
  // --------------------------------------------------------------------------
  if (mode === 'create' || mode === 'edit') {
    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-primary)]">
            {mode === 'edit' ? 'Sửa phiếu hủy' : 'Tạo phiếu hủy'}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {mode === 'edit'
              ? 'Cập nhật thông tin phiếu hủy đang chờ xử lý.'
              : 'Chọn sản phẩm, nhập lý do và đính kèm ảnh minh chứng theo yêu cầu.'}
          </p>
        </div>

        {/* Thanh tìm kiếm thêm sản phẩm */}
        <div className="relative flex gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={createSearch}
              onChange={(e) => {
                setCreateSearch(e.target.value);
                setShowSearchDrop(e.target.value.length > 0);
              }}
              onFocus={() => setShowSearchDrop(createSearch.length > 0)}
              placeholder="Tên sản phẩm"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)] bg-white shadow-2xs"
            />
            {showSearchDrop && (
              <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg z-20 max-h-56 overflow-y-auto mt-1">
                {products
                  .filter(
                    (p) =>
                      p.name.toLowerCase().includes(createSearch.toLowerCase()) ||
                      p.barcode.includes(createSearch)
                  )
                  .map((p) => (
                    <button
                      key={p.barcode}
                      type="button"
                      onClick={() => handleAddProductToCreate(p)}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-primary-soft text-sm flex items-center justify-between"
                    >
                      <div>
                        <span className="font-medium text-slate-800">{p.name}</span>
                        <span className="text-xs text-slate-400 ml-2">({p.barcode})</span>
                      </div>
                      <span className="text-xs font-semibold text-slate-600">
                        Tồn: {p.stock_quantity} {p.unit}
                      </span>
                    </button>
                  ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className="w-11 h-11 bg-[var(--color-primary)] text-white rounded-lg flex items-center justify-center hover:bg-[var(--color-primary-hover)]"
            title="Quét mã vạch"
          >
            <Barcode className="w-5 h-5" />
          </button>
        </div>

        {/* Bố cục 2 cột theo Figma UC 9.1 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* CỘT TRÁI (8 CỘT): DANH SÁCH SẢN PHẨM HỦY */}
          <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
            <h2 className="text-base font-bold text-slate-800">Sản phẩm hủy</h2>

            {createItems.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
                Chưa có sản phẩm nào trong phiếu. Hãy tìm kiếm sản phẩm ở trên để thêm vào phiếu hủy.
              </div>
            ) : (
              <div className="space-y-6">
                {createItems.map((item, idx) => {
                  const cost = item.product.cost_price || 0;
                  const itemTotal = cost * item.quantity;
                  return (
                    <div
                      key={item.product.barcode}
                      className="border-b border-slate-100 pb-5 space-y-3 last:border-b-0"
                    >
                      {/* Bảng tóm tắt thông tin */}
                      <div className={`grid ${isOwner ? 'grid-cols-6' : 'grid-cols-5'} gap-2 text-xs`}>
                        <div className="col-span-2">
                          <p className="font-bold text-slate-900 text-sm">{item.product.name}</p>
                          <p className="text-slate-400 font-mono text-[11px]">{item.product.barcode}</p>
                        </div>
                        <div className="text-center">
                          <span className="text-slate-400 block text-[10px] uppercase">ĐVT</span>
                          <span className="font-medium text-slate-700">{item.product.unit}</span>
                        </div>
                        <div className="text-center">
                          <span className="text-slate-400 block text-[10px] uppercase">Tồn trước</span>
                          <span className="font-semibold text-slate-700">{item.product.stock_quantity}</span>
                        </div>
                        <div className="text-center">
                          <span className="text-slate-400 block text-[10px] uppercase">SL hủy</span>
                          <div className="flex items-center justify-center gap-1.5 mt-0.5">
                            <button
                              type="button"
                              onClick={() => {
                                if (item.quantity > 1) {
                                  setCreateItems((prev) =>
                                    prev.map((it, i) =>
                                      i === idx ? { ...it, quantity: it.quantity - 1 } : it
                                    )
                                  );
                                } else {
                                  setCreateItems((prev) => prev.filter((_, i) => i !== idx));
                                }
                              }}
                              className="w-5 h-5 rounded border border-slate-200 flex items-center justify-center hover:bg-slate-100"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="font-bold text-slate-900">{item.quantity}</span>
                            <button
                              type="button"
                              disabled={item.quantity >= item.product.stock_quantity}
                              onClick={() => {
                                setCreateItems((prev) =>
                                  prev.map((it, i) =>
                                    i === idx ? { ...it, quantity: it.quantity + 1 } : it
                                  )
                                );
                              }}
                              className="w-5 h-5 rounded border border-slate-200 flex items-center justify-center hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        {isOwner && (
                          <div className="text-right">
                            <span className="text-slate-400 block text-[10px] uppercase">Giá trị hủy</span>
                            <span className="font-bold text-slate-900 text-xs">
                              {formatVND(itemTotal)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Nhập Lý do */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Lý do *
                        </label>
                        <input
                          type="text"
                          value={item.reason}
                          onChange={(e) =>
                            setCreateItems((prev) =>
                              prev.map((it, i) =>
                                i === idx ? { ...it, reason: e.target.value } : it
                              )
                            )
                          }
                          placeholder="Nhập lý do hủy..."
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-[var(--color-primary)]"
                        />
                      </div>

                      {/* Đính kèm minh chứng */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Minh chứng (ít nhất một ảnh/phiếu)
                        </label>
                        <EvidenceImageUpload
                          value={item.proof_image_url}
                          fileName={item.proof_file_name}
                          onChange={(proof_image_url, proof_file_name) => {
                            setFormError('');
                            setCreateItems((prev) =>
                              prev.map((currentItem, itemIndex) =>
                                itemIndex === idx
                                  ? { ...currentItem, proof_file_name, proof_image_url }
                                  : currentItem
                              )
                            );
                          }}
                          onRemove={() => {
                            setCreateItems((prev) =>
                              prev.map((currentItem, itemIndex) =>
                                itemIndex === idx
                                  ? { ...currentItem, proof_file_name: '', proof_image_url: '' }
                                  : currentItem
                              )
                            );
                          }}
                          ariaLabel={`Chọn ảnh minh chứng cho ${item.product.name}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {formError && (
              <p className="text-xs text-primary font-medium">{formError}</p>
            )}
          </div>

          {/* CỘT PHẢI (4 CỘT): THÔNG TIN PHIẾU HỦY & XÁC NHẬN */}
          <div className="lg:col-span-4 space-y-4">
            {/* Thẻ Thông tin phiếu hủy */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
              <h3 className="text-sm font-bold text-[var(--color-primary)]">Thông tin phiếu hủy</h3>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800">
                  {mode === 'edit' ? selectedSlip?.code : 'Chưa cấp mã phiếu'}
                </span>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary-soft text-[var(--color-primary)]">
                  • Chưa gửi
                </span>
              </div>
              <div className="pt-2 border-t border-slate-100 text-xs text-slate-600 space-y-1">
                <p>
                  Người lập:{' '}
                  <span className="font-semibold text-slate-800">
                    {user?.full_name || 'Nhân viên'}
                  </span>
                </p>
                <p>Ngày lập: {formatDateTime(new Date().toISOString())}</p>
              </div>
            </div>

            {/* Thẻ Xác nhận */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-800">Xác nhận</h3>

              {/* Hộp màu vàng đặc trưng Figma */}
              {isOwner && <div className="bg-highlight rounded-xl border border-[var(--border)] p-4 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700">Tổng giá trị</span>
                <span className="text-xl font-black text-slate-900">
                  {formatVND(totalCreateValue)}
                </span>
              </div>}

              <div className="space-y-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMode(mode === 'edit' ? 'detail' : 'list')}
                    className="flex-1 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-lg text-xs"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={() => mode === 'edit' ? updateMutation.mutate() : createMutation.mutate(true)}
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg text-xs"
                  >
                    {mode === 'edit'
                      ? updateMutation.isPending
                        ? 'Đang lưu...'
                        : 'Lưu thay đổi'
                      : createMutation.isPending
                        ? 'Đang lưu...'
                        : 'Lưu'}
                  </button>
                </div>

                {mode === 'create' && (
                  <button
                    type="button"
                    onClick={() => createMutation.mutate(false)}
                    disabled={createMutation.isPending}
                    className="w-full py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Check className="w-4 h-4" />
                    Gửi duyệt
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // MÀN HÌNH DUYỆT / XEM CHI TIẾT PHIẾU HỦY (Figma UC 9.4)
  // --------------------------------------------------------------------------
  if (mode === 'detail' && selectedSlip) {
    const freshSlip = slips.find((s) => s.id === selectedSlip.id) || selectedSlip;
    const isPending = freshSlip.status === 'pending';
    const isApproved = freshSlip.status === 'approved';
    const totalSlipValue = freshSlip.items.reduce(
      (s, i) => s + (i.total_value || (i.cost_price || 0) * i.quantity),
      0
    );

    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-primary)]">
            {isPending && isOwner ? 'Duyệt phiếu hủy' : 'Chi tiết phiếu hủy'}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {isPending
              ? 'Kiểm tra thông tin trước khi duyệt hoặc từ chối phiếu.'
              : 'Thông tin và trạng thái xử lý phiếu hủy.'}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* CỘT TRÁI (8 CỘT): SẢN PHẨM HỦY FIGMA UC 9.4 */}
          <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
            <h2 className="text-base font-bold text-slate-800">Sản phẩm hủy</h2>

            <div className="space-y-6">
              {freshSlip.items.map((item, idx) => (
                <div
                  key={idx}
                  className="border-b border-slate-100 pb-5 space-y-3 last:border-b-0"
                >
                  <div className={`grid ${isOwner ? 'grid-cols-6' : 'grid-cols-4'} gap-2 text-xs`}>
                    <div className="col-span-2">
                      <p className="font-bold text-slate-900 text-sm">{item.product_name}</p>
                      <p className="text-slate-400 font-mono text-[11px]">{item.product_barcode}</p>
                    </div>
                    <div className="text-center">
                      <span className="text-slate-400 block text-[10px] uppercase">ĐVT</span>
                      <span className="font-medium text-slate-700">{item.unit || 'gói'}</span>
                    </div>
                    <div className="text-center">
                      <span className="text-slate-400 block text-[10px] uppercase">SL hủy</span>
                      <span className="font-bold text-slate-900">{item.quantity}</span>
                    </div>
                    {isOwner && (
                      <div className="text-right">
                        <span className="text-slate-400 block text-[10px] uppercase">Giá nhập</span>
                        <span className="font-medium text-slate-700">
                          {formatVND(item.cost_price || 0)}
                        </span>
                      </div>
                    )}
                    {isOwner && <div className="text-right">
                      <span className="text-slate-400 block text-[10px] uppercase">Giá trị hủy</span>
                      <span className="font-bold text-slate-900">
                        {formatVND(item.total_value || (item.cost_price || 0) * item.quantity)}
                      </span>
                    </div>}
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-slate-700 block mb-0.5">Lý do</span>
                    <p className="text-xs text-slate-600">{freshSlip.reason}</p>
                  </div>

                  {freshSlip.proof_image_url && (
                    <div>
                      <span className="text-xs font-semibold text-slate-700 block mb-0.5">
                        Minh chứng
                      </span>
                      {freshSlip.proof_image_url.startsWith('data:image/') ? (
                        <img
                          src={freshSlip.proof_image_url}
                          alt="Ảnh minh chứng phiếu hủy"
                          className="max-h-64 rounded-lg border border-slate-200 object-contain"
                        />
                      ) : freshSlip.proof_image_url.startsWith('http') ? (
                        <a
                          href={freshSlip.proof_image_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 text-xs font-medium text-[var(--color-primary)] hover:underline"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          Xem ảnh minh chứng
                        </a>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-slate-600">
                          <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                          <span>Minh chứng đã được đính kèm</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* CỘT PHẢI (4 CỘT): THÔNG TIN PHIẾU HỦY & XÁC NHẬN */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
              <h3 className="text-sm font-bold text-[var(--color-primary)]">Thông tin phiếu hủy</h3>
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-slate-900 text-sm">
                  {freshSlip.code}
                </span>
                <span
                  className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                    isApproved
                      ? 'bg-[color-mix(in_srgb,var(--color-success)_10%,white)] text-[var(--color-success)]'
                      : freshSlip.status === 'rejected'
                      ? 'bg-primary-soft text-primary'
                      : 'bg-primary-soft text-[var(--color-primary)]'
                  }`}
                >
                  • {isApproved ? 'Đã duyệt' : freshSlip.status === 'rejected' ? 'Từ chối' : 'Chờ duyệt'}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-100 text-xs text-slate-600 space-y-1.5">
                <p>
                  Người lập:{' '}
                  <span className="font-semibold text-slate-800">{freshSlip.creator_name}</span>
                </p>
                <p>Ngày lập: {formatDateTime(freshSlip.slip_date)}</p>
                {freshSlip.approved_by && (
                  <p className="pt-1 border-t border-slate-50">
                    Người duyệt:{' '}
                    <span className="font-semibold text-slate-800">
                      {freshSlip.approved_by}
                    </span>
                  </p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-800">Xác nhận</h3>

              {isOwner && <div className="bg-highlight rounded-xl border border-[var(--border)] p-4 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700">Tổng giá trị</span>
                <span className="text-xl font-black text-slate-900">
                  {formatVND(totalSlipValue)}
                </span>
              </div>}

              {isOwner && isPending ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setApproveSlipId(freshSlip.id)}
                    className="w-full py-2.5 bg-[var(--color-success)] hover:bg-[var(--color-success-hover)] text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Check className="w-4 h-4" />
                    Duyệt phiếu hủy
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(freshSlip)}
                      className="flex-1 py-2 bg-primary-soft hover:bg-primary-soft text-[var(--color-primary)] font-medium rounded-lg text-xs"
                    >
                      Sửa phiếu
                    </button>
                    <button
                      type="button"
                      onClick={() => setRejectSlipId(freshSlip.id)}
                      className="flex-1 py-2 bg-white border border-[var(--border)] hover:bg-primary-soft text-primary font-medium rounded-lg text-xs"
                    >
                      Từ chối
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('list')}
                      className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg text-xs"
                    >
                      Về danh sách
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {isOwner && !isApproved && (
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(freshSlip)}
                      className="w-full py-2.5 bg-primary-soft hover:bg-primary-soft text-[var(--color-primary)] font-medium rounded-lg text-xs"
                    >
                      Sửa phiếu hủy
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setMode('list')}
                    className="w-full py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium rounded-lg text-xs shadow-sm flex items-center justify-center gap-1.5"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Về danh sách
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal duyệt */}
        <ConfirmModal
          isOpen={!!approveSlipId}
          onClose={() => setApproveSlipId(null)}
          onConfirm={() => approveSlipId && approveMutation.mutate(approveSlipId)}
          title="Xác nhận duyệt phiếu hủy hàng?"
          message="Số lượng sản phẩm trong phiếu sẽ bị trừ khỏi tồn kho ngay lập tức và tính vào tổn thất kinh doanh. Bạn có chắc chắn không?"
          confirmText="Duyệt & Trừ kho"
          type="success"
          isLoading={approveMutation.isPending}
        />

        {/* Modal từ chối */}
        <ConfirmModal
          isOpen={!!rejectSlipId}
          onClose={() => setRejectSlipId(null)}
          onConfirm={() => rejectSlipId && rejectMutation.mutate(rejectSlipId)}
          title="Xác nhận từ chối phiếu hủy?"
          message="Phiếu hủy sẽ chuyển sang trạng thái Từ chối và số lượng tồn kho không bị thay đổi."
          confirmText="Từ chối phiếu"
          type="danger"
          isLoading={rejectMutation.isPending}
        />
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // MÀN HÌNH DANH SÁCH PHIẾU HỦY (Figma UC 9)
  // --------------------------------------------------------------------------
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-primary)]">Danh sách phiếu hủy</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Theo dõi, xem chi tiết và xử lý các phiếu hủy hàng.
          </p>
        </div>

        <button
          onClick={() => {
            setCreateItems([]);
            setFormError('');
            setMode('create');
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium rounded-lg text-sm shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Tạo phiếu hủy hàng
        </button>
      </div>

      {isLoading && <LoadingSpinner message="Đang tải danh sách phiếu hủy..." />}
      {isError && (
        <ErrorState
          title="Không tải được phiếu hủy"
          message={(error as Error)?.message}
          onRetry={refetch}
        />
      )}

      {!isLoading && !isError && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-5 space-y-4">
          {/* Ô tìm kiếm */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm mã phiếu"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          {/* Các tab lọc trạng thái */}
          <div className="flex gap-2">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === 'all'
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Tất cả ({slips.length})
            </button>
            <button
              onClick={() => setStatusFilter('pending')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === 'pending'
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Chờ duyệt ({pendingCount})
            </button>
            <button
              onClick={() => setStatusFilter('approved')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === 'approved'
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Đã duyệt ({approvedCount})
            </button>
          </div>

          {/* Bảng danh sách phiếu hủy theo Figma UC 9 */}
          {filteredSlips.length === 0 ? (
            <EmptyState
              title="Không có phiếu hủy nào"
              description="Chưa có phiếu hủy nào phù hợp với bộ lọc."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--color-primary-soft)] text-slate-500 text-xs">
                  <tr>
                    <th className="py-3 px-4 font-medium">Mã phiếu</th>
                    <th className="py-3 px-4 font-medium">Ngày lập</th>
                    <th className="py-3 px-4 font-medium">Người lập</th>
                    <th className="py-3 px-4 font-medium">Lý do hủy</th>
                    {isOwner && <th className="py-3 px-4 font-medium text-right">Tổng giá trị</th>}
                    <th className="py-3 px-4 font-medium text-center">Trạng thái</th>
                    <th className="py-3 px-4 font-medium text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSlips.map((s) => {
                    const isPending = s.status === 'pending';
                    const isApproved = s.status === 'approved';
                    const totalVal = s.items.reduce(
                      (sum, i) => sum + (i.total_value || (i.cost_price || 0) * i.quantity),
                      0
                    );

                    return (
                      <tr key={s.id} className="hover:bg-slate-50/60">
                        <td className="py-3.5 px-4">
                          <button
                            onClick={() => {
                              setSelectedSlip(s);
                              setMode('detail');
                            }}
                            className="font-mono font-bold text-[var(--color-primary)] hover:underline"
                          >
                            {s.code}
                          </button>
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 text-xs">
                          {formatDateTime(s.slip_date)}
                        </td>
                        <td className="py-3.5 px-4 text-slate-700">{s.creator_name}</td>
                        <td className="py-3.5 px-4 text-slate-600 max-w-xs truncate">
                          {s.reason}
                        </td>
                        {isOwner && (
                          <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                            {formatVND(totalVal)}
                          </td>
                        )}
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                              isApproved
                                ? 'bg-[color-mix(in_srgb,var(--color-success)_10%,white)] text-[var(--color-success)]'
                                : s.status === 'rejected'
                                ? 'bg-primary-soft text-primary'
                                : 'bg-primary-soft text-[var(--color-primary)]'
                            }`}
                          >
                            • {isApproved ? 'Đã duyệt' : s.status === 'rejected' ? 'Từ chối' : 'Chờ duyệt'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-2 text-xs">
                            <button
                              onClick={() => {
                                setSelectedSlip(s);
                                setMode('detail');
                              }}
                              className="inline-flex items-center gap-1 text-[var(--color-primary)] hover:underline"
                            >
                              <Eye className="w-3.5 h-3.5" /> Xem
                            </button>

                            {isOwner && isPending && (
                              <button
                                onClick={() => {
                                  setSelectedSlip(s);
                                  setMode('detail');
                                }}
                                className="inline-flex items-center gap-1 text-[var(--color-success)] hover:underline font-semibold"
                              >
                                <Check className="w-3.5 h-3.5" /> Duyệt
                              </button>
                            )}
                            {isOwner && s.status !== 'approved' && (
                              <>
                                <button
                                  onClick={() => handleOpenEdit(s)}
                                  className="inline-flex items-center gap-1 text-slate-600 hover:text-[var(--color-primary)] hover:underline"
                                >
                                  <Edit2 className="w-3.5 h-3.5" /> Sửa
                                </button>
                                <button
                                  onClick={() => setDeleteSlipId(s.id)}
                                  className="inline-flex items-center gap-1 text-danger hover:underline"
                                >
                                  <Trash2 className="w-3.5 h-3.5" /> Xóa
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <ConfirmModal
        isOpen={!!deleteSlipId}
        onClose={() => setDeleteSlipId(null)}
        onConfirm={() => deleteSlipId && deleteMutation.mutate(deleteSlipId)}
        title="Xác nhận xóa phiếu hủy?"
        message="Phiếu hủy chưa được duyệt sẽ bị xóa khỏi danh sách. Phiếu đã duyệt không thể xóa."
        confirmText="Xóa phiếu"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
};
