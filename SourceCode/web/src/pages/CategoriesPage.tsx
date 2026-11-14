import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Category, Product } from '../types';
import { formatVND, generateCode } from '../utils/format';
import {
  Folder,
  Copy,
  Plus,
  Edit2,
  Trash2,
  Search,
  Eye,
  ArrowLeft,
  Lock,
  Layers,
  SearchX,
  X,
  AlertCircle,
  Check,
  ShieldAlert,
  CupSoda,
  Cookie,
  Milk,
  Utensils,
  Package,
  Home,
  Sparkles,
  Calendar,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorState } from '../components/common/ErrorState';

type PageMode = 'list' | 'detail';

const getCategoryIcon = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes('uống') || n.includes('nước') || n.includes('giải khát')) {
    return <CupSoda className="w-4 h-4 text-blue-600" />;
  }
  if (n.includes('bánh') || n.includes('kẹo') || n.includes('snack')) {
    return <Cookie className="w-4 h-4 text-blue-600" />;
  }
  if (n.includes('sữa')) {
    return <Milk className="w-4 h-4 text-blue-600" />;
  }
  if (n.includes('gia vị') || n.includes('nấu ăn')) {
    return <Utensils className="w-4 h-4 text-blue-600" />;
  }
  if (n.includes('khô') || n.includes('mì') || n.includes('gói') || n.includes('thực phẩm')) {
    return <Package className="w-4 h-4 text-blue-600" />;
  }
  if (n.includes('gia đình') || n.includes('chăm sóc') || n.includes('tẩy rửa')) {
    return <Home className="w-4 h-4 text-blue-600" />;
  }
  if (n.includes('cá nhân') || n.includes('mỹ phẩm') || n.includes('đồ dùng')) {
    return <Sparkles className="w-4 h-4 text-blue-600" />;
  }
  if (n.includes('mùa') || n.includes('tết') || n.includes('lễ')) {
    return <Calendar className="w-4 h-4 text-blue-600" />;
  }
  return <Folder className="w-4 h-4 text-blue-600" />;
};

