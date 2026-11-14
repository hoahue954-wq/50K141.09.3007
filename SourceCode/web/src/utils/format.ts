/**
 * Định dạng tiền tệ VND: 1.234.000 ₫
 */
export function formatVND(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return '0 ₫';
  }
  // Dùng toLocaleString vi-VN và nối ký hiệu ₫
  const formatted = Math.round(amount).toLocaleString('vi-VN');
  return `${formatted} ₫`;
}

/**
 * Định dạng ngày giờ theo múi giờ Asia/Ho_Chi_Minh: dd/MM/yyyy HH:mm
 */
export function formatDateTime(dateInput?: string | number | Date | null): string {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Định dạng ngày theo múi giờ Asia/Ho_Chi_Minh: dd/MM/yyyy
 */
export function formatDate(dateInput?: string | number | Date | null): string {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

/**
 * Lấy chuỗi ngày hiện tại dạng YYYYMMDD theo múi giờ Asia/Ho_Chi_Minh
 */
export function getTodayDateString(): string {
  const parts = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === 'year')?.value || '2026';
  const month = parts.find((p) => p.type === 'month')?.value || '01';
  const day = parts.find((p) => p.type === 'day')?.value || '01';
  return `${year}${month}${day}`;
}

/**
 * Kiểm tra xem 2 thời điểm có cùng ngày dương lịch theo múi giờ Asia/Ho_Chi_Minh không
 */
export function isSameDayVN(date1: string | Date, date2: string | Date): boolean {
  return formatDate(date1) === formatDate(date2);
}

export type CodeKind =
  | 'product'
  | 'category'
  | 'customer'
  | 'invoice'
  | 'disposal'
  | 'return'
  | 'purchaseOrder';

const CODE_FORMATS: Record<Exclude<CodeKind, 'product'>, { prefix: string; digits: number }> = {
  category: { prefix: 'DM', digits: 3 },
  customer: { prefix: 'KH', digits: 6 },
  invoice: { prefix: 'BH', digits: 6 },
  disposal: { prefix: 'PHH', digits: 6 },
  return: { prefix: 'PHD', digits: 6 },
  purchaseOrder: { prefix: 'PHN', digits: 6 },
};

function randomDigits(length: number, firstDigitNonZero = false): string {
  const values = new Uint32Array(length);
  globalThis.crypto.getRandomValues(values);
  return Array.from(values, (value, index) =>
    String(index === 0 && firstDigitNonZero ? 1 + (value % 9) : value % 10),
  ).join('');
}

export function generateCode(kind: CodeKind, existingCodes: Iterable<string> = []): string {
  const existing = new Set(existingCodes);

  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const candidate = kind === 'product'
      ? randomDigits(13, true)
      : `${CODE_FORMATS[kind].prefix}${randomDigits(CODE_FORMATS[kind].digits)}`;
    if (!existing.has(candidate)) return candidate;
  }

  throw new Error(`Không thể tạo mã ${kind} duy nhất.`);
}

/**
 * Chuyển số tiền VND thành chữ tiếng Việt (Ví dụ: 245000 -> "Hai trăm bốn mươi lăm nghìn đồng")
 */
export function numberToWordsVietnamese(num: number): string {
  if (num === 0) return 'Không đồng';
  const units = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];
  const digits = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

  function readThreeDigits(n: number, full: boolean): string {
    const hundred = Math.floor(n / 100);
    const remainder = n % 100;
    const ten = Math.floor(remainder / 10);
    const unit = remainder % 10;
    let result = '';

    if (hundred > 0 || full) {
      result += `${digits[hundred]} trăm `;
    }

    if (ten > 1) {
      result += `${digits[ten]} mươi `;
      if (unit === 1) result += 'mốt ';
      else if (unit === 4) result += 'tư ';
      else if (unit === 5) result += 'lăm ';
      else if (unit > 0) result += `${digits[unit]} `;
    } else if (ten === 1) {
      result += 'mười ';
      if (unit === 5) result += 'lăm ';
      else if (unit > 0) result += `${digits[unit]} `;
    } else if (unit > 0) {
      if (hundred > 0 || full) result += 'linh ';
      result += `${digits[unit]} `;
    }

    return result.trim();
  }

  let n = Math.abs(Math.round(num));
  const groups: number[] = [];
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }

  let result = '';
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g > 0) {
      const isFull = i < groups.length - 1;
      const readGroup = readThreeDigits(g, isFull);
      result += `${readGroup} ${units[i]} `;
    }
  }

  result = result.trim();
  if (!result) return 'Không đồng';

  return result.charAt(0).toUpperCase() + result.slice(1) + ' đồng';
}
