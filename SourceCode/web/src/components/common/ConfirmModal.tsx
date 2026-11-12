import React from 'react';
import { AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react';
import { Modal } from './Modal';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'success' | 'info';
  isLoading?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy bỏ',
  type = 'danger',
  isLoading = false,
}) => {
  const iconMap = {
    danger: <XCircle className="w-8 h-8 text-danger" />,
    warning: <AlertTriangle className="w-8 h-8 text-primary" />,
    success: <CheckCircle className="w-8 h-8 text-primary" />,
    info: <Info className="w-8 h-8 text-primary" />,
  };

  const buttonStyleMap = {
    danger: 'bg-danger hover:bg-[var(--color-danger-hover)] active:bg-[var(--color-danger-hover)] text-white',
    warning: 'bg-primary hover:bg-[var(--color-primary-hover)] active:bg-[var(--color-primary-hover)] text-white',
    success: 'bg-primary hover:bg-[var(--color-primary-hover)] active:bg-[var(--color-primary-hover)] text-white',
    info: 'bg-primary hover:bg-[var(--color-primary-hover)] active:bg-[var(--color-primary-hover)] text-white',
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="sm">
      <div className="flex flex-col items-center text-center">
        <div className="mb-4">{iconMap[type]}</div>
        <p className="text-slate-600 text-sm leading-relaxed mb-6">{message}</p>
        <div className="flex items-center gap-3 w-full">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="ui-button ui-button-secondary flex-1 text-sm disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
            }}
            disabled={isLoading}
            className={`ui-button flex-1 shadow-xs disabled:opacity-50 ${buttonStyleMap[type]}`}
          >
            {isLoading ? 'Đang xử lý...' : confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
};
