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
  Check,
  X,
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

type ProductModalState =
  | { type: 'duplicate_create'; message: string }
  | { type: 'empty_fields_create' }
  | { type: 'invalid_info_create' }
  | { type: 'success_create'; product: { name: string; barcode: string; stock: number } }
  | { type: 'invalid_info_edit' }
  | { type: 'duplicate_edit' }
  | { type: 'success_edit'; product: { name: string; price: number } }
  | null;

export const ProductsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlMode = searchParams.get('mode') as PageMode | null;
  const urlBarcode = searchParams.get('barcode');

  const [mode, setMode] = useState<PageMode>('list');
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);
  const [referencedProduct, setReferencedProduct] = useState<{
    product: Product;
    invoiceCode: string;
  } | null>(null);

  const [productModal, setProductModal] = useState<ProductModalState>(null);

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
  const [fieldErrors, setFieldErrors] = useState<{
    barcode?: string;
    name?: string;
    categoryId?: string;
    unit?: string;
    costPrice?: string;
    sellingPrice?: string;
    imageUrl?: string;
  }>({});

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
      return 'Đường dẫn ảnh phải là URL hợp lệ bắt đầu bằng http:// hoặc https://';
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

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api.invoices.list(),
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
        setFieldErrors({});
        setActiveProduct(p);
      }
    }
  }, [urlMode, urlBarcode, products]);

  const handleBackToList = () => {
    setSearchParams({});
    setMode('list');
    setActiveProduct(null);
    setProductModal(null);
    setFieldErrors({});
  };

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
    setFieldErrors({});
    setProductModal(null);
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
    setFieldErrors({});
    setProductModal(null);
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
      const cat = categories.find((c) => c.id === categoryId);
      return api.products.create({
        barcode: barcode.trim(),
        name: name.trim(),
        category_id: categoryId,
        category_name: cat?.name || '',
        selling_price: Number(sellingPrice),
        cost_price: Number(costPrice),
        unit: unit.trim(),
        stock_quantity: 0,
        min_stock: 5,
        image_url: imageUrl.trim() || undefined,
      });
    },
    onSuccess: (prod) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setProductModal({
        type: 'success_create',
        product: { name: prod.name, barcode: prod.barcode, stock: prod.stock_quantity || 0 },
      });
    },
    onError: (err: any) => {
      if (err.message?.includes('tồn tại') || err.message?.includes('DUPLICATE')) {
        setProductModal({
          type: 'duplicate_create',
          message: err.message,
        });
      } else {
        setProductModal({ type: 'invalid_info_create' });
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!currentProduct) throw new Error('Không tìm thấy sản phẩm cần sửa.');
      const cat = categories.find((c) => c.id === categoryId);
      return api.products.update(currentProduct.barcode, {
        name: name.trim(),
        category_id: categoryId,
        category_name: cat?.name || '',
        selling_price: Number(sellingPrice),
        cost_price: Number(costPrice),
        unit: unit.trim(),
        image_url: imageUrl.trim() || undefined,
      });
    },
    onSuccess: (prod) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setProductModal({
        type: 'success_edit',
        product: { name: prod.name, price: prod.selling_price },
      });
    },
    onError: (err: any) => {
      if (err.message?.includes('tồn tại') || err.message?.includes('DUPLICATE')) {
        setProductModal({ type: 'duplicate_edit' });
      } else {
        setProductModal({ type: 'invalid_info_edit' });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (barcode: string) => api.products.delete(barcode),
    onSuccess: () => {
      showSuccess('Đã xóa sản phẩm thành công!');
      setDeleteProduct(null);
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err: any) => {
      if (deleteProduct) {
        setReferencedProduct({
          product: deleteProduct,
          invoiceCode: 'trong hệ thống',
        });
        setDeleteProduct(null);
      } else {
        showError(err.message);
      }
    },
  });

  const handleDeleteClick = (p: Product) => {
    // Kiểm tra sản phẩm đã được tham chiếu bởi hóa đơn nào chưa
    const refInvoice = invoices.find((inv: any) =>
      inv.items?.some((it: any) => it.product_barcode === p.barcode)
    );

    if (refInvoice) {
      setReferencedProduct({ product: p, invoiceCode: refInvoice.code });
    } else {
      setDeleteProduct(p);
    }
  };

  const handleSubmitCreate = () => {
    const errors: typeof fieldErrors = {};
    const trimmedBarcode = barcode.trim();
    const trimmedName = name.trim();
    const trimmedUnit = unit.trim();
    const sp = Number(sellingPrice);
    const cp = Number(costPrice);

    if (!trimmedBarcode) errors.barcode = 'Mã vạch không được để trống';
    if (!trimmedName) errors.name = 'Tên sản phẩm không được để trống';
    if (!categoryId) errors.categoryId = 'Vui lòng chọn danh mục';
    if (!trimmedUnit) errors.unit = 'Đơn vị tính không được để trống';
    if (!costPrice) errors.costPrice = 'Giá nhập không được để trống';
    if (!sellingPrice) errors.sellingPrice = 'Giá bán không được để trống';

    const imgErr = validateImageUrl(imageUrl);
    if (imgErr) errors.imageUrl = imgErr;

    setFieldErrors(errors);

    // 1. Kiểm tra trường để trống (Mục 45)
    if (!trimmedBarcode || !trimmedName || !categoryId || !trimmedUnit || !costPrice || !sellingPrice) {
      setProductModal({ type: 'empty_fields_create' });
      return;
    }

    // 2. Kiểm tra trùng mã vạch hoặc tên (Mục 44)
    const isDuplicateBarcode = products.some((p) => p.barcode === trimmedBarcode);
    const isDuplicateName = products.some(
      (p) => p.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );

    if (isDuplicateBarcode || isDuplicateName) {
      let msg = 'Tên sản phẩm đã tồn tại. Mã vạch đã tồn tại trong hệ thống. Vui lòng sử dụng tên và mã vạch khác.';
      if (isDuplicateBarcode && !isDuplicateName) {
        msg = 'Mã vạch đã tồn tại trong hệ thống. Vui lòng sử dụng mã vạch khác.';
        setFieldErrors((prev) => ({ ...prev, barcode: 'Mã vạch đã tồn tại' }));
      } else if (isDuplicateName && !isDuplicateBarcode) {
        msg = 'Tên sản phẩm đã tồn tại trong hệ thống. Vui lòng sử dụng tên khác.';
        setFieldErrors((prev) => ({ ...prev, name: 'Tên sản phẩm đã tồn tại' }));
      } else {
        setFieldErrors((prev) => ({ ...prev, barcode: 'Mã vạch đã tồn tại', name: 'Tên sản phẩm đã tồn tại' }));
      }
      setProductModal({ type: 'duplicate_create', message: msg });
      return;
    }

    // 3. Kiểm tra tính hợp lệ giá (Mục 46)
    if (isNaN(sp) || sp <= 0 || isNaN(cp) || cp <= 0) {
      setProductModal({ type: 'invalid_info_create' });
      return;
    }

    if (imgErr) {
      setImageUrlError(imgErr);
      return;
    }

    createMutation.mutate();
  };

  const handleSubmitEdit = () => {
    if (!currentProduct) return;
    const errors: typeof fieldErrors = {};
    const trimmedName = name.trim();
    const trimmedUnit = unit.trim();
    const sp = Number(sellingPrice);
    const cp = Number(costPrice);

    if (!trimmedName) errors.name = 'Tên sản phẩm không được để trống';
    if (!categoryId) errors.categoryId = 'Vui lòng chọn danh mục';
    if (!trimmedUnit) errors.unit = 'Đơn vị tính không được để trống';
    if (!costPrice) errors.costPrice = 'Giá nhập không được để trống';
    if (!sellingPrice) errors.sellingPrice = 'Giá bán không được để trống';

    const imgErr = validateImageUrl(imageUrl);
    if (imgErr) errors.imageUrl = imgErr;

    setFieldErrors(errors);

    // 1. Kiểm tra trường chưa hợp lệ / để trống / giá không hợp lệ (Mục 48)
    if (!trimmedName || !categoryId || !trimmedUnit || !costPrice || !sellingPrice || isNaN(sp) || sp <= 0 || isNaN(cp) || cp <= 0) {
      setProductModal({ type: 'invalid_info_edit' });
      return;
    }

    // 2. Kiểm tra trùng tên sản phẩm (Mục 49)
    const isDuplicateName = products.some(
      (p) => p.barcode !== currentProduct.barcode && p.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (isDuplicateName) {
      setFieldErrors((prev) => ({ ...prev, name: 'Tên sản phẩm đã tồn tại' }));
      setProductModal({ type: 'duplicate_edit' });
      return;
    }

    if (imgErr) {
      setImageUrlError(imgErr);
      return;
    }

    updateMutation.mutate();
  };

  // --------------------------------------------------------------------------
  // MÀN HÌNH TẠO SẢN PHẨM (Figma 3.2.1)
  // --------------------------------------------------------------------------
  if (currentMode === 'create') {
    return (
      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#024E82]">Tạo sản phẩm</h1>
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-6">
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
                    if (fieldErrors.barcode) {
                      setFieldErrors((prev) => ({ ...prev, barcode: undefined }));
                    }
                  }}
                  onBlur={() => {
                    if (barcode) {
                      setBarcodeError(validateBarcode(barcode));
                    }
                  }}
                  placeholder="Nhập hoặc quét mã vạch 13 chữ số"
                  className={`w-full px-3.5 py-2.5 rounded-lg border text-sm focus:outline-none pr-10 ${
                    barcodeError || fieldErrors.barcode
                      ? 'border-danger focus:border-danger'
                      : 'border-slate-200 focus:border-[#024E82]'
                  }`}
                />
                <BarcodeIcon className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              </div>
              {(barcodeError || fieldErrors.barcode) && (
                <p className="mt-1 text-xs text-danger font-medium flex items-center gap-1">
                  {barcodeError || fieldErrors.barcode}
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
                onChange={(e) => {
                  setName(e.target.value);
                  if (fieldErrors.name) {
                    setFieldErrors((prev) => ({ ...prev, name: undefined }));
                  }
                }}
                placeholder="Nhập tên sản phẩm"
                className={`w-full px-3.5 py-2.5 rounded-lg border text-sm focus:outline-none ${
                  fieldErrors.name
                    ? 'border-danger focus:border-danger'
                    : 'border-slate-200 focus:border-[#024E82]'
                }`}
              />
              {fieldErrors.name && (
                <p className="mt-1 text-xs text-danger font-medium">{fieldErrors.name}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Danh mục *
              </label>
              <select
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  if (fieldErrors.categoryId) {
                    setFieldErrors((prev) => ({ ...prev, categoryId: undefined }));
                  }
                }}
                className={`w-full px-3.5 py-2.5 rounded-lg border text-sm focus:outline-none bg-white ${
                  fieldErrors.categoryId
                    ? 'border-danger focus:border-danger'
                    : 'border-slate-200 focus:border-[#024E82]'
                }`}
              >
                <option value="">Chọn danh mục</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {fieldErrors.categoryId && (
                <p className="mt-1 text-xs text-danger font-medium">{fieldErrors.categoryId}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Đơn vị tính *
              </label>
              <input
                type="text"
                value={unit}
                onChange={(e) => {
                  setUnit(e.target.value);
                  if (fieldErrors.unit) {
                    setFieldErrors((prev) => ({ ...prev, unit: undefined }));
                  }
                }}
                placeholder="Nhập đơn vị tính"
                className={`w-full px-3.5 py-2.5 rounded-lg border text-sm focus:outline-none ${
                  fieldErrors.unit
                    ? 'border-danger focus:border-danger'
                    : 'border-slate-200 focus:border-[#024E82]'
                }`}
              />
              {fieldErrors.unit && (
                <p className="mt-1 text-xs text-danger font-medium">{fieldErrors.unit}</p>
              )}
            </div>

            {/* Mục 43: Bỏ nút tăng giảm spinner giá nhập */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Giá nhập (VND) *
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={costPrice}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, '');
                  const clean = raw.replace(/^0+(?=\d)/, '');
                  setCostPrice(clean);
                  if (fieldErrors.costPrice) {
                    setFieldErrors((prev) => ({ ...prev, costPrice: undefined }));
                  }
                }}
                placeholder="Nhập giá nhập"
                className={`w-full px-3.5 py-2.5 rounded-lg border text-sm focus:outline-none ${
                  fieldErrors.costPrice
                    ? 'border-danger focus:border-danger'
                    : 'border-slate-200 focus:border-[#024E82]'
                }`}
              />
              {fieldErrors.costPrice && (
                <p className="mt-1 text-xs text-danger font-medium">{fieldErrors.costPrice}</p>
              )}
            </div>

            {/* Mục 43: Bỏ nút tăng giảm spinner giá bán */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Giá bán (VND) *
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={sellingPrice}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, '');
                  const clean = raw.replace(/^0+(?=\d)/, '');
                  setSellingPrice(clean);
                  if (fieldErrors.sellingPrice) {
                    setFieldErrors((prev) => ({ ...prev, sellingPrice: undefined }));
                  }
                }}
                placeholder="Nhập giá bán"
                className={`w-full px-3.5 py-2.5 rounded-lg border text-sm focus:outline-none ${
                  fieldErrors.sellingPrice
                    ? 'border-danger focus:border-danger'
                    : 'border-slate-200 focus:border-[#024E82]'
                }`}
              />
              {fieldErrors.sellingPrice && (
                <p className="mt-1 text-xs text-danger font-medium">{fieldErrors.sellingPrice}</p>
              )}
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
                    : 'border-slate-200 focus:border-[#024E82]'
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
                onClick={handleSubmitCreate}
                disabled={createMutation.isPending}
                className="px-6 py-2.5 bg-[#024E82] hover:bg-blue-900 text-white font-medium rounded-lg text-sm shadow-sm disabled:opacity-70 transition-colors"
              >
                {createMutation.isPending ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>

        {/* CÁC POPUP MỤC 44-47 */}
        {productModal?.type === 'duplicate_create' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full border border-red-200 flex items-center justify-center text-red-500 mb-4">
                <X className="w-8 h-8 stroke-[2.5]" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Không thể tạo sản phẩm</h3>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mb-6">
                {productModal.message}
              </p>
              <div className="w-full flex justify-end">
                <button
                  onClick={() => setProductModal(null)}
                  className="px-6 py-2.5 bg-[#024E82] hover:bg-blue-900 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  Kiểm tra lại
                </button>
              </div>
            </div>
          </div>
        )}

        {productModal?.type === 'empty_fields_create' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full border border-red-200 flex items-center justify-center text-red-500 mb-4">
                <X className="w-8 h-8 stroke-[2.5]" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Vui lòng nhập đầy đủ thông tin</h3>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mb-6">
                Mã vạch, tên sản phẩm, danh mục, đơn vị tính, giá nhập và giá bán là thông tin bắt buộc.
              </p>
              <div className="w-full flex justify-end">
                <button
                  onClick={() => setProductModal(null)}
                  className="px-6 py-2.5 bg-[#024E82] hover:bg-blue-900 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  Kiểm tra lại
                </button>
              </div>
            </div>
          </div>
        )}

        {productModal?.type === 'invalid_info_create' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full border border-red-200 flex items-center justify-center text-red-500 mb-4">
                <X className="w-8 h-8 stroke-[2.5]" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Thông tin sản phẩm chưa hợp lệ</h3>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mb-6">
                Giá nhập phải là số dương. Giá bán phải là số dương. Vui lòng chọn danh mục hợp lệ và nhập đơn vị tính.
              </p>
              <div className="w-full flex justify-end">
                <button
                  onClick={() => setProductModal(null)}
                  className="px-6 py-2.5 bg-[#024E82] hover:bg-blue-900 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  Kiểm tra lại
                </button>
              </div>
            </div>
          </div>
        )}

        {productModal?.type === 'success_create' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full border border-emerald-300 flex items-center justify-center text-emerald-500 mb-4">
                <Check className="w-8 h-8 stroke-[2.5]" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Tạo thông tin sản phẩm thành công</h3>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mb-6">
                {productModal.product.name} đã được thêm vào danh sách. Mã vạch: {productModal.product.barcode} · Tồn kho: {productModal.product.stock}.
              </p>
              <div className="w-full flex justify-end">
                <button
                  onClick={() => {
                    setProductModal(null);
                    handleBackToList();
                  }}
                  className="px-6 py-2.5 bg-[#024E82] hover:bg-blue-900 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        )}
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
            <h1 className="text-2xl font-bold text-[#024E82]">Sửa thông tin sản phẩm</h1>
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-6">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Mã vạch *
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
                Tên sản phẩm *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (fieldErrors.name) {
                    setFieldErrors((prev) => ({ ...prev, name: undefined }));
                  }
                }}
                placeholder="Nhập tên sản phẩm"
                className={`w-full px-3.5 py-2.5 rounded-lg border text-sm focus:outline-none ${
                  fieldErrors.name
                    ? 'border-danger focus:border-danger'
                    : 'border-slate-200 focus:border-[#024E82]'
                }`}
              />
              {fieldErrors.name && (
                <p className="mt-1 text-xs text-danger font-medium">{fieldErrors.name}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Danh mục *
              </label>
              <select
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  if (fieldErrors.categoryId) {
                    setFieldErrors((prev) => ({ ...prev, categoryId: undefined }));
                  }
                }}
                className={`w-full px-3.5 py-2.5 rounded-lg border text-sm focus:outline-none bg-white ${
                  fieldErrors.categoryId
                    ? 'border-danger focus:border-danger'
                    : 'border-slate-200 focus:border-[#024E82]'
                }`}
              >
                <option value="">Chọn danh mục</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {fieldErrors.categoryId && (
                <p className="mt-1 text-xs text-danger font-medium">{fieldErrors.categoryId}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Đơn vị tính *
              </label>
              <input
                type="text"
                value={unit}
                onChange={(e) => {
                  setUnit(e.target.value);
                  if (fieldErrors.unit) {
                    setFieldErrors((prev) => ({ ...prev, unit: undefined }));
                  }
                }}
                placeholder="Nhập đơn vị tính"
                className={`w-full px-3.5 py-2.5 rounded-lg border text-sm focus:outline-none ${
                  fieldErrors.unit
                    ? 'border-danger focus:border-danger'
                    : 'border-slate-200 focus:border-[#024E82]'
                }`}
              />
              {fieldErrors.unit && (
                <p className="mt-1 text-xs text-danger font-medium">{fieldErrors.unit}</p>
              )}
            </div>

            {/* Mục 43: Bỏ nút tăng giảm spinner giá nhập */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Giá nhập (VND) *
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={costPrice}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, '');
                  const clean = raw.replace(/^0+(?=\d)/, '');
                  setCostPrice(clean);
                  if (fieldErrors.costPrice) {
                    setFieldErrors((prev) => ({ ...prev, costPrice: undefined }));
                  }
                }}
                placeholder="Nhập giá nhập"
                className={`w-full px-3.5 py-2.5 rounded-lg border text-sm focus:outline-none ${
                  fieldErrors.costPrice
                    ? 'border-danger focus:border-danger'
                    : 'border-slate-200 focus:border-[#024E82]'
                }`}
              />
              {fieldErrors.costPrice && (
                <p className="mt-1 text-xs text-danger font-medium">{fieldErrors.costPrice}</p>
              )}
            </div>

            {/* Mục 43: Bỏ nút tăng giảm spinner giá bán */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Giá bán (VND) *
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={sellingPrice}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, '');
                  const clean = raw.replace(/^0+(?=\d)/, '');
                  setSellingPrice(clean);
                  if (fieldErrors.sellingPrice) {
                    setFieldErrors((prev) => ({ ...prev, sellingPrice: undefined }));
                  }
                }}
                placeholder="Nhập giá bán"
                className={`w-full px-3.5 py-2.5 rounded-lg border text-sm focus:outline-none ${
                  fieldErrors.sellingPrice
                    ? 'border-danger focus:border-danger'
                    : 'border-slate-200 focus:border-[#024E82]'
                }`}
              />
              {fieldErrors.sellingPrice && (
                <p className="mt-1 text-xs text-danger font-medium">{fieldErrors.sellingPrice}</p>
              )}
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
                    : 'border-slate-200 focus:border-[#024E82]'
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
                onClick={handleSubmitEdit}
                disabled={updateMutation.isPending}
                className="px-6 py-2.5 bg-[#024E82] hover:bg-blue-900 text-white font-medium rounded-lg text-sm shadow-sm disabled:opacity-70 transition-colors"
              >
                {updateMutation.isPending ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>

        {/* CÁC POPUP MỤC 48-50, 53 */}
        {productModal?.type === 'invalid_info_edit' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full border border-red-200 flex items-center justify-center text-red-500 mb-4">
                <X className="w-8 h-8 stroke-[2.5]" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Thông tin sản phẩm chưa hợp lệ</h3>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mb-6">
                Tên sản phẩm không được để trống. Giá nhập và giá bán phải là số dương. Vui lòng chọn danh mục hợp lệ và nhập đơn vị tính.
              </p>
              <div className="w-full flex justify-end">
                <button
                  onClick={() => setProductModal(null)}
                  className="px-6 py-2.5 bg-[#024E82] hover:bg-blue-900 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  Kiểm tra lại
                </button>
              </div>
            </div>
          </div>
        )}

        {productModal?.type === 'duplicate_edit' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full border border-red-200 flex items-center justify-center text-red-500 mb-4">
                <X className="w-8 h-8 stroke-[2.5]" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Tên sản phẩm đã tồn tại!</h3>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mb-6">
                Vui lòng nhập tên sản phẩm khác. Thông tin gốc chưa bị thay đổi.
              </p>
              <div className="w-full flex justify-end">
                <button
                  onClick={() => setProductModal(null)}
                  className="px-6 py-2.5 bg-[#024E82] hover:bg-blue-900 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  Kiểm tra lại
                </button>
              </div>
            </div>
          </div>
        )}

        {productModal?.type === 'success_edit' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full border border-emerald-300 flex items-center justify-center text-emerald-500 mb-4">
                <Check className="w-8 h-8 stroke-[2.5]" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Sửa thông tin sản phẩm thành công</h3>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mb-6">
                Đã cập nhật {productModal.product.name}. Giá bán: {productModal.product.price.toLocaleString('vi-VN')} VND. Mã vạch và tồn kho không thay đổi.
              </p>
              <div className="w-full flex justify-end">
                <button
                  onClick={() => {
                    setProductModal(null);
                    handleBackToList();
                  }}
                  className="px-6 py-2.5 bg-[#024E82] hover:bg-blue-900 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        )}
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
            <h1 className="text-2xl font-bold text-[#024E82]">Thông tin chi tiết sản phẩm</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Xem đầy đủ thông tin sản phẩm. Dữ liệu không thay đổi.
            </p>
          </div>
          {/* Mục 41: Nút quay lại màu xanh biển */}
          <button
            onClick={handleBackToList}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-[#024E82] font-semibold rounded-lg text-sm shadow-2xs transition-colors"
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
                    className="text-xs text-[#024E82] hover:underline break-all"
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
              className="px-6 py-2.5 bg-[#024E82] hover:bg-blue-900 text-white font-medium rounded-lg text-sm shadow-sm transition-colors"
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
          <h1 className="text-2xl font-bold text-[#024E82]">Sản phẩm</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Cho xem, tạo mới, cập nhật và xóa thông tin sản phẩm trực tiếp trên phần mềm.
          </p>
        </div>

        {isOwner && (
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#024E82] hover:bg-blue-900 text-white font-medium rounded-lg text-sm shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Tạo sản phẩm
          </button>
        )}
      </div>

      {/* Mục 40: Rút ngắn thanh tìm kiếm sản phẩm & đồng bộ màu chữ */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="w-full sm:w-80 relative">
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
            className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-[#024E82] bg-white"
          />
        </div>

        <select
          value={selectedCatId}
          onChange={(e) => {
            setSelectedCatId(e.target.value);
            setPage(1);
          }}
          className="px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:border-[#024E82] bg-white shadow-2xs min-w-48"
        >
          <option value="" className="text-slate-400">Tìm kiếm theo danh mục</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id} className="text-slate-700">
              {c.name}
            </option>
          ))}
        </select>

        <button
          onClick={() => {
            setSearchQuery(searchInput);
            setPage(1);
          }}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#024E82] hover:bg-blue-900 text-white font-medium rounded-lg text-sm shadow-sm transition-colors"
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
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Header của bảng */}
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="font-semibold text-slate-800 text-sm">Danh sách sản phẩm</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-soft text-[#024E82]">
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
                  {/* Mục 42: Màn hình khi không tìm thấy sản phẩm */}
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-24 text-center text-slate-400 text-sm">
                        Không tìm thấy sản phẩm phù hợp!
                      </td>
                    </tr>
                  ) : (
                    pagedProducts.map((p) => (
                      <tr key={p.barcode} className="hover:bg-[var(--color-primary-soft)]/50 transition-colors">
                        <td className="py-3.5 px-4 font-mono text-slate-500 text-xs">
                          {p.barcode}
                        </td>
                        <td className="py-3.5 px-4">
                          <button
                            onClick={() => handleOpenDetail(p)}
                            className="font-medium text-[#024E82] hover:underline text-left"
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
                              className="inline-flex items-center gap-1 text-[#024E82] hover:underline"
                            >
                              <Eye className="w-3.5 h-3.5" /> Xem
                            </button>

                            {isOwner && (
                              <>
                                <button
                                  onClick={() => handleOpenEdit(p)}
                                  className="inline-flex items-center gap-1 text-slate-600 hover:text-[#024E82] hover:underline"
                                >
                                  <Edit2 className="w-3.5 h-3.5" /> Sửa
                                </button>
                                <button
                                  onClick={() => handleDeleteClick(p)}
                                  className="inline-flex items-center gap-1 text-danger hover:underline"
                                >
                                  <Trash2 className="w-3.5 h-3.5" /> Xóa
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Phân trang */}
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>
                {filteredProducts.length === 0
                  ? 'Hiển thị 0 trong 0 sản phẩm'
                  : `Hiển thị ${(page - 1) * PAGE_SIZE + 1}–${Math.min(
                      page * PAGE_SIZE,
                      filteredProducts.length
                    )} trong ${filteredProducts.length} sản phẩm`}
              </span>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {filteredProducts.length === 0 ? (
                  <button className="w-6 h-6 rounded text-xs font-medium bg-[#024E82] text-white">
                    1
                  </button>
                ) : (
                  Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
                    <button
                      key={pg}
                      onClick={() => setPage(pg)}
                      className={`w-6 h-6 rounded text-xs font-medium transition-colors ${
                        page === pg
                          ? 'bg-[#024E82] text-white'
                          : 'hover:bg-[var(--color-primary-soft)] text-slate-700'
                      }`}
                    >
                      {pg}
                    </button>
                  ))
                )}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || filteredProducts.length === 0}
                  className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Ghi chú chân trang theo Figma */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>⚑</span>
            <span>Chọn tên sản phẩm hoặc biểu tượng mắt để xem chi tiết.</span>
          </div>
        </>
      )}

      {/* MODAL MỤC 51: XÁC NHẬN XÓA KHI CHƯA THAM CHIẾU (ẢNH 86) */}
      {deleteProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-red-50 text-red-400 flex items-center justify-center">
              <Trash2 className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Bạn có chắc chắn muốn xóa sản phẩm này?</h3>
              <p className="text-xs text-slate-500 mt-1">
                Thao tác này sẽ xóa thông tin sản phẩm khỏi danh sách và không thể hoàn tác.
              </p>
            </div>

            <div className="w-full bg-slate-50 p-4 rounded-xl text-left space-y-1">
              <p className="font-bold text-slate-900 text-sm">{deleteProduct.name}</p>
              <p className="text-xs text-slate-500 font-mono">Mã vạch: {deleteProduct.barcode}</p>
              <p className="text-xs text-slate-500">
                Tồn kho: {deleteProduct.stock_quantity} {deleteProduct.unit} · Chưa được tham chiếu bởi đơn hàng
              </p>
            </div>

            <div className="w-full bg-red-50 text-[#E12B2B] text-xs p-3 rounded-lg text-left">
              Chỉ có thể xóa sản phẩm chưa được tham chiếu bởi bất kỳ đơn hàng nào trong hệ thống.
            </div>

            <div className="w-full flex justify-end gap-3 pt-2">
              <button
                onClick={() => setDeleteProduct(null)}
                className="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-lg transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteProduct.barcode)}
                disabled={deleteMutation.isPending}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Đang xóa...' : 'Đồng ý'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL MỤC 52: CHẶN XÓA KHI ĐÃ CÓ ĐƠN HÀNG THAM CHIẾU (ẢNH 87) */}
      {referencedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full border border-red-200 flex items-center justify-center text-red-500 mb-4">
              <X className="w-8 h-8 stroke-[2.5]" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Không thể xóa sản phẩm này</h3>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mb-6">
              {referencedProduct.product.name} · Mã vạch: {referencedProduct.product.barcode} · Tồn kho: {referencedProduct.product.stock_quantity} {referencedProduct.product.unit}. Sản phẩm đã được tham chiếu bởi đơn hàng {referencedProduct.invoiceCode} nên không thể xóa. Dữ liệu được giữ nguyên.
            </p>
            <div className="w-full flex justify-end">
              <button
                onClick={() => setReferencedProduct(null)}
                className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
