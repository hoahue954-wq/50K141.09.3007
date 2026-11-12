import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { UserProfile } from '../types';
import { UserCheck, Plus, Lock, Unlock, Shield, User } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { Modal } from '../components/common/Modal';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorState } from '../components/common/ErrorState';

export const AccountsPage: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toggleUserId, setToggleUserId] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');

  const { showSuccess, showError } = useToast();
  const queryClient = useQueryClient();

  const {
    data: accounts = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.accounts.list(),
  });

  const openCreateModal = () => {
    setUsername('');
    setFullName('');
    setIsModalOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: () => {
      if (!username.trim()) throw new Error('Vui lòng nhập tên đăng nhập.');
      if (!fullName.trim()) throw new Error('Vui lòng nhập họ tên nhân viên.');

      const cleanUsername = username.includes('@')
        ? username.trim()
        : `${username.trim()}@taphoahang.local`;

      return api.accounts.create({
        username: cleanUsername,
        full_name: fullName.trim(),
        role: 'staff',
      });
    },
    onSuccess: (acc) => {
      showSuccess(`Đã tạo tài khoản cho nhân viên "${acc.full_name}" thành công!`);
      setIsModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (err: any) => showError(err.message),
  });

  const toggleLockMutation = useMutation({
    mutationFn: (id: string) => api.accounts.toggleLock(id),
    onSuccess: (acc) => {
      showSuccess(
        `Đã ${acc.status === 'locked' ? 'khóa' : 'mở khóa'} tài khoản "${acc.full_name}"!`
      );
      setToggleUserId(null);
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (err: any) => showError(err.message),
  });

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-primary)]">Quản lý tài khoản</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Tạo tài khoản và phân quyền cho nhân viên thu ngân cửa hàng.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium rounded-lg text-sm shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Thêm tài khoản nhân viên
        </button>
      </div>

      {isLoading && <LoadingSpinner message="Đang tải danh sách tài khoản..." />}
      {isError && (
        <ErrorState
          title="Không tải được tài khoản"
          message={(error as Error)?.message}
          onRetry={refetch}
        />
      )}

      {!isLoading && !isError && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 text-sm">Danh sách tài khoản</h2>
            <span className="text-xs text-slate-400">{accounts.length} tài khoản</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-medium">
                <tr>
                  <th className="py-3 px-4">Tên đăng nhập</th>
                  <th className="py-3 px-4">Họ và tên</th>
                  <th className="py-3 px-4 text-center">Vai trò</th>
                  <th className="py-3 px-4 text-center">Trạng thái</th>
                  <th className="py-3 px-4 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map((acc) => {
                  const isOwnerRole = acc.role === 'owner';
                  const isLocked = acc.status === 'locked';
                  return (
                    <tr key={acc.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-[var(--color-primary)] text-xs">
                        {acc.username}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-800">{acc.full_name}</td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                            isOwnerRole
                              ? 'bg-primary-soft text-[var(--color-primary)]'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {isOwnerRole ? <Shield className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                          {isOwnerRole ? 'Chủ' : 'Nhân viên'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                            isLocked
                              ? 'bg-primary-soft text-primary border border-[var(--border)]'
                              : 'bg-primary-soft text-primary border border-[var(--border)]'
                          }`}
                        >
                          {isLocked ? 'Đã khóa' : 'Hoạt động'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {!isOwnerRole ? (
                          <button
                            onClick={() => setToggleUserId(acc.id)}
                            className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                              isLocked
                                ? 'bg-primary-soft text-primary hover:bg-primary-soft'
                                : 'bg-primary-soft text-primary hover:bg-primary-soft'
                            }`}
                          >
                            {isLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                            <span>{isLocked ? 'Mở khóa' : 'Khóa'}</span>
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Mặc định</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL THÊM TÀI KHOẢN NHÂN VIÊN */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Thêm tài khoản nhân viên mới"
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
              Tên đăng nhập *
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="VD: nam, hoa, lan..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)] font-mono"
              required
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Hệ thống tự động: {username ? `${username}@taphoahang.local` : '...'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Họ và tên nhân viên *
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="VD: Nguyễn Văn Nam"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
              required
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
              {createMutation.isPending ? 'Đang tạo...' : 'Tạo tài khoản'}
            </button>
          </div>
        </form>
      </Modal>

      {/* CONFIRM KHÓA / MỞ KHÓA */}
      <ConfirmModal
        isOpen={!!toggleUserId}
        onClose={() => setToggleUserId(null)}
        onConfirm={() => toggleUserId && toggleLockMutation.mutate(toggleUserId)}
        title="Đổi trạng thái tài khoản?"
        message="Khi bị khóa, tài khoản nhân viên sẽ không thể đăng nhập hoặc bán hàng vào hệ thống."
        confirmText="Xác nhận"
        type="warning"
        isLoading={toggleLockMutation.isPending}
      />
    </div>
  );
};
