import React, { useRef, useState } from 'react';
import { Paperclip, Trash2 } from 'lucide-react';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

interface EvidenceImageUploadProps {
  value: string;
  fileName: string;
  onChange: (value: string, fileName: string) => void;
  onRemove: () => void;
  ariaLabel: string;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Không thể đọc ảnh minh chứng đã chọn.'));
    };
    reader.onerror = () => reject(new Error('Không thể đọc ảnh minh chứng đã chọn.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Ảnh minh chứng không hợp lệ hoặc không thể xử lý.'));
    image.src = dataUrl;
  });
}

function dataUrlByteLength(dataUrl: string): number {
  const base64 = dataUrl.substring(dataUrl.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

async function compressImage(dataUrl: string): Promise<string> {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Không thể xử lý ảnh minh chứng trên trình duyệt này.');

  let scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
  let quality = 0.82;

  for (let attempt = 0; attempt < 18; attempt += 1) {
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const compressed = canvas.toDataURL('image/jpeg', quality);
    if (dataUrlByteLength(compressed) <= MAX_IMAGE_BYTES) return compressed;

    if (quality > 0.5) quality -= 0.1;
    else scale *= 0.8;
  }

  throw new Error('Ảnh quá lớn, không thể nén xuống dưới 2 MB. Vui lòng chọn ảnh khác.');
}

export const EvidenceImageUpload: React.FC<EvidenceImageUploadProps> = ({
  value,
  fileName,
  onChange,
  onRemove,
  ariaLabel,
}) => {
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setError('');
    if (!allowedImageTypes.has(file.type)) {
      setError('Tệp minh chứng phải là ảnh JPEG, PNG, WebP hoặc GIF.');
      return;
    }

    setIsProcessing(true);
    try {
      const dataUrl = await readAsDataUrl(file);
      const imageData = file.size > MAX_IMAGE_BYTES ? await compressImage(dataUrl) : dataUrl;
      onChange(imageData, file.name);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Không thể xử lý ảnh minh chứng.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-2">
      {value && (
        <div className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-white p-2">
          <img
            src={value}
            alt="Ảnh minh chứng xem trước"
            className="h-16 w-16 rounded-md border border-slate-200 object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-slate-700">{fileName || 'Ảnh minh chứng'}</p>
            <p className="text-[11px] text-slate-500">Đã sẵn sàng tải lên</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setError('');
              onRemove();
            }}
            className="rounded-md p-1 text-[var(--color-danger)] hover:bg-red-50"
            aria-label="Xóa ảnh minh chứng"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}

      {!value && (
        <label className="flex cursor-pointer items-center justify-between rounded-lg border border-[var(--color-primary-soft)] bg-[var(--color-primary-soft)] px-3 py-2 text-xs">
          <span className="flex items-center gap-2 text-slate-600">
            <Paperclip className="h-3.5 w-3.5 text-slate-400" />
            {isProcessing ? 'Đang xử lý ảnh...' : 'Chưa chọn ảnh'}
          </span>
          <span className="font-medium text-[var(--color-primary)] hover:underline">
            {isProcessing ? 'Vui lòng đợi' : 'Chọn ảnh'}
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            aria-label={ariaLabel}
            disabled={isProcessing}
            onChange={handleFileChange}
          />
        </label>
      )}

      {error && <p className="text-xs font-medium text-[var(--color-danger)]">{error}</p>}
    </div>
  );
};
