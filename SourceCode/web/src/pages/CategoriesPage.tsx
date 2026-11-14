import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Category, Product } from '../types';
import { formatVND, generateCode } from '../utils/format';
import {
  FolderTree,
  Plus,
  Edit2,
  Trash2,
  Search,
  Eye,
  ArrowLeft,
  Lock,
  Layers,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Modal } from '../components/common/Modal';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';

type PageMode = 'list' | 'detail';

export const CategoriesPage: React.FC = () => {
  const [mode, setMode] = useState<PageMode>('list');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [detailCategory, setDetailCategory] = useState<Category | null>(null);
  const [deleteCatId, setDeleteCatId] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const { isOwner } = useAuth();
  const { showSuccess, showError } = useToast();
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
    setCode(generateCode('category', categories.map((category) => category.code)));
    setName('');
    setDescription('');
    setIsModalOpen(true);
  };

  const openEditModal = (cat: Category) => {
    setEditingCategory(cat);
    setCode(cat.code);
    setName(cat.name);
    setDescription(cat.description || '');
    setIsModalOpen(true);
  };

  const handleViewDetail = (cat: Category) => {
    setDetailCategory(cat);
    setMode('detail');
  };

  const handleBackToList = () => {
    setDetailCategory(null);
    setMode('list');
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Vui lòng nhập tên danh mục.');
      if (editingCategory) {
        return api.categories.update(editingCategory.id, {
          name: name.trim(),
          description: description.trim(),
        });
      } else {
        return api.categories.create({
          name: name.trim(),
          description: description.trim(),
        });
      }
    },
    onSuccess: () => {
      showSuccess(editingCategory ? 'Cập nhật danh mục thành công!' : 'Tạo danh mục mới thành công!');
      setIsModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err: any) => showError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.categories.delete(id),
    onSuccess: () => {
      showSuccess('Đã xóa danh mục thành công!');
      setDeleteCatId(null);
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (err: any) => showError(err.message),
  });

  const filteredCategories = categories.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.code.toLowerCase().includes(search.toLowerCase())
  );

  // ─── MÀN HÌNH CHI TIẾT DANH MỤC (Figma "2. Xem Chi tiết Danh mục") ─────────
  if (mode === 'detail' && detailCategory) {
    const catProducts = products.filter((p) => p.category_id === detailCategory.id);

    return (
      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
        {/* Nút Về danh mục sản phẩm */}
        <button
          onClick={handleBackToList}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-semibold rounded-xl text-sm shadow-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Về danh mục sản phẩm
        </button>

        {/* Tiêu đề danh mục */}
        <div>
          <h1 className="text-3xl font-black text-[var(--color-primary)]">{detailCategory.name}</h1>
          <p className="text-sm text-slate-500 mt-1">Thông tin danh mục và các sản phẩm liên kết.</p>
        </div>

        {/* Card thông tin danh mục */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-800">Thông tin danh mục</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <p className="text-xs text-slate-500 mb-1">Mã danh mục</p>
              <p className="font-black text-slate-900 text-lg font-mono">{detailCategory.code}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Tên danh mục</p>
              <p className="font-black text-slate-900 text-lg">{detailCategory.name}</p>
            </div>
            {detailCategory.description && (
              <div className="sm:col-span-2">
                <p className="text-xs text-slate-500 mb-1">Mô tả</p>
                <p className="text-slate-700">{detailCategory.description}</p>
              </div>
            )}
          </div>
        </div>

        {/* Bảng sản phẩm thuộc danh mục */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800">Sản phẩm thuộc danh mục</h2>
            <span className="text-sm text-slate-500">Tất cả {catProducts.length} sản phẩm</span>
          </div>

          {catProducts.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Layers className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              <p className="text-sm">Chưa có sản phẩm nào thuộc danh mục này.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="ui-table w-full text-left text-sm">
                <thead className="bg-[var(--surface-muted)] text-slate-500 uppercase font-semibold text-xs">
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
      {/* Header chuẩn Figma */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-primary)] tracking-tight">Danh mục sản phẩm</h1>
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

      {/* Thẻ Tổng danh mục */}
      <div className="w-full sm:w-64 bg-white p-4 rounded-xl border border-slate-200 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-soft text-[var(--color-primary)] flex items-center justify-center shrink-0">
          <FolderTree className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs text-slate-500 font-semibold">Tổng danh mục</p>
          <p className="text-xl font-black text-slate-900 mt-0.5">
            {categories.length} <span className="text-sm font-semibold text-slate-500">danh mục</span>
          </p>
        </div>
      </div>

      {/* Thanh tìm kiếm */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex-1 flex gap-2 w-full">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm kiếm theo tên danh mục..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-[var(--color-primary)]"
            />
          </div>
          <button
            type="button"
            className="px-5 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-xl text-xs font-bold shrink-0"
          >
            Tìm kiếm
          </button>
        </div>
        <span className="text-xs font-semibold text-slate-500 shrink-0">Tất cả danh mục</span>
      </div>

      {isLoading && <LoadingSpinner message="Đang tải danh mục..." />}
      {isError && (
        <ErrorState
          title="Lỗi kết nối CSDL"
          message={(error as Error)?.message}
          onRetry={refetch}
        />
      )}

      {!isLoading && !isError && filteredCategories.length === 0 && (
        <EmptyState
          title="Không tìm thấy danh mục"
          description="Chưa có danh mục nào phù hợp với từ khóa tìm kiếm."
          actionText={isOwner ? 'Tạo danh mục ngay' : undefined}
          onAction={isOwner ? openCreateModal : undefined}
        />
      )}

      {/* Bảng Danh mục */}
      {!isLoading && !isError && filteredCategories.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="ui-table w-full text-left text-xs md:text-sm">
              <thead className="bg-[var(--surface-muted)] text-slate-500 uppercase font-semibold text-xs">
                <tr>
                  <th className="py-3 px-6">MÃ DANH MỤC</th>
                  <th className="py-3 px-6">TÊN DANH MỤC</th>
                  <th className="py-3 px-6 text-center">SỐ LƯỢNG SẢN PHẨM</th>
                  <th className="py-3 px-6 text-center">THAO TÁC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCategories.map((cat) => {
                  const count = products.filter((p) => p.category_id === cat.id).length;
                  const isZero = count === 0;
                  return (
                    <tr key={cat.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-6 font-mono font-bold text-slate-700">{cat.code}</td>
                      <td className="py-3.5 px-6">
                        <button
                          onClick={() => handleViewDetail(cat)}
                          className="font-bold text-slate-900 hover:text-[var(--color-primary)] text-left transition-colors"
                        >
                          {cat.name}
                        </button>
                      </td>
                      <td className="py-3.5 px-6 text-center">
                        <span
                          className={`inline-block text-xs font-bold px-3 py-1 rounded-full ${
                            isZero
                              ? 'bg-primary-soft text-primary'
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

                          {/* Sửa / Xóa: CHỈ DÀNH CHO CHỦ (SPEC Mục 8) */}
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
                                onClick={() => setDeleteCatId(cat.id)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-danger hover:underline"
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
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL TẠO / SỬA DANH MỤC (giữ popup theo Figma) */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCategory ? 'Sửa danh mục' : 'Tạo thông tin danh mục mới'}
        maxWidth="lg"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
          className="space-y-5"
        >
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Mã danh mục</label>
            <div className="relative">
              <input
                type="text"
                value={editingCategory ? editingCategory.code : 'Tự động sinh'}
                readOnly
                disabled
                className="w-full px-3 py-2.5 rounded-md border border-slate-200 font-mono text-sm bg-slate-50 text-slate-500 cursor-not-allowed pr-9"
              />
              <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Tên danh mục *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nhập tên danh mục"
              className="w-full px-3 py-2.5 rounded-md border border-slate-200 text-sm focus:outline-hidden focus:border-[var(--color-primary)]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Mô tả (tùy chọn)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Nhập mô tả cho danh mục (không bắt buộc)"
              className="w-full px-3 py-2.5 rounded-md border border-slate-200 text-sm focus:outline-hidden focus:border-[var(--color-primary)]"
            />
          </div>

          <div className="pt-3 flex gap-3">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="flex-1 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-sm"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="flex-1 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-bold rounded-xl text-sm shadow-xs"
            >
              {saveMutation.isPending ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
        </form>
      </Modal>

      {/* CONFIRM XÓA DANH MỤC */}
      <ConfirmModal
        isOpen={!!deleteCatId}
        onClose={() => setDeleteCatId(null)}
        onConfirm={() => deleteCatId && deleteMutation.mutate(deleteCatId)}
        title="Xác nhận xóa thông tin danh mục?"
        message="Hệ thống chỉ cho phép xóa nếu không còn sản phẩm nào thuộc danh mục này. Nếu danh mục còn sản phẩm, thao tác sẽ bị chặn."
        confirmText="Xóa danh mục"
        type="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
};