export const CategoriesPage: React.FC = () => {
  const [mode, setMode] = useState<PageMode>('list');
  const [search, setSearch] = useState('');
  const [detailCategory, setDetailCategory] = useState<Category | null>(null);

  // Form Modal state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState<'empty' | 'duplicate' | null>(null);

  // Delete Modals
  const [deleteConfirmCat, setDeleteConfirmCat] = useState<Category | null>(null);
  const [deleteBlockedCat, setDeleteBlockedCat] = useState<{ cat: Category; productCount: number } | null>(null);

  // Success Modal (Mục 9, 10, 13)
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { isOwner } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: categories = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.categories.list(),
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.products.list(),
  });

  const openCreateModal = () => {
    setEditingCategory(null);
    setCode(generateCode('category', categories.map((c) => c.code)));
    setName('');
    setDescription('');
    setNameError(null);
    setIsFormModalOpen(true);
  };

  const openEditModal = (cat: Category) => {
    setEditingCategory(cat);
    setCode(cat.code);
    setName(cat.name);
    setDescription(cat.description || '');
    setNameError(null);
    setIsFormModalOpen(true);
  };

  const handleViewDetail = (cat: Category) => {
    setDetailCategory(cat);
    setMode('detail');
  };

  const handleBackToList = () => {
    setDetailCategory(null);
    setMode('list');
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('empty');
      return;
    }

    // Kiểm tra trùng tên danh mục (không phân biệt hoa thường, bỏ khoảng trắng thừa)
    const normalized = trimmed.toLowerCase();
    const isDuplicate = categories.some(
      (c) => c.name.trim().toLowerCase() === normalized && c.id !== editingCategory?.id
    );

    if (isDuplicate) {
      setNameError('duplicate');
      return;
    }

    setNameError(null);
    saveMutation.mutate();
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (editingCategory) {
        return api.categories.update(editingCategory.id, {
          name: trimmed,
          description: description.trim(),
        });
      } else {
        return api.categories.create({
          name: trimmed,
          description: description.trim(),
        });
      }
    },
    onSuccess: () => {
      setIsFormModalOpen(false);
      setSuccessMessage(
        editingCategory
          ? 'Cập nhật danh mục sản phẩm thành công'
          : 'Tạo danh mục sản phẩm thành công'
      );
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err: any) => {
      if (err.message && err.message.toLowerCase().includes('tồn tại')) {
        setNameError('duplicate');
      }
    },
  });

  const handleDeleteClick = (cat: Category) => {
    const productCount = products.filter((p) => p.category_id === cat.id).length;
    if (productCount > 0) {
      setDeleteBlockedCat({ cat, productCount });
    } else {
      setDeleteConfirmCat(cat);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.categories.delete(id),
    onSuccess: () => {
      setDeleteConfirmCat(null);
      setSuccessMessage('Đã xóa danh mục thành công');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const filteredCategories = categories.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.code.toLowerCase().includes(search.toLowerCase())
  );

  // ─── MÀN HÌNH CHI TIẾT DANH MỤC ───────────────────────────────────────────
  if (mode === 'detail' && detailCategory) {
    const catProducts = products.filter((p) => p.category_id === detailCategory.id);

    return (
      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
        <button
          onClick={handleBackToList}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-semibold rounded-xl text-sm shadow-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Về danh mục sản phẩm
        </button>

        <div>
          <h1 className="text-3xl font-black text-[var(--color-primary)]">
            {detailCategory.name}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Thông tin danh mục và các sản phẩm liên kết.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-800">Thông tin danh mục</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <p className="text-xs text-slate-500 mb-1">Mã danh mục</p>
              <p className="font-mono text-slate-700 text-lg">{detailCategory.code}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Tên danh mục</p>
              <p className="font-bold text-slate-900 text-lg flex items-center gap-2">
                {getCategoryIcon(detailCategory.name)}
                <span>{detailCategory.name}</span>
              </p>
            </div>
            {detailCategory.description && (
              <div className="sm:col-span-2">
                <p className="text-xs text-slate-500 mb-1">Mô tả</p>
                <p className="text-slate-700">{detailCategory.description}</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800">Sản phẩm thuộc danh mục</h2>
            <span className="text-sm text-slate-500">
              Tất cả {catProducts.length} sản phẩm
            </span>
          </div>

          {catProducts.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Layers className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              <p className="text-sm">Chưa có sản phẩm nào thuộc danh mục này.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-xs">
                  <tr>
                    <th className="py-3 px-6">MÃ VẠCH</th>
                    <th className="py-3 px-6">TÊN SẢN PHẨM</th>
                    <th className="py-3 px-6">ĐƠN VỊ</th>
                    <th className="py-3 px-6 text-right">GIÁ BÁN</th>
                    <th className="py-3 px-6 text-center">TỒN KHO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {catProducts.map((p) => (
                    <tr key={p.barcode} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-6 font-mono text-xs text-slate-500">{p.barcode}</td>
                      <td className="py-3.5 px-6 font-medium text-slate-900">{p.name}</td>
                      <td className="py-3.5 px-6 text-slate-500">{p.unit}</td>
                      <td className="py-3.5 px-6 text-right font-semibold text-slate-800">
                        {formatVND(p.selling_price)}
                      </td>
                      <td className="py-3.5 px-6 text-center font-bold text-slate-700">
                        {p.stock_quantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── MÀN HÌNH DANH SÁCH DANH MỤC ───────────────────────────────────────────
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-primary)] tracking-tight">
            Danh mục sản phẩm
          </h1>
        </div>
        {isOwner && (
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-bold rounded-xl shadow-xs text-sm"
          >
            <Plus className="w-4 h-4" />
            Tạo danh mục
          </button>
        )}
      </div>

      {/* Thẻ Tổng danh mục (Mục 1 - image2: icon 2 hình chữ nhật lồng nhau) */}
      <div className="w-full sm:w-64 bg-white p-4 rounded-xl border border-slate-200 flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
          <Copy className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs text-slate-500 font-semibold">Tổng danh mục</p>
          <p className="text-xl font-black text-slate-900 mt-0.5">
            {categories.length} <span className="text-sm font-semibold text-slate-500">danh mục</span>
          </p>
        </div>
      </div>

      {/* Thanh tìm kiếm (Mục 2 - image4: tỉ lệ cân đối, nút tìm kiếm bên cạnh) */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm kiếm theo tên danh mục..."
              className="w-full pl-10 pr-8 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-[var(--color-primary)]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            className="px-5 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-xl text-xs font-bold shrink-0 shadow-2xs"
          >
            Tìm kiếm
          </button>
        </div>
        <span className="text-xs font-semibold text-slate-500 shrink-0">
          {search ? 'Kết quả tìm kiếm' : 'Tất cả danh mục'}
        </span>
      </div>

      {isLoading && <LoadingSpinner message="Đang tải danh mục..." />}
      {isError && (
        <ErrorState
          title="Lỗi kết nối CSDL"
          message={(error as Error)?.message}
          onRetry={refetch}
        />
      )}

      {/* Bảng Danh mục & Trạng thái trống (Mục 3 & Mục 5) */}
      {!isLoading && !isError && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs md:text-sm">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-xs border-b border-slate-100">
                <tr>
                  <th className="py-3 px-6">MÃ DANH MỤC</th>
                  <th className="py-3 px-6">TÊN DANH MỤC</th>
                  <th className="py-3 px-6 text-center">SỐ LƯỢNG SẢN PHẨM</th>
                  <th className="py-3 px-6 text-center">THAO TÁC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCategories.length === 0 ? (
                  /* Tìm không thấy danh mục (Mục 5 - image9) */
                  <tr>
                    <td colSpan={4} className="py-16 text-center">
                      <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center text-red-500 mx-auto mb-3">
                        <SearchX className="w-7 h-7" />
                      </div>
                      <p className="font-bold text-slate-800 text-base">
                        Không tìm thấy danh mục phù hợp
                      </p>
                      <button
                        onClick={() => setSearch('')}
                        className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl shadow-2xs transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        Xóa tìm kiếm
                      </button>
                    </td>
                  </tr>
                ) : (
                  filteredCategories.map((cat) => {
                    const count = products.filter((p) => p.category_id === cat.id).length;
                    const isZero = count === 0;
                    return (
                      <tr key={cat.id} className="hover:bg-slate-50/60 transition-colors">
                        {/* Mục 3 - image6: Mã font thường text-slate-500 */}
                        <td className="py-3.5 px-6 font-mono text-slate-500 text-sm">
                          {cat.code}
                        </td>

                        {/* Mục 3 - image6: Tên có icon tương ứng */}
                        <td className="py-3.5 px-6">
                          <button
                            onClick={() => handleViewDetail(cat)}
                            className="font-bold text-slate-900 hover:text-[var(--color-primary)] text-left transition-colors inline-flex items-center gap-2"
                          >
                            {getCategoryIcon(cat.name)}
                            <span>{cat.name}</span>
                          </button>
                        </td>

                        <td className="py-3.5 px-6 text-center">
                          <span
                            className={`inline-block text-xs font-bold px-3 py-1 rounded-full ${
                              isZero
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-primary-soft text-[var(--color-primary)]'
                            }`}
                          >
                            {count} sản phẩm
                          </span>
                        </td>

                        <td className="py-3.5 px-6 text-center">
                          <div className="flex items-center justify-center gap-3">
                            <button
                              onClick={() => handleViewDetail(cat)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)] hover:underline"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Xem</span>
                            </button>

                            {/* Sửa / Xóa: CHỈ DÀNH CHO CHỦ */}
                            {isOwner && (
                              <>
                                <button
                                  onClick={() => openEditModal(cat)}
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-[var(--color-primary)]"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                  <span>Sửa</span>
                                </button>
                                <button
                                  onClick={() => handleDeleteClick(cat)}
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Xóa</span>
                                </button>
                              </>
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
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* MODAL TẠO / SỬA DANH MỤC (Mục 6, 7, 8 - image11, 12, 14) */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 relative animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <h2 className="text-lg font-bold text-slate-900">
                {editingCategory ? 'Sửa thông tin danh mục' : 'Tạo thông tin danh mục mới'}
              </h2>
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} noValidate className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mã danh mục
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={editingCategory ? editingCategory.code : 'Tự động sinh'}
                    readOnly
                    disabled
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 font-mono text-sm bg-slate-50 text-slate-400 cursor-not-allowed pr-9"
                  />
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3.5" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tên danh mục *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameError(null);
                  }}
                  placeholder="Nhập tên danh mục"
                  className={`w-full px-3 py-2.5 rounded-lg border text-sm outline-none transition-colors ${
                    nameError ? 'border-red-500 bg-red-50/20' : 'border-slate-200 focus:border-blue-600'
                  }`}
                />
                {/* Thông báo lỗi validation dưới ô Tên danh mục (Mục 7 & 8) */}
                {nameError === 'empty' && (
                  <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Tên danh mục không được để trống, vui lòng nhập lại</span>
                  </p>
                )}
                {nameError === 'duplicate' && (
                  <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Tên danh mục đã tồn tại, vui lòng nhập tên khác</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mô tả (tùy chọn)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Nhập mô tả cho danh mục (không bắt buộc)"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:border-blue-600 outline-none"
                />
              </div>

              {/* Nút Hủy và Lưu ở góc dưới bên phải (Mục 6 - image11) */}
              <div className="pt-3 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-sm transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="px-6 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-bold rounded-xl text-sm shadow-xs transition-colors"
                >
                  {saveMutation.isPending ? 'Đang lưu...' : 'Lưu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* MODAL XÁC NHẬN XÓA DANH MỤC (Mục 11 - image18) */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      {deleteConfirmCat && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 text-center relative animate-in fade-in zoom-in-95">
            <button
              type="button"
              onClick={() => setDeleteConfirmCat(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 mx-auto mb-3">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Xác nhận xóa danh mục?</h3>
            <p className="text-sm font-semibold text-red-600 py-3">
              Bạn có chắc chắn muốn xóa danh mục này?
            </p>
            <div className="flex gap-3 justify-center pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmCat(null)}
                className="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-sm"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(deleteConfirmCat.id)}
                disabled={deleteMutation.isPending}
                className="px-6 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-bold rounded-xl text-sm shadow-sm"
              >
                {deleteMutation.isPending ? 'Đang xóa...' : 'Đồng ý'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* MODAL KHÔNG THỂ XÓA KHI CÒN SẢN PHẨM (Mục 12 - image19) */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      {deleteBlockedCat && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 relative animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2 text-amber-600">
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Không thể xóa danh mục</h3>
              </div>
              <button
                type="button"
                onClick={() => setDeleteBlockedCat(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-sm">
                    {deleteBlockedCat.cat.name}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                    {deleteBlockedCat.productCount} sản phẩm
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 font-mono">
                  Mã danh mục: {deleteBlockedCat.cat.code}
                </p>
              </div>

              <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Danh mục đang chứa sản phẩm, vui lòng di chuyển sản phẩm sang danh mục khác trước khi xóa.
                </span>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteBlockedCat(null)}
                  className="px-6 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-sm shadow-2xs"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* MODAL THÔNG BÁO THÀNH CÔNG (Mục 9, 10, 13 - image15, 16, 20) */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      {successMessage && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 text-center relative animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4 text-left">
              <h3 className="text-base font-bold text-slate-900">Thông báo thành công</h3>
              <button
                type="button"
                onClick={() => setSuccessMessage(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-2">
              <div className="w-20 h-20 rounded-full border-2 border-emerald-500 text-emerald-500 flex items-center justify-center mx-auto mb-4">
                <Check className="w-10 h-10" />
              </div>
              <p className="font-bold text-slate-800 text-base mb-6">
                {successMessage}
              </p>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSuccessMessage(null)}
                className="px-6 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-bold rounded-xl text-sm shadow-xs transition-colors"
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
