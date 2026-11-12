import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { StoreSettings } from '../types';
import { Save, Store, QrCode } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorState } from '../components/common/ErrorState';

export const SettingsPage: React.FC = () => {
  const { showSuccess, showError } = useToast();
  const queryClient = useQueryClient();

  const {
    data: settings,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['store-settings'],
    queryFn: () => api.storeSettings.get(),
  });

  const [storeName, setStoreName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankAccountHolder, setBankAccountHolder] = useState('');

  useEffect(() => {
    if (settings) {
      setStoreName(settings.store_name);
      setAddress(settings.address);
      setPhone(settings.phone);
      setBankName(settings.bank_name);
      setBankAccountNumber(settings.bank_account_number);
      setBankAccountHolder(settings.bank_account_holder);
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: (updated: StoreSettings) => api.storeSettings.update(updated),
    onSuccess: () => {
      showSuccess('Cập nhật cấu hình cửa hàng thành công!');
      queryClient.invalidateQueries({ queryKey: ['store-settings'] });
    },
    onError: (err: any) => showError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      store_name: storeName.trim(),
      address: address.trim(),
      phone: phone.trim(),
      bank_name: bankName.trim(),
      bank_account_number: bankAccountNumber.trim(),
      bank_account_holder: bankAccountHolder.trim().toUpperCase(),
    });
  };

  if (isLoading) return <LoadingSpinner message="Đang tải cấu hình..." />;
  if (isError) return <ErrorState title="Lỗi tải cấu hình" message={(error as Error)?.message} onRetry={refetch} />;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-primary)]">Cấu hình cửa hàng</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Thông tin hiển thị trên hóa đơn in nhiệt và tài khoản nhận tiền chuyển khoản VietQR.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Phần 1: Thông tin in hóa đơn */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Store className="w-5 h-5 text-[var(--color-primary)]" />
            Thông tin cửa hàng in trên hóa đơn
          </h2>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Tên cửa hàng *
            </label>
            <input
              type="text"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Địa chỉ cửa hàng *
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Số điện thoại liên hệ *
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
              required
            />
          </div>
        </div>

        {/* Phần 2: Tài khoản nhận tiền VietQR */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <QrCode className="w-5 h-5 text-[var(--color-primary)]" />
            Tài khoản ngân hàng tạo mã VietQR động
          </h2>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Ngân hàng thụ hưởng *
            </label>
            <input
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="VD: MBBank, Vietcombank, Techcombank, BIDV..."
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[var(--color-primary)]"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Số tài khoản ngân hàng *
              </label>
              <input
                type="text"
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
                placeholder="VD: 0905123456"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm font-mono font-bold focus:outline-none focus:border-[var(--color-primary)]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Tên chủ tài khoản (Viết hoa không dấu) *
              </label>
              <input
                type="text"
                value={bankAccountHolder}
                onChange={(e) => setBankAccountHolder(e.target.value)}
                placeholder="VD: NGUYEN THI HANG"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm font-bold uppercase focus:outline-none focus:border-[var(--color-primary)]"
                required
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={updateMutation.isPending}
          className="w-full sm:w-auto px-8 py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-70"
        >
          <Save className="w-4 h-4" />
          <span>{updateMutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}</span>
        </button>
      </form>
    </div>
  );
};
