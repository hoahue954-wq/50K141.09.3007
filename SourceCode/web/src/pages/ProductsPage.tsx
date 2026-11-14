import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Product } from '../types';
import { formatVND } from '../utils/format';
import {
  Search,
  Plus,
  Eye,
  Edit2,
  Trash2,
  Lock,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Barcode as BarcodeIcon,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Modal } from '../components/common/Modal';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';

type PageMode = 'list' | 'create' | 'edit' | 'detail';
const PAGE_SIZE = 10;

export const ProductsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlMode = searchParams.get('mode') as PageMode | null;
  const urlBarcode = searchParams.get('barcode');

  const [mode, setMode] = useState<PageMode>('list');
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);

  // Search & Filter state
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCatId, setSelectedCatId] = useState('');
  const [page, setPage] = useState(1);

  // Form state
  const [barcode, setBarcode] = useState('');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [unit, setUnit] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageUrlError, setImageUrlError] = useState('');
  const [barcodeError, setBarcodeError] = useState('');
  const [formError, setFormError] = useState('');
  const [formNotice, setFormNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const validateBarcode = (val: string): string => {
    const trimmed = val.trim();
    if (!trimmed) return 'Mã vạch phải gồm đúng 13 chữ số.';
    if (!/^\d{13}$/.test(trimmed)) {
      return 'Mã vạch phải gồm đúng 13 chữ số.';
    }
    return '';
  };

  const validateImageUrl = (url: string): string => {
    const trimmed = url.trim();
    if (!trimmed) return '';
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return 'Đường dẫn ảnh phải là URL hợp lệ bắt đầu bằng http:// hoặc https://';
      }
      return '';
    } catch {
      return 'Đường dẫn ảnh không hợp lệ (ví dụ: https://example.com/anh.jpg)';
    }
  };

  const { isOwner, isStaff } = useAuth();
  const { showSuccess, showError } = useToast();
  const queryClient = useQueryClient();

  const {
    data: products = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.products.list(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.categories.list(),
  });

  // Filtered products
  const filteredProducts = products.filter((p) => {
    const matchSearch =
      !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode.includes(searchQuery.trim());
    const matchCat = !selectedCatId || p.category_id === selectedCatId;
    return matchSearch && matchCat;
  });

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const pagedProducts = filteredProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const currentProduct =
    activeProduct || (urlBarcode ? products.find((p) => p.barcode === urlBarcode) : null) || null;
  const currentMode: PageMode = urlMode || mode;

  useEffect(() => {
    if (urlMode === 'edit' && urlBarcode && products.length > 0) {
      const p = products.find((prod) => prod.barcode === urlBarcode);
      if (p) {
        setBarcode(p.barcode);
        setName(p.name);
        setCategoryId(p.category_id);
        setSellingPrice(p.selling_price.toString());
        setCostPrice(p.cost_price ? p.cost_price.toString() : '');
        setUnit(p.unit);
        setImageUrl(p.image_url || '');
        setImageUrlError('');
        setActiveProduct(p);
      }
    }
  }, [urlMode, urlBarcode, products]);

  const handleBackToList = () => {
    setSearchParams({});
    setMode('list');
    setActiveProduct(null);
    setFormNotice(null);
  };

  const handleCloseFormNotice = () => {
    const notice = formNotice;
    setFormNotice(null);
    if (notice?.type === 'success') {
      handleBackToList();
      showSuccess(notice.message);
    }
  };

  const formNoticeModal = formNotice && (
    <Modal
      isOpen
      onClose={handleCloseFormNotice}
      title={formNotice.type === 'success' ? 'Lưu thành công' : 'Không thể lưu sản phẩm'}
      maxWidth="sm"
    >
      <div className="flex flex-col items-center text-center">
        {formNotice.type === 'success' ? (
          <CheckCircle2 className="mb-4 h-10 w-10 text-primary" />
        ) : (
          <AlertCircle className="mb-4 h-10 w-10 text-primary" />
        )}
        <p className="text-sm leading-relaxed text-slate-600">{formNotice.message}</p>
        <button
          type="button"
          onClick={handleCloseFormNotice}
          className={`mt-6 w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white ${
            formNotice.type === 'success'
              ? 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]'
              : 'bg-slate-700 hover:bg-slate-800'
          }`}
        >
          {formNotice.type === 'success' ? 'Về danh sách sản phẩm' : 'Đã hiểu'}
        </button>
      </div>
    </Modal>
  );

  // Form Handlers
  const handleOpenCreate = () => {
    setBarcode('');
    setBarcodeError('');
    setName('');
    setCategoryId(categories[0]?.id || '');
    setSellingPrice('');
    setCostPrice('');
    setUnit('');
    setImageUrl('');
    setImageUrlError('');
    setFormError('');
    setFormNotice(null);
    setActiveProduct(null);
    setMode('create');
    setSearchParams({ mode: 'create' });
  };

  const handleOpenEdit = (p: Product) => {
    setBarcode(p.barcode);
    setBarcodeError('');
    setName(p.name);
    setCategoryId(p.category_id);
    setSellingPrice(p.selling_price.toString());
    setCostPrice(p.cost_price ? p.cost_price.toString() : '');
    setUnit(p.unit);
    setImageUrl(p.image_url || '');
    setImageUrlError('');
    setFormError('');
    setFormNotice(null);
    setActiveProduct(p);
    setMode('edit');
    setSearchParams({ mode: 'edit', barcode: p.barcode });
  };

  const handleOpenDetail = (p: Product) => {
    setActiveProduct(p);
    setMode('detail');
    setSearchParams({ mode: 'detail', barcode: p.barcode });
  };

  // Mutations
  const createMutation = useMutation({
    mutationFn: () => {
      setFormError('');
      const bErr = validateBarcode(barcode);
      if (bErr) {
        setBarcodeError(bErr);
        throw new Error(bErr);
      }
      if (!name.trim()) throw new Error('Vui lòng nhập tên sản phẩm.');
      if (!categoryId) throw new Error('Vui lòng chọn danh mục.');
      if (!unit.trim()) throw new Error('Vui lòng nhập đơn vị tính.');
      const sp = Number(sellingPrice);
      const cp = Number(costPrice);
      if (isNaN(sp) || sp <= 0) throw new Error('Giá bán phải là số lớn hơn 0.');
      if (isNaN(cp) || cp <= 0) throw new Error('Giá nhập phải là số lớn hơn 0.');

      const imgErr = validateImageUrl(imageUrl);
      if (imgErr) {
        setImageUrlError(imgErr);
        throw new Error(imgErr);
      }

      const cat = categories.find((c) => c.id === categoryId);
      return api.products.create({
        barcode: barcode.trim(),
        name: name.trim(),
        category_id: categoryId,
        category_name: cat?.name || '',
        selling_price: sp,
        cost_price: cp,
        unit: unit.trim(),
        stock_quantity: 0,
        min_stock: 5,
        image_url: imageUrl.trim() || undefined,
      });
    },
    onSuccess: (prod) => {
      setFormNotice({ type: 'success', message: `Đã tạo sản phẩm "${prod.name}" thành công!` });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err: any) => {
      setFormError(err.message);
      setFormNotice({ type: 'error', message: err.message });
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!currentProduct) throw new Error('Không tìm thấy sản phẩm cần sửa.');
      setFormError('');
      if (!name.trim()) throw new Error('Vui lòng nhập tên sản phẩm.');
      if (!categoryId) throw new Error('Vui lòng chọn danh mục.');
      if (!unit.trim()) throw new Error('Vui lòng nhập đơn vị tính.');
      const sp = Number(sellingPrice);
      const cp = Number(costPrice);
      if (isNaN(sp) || sp <= 0) throw new Error('Giá bán phải là số lớn hơn 0.');
      if (isNaN(cp) || cp <= 0) throw new Error('Giá nhập phải là số lớn hơn 0.');

      const imgErr = validateImageUrl(imageUrl);
      if (imgErr) {
        setImageUrlError(imgErr);
        throw new Error(imgErr);
      }

      const cat = categories.find((c) => c.id === categoryId);
      return api.products.update(currentProduct.barcode, {
        name: name.trim(),
        category_id: categoryId,
        category_name: cat?.name || '',
        selling_price: sp,
        cost_price: cp,
        unit: unit.trim(),
        image_url: imageUrl.trim() || undefined,
      });
    },
    onSuccess: (prod) => {
      setFormNotice({ type: 'success', message: `Đã cập nhật sản phẩm "${prod.name}" thành công!` });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err: any) => {
      setFormError(err.message);
      setFormNotice({ type: 'error', message: err.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (barcode: string) => api.products.delete(barcode),
    onSuccess: () => {
      showSuccess('Đã xóa sản phẩm thành công!');
      setDeleteProduct(null);
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err: any) => showError(err.message),
  });

  // --------------------------------------------------------------------------
  // MÀN HÌNH TẠO SẢN PHẨM (Figma 3.2.1)
  // --------------------------------------------------------------------------
  if (currentMode === 'create') {
    return (
      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-primary)]">Tạo sản phẩm</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Nhập đầy đủ thông tin sản phẩm mới. Tồn kho ban đầu mặc định bằng 0.
            </p>
          </div>
          <button
            onClick={handleBackToList}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-lg text-sm shadow-2xs"
          >
            <ArrowLeft className="w-4 h-4" />
            Quay lại
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
          <h2 className="text-base font-bold text-slate-800">Thông tin chung</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-10">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Mã vạch *
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={barcode}
                  onChange={(e) => {
                    const val = e.target.value;
                    setBarcode(val);
                    if (val) {
                      setBarcodeError(validateBarcode(val));
                    } else {
                      setBarcodeError('');
                    }
                  }}
                  onBlur={() => {
                    if (barcode) {
                      setBarcodeError(validateBarcode(barcode));
                    }
                  }}
                  placeholder="Nhập hoặc quét mã vạch 13 chữ số"
                  className={`w-full px-3.5 py-2.5 rounded-lg border text-sm focus:outline-none pr-10 ${
                    barcodeError
                      ? 'border-danger focus:border-danger'
                      : 'border-slate-200 focus:border-[var(--color-primary)]'
                  }`}
                />
                <BarcodeIcon className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              </div>
              {barcodeError && (
                <p className="mt-1 text-xs text-danger font-medium flex items-center gap-1">
                  {barcodeError}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Tên sản phẩm *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nhập tên sản phẩm"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Danh mục *
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)] bg-white"
              >
                <option value="">Chọn danh mục</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Đơn vị tính *
              </label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="Nhập đơn vị tính"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Giá nhập (VND) *
              </label>
              <input
                type="number"
                min="0"
                step="1000"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                placeholder="Nhập giá nhập"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Giá bán (VND) *
              </label>
              <input
                type="number"
                min="0"
                step="1000"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                placeholder="Nhập giá bán"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Tồn kho
              </label>
              <div className="relative">
                <input
                  type="text"
                  value="0"
                  readOnly
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-600 pr-10 cursor-not-allowed"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              </div>
            </div>

            <div className="flex items-center pt-4">
              <p className="text-xs text-slate-500">
                Sản phẩm mới có tồn kho bằng 0. Nhập hàng để cập nhật số lượng.
              </p>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                URL ảnh sản phẩm (tùy chọn)
              </label>
              <input
                type="text"
                value={imageUrl}
                onChange={(e) => {
                  const val = e.target.value;
                  setImageUrl(val);
                  setImageUrlError(validateImageUrl(val));
                }}
                placeholder="https://example.com/anh-san-pham.jpg"
                className={`w-full px-3.5 py-2.5 rounded-lg border text-sm focus:outline-none ${
                  imageUrlError
                    ? 'border-danger focus:border-danger'
                    : 'border-slate-200 focus:border-[var(--color-primary)]'
                }`}
              />
              {imageUrlError && (
                <p className="mt-1.5 text-xs text-danger font-medium">{imageUrlError}</p>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="text-xs text-slate-500">
              * Thông tin bắt buộc. Mã vạch phải duy nhất; giá nhập và giá bán phải là số lớn hơn 0.
            </p>
            <div className="flex items-center gap-3 self-end sm:self-auto">
              <button
                type="button"
                onClick={handleBackToList}
                className="px-6 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-lg text-sm shadow-2xs"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className="px-6 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium rounded-lg text-sm shadow-sm disabled:opacity-70"
              >
                {createMutation.isPending ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>

          {formError && (
            <div className="p-3 bg-primary-soft border border-[var(--border)] rounded-lg text-xs text-primary font-medium">
              {formError}
            </div>
          )}
        </div>
        {formNoticeModal}
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // MÀN HÌNH SỬA SẢN PHẨM (Figma 3.3.1)
  // --------------------------------------------------------------------------
  if (currentMode === 'edit' && currentProduct) {
    return (
      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-primary)]">Sửa thông tin sản phẩm</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Cập nhật thông tin sản phẩm. Mã vạch và tồn kho không được chỉnh sửa.
            </p>
          </div>
          <button
            onClick={handleBackToList}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-lg text-sm shadow-2xs"
          >
            <ArrowLeft className="w-4 h-4" />
            Quay lại
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
          <h2 className="text-base font-bold text-slate-800">Thông tin chung</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-10">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Mã vạch *
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={currentProduct.barcode}
                  readOnly
                  className={`w-full px-3.5 py-2.5 rounded-lg border bg-slate-50 text-sm text-slate-600 pr-10 cursor-not-allowed font-mono ${
                    !/^\d{13}$/.test(currentProduct.barcode)
                      ? 'border-danger'
                      : 'border-slate-200'
                  }`}
                />
                <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              </div>
              {!/^\d{13}$/.test(currentProduct.barcode) && (
                <p className="mt-1 text-xs text-danger font-medium flex items-center gap-1">
                  Mã vạch phải gồm đúng 13 chữ số.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Tên sản phẩm *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nhập tên sản phẩm"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Danh mục *
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)] bg-white"
              >
                <option value="">Chọn danh mục</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Đơn vị tính *
              </label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="Nhập đơn vị tính"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Giá nhập (VND) *
              </label>
              <input
                type="number"
                min="0"
                step="1000"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                placeholder="Nhập giá nhập"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Giá bán (VND) *
              </label>
              <input
                type="number"
                min="0"
                step="1000"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                placeholder="Nhập giá bán"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Tồn kho
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={currentProduct.stock_quantity}
                  readOnly
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-600 pr-10 cursor-not-allowed font-semibold"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              </div>
            </div>

            <div className="flex items-center pt-4">
              <p className="text-xs text-slate-500">
                Số lượng tồn kho được quản lý qua nghiệp vụ nhập, bán và điều chỉnh hàng.
              </p>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                URL ảnh sản phẩm (tùy chọn)
              </label>
              <input
                type="text"
                value={imageUrl}
                onChange={(e) => {
                  const val = e.target.value;
                  setImageUrl(val);
                  setImageUrlError(validateImageUrl(val));
                }}
                placeholder="https://example.com/anh-san-pham.jpg"
                className={`w-full px-3.5 py-2.5 rounded-lg border text-sm focus:outline-none ${
                  imageUrlError
                    ? 'border-danger focus:border-danger'
                    : 'border-slate-200 focus:border-[var(--color-primary)]'
                }`}
              />
              {imageUrlError && (
                <p className="mt-1.5 text-xs text-danger font-medium">{imageUrlError}</p>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="text-xs text-slate-500">
              * Thông tin bắt buộc. Mã vạch phải duy nhất; giá nhập và giá bán phải là số lớn hơn 0.
            </p>
            <div className="flex items-center gap-3 self-end sm:self-auto">
              <button
                type="button"
                onClick={handleBackToList}
                className="px-6 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-lg text-sm shadow-2xs"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => updateMutation.mutate()}
                disabled={updateMutation.isPending}
                className="px-6 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium rounded-lg text-sm shadow-sm disabled:opacity-70"
              >
                {updateMutation.isPending ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>

          {formError && (
            <div className="p-3 bg-primary-soft border border-[var(--border)] rounded-lg text-xs text-primary font-medium">
              {formError}
            </div>
          )}
        </div>
        {formNoticeModal}
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // MÀN HÌNH CHI TIẾT SẢN PHẨM (Figma 3.1.7)
  // --------------------------------------------------------------------------
  if (currentMode === 'detail' && currentProduct) {
    return (
      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-primary)]">Thông tin chi tiết sản phẩm</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Xem đầy đủ thông tin sản phẩm. Dữ liệu không thay đổi.
            </p>
          </div>
          <button
            onClick={handleBackToList}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-lg text-sm shadow-2xs"
          >
            <ArrowLeft className="w-4 h-4" />
            Quay lại
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
          <h2 className="text-base font-bold text-slate-800">Chi tiết sản phẩm</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Mã vạch
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={currentProduct.barcode}
                  readOnly
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-600 pr-10 cursor-not-allowed font-mono"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Tên sản phẩm
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={currentProduct.name}
                  readOnly
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-800 pr-10 cursor-not-allowed font-medium"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Danh mục
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={currentProduct.category_name || 'Chưa phân loại'}
                  readOnly
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-600 pr-10 cursor-not-allowed"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Đơn vị tính
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={currentProduct.unit}
                  readOnly
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-600 pr-10 cursor-not-allowed"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Giá nhập (VND)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={currentProduct.cost_price ? currentProduct.cost_price.toLocaleString('vi-VN') : '0'}
                  readOnly
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-800 pr-10 cursor-not-allowed font-medium"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Giá bán (VND)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={currentProduct.selling_price.toLocaleString('vi-VN')}
                  readOnly
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-800 pr-10 cursor-not-allowed font-bold"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Tồn kho
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={currentProduct.stock_quantity}
                  readOnly
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-800 pr-10 cursor-not-allowed font-bold"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              </div>
            </div>

            <div className="flex items-center pt-4">
              <p className="text-xs text-slate-500">
                Số lượng tồn kho được quản lý qua nghiệp vụ nhập, bán và điều chỉnh hàng.
              </p>
            </div>

            {currentProduct.image_url ? (
              <div className="md:col-span-2 space-y-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Ảnh sản phẩm
                </label>
                <div className="flex items-center gap-4">
                  <img
                    src={currentProduct.image_url}
                    alt={currentProduct.name}
                    className="w-20 h-20 object-cover rounded-lg border border-slate-200"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <a
                    href={currentProduct.image_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--color-primary)] hover:underline break-all"
                  >
                    {currentProduct.image_url}
                  </a>
                </div>
              </div>
            ) : null}
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              type="button"
              onClick={handleBackToList}
              className="px-6 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium rounded-lg text-sm shadow-sm"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // MÀN HÌNH DANH SÁCH SẢN PHẨM (Figma 3.1.1)
  // --------------------------------------------------------------------------
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-primary)]">Sản phẩm</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Cho xem, tạo mới, cập nhật và xóa thông tin sản phẩm trực tiếp trên phần mềm.
          </p>
        </div>

        {isOwner && (
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium rounded-lg text-sm shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Tạo sản phẩm
          </button>
        )}
      </div>

      {/* Thanh tìm kiếm & lọc */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setSearchQuery(searchInput);
                setPage(1);
              }
            }}
            placeholder="Tìm theo tên sản phẩm..."
            className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)] bg-white"
          />
        </div>

        <select
          value={selectedCatId}
          onChange={(e) => {
            setSelectedCatId(e.target.value);
            setPage(1);
          }}
          className="px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)] bg-white shadow-2xs min-w-48"
        >
          <option value="">Tìm kiếm theo danh mục</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <button
          onClick={() => {
            setSearchQuery(searchInput);
            setPage(1);
          }}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium rounded-lg text-sm shadow-sm transition-colors"
        >
          <Search className="w-4 h-4" />
          Tìm kiếm
        </button>
      </div>

      {isLoading && <LoadingSpinner message="Đang tải danh sách sản phẩm..." />}
      {isError && (
        <ErrorState
          title="Không tải được sản phẩm"
          message={(error as Error)?.message}
          onRetry={refetch}
        />
      )}

      {!isLoading && !isError && (
        <>
          {filteredProducts.length === 0 ? (
            <EmptyState
              title="Không tìm thấy sản phẩm"
              description="Không có sản phẩm nào khớp với tìm kiếm của bạn."
            />
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {/* Header của bảng */}
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="font-semibold text-slate-800 text-sm">Danh sách sản phẩm</span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-soft text-[var(--color-primary)]">
                    {filteredProducts.length} sản phẩm
                  </span>
                </div>
                <span className="text-xs text-slate-500">Giá bán: VND</span>
              </div>

              {/* Bảng sản phẩm */}
              <div className="overflow-x-auto">
                <table className="ui-table w-full text-left text-sm">
                  <thead className="bg-[var(--surface-muted)] text-slate-500 text-xs uppercase font-medium">
                    <tr>
                      <th className="py-3 px-4">Mã vạch</th>
                      <th className="py-3 px-4">Tên sản phẩm</th>
                      <th className="py-3 px-4 text-right">Giá bán</th>
                      <th className="py-3 px-4 text-center">Tồn kho</th>
                      <th className="py-3 px-4 text-center">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedProducts.map((p) => (
                      <tr key={p.barcode} className="hover:bg-[var(--color-primary-soft)]/50 transition-colors">
                        <td className="py-3.5 px-4 font-mono text-slate-500 text-xs">
                          {p.barcode}
                        </td>
                        <td className="py-3.5 px-4">
                          <button
                            onClick={() => handleOpenDetail(p)}
                            className="font-medium text-[var(--color-primary)] hover:underline text-left"
                          >
                            {p.name}
                          </button>
                        </td>
                        <td className="py-3.5 px-4 text-right font-medium text-slate-800">
                          {p.selling_price.toLocaleString('vi-VN')}
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-slate-700">
                          {p.stock_quantity}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-3 text-xs">
                            <button
                              onClick={() => handleOpenDetail(p)}
                              className="inline-flex items-center gap-1 text-[var(--color-primary)] hover:underline"
                            >
                              <Eye className="w-3.5 h-3.5" /> Xem
                            </button>

                            {isOwner && (
                              <>
                                <button
                                  onClick={() => handleOpenEdit(p)}
                                  className="inline-flex items-center gap-1 text-slate-600 hover:text-[var(--color-primary)] hover:underline"
                                >
                                  <Edit2 className="w-3.5 h-3.5" /> Sửa
                                </button>
                                <button
                                  onClick={() => setDeleteProduct(p)}
                                  className="inline-flex items-center gap-1 text-danger hover:underline"
                                >
                                  <Trash2 className="w-3.5 h-3.5" /> Xóa
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Phân trang */}
              <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Hiển thị {(page - 1) * PAGE_SIZE + 1}–
                  {Math.min(page * PAGE_SIZE, filteredProducts.length)} trong {filteredProducts.length} sản phẩm
                </span>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
                    <button
                      key={pg}
                      onClick={() => setPage(pg)}
                      className={`w-6 h-6 rounded text-xs font-medium transition-colors ${
                        page === pg
                          ? 'bg-[var(--color-primary)] text-white'
                        : 'hover:bg-[var(--color-primary-soft)] text-slate-700'
                      }`}
                    >
                      {pg}
                    </button>
                  ))}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Ghi chú chân trang theo Figma */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>⚑</span>
            <span>Chọn tên sản phẩm hoặc biểu tượng mắt để xem chi tiết.</span>
          </div>
        </>
      )}

      <ConfirmModal
        isOpen={!!deleteProduct}
        onClose={() => setDeleteProduct(null)}
        onConfirm={() => deleteProduct && deleteMutation.mutate(deleteProduct.barcode)}
        title="Xác nhận xóa sản phẩm?"
        message={
          deleteProduct
            ? `${deleteProduct.name} (${deleteProduct.barcode}) sẽ bị xóa khỏi danh sách. Sản phẩm đã được tham chiếu bởi hóa đơn không thể xóa.`
            : ''
        }
        confirmText="Xóa sản phẩm"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
};
