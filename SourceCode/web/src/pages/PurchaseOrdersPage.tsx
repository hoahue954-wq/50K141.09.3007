import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Product, PurchaseOrder } from '../types';
import { formatVND, formatDate, formatDateTime } from '../utils/format';
import {
  Search,
  Plus,
  Trash2,
  ArrowLeft,
  CheckCircle,
  Edit2,
  Lock,
  Calendar,
  Info,
  Package,
  Clock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';

type PageMode = 'list' | 'create' | 'detail' | 'edit';

// ─── Stat Card ───────────────────────────────────────────────────────────────
const StatCard: React.FC<{
  label: string;
  value: number;
  icon: React.ReactNode;
  iconBg: string;
}> = ({ label, value, icon, iconBg }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
      {icon}
    </div>
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-800 mt-0.5">{value}</p>
    </div>
  </div>
);

// ─── EditForm (Sửa phiếu nhập) ───────────────────────────────────────────────
const EditForm: React.FC<{
  po: PurchaseOrder;
  products: Product[];
  onCancel: () => void;
  onSuccess: (po: PurchaseOrder) => void;
}> = ({ po, products, onCancel, onSuccess }) => {
  const [items, setItems] = useState<
    { product_barcode: string; product_name: string; category: string; quantity: number; cost_price: number; note: string }[]
  >(
    po.items.map((i) => ({
      product_barcode: i.product_barcode,
      product_name: i.product_name,
      category: products.find((p) => p.barcode === i.product_barcode)?.category_name || '',
      quantity: i.quantity,
      cost_price: i.cost_price,
      note: '',
    }))
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [formError, setFormError] = useState('');
  const { showSuccess, showError } = useToast();
  const queryClient = useQueryClient();

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode.includes(searchQuery)
  );

  const addProduct = (prod: Product) => {
    const existing = items.find((i) => i.product_barcode === prod.barcode);
    if (existing) {
      setItems((prev) =>
        prev.map((i) =>
          i.product_barcode === prod.barcode ? { ...i, quantity: i.quantity + 1 } : i
        )
      );
    } else {
      setItems((prev) => [
        ...prev,
        {
          product_barcode: prod.barcode,
          product_name: prod.name,
          category: prod.category_name || '',
          quantity: 1,
          cost_price: prod.cost_price || 0,
          note: '',
        },
      ]);
    }
    setSearchQuery('');
    setShowSearchDropdown(false);
  };

  const updateItem = (barcode: string, field: string, value: number | string) => {
    setItems((prev) =>
      prev.map((i) => (i.product_barcode === barcode ? { ...i, [field]: value } : i))
    );
  };

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const totalAmount = items.reduce((s, i) => s + i.quantity * i.cost_price, 0);

  const updateMutation = useMutation({
    mutationFn: () => {
      if (items.length === 0) throw new Error('Phiếu cần ít nhất 1 sản phẩm.');
      const invalid = items.find((i) => i.quantity <= 0 || i.cost_price <= 0);
      if (invalid) throw new Error(`Số lượng và giá nhập phải lớn hơn 0 (${invalid.product_name}).`);
      return api.purchaseOrders.update(po.id, {
        items: items.map((i) => ({
          product_barcode: i.product_barcode,
          product_name: i.product_name,
          quantity: i.quantity,
          cost_price: i.cost_price,
        })),
      });
    },
    onSuccess: (updated) => {
      showSuccess(`Đã cập nhật phiếu nhập ${updated.code} thành công!`);
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      onSuccess(updated);
    },
    onError: (err: any) => {
      setFormError(err.message);
      showError(err.message);
    },
  });

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-primary)]">Sửa phiếu nhập hàng</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Chỉnh sửa thông tin sản phẩm trong phiếu nhập trước khi hoàn thành.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* Left: Product table */}
        <div className="order-2 space-y-4">
          {/* Search */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Tìm theo tên hoặc mã vạch sản phẩm..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSearchDropdown(e.target.value.length > 0);
                  }}
                  onFocus={() => { if (searchQuery.length > 0) setShowSearchDropdown(true); }}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                />
                {showSearchDropdown && filteredProducts.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg z-20 max-h-52 overflow-y-auto mt-1">
                    {filteredProducts.slice(0, 10).map((p) => (
                      <button
                        key={p.barcode}
                        type="button"
                        onClick={() => addProduct(p)}
                        className="w-full text-left px-3 py-2.5 hover:bg-primary-soft text-sm flex items-center justify-between gap-2"
                      >
                        <div>
                          <span className="font-medium text-slate-800">{p.name}</span>
                          <span className="text-slate-400 text-xs ml-2">{p.barcode}</span>
                        </div>
                        <span className="text-xs text-slate-500">{p.category_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="ui-table w-full text-sm text-left">
                <thead className="bg-[var(--color-primary-soft)] text-slate-500 text-xs">
                  <tr>
                    <th className="py-3 px-4 font-medium">Mã vạch</th>
                    <th className="py-3 px-4 font-medium">Tên sản phẩm</th>
                    <th className="py-3 px-4 font-medium">Danh mục</th>
                    <th className="py-3 px-4 font-medium text-center">SL nhập</th>
                    <th className="py-3 px-4 font-medium text-right">Giá nhập</th>
                    <th className="py-3 px-4 font-medium text-right">Thành tiền</th>
                    <th className="py-3 px-4 font-medium">Ghi chú</th>
                    <th className="py-3 px-4 font-medium text-center">Xóa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => (
                    <tr key={item.product_barcode} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 text-slate-500 text-xs font-mono">{item.product_barcode}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{item.product_name}</td>
                      <td className="py-3 px-4 text-slate-500 text-xs">{item.category}</td>
                      <td className="py-3 px-4 text-center">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(item.product_barcode, 'quantity', Number(e.target.value) || 1)}
                          className="w-20 text-center border border-slate-200 rounded-lg px-2 py-1 text-sm font-semibold focus:outline-none focus:border-[var(--color-primary)]"
                        />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <input
                          type="number"
                          min="0"
                          value={item.cost_price}
                          onChange={(e) => updateItem(item.product_barcode, 'cost_price', Number(e.target.value) || 0)}
                          className="w-28 text-right border border-slate-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                        />
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-700">
                        {formatVND(item.quantity * item.cost_price)}
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          value={item.note}
                          onChange={(e) => updateItem(item.product_barcode, 'note', e.target.value)}
                          placeholder="Ghi chú..."
                          className="w-36 border border-slate-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                        />
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => setItems((prev) => prev.filter((i) => i.product_barcode !== item.product_barcode))}
                          className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary-soft rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {items.length === 0 && (
                <div className="py-12 text-center text-slate-400 text-sm">
                  Chưa có sản phẩm nào. Tìm kiếm để thêm.
                </div>
              )}
            </div>

            {items.length > 0 && (
              <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                <span className="text-sm text-slate-500">
                  {items.length} sản phẩm · Tổng số lượng: {totalQty}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="contents">
          {/* Thông tin phiếu card */}
          <div className="order-1 bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Thông tin phiếu nhập</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Mã phiếu nhập</label>
                <div className="relative">
                  <input
                    type="text"
                    value={po.code}
                    readOnly
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-600 pr-8"
                  />
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Ngày nhập</label>
                <div className="relative">
                  <input
                    type="text"
                    value={formatDate(po.order_date)}
                    readOnly
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-600"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Người lập</label>
                <input
                  type="text"
                  value={po.creator_name}
                  readOnly
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-600"
                />
              </div>
            </div>
          </div>

          {/* Xác nhận yellow box */}
          <div className="order-3 bg-highlight rounded-xl px-5 py-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Tổng tiền hàng</span>
            <span className="text-2xl font-bold text-primary">{formatVND(totalAmount)}</span>
          </div>

          {formError && <p className="order-4 text-sm text-danger font-medium">{formError}</p>}

          {/* Buttons */}
          <div className="order-5 flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-lg text-sm"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium rounded-lg text-sm shadow-sm disabled:opacity-70"
            >
              <Edit2 className="w-4 h-4" />
              {updateMutation.isPending ? 'Đang lưu...' : 'Lập phiếu'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── CreateForm (Lập phiếu nhập) ─────────────────────────────────────────────
const CreateForm: React.FC<{
  products: Product[];
  user: { full_name: string };
  onCancel: () => void;
  onSuccess: (po: PurchaseOrder) => void;
}> = ({ products, user, onCancel, onSuccess }) => {
  const today = new Date().toISOString().split('T')[0];
  const [orderDate, setOrderDate] = useState(today);
  const [items, setItems] = useState<
    { product_barcode: string; product_name: string; category: string; quantity: number; cost_price: number; note: string }[]
  >([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [formError, setFormError] = useState('');
  const { showSuccess, showError, showToast } = useToast();
  const queryClient = useQueryClient();

  const [autoCode] = useState(() => `PHN${String(Date.now()).slice(-6)}`);

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode.includes(searchQuery)
  );

  const addProduct = (prod: Product) => {
    const existing = items.find((i) => i.product_barcode === prod.barcode);
    if (existing) {
      setItems((prev) =>
        prev.map((i) =>
          i.product_barcode === prod.barcode ? { ...i, quantity: i.quantity + 1 } : i
        )
      );
    } else {
      setItems((prev) => [
        ...prev,
        {
          product_barcode: prod.barcode,
          product_name: prod.name,
          category: prod.category_name || '',
          quantity: 1,
          cost_price: prod.cost_price || 0,
          note: '',
        },
      ]);
    }
    setSearchQuery('');
    setShowSearchDropdown(false);
  };

  const updateItem = (barcode: string, field: string, value: number | string) => {
    setItems((prev) =>
      prev.map((i) => (i.product_barcode === barcode ? { ...i, [field]: value } : i))
    );
  };

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const totalAmount = items.reduce((s, i) => s + i.quantity * i.cost_price, 0);

  const createMutation = useMutation({
    mutationFn: () => {
      if (items.length === 0) throw new Error('Phiếu cần ít nhất 1 sản phẩm. Số lượng và giá nhập phải lớn hơn 0.');
      const invalid = items.find((i) => i.quantity <= 0 || i.cost_price <= 0);
      if (invalid) throw new Error(`Số lượng và giá nhập phải lớn hơn 0 (${invalid.product_name}).`);
      return api.purchaseOrders.create({
        code: autoCode,
        order_date: orderDate,
        items: items.map((i) => ({
          product_barcode: i.product_barcode,
          product_name: i.product_name,
          quantity: i.quantity,
          cost_price: i.cost_price,
        })),
      });
    },
    onSuccess: (po) => {
      showSuccess(`Đã lưu phiếu nhập ${po.code} thành công!`);
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      onSuccess(po);
    },
    onError: (err: any) => {
      const isTimeoutOrNetwork =
        err?.name === 'AbortError' ||
        err?.message?.toLowerCase().includes('abort') ||
        err?.message?.toLowerCase().includes('timeout') ||
        err?.message?.toLowerCase().includes('failed to fetch') ||
        err?.message?.toLowerCase().includes('networkerror') ||
        (typeof navigator !== 'undefined' && !navigator.onLine);

      if (isTimeoutOrNetwork) {
        showToast(
          'Hệ thống đang xử lý phiếu nhập, có thể mất vài giây. Vui lòng không bấm lưu lại, hãy kiểm tra danh sách phiếu nhập sau ít phút.',
          'info'
        );
        queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
        onCancel();
      } else {
        setFormError(err.message);
        showError(err.message);
      }
    },
  });

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-primary)]">Lập phiếu nhập hàng</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Thêm sản phẩm và lưu phiếu để chủ cửa hàng kiểm tra, duyệt nhập kho.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* Left: Search + product table */}
        <div className="order-2 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Search bar */}
            <div className="p-4 border-b border-slate-100">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Tìm theo tên sản phẩm hoặc mã vạch..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSearchDropdown(e.target.value.length > 0);
                  }}
                  onFocus={() => { if (searchQuery.length > 0) setShowSearchDropdown(true); }}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                />
                {showSearchDropdown && filteredProducts.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg z-20 max-h-52 overflow-y-auto mt-1">
                    {filteredProducts.slice(0, 10).map((p) => (
                      <button
                        key={p.barcode}
                        type="button"
                        onClick={() => addProduct(p)}
                        className="w-full text-left px-3 py-2.5 hover:bg-primary-soft text-sm flex items-center justify-between gap-2"
                      >
                        <div>
                          <span className="font-medium text-slate-800">{p.name}</span>
                          <span className="text-slate-400 text-xs ml-2">{p.barcode}</span>
                        </div>
                        <span className="text-xs text-slate-500">{p.category_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="ui-table w-full text-sm text-left">
                <thead className="bg-[var(--color-primary-soft)] text-slate-500 text-xs">
                  <tr>
                    <th className="py-3 px-4 font-medium">Mã vạch</th>
                    <th className="py-3 px-4 font-medium">Tên sản phẩm</th>
                    <th className="py-3 px-4 font-medium">Danh mục</th>
                    <th className="py-3 px-4 font-medium text-center">SL nhập</th>
                    <th className="py-3 px-4 font-medium text-right">Giá nhập</th>
                    <th className="py-3 px-4 font-medium text-right">Thành tiền</th>
                    <th className="py-3 px-4 font-medium">Ghi chú</th>
                    <th className="py-3 px-4 font-medium text-center">Xóa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => (
                    <tr key={item.product_barcode} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 text-slate-500 text-xs font-mono">{item.product_barcode}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{item.product_name}</td>
                      <td className="py-3 px-4 text-slate-500 text-xs">{item.category}</td>
                      <td className="py-3 px-4 text-center">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(item.product_barcode, 'quantity', Number(e.target.value) || 1)}
                          className="w-20 text-center border border-slate-200 rounded-lg px-2 py-1 text-sm font-semibold focus:outline-none focus:border-[var(--color-primary)]"
                        />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <input
                          type="number"
                          min="0"
                          value={item.cost_price}
                          onChange={(e) => updateItem(item.product_barcode, 'cost_price', Number(e.target.value) || 0)}
                          className="w-28 text-right border border-slate-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                        />
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-700">
                        {formatVND(item.quantity * item.cost_price)}
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          value={item.note}
                          onChange={(e) => updateItem(item.product_barcode, 'note', e.target.value)}
                          placeholder="Ghi chú..."
                          className="w-36 border border-slate-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                        />
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => setItems((prev) => prev.filter((i) => i.product_barcode !== item.product_barcode))}
                          className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary-soft rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {items.length === 0 && (
                <div className="py-12 text-center text-slate-400 text-sm">
                  Chưa có sản phẩm nào. Tìm kiếm hoặc quét mã vạch để thêm.
                </div>
              )}
            </div>

            {items.length > 0 && (
              <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                <span className="text-sm text-slate-500">
                  {items.length} sản phẩm · Tổng số lượng: {totalQty}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="contents">
          {/* Thông tin phiếu card */}
          <div className="order-1 bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Thông tin phiếu nhập</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Mã phiếu nhập · Tự động</label>
                <div className="relative">
                  <input
                    type="text"
                    value={autoCode}
                    readOnly
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-600 pr-8"
                  />
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Ngày nhập</label>
                <div className="relative">
                  <input
                    type="date"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)] pr-8"
                  />
                  <Calendar className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Người lập</label>
                <input
                  type="text"
                  value={user.full_name}
                  readOnly
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-600"
                />
              </div>
            </div>
          </div>

          {/* Xác nhận yellow box */}
          <div className="order-3 bg-highlight rounded-xl px-5 py-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Tổng tiền hàng</span>
            <span className="text-2xl font-bold text-primary">{formatVND(totalAmount)}</span>
          </div>

          {formError && <p className="order-4 text-sm text-danger font-medium">{formError}</p>}

          {/* Buttons */}
          <div className="order-5 flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-lg text-sm"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={() => {
                if (!createMutation.isPending) {
                  createMutation.mutate();
                }
              }}
              disabled={createMutation.isPending}
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium rounded-lg text-sm shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <Edit2 className="w-4 h-4" />
              {createMutation.isPending ? 'Đang lưu...' : 'Lập phiếu'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── DetailView (Chi tiết phiếu nhập) ────────────────────────────────────────
const DetailView: React.FC<{
  po: PurchaseOrder;
  isOwner: boolean;
  onBack: () => void;
  onEdit: () => void;
  onComplete: () => void;
}> = ({ po, isOwner, onBack, onEdit, onComplete }) => {
  const isCompleted = po.status === 'completed';
  const totalQty = po.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-primary)]">Chi tiết phiếu nhập hàng</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Kiểm tra hàng thực nhận trước khi hoàn thành phiếu nhập.
        </p>
      </div>

      {/* Info card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-800">Phiếu nhập {po.code}</h2>
          <span
            className={`px-3 py-1 text-xs font-semibold rounded-full border ${
              isCompleted
                ? 'bg-primary-soft text-primary border-[var(--border)]'
                : 'bg-primary-soft text-[var(--color-primary)] border-primary-soft'
            }`}
          >
            {isCompleted ? 'Đã hoàn thành' : 'Đã lưu'}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-slate-500 text-xs">Ngày nhập</p>
            <p className="font-semibold text-slate-800 mt-0.5">{formatDate(new Date(po.order_date))}</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs">Người lập</p>
            <p className="font-semibold text-slate-800 mt-0.5">{po.creator_name}</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs">Thời gian lập</p>
            <p className="font-semibold text-slate-800 mt-0.5">{formatDateTime(po.order_date)}</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs">Trạng thái kho</p>
            <p className={`font-semibold mt-0.5 ${isCompleted ? 'text-primary' : 'text-primary'}`}>
              {isCompleted ? 'Đã cập nhật tồn kho' : 'Chưa cập nhật tồn kho'}
            </p>
          </div>
        </div>
      </div>

      {/* Product table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Danh sách sản phẩm</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="ui-table w-full text-sm text-left">
            <thead className="bg-[var(--color-primary-soft)] text-slate-500 text-xs">
              <tr>
                <th className="py-3 px-4 font-medium">Mã vạch</th>
                <th className="py-3 px-4 font-medium">Tên sản phẩm</th>
                <th className="py-3 px-4 font-medium">Danh mục</th>
                <th className="py-3 px-4 font-medium text-center">Số lượng nhập</th>
                <th className="py-3 px-4 font-medium text-right">Giá nhập (đ)</th>
                <th className="py-3 px-4 font-medium text-right">Thành tiền</th>
                <th className="py-3 px-4 font-medium">Ghi chú</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {po.items.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50">
                  <td className="py-3 px-4 text-slate-500 text-xs font-mono">{item.product_barcode}</td>
                  <td className="py-3 px-4 font-semibold text-slate-800">{item.product_name}</td>
                  <td className="py-3 px-4 text-slate-500 text-xs">—</td>
                  <td className="py-3 px-4 text-center font-semibold">{item.quantity}</td>
                  <td className="py-3 px-4 text-right text-slate-600">{item.cost_price.toLocaleString('vi-VN')}</td>
                  <td className="py-3 px-4 text-right font-semibold text-slate-700">
                    {formatVND(item.quantity * item.cost_price)}
                  </td>
                  <td className="py-3 px-4 text-slate-500 text-xs">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
          <span className="text-sm text-slate-500">
            {po.items.length} sản phẩm · Tổng số lượng: {totalQty}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">Tổng tiền hàng</span>
            <span className="text-xl font-bold text-[var(--color-primary)]">{formatVND(po.total_amount)}</span>
          </div>
        </div>
      </div>

      {/* Info note */}
      <div className="flex items-start gap-2 p-3 bg-primary-soft rounded-xl border border-primary-soft text-sm text-primary">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span>
          Chỉ chủ cửa hàng được sửa và hoàn thành phiếu. Phiếu sau khi hoàn thành sẽ không thể chỉnh sửa.
        </span>
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-3 pt-2 flex-wrap">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-lg text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Về danh sách
        </button>
        <p className="text-xs text-slate-500 flex-1 hidden md:block">Đối chiếu hàng thực nhận trước khi duyệt.</p>
        {isOwner && !isCompleted && (
          <>
            <button
              type="button"
              onClick={onEdit}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-lg text-sm"
            >
              <Edit2 className="w-4 h-4" /> Sửa phiếu
            </button>
            <button
              type="button"
              onClick={onComplete}
              className="flex items-center gap-2 px-6 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium rounded-lg text-sm shadow-sm"
            >
              <CheckCircle className="w-4 h-4" /> Hoàn thành
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// ─── Component chính ──────────────────────────────────────────────────────────
export const PurchaseOrdersPage: React.FC = () => {
  const [mode, setMode] = useState<PageMode>('list');
  const [selectedPo, setSelectedPo] = useState<PurchaseOrder | null>(null);
  const [completePoId, setCompletePoId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'saved' | 'completed'>('saved');
  const [dateFilter, setDateFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 3;

  const { isOwner, user } = useAuth();
  const { showSuccess, showError } = useToast();
  const queryClient = useQueryClient();

  const { data: purchaseOrders = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: () => api.purchaseOrders.list(),
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.products.list(),
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => api.purchaseOrders.complete(id),
    onSuccess: (po) => {
      showSuccess(`Đã hoàn thành phiếu ${po.code}, kho hàng đã được cộng tự động!`);
      setCompletePoId(null);
      setSelectedPo(po);
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stats'] });
    },
    onError: (err: any) => showError(err.message),
  });

  const totalCount = purchaseOrders.length;
  const savedCount = purchaseOrders.filter((po) => po.status === 'saved').length;
  const completedCount = purchaseOrders.filter((po) => po.status === 'completed').length;

  const filtered = purchaseOrders.filter((po) => {
    const matchSearch =
      po.code.toLowerCase().includes(search.toLowerCase()) ||
      po.creator_name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || po.status === statusFilter;
    const matchDate = !dateFilter || po.order_date.startsWith(dateFilter);
    return matchSearch && matchStatus && matchDate;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Reset page when filters change
  const handleStatusFilter = (s: 'all' | 'saved' | 'completed') => {
    setStatusFilter(s);
    setCurrentPage(1);
  };

  // ── Mode: Create ────────────────────────────────────────────────────────────
  if (mode === 'create') {
    return (
      <CreateForm
        products={products}
        user={user || { full_name: 'Người dùng' }}
        onCancel={() => setMode('list')}
        onSuccess={(po) => {
          setSelectedPo(po);
          setMode('detail');
        }}
      />
    );
  }

  // ── Mode: Edit ──────────────────────────────────────────────────────────────
  if (mode === 'edit' && selectedPo) {
    return (
      <EditForm
        po={selectedPo}
        products={products}
        onCancel={() => setMode('detail')}
        onSuccess={(po) => {
          setSelectedPo(po);
          setMode('detail');
        }}
      />
    );
  }

  // ── Mode: Detail ────────────────────────────────────────────────────────────
  if (mode === 'detail' && selectedPo) {
    const freshPo = purchaseOrders.find((p) => p.id === selectedPo.id) || selectedPo;
    return (
      <>
        <DetailView
          po={freshPo}
          isOwner={isOwner}
          onBack={() => setMode('list')}
          onEdit={() => setMode('edit')}
          onComplete={() => setCompletePoId(freshPo.id)}
        />
        <ConfirmModal
          isOpen={!!completePoId}
          onClose={() => setCompletePoId(null)}
          onConfirm={() => completePoId && completeMutation.mutate(completePoId)}
          title="Xác nhận hoàn thành phiếu nhập?"
          message="Hệ thống sẽ tự động cộng số lượng hàng vào kho và cập nhật giá nhập mới nhất cho từng sản phẩm trong phiếu. Phiếu sau khi hoàn thành sẽ không thể chỉnh sửa."
          confirmText="Hoàn thành & Cộng kho"
          type="success"
          isLoading={completeMutation.isPending}
        />
      </>
    );
  }

  // ── Mode: List ──────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-primary)]">Danh sách phiếu nhập hàng</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Theo dõi và quản lý toàn bộ phiếu nhập hàng của cửa hàng.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Tổng số phiếu nhập"
          value={totalCount}
          iconBg="bg-primary-soft"
          icon={<Package className="w-6 h-6 text-[var(--color-primary)]" />}
        />
        <StatCard
          label="Phiếu đã lưu"
          value={savedCount}
          iconBg="bg-primary-soft"
          icon={<Clock className="w-6 h-6 text-primary" />}
        />
        <StatCard
          label="Phiếu đã hoàn thành"
          value={completedCount}
          iconBg="bg-primary-soft"
          icon={<CheckCircle className="w-6 h-6 text-primary" />}
        />
      </div>

      {/* Loading / Error */}
      {isLoading && <LoadingSpinner message="Đang tải danh sách phiếu nhập..." />}
      {isError && (
        <ErrorState title="Không tải được phiếu nhập" message={(error as Error)?.message} onRetry={refetch} />
      )}

      {!isLoading && !isError && (
        purchaseOrders.length === 0 ? (
          <EmptyState
            title="Chưa có phiếu nhập hàng nào"
            description="Bấm Lập phiếu nhập hàng để ghi nhận hàng về kho."
            actionText="Lập phiếu ngay"
            onAction={() => setMode('create')}
          />
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Filter row */}
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              {/* Search */}
              <div className="relative flex-1 min-w-48">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Tìm theo mã phiếu nhập..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
                />
              </div>

              {/* Status dropdown */}
              <select
                value={statusFilter}
                onChange={(e) => handleStatusFilter(e.target.value as 'all' | 'saved' | 'completed')}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)] text-slate-700 bg-white"
              >
                <option value="all">Tất cả</option>
                <option value="saved">Đã lưu</option>
                <option value="completed">Đã hoàn thành</option>
              </select>

              {/* Date filter */}
              <div className="relative">
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => { setDateFilter(e.target.value); setCurrentPage(1); }}
                  placeholder="Ngày nhập"
                  className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)] text-slate-700"
                />
              </div>

              {/* Create button */}
              <button
                onClick={() => setMode('create')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium rounded-lg text-sm shadow-sm whitespace-nowrap ml-auto"
              >
                <Plus className="w-4 h-4" />
                Lập phiếu nhập
              </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-[var(--color-primary-soft)] text-slate-500 text-xs">
                  <tr>
                    <th className="py-3 px-4 font-medium">Mã phiếu nhập</th>
                    <th className="py-3 px-4 font-medium">Ngày nhập</th>
                    <th className="py-3 px-4 font-medium">Người lập phiếu</th>
                    <th className="py-3 px-4 font-medium text-center">Tổng số sản phẩm</th>
                    <th className="py-3 px-4 font-medium text-right">Tổng tiền hàng</th>
                    <th className="py-3 px-4 font-medium text-center">Trạng thái</th>
                    <th className="py-3 px-4 font-medium text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginated.map((po) => {
                    const isCompleted = po.status === 'completed';
                    return (
                      <tr key={po.id} className="hover:bg-slate-50/60">
                        {/* Mã phiếu - blue link */}
                        <td className="py-3.5 px-4">
                          <button
                            onClick={() => { setSelectedPo(po); setMode('detail'); }}
                            className="font-semibold text-[var(--color-primary)] hover:underline font-mono"
                          >
                            {po.code}
                          </button>
                        </td>
                        <td className="py-3.5 px-4 text-slate-600">{formatDate(new Date(po.order_date))}</td>
                        <td className="py-3.5 px-4 text-slate-700">{po.creator_name}</td>
                        <td className="py-3.5 px-4 text-center font-semibold">{po.items.length}</td>
                        <td className="py-3.5 px-4 text-right font-semibold text-slate-800">
                          {formatVND(po.total_amount)}
                        </td>
                        {/* Status badge */}
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                              isCompleted
                                ? 'bg-primary-soft text-primary'
                                : 'bg-primary-soft text-[var(--color-primary)]'
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]" />
                            {isCompleted ? 'Đã hoàn thành' : 'Đã lưu'}
                          </span>
                        </td>
                        {/* Thao tác */}
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => { setSelectedPo(po); setMode('detail'); }}
                              className="text-[var(--color-primary)] hover:underline text-xs font-medium"
                            >
                              Xem chi tiết
                            </button>
                            {isOwner && !isCompleted && (
                              <>
                                <button
                                  onClick={() => { setSelectedPo(po); setMode('edit'); }}
                                  className="p-1 text-slate-500 hover:text-[var(--color-primary)] hover:bg-primary-soft rounded"
                                  title="Sửa phiếu"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => { setSelectedPo(po); setCompletePoId(po.id); }}
                                  className="p-1 text-slate-500 hover:text-primary hover:bg-primary-soft rounded"
                                  title="Hoàn thành"
                                >
                                  <CheckCircle className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {paginated.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 text-sm">
                        Không tìm thấy phiếu nhập nào.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {filtered.length > 0 && (
              <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                <span className="text-sm text-slate-500" />
                <div className="flex items-center gap-4">
                  <span className="text-sm text-slate-500">
                    Hiển thị {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} trong {filtered.length} phiếu{' '}
                    {statusFilter === 'saved' ? 'đã lưu' : statusFilter === 'completed' ? 'đã hoàn thành' : ''}
                    &nbsp;&nbsp;Trang {currentPage}/{totalPages}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ‹
                    </button>
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ›
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* Confirm complete modal (from list view) */}
      <ConfirmModal
        isOpen={!!completePoId && mode === 'list'}
        onClose={() => setCompletePoId(null)}
        onConfirm={() => completePoId && completeMutation.mutate(completePoId)}
        title="Xác nhận hoàn thành phiếu nhập?"
        message="Hệ thống sẽ tự động cộng số lượng hàng vào kho và cập nhật giá nhập mới nhất cho từng sản phẩm trong phiếu. Phiếu sau khi hoàn thành sẽ không thể chỉnh sửa."
        confirmText="Hoàn thành & Cộng kho"
        type="success"
        isLoading={completeMutation.isPending}
      />
    </div>
  );
};
