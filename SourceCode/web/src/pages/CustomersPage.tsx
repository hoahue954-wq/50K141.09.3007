import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Customer } from '../types';
import { formatVND } from '../utils/format';
import { Users, Plus, Search, Phone, Edit2, Trash2, UserCheck, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Modal } from '../components/common/Modal';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';

export const CustomersPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deleteCustId, setDeleteCustId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  const { isOwner } = useAuth();
  const { showSuccess, showError } = useToast();
  const queryClient = useQueryClient();

  const {
    data: customers = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.customers.list(),
  });

  const openCreateModal = () => {
    setEditingCustomer(null);
    setName('');
    setPhone('');
    setNotes('');
    setIsModalOpen(true);
  };

  const openEditModal = (c: Customer) => {
    setEditingCustomer(c);
    setName(c.name);
    setPhone(c.phone || '');
    setNotes(c.notes || '');
    setIsModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Vui lòng nhập tên khách hàng.');
      if (editingCustomer) {
        return api.customers.update(editingCustomer.id, {
          name: name.trim(),
          phone: phone.trim() || undefined,
          notes: notes.trim() || undefined,
        });
      } else {
        return api.customers.create({
          name: name.trim(),
          phone: phone.trim() || undefined,
          type: 'loyal',
          notes: notes.trim() || undefined,
        });
      }
    },
    onSuccess: () => {
      showSuccess(editingCustomer ? 'Cập nhật khách hàng thành công!' : 'Thêm khách quen thành công!');
      setIsModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err: any) => showError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.customers.delete(id),
    onSuccess: () => {
      showSuccess('Đã xóa khách hàng thành công!');
      setDeleteCustId(null);
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err: any) => showError(err.message),
  });

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone && c.phone.includes(search.trim())) ||
      c.code.toLowerCase().includes(search.toLowerCase())
  );

  const totalAllDebt = customers.reduce((sum, c) => sum + c.total_debt, 0);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-primary)]">Khách hàng & Sổ nợ</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Danh sách khách quen, theo dõi công nợ chi tiết từng người để đối soát.
          </p>
        </div>
        {isOwner && (
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium rounded-lg shadow-sm text-sm"
          >
            <Plus className="w-4 h-4" />
            Thêm khách quen mới
          </button>
        )}
      </div>

      {/* 3 Thẻ thống kê công nợ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary-soft flex items-center justify-center">
            <Users className="w-5 h-5 text-[var(--color-primary)]" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Tổng số khách quen</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{customers.length} khách</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary-soft flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Khách đang có nợ</p>
            <p className="text-2xl font-bold text-primary mt-0.5">
              {customers.filter((c) => c.total_debt > 0).length} người
            </p>
          </div>
        </div>

        <div className="bg-[var(--color-primary-soft)] p-5 rounded-2xl border border-[var(--border)] flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-600 font-medium">Tổng nợ phải thu</p>
            <p className="text-2xl font-black text-[var(--color-primary)] mt-0.5">{formatVND(totalAllDebt)}</p>
          </div>
        </div>
      </div>

      {/* Tìm kiếm */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên khách hàng hoặc số điện thoại..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
          />
        </div>
      </div>

      {isLoading && <LoadingSpinner message="Đang tải danh sách khách hàng..." />}
      {isError && (
        <ErrorState
          title="Không tải được khách hàng"
          message={(error as Error)?.message}
          onRetry={refetch}
        />
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <EmptyState
          title="Không tìm thấy khách hàng nào"
          description="Chưa có khách hàng nào phù hợp với từ khóa tìm kiếm."
        />
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <div
              key={c.id}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between hover:border-[var(--color-primary)]/40 transition-colors"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-800">{c.name}</h3>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">{c.code}</p>
                  </div>
                  {isOwner && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(c)}
                        className="p-1 text-slate-400 hover:text-[var(--color-primary)] rounded-lg hover:bg-slate-100"
                        title="Sửa"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteCustId(c.id)}
                        className="p-1 text-slate-400 hover:text-primary rounded-lg hover:bg-primary-soft"
                        title="Xóa"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{c.phone || 'Chưa có số điện thoại'}</span>
                  </div>
                  {c.notes && (
                    <p className="text-slate-500 italic mt-1 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      "{c.notes}"
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">Nợ hiện tại:</span>
                <span
                  className={`text-base font-bold ${
                    c.total_debt > 0 ? 'text-primary' : 'text-primary'
                  }`}
                >
                  {formatVND(c.total_debt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL THÊM / SỬA KHÁCH HÀNG */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCustomer ? 'Sửa thông tin khách hàng' : 'Thêm khách quen mới'}
        maxWidth="sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Họ tên khách *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Cô Lan (Nhà số 30)"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Số điện thoại
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="VD: 0905123456"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Ghi chú địa chỉ / thói quen
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="VD: Nhà ngay đối diện, thường thanh toán vào cuối tháng..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="flex-1 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-lg text-sm"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="flex-1 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium rounded-lg text-sm shadow-sm disabled:opacity-70"
            >
              {saveMutation.isPending ? 'Đang lưu...' : 'Lưu khách hàng'}
            </button>
          </div>
        </form>
      </Modal>

      {/* CONFIRM XÓA */}
      <ConfirmModal
        isOpen={!!deleteCustId}
        onClose={() => setDeleteCustId(null)}
        onConfirm={() => deleteCustId && deleteMutation.mutate(deleteCustId)}
        title="Xác nhận xóa khách hàng?"
        message="Thông tin khách hàng sẽ bị xóa. Hãy đảm bảo khách hàng này không còn nợ trước khi xóa."
        confirmText="Xóa khách"
        type="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
};
