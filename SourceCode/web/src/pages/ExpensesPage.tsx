import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Expense } from '../types';
import { formatVND, formatDate } from '../utils/format';
import { Plus, Trash2, Calendar, FileText, AlertCircle } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { Modal } from '../components/common/Modal';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';

export const ExpensesPage: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteExpId, setDeleteExpId] = useState<string | null>(null);

  const [category, setCategory] = useState<'rent' | 'electricity' | 'salary' | 'other'>('electricity');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  const { showSuccess, showError } = useToast();
  const queryClient = useQueryClient();

  const {
    data: expenses = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['expenses'],
    queryFn: () => api.expenses.list(),
  });

  const openCreateModal = () => {
    setCategory('electricity');
    setAmount('');
    setNotes('');
    setIsModalOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: () => {
      const parsedAmount = Number(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new Error('Số tiền chi phí không hợp lệ.');
      }
      return api.expenses.create({
        expense_date: new Date().toISOString(),
        category,
        amount: parsedAmount,
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: () => {
      showSuccess('Ghi nhận chi phí phát sinh thành công!');
      setIsModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['monthly-report'] });
    },
    onError: (err: any) => showError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.expenses.delete(id),
    onSuccess: () => {
      showSuccess('Đã xóa chi phí thành công!');
      setDeleteExpId(null);
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['monthly-report'] });
    },
    onError: (err: any) => showError(err.message),
  });

  const categoryLabelMap = {
    rent: 'Mặt bằng',
    electricity: 'Điện & Nước',
    salary: 'Lương nhân viên',
    other: 'Chi phí khác',
  };

  const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-primary)]">Quản lý chi phí phát sinh</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Ghi nhận tiền mặt bằng, tiền điện, lương... để tự động khấu trừ vào lợi nhuận thực tế theo tháng.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium rounded-lg text-sm shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Thêm khoản chi mới
        </button>
      </div>

      {/* Thẻ tóm tắt */}
      <div className="bg-[var(--color-primary-soft)] rounded-2xl border border-[var(--border)] p-5 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-600 font-medium">Tổng chi phí đã ghi nhận</p>
          <p className="text-3xl font-black text-[var(--color-primary)] mt-1">{formatVND(totalExpense)}</p>
          <p className="text-[11px] text-slate-500 mt-1">Được tự động tính vào báo cáo lợi nhuận tháng</p>
        </div>
        <FileText className="w-10 h-10 text-primary" />
      </div>

      {isLoading && <LoadingSpinner message="Đang tải chi phí..." />}
      {isError && (
        <ErrorState
          title="Không tải được chi phí"
          message={(error as Error)?.message}
          onRetry={refetch}
        />
      )}

      {!isLoading && !isError && expenses.length === 0 && (
        <EmptyState
          title="Chưa có khoản chi phí nào"
          description="Ghi nhận các chi phí phát sinh để tính lợi nhuận ròng của cửa hàng."
          actionText="Thêm chi phí ngay"
          onAction={openCreateModal}
        />
      )}

      {!isLoading && !isError && expenses.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 text-sm">Danh sách các khoản chi</h2>
            <span className="text-xs text-slate-400">{expenses.length} khoản chi</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-medium">
                <tr>
                  <th className="py-3 px-4">Ngày ghi nhận</th>
                  <th className="py-3 px-4">Khoản mục</th>
                  <th className="py-3 px-4">Ghi chú diễn giải</th>
                  <th className="py-3 px-4 text-right">Số tiền</th>
                  <th className="py-3 px-4 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4 text-slate-600 text-xs font-mono">
                      {formatDate(e.expense_date)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-block px-2.5 py-0.5 rounded-full bg-primary-soft text-[var(--color-primary)] text-xs font-semibold">
                        {categoryLabelMap[e.category] || e.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 text-xs">{e.notes || '—'}</td>
                    <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                      {formatVND(e.amount)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => setDeleteExpId(e.id)}
                        className="inline-flex items-center gap-1 text-xs text-danger hover:underline"
                        title="Xóa khoản chi"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Xóa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL THÊM KHOẢN CHI */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Thêm khoản chi phí mới"
        maxWidth="sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Loại chi phí *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as any)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)] bg-white"
            >
              <option value="electricity">Tiền điện & Nước</option>
              <option value="rent">Tiền thuê mặt bằng</option>
              <option value="salary">Tiền lương nhân viên</option>
              <option value="other">Chi phí khác</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Số tiền (VND) *
            </label>
            <input
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="VD: 680000"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold focus:outline-none focus:border-[var(--color-primary)]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Ghi chú diễn giải
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="VD: Tiền điện tủ mát và bóng đèn tháng 10/2026..."
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
              disabled={createMutation.isPending}
              className="flex-1 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium rounded-lg text-sm shadow-sm disabled:opacity-70"
            >
              {createMutation.isPending ? 'Đang lưu...' : 'Lưu khoản chi'}
            </button>
          </div>
        </form>
      </Modal>

      {/* CONFIRM XÓA */}
      <ConfirmModal
        isOpen={!!deleteExpId}
        onClose={() => setDeleteExpId(null)}
        onConfirm={() => deleteExpId && deleteMutation.mutate(deleteExpId)}
        title="Xác nhận xóa khoản chi?"
        message="Khoản chi sẽ bị xóa khỏi hệ thống và số liệu lợi nhuận tháng sẽ được cập nhật lại."
        confirmText="Xóa khoản chi"
        type="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
};
