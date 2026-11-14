import { ExpenseCategory, Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { AppError } from '../utils/AppError.js';

export type ParsedExpenseRow = {
  expenseDate: Date;
  category: ExpenseCategory;
  amount: Prisma.Decimal;
  notes: string | null;
};

export type ParseExpensesResult = {
  items: ParsedExpenseRow[];
  targetYear?: number;
  targetMonth?: number;
};

export function parseTargetMonth(monthStr?: string): { year: number; month: number } | null {
  if (!monthStr || typeof monthStr !== 'string') return null;
  const trimmed = monthStr.trim();
  if (!trimmed) return null;

  const m1 = trimmed.match(/^(0?[1-9]|1[0-2])\/(\d{4})$/);
  if (m1) return { month: Number(m1[1]), year: Number(m1[2]) };

  const m2 = trimmed.match(/^(\d{4})[-/](0?[1-9]|1[0-2])$/);
  if (m2) return { year: Number(m2[1]), month: Number(m2[2]) };

  const m3 = trimmed.match(/^(0?[1-9]|1[0-2])\/(\d{2})$/);
  if (m3) return { month: Number(m3[1]), year: 2000 + Number(m3[2]) };

  throw new AppError(400, 'Định dạng tháng không hợp lệ (hỗ trợ mm/yyyy hoặc yyyy-mm).', 'INVALID_MONTH_FORMAT');
}

export function parseExcelDate(val: unknown): Date | null {
  if (!val) return null;

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return new Date(Date.UTC(val.getUTCFullYear(), val.getUTCMonth(), val.getUTCDate()));
  }

  if (typeof val === 'number') {
    if (val <= 0) return null;
    try {
      const parsed = XLSX.SSF.parse_date_code(val);
      if (parsed && parsed.y && parsed.m && parsed.d) {
        return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
      }
    } catch {
      return null;
    }
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;

    const isoMatch = trimmed.match(/^(\d{4})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])$/);
    if (isoMatch) {
      return new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])));
    }

    const vnMatch = trimmed.match(/^(0?[1-9]|[12]\d|3[01])[-/](0?[1-9]|1[0-2])[-/](\d{4})$/);
    if (vnMatch) {
      return new Date(Date.UTC(Number(vnMatch[3]), Number(vnMatch[2]) - 1, Number(vnMatch[1])));
    }

    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
    }
  }

  return null;
}

export function parseCategory(rawVal: unknown): ExpenseCategory | null {
  if (rawVal === undefined || rawVal === null) return null;
  const s = String(rawVal).trim().toLowerCase();
  if (['electricity', 'điện', 'tiền điện', 'chi phí điện', 'dien', 'tien dien'].includes(s)) {
    return ExpenseCategory.ELECTRICITY;
  }
  if (['rent', 'mặt bằng', 'thuê mặt bằng', 'tiền mặt bằng', 'tiền nhà', 'mat bang', 'thue mat bang', 'tien nha'].includes(s)) {
    return ExpenseCategory.RENT;
  }
  if (['salary', 'lương', 'tiền lương', 'lương nhân viên', 'luong', 'tien luong'].includes(s)) {
    return ExpenseCategory.SALARY;
  }
  if (['other', 'khác', 'chi phí khác', 'khac', 'chi phi khac'].includes(s)) {
    return ExpenseCategory.OTHER;
  }
  return null;
}

export function parseAmount(rawVal: unknown): Prisma.Decimal | null {
  if (typeof rawVal === 'number') {
    if (isNaN(rawVal) || rawVal <= 0) return null;
    return new Prisma.Decimal(rawVal.toFixed(2));
  }

  if (typeof rawVal === 'string') {
    const cleaned = rawVal.replace(/[^\d.,]/g, '').trim();
    if (!cleaned) return null;

    let numStr = cleaned;
    if (cleaned.includes('.') && cleaned.includes(',')) {
      if (cleaned.indexOf('.') < cleaned.indexOf(',')) {
        numStr = cleaned.replace(/\./g, '').replace(',', '.');
      } else {
        numStr = cleaned.replace(/,/g, '');
      }
    } else if (cleaned.includes('.')) {
      const parts = cleaned.split('.');
      const p1 = parts[1];
      if (parts.length > 2 || (parts.length === 2 && p1 !== undefined && p1.length === 3)) {
        numStr = cleaned.replace(/\./g, '');
      }
    } else if (cleaned.includes(',')) {
      const parts = cleaned.split(',');
      const p1 = parts[1];
      if (parts.length > 2 || (parts.length === 2 && p1 !== undefined && p1.length === 3)) {
        numStr = cleaned.replace(/,/g, '');
      } else {
        numStr = cleaned.replace(',', '.');
      }
    }

    const num = parseFloat(numStr);
    if (isNaN(num) || num <= 0) return null;
    return new Prisma.Decimal(num.toFixed(2));
  }

  return null;
}

export function parseAndValidateExpensesExcel(
  buffer: Buffer,
  originalname: string,
  monthStr?: string
): ParseExpensesResult {
  if (!originalname || !originalname.toLowerCase().endsWith('.xlsx')) {
    throw new AppError(400, 'Chỉ chấp nhận file định dạng Excel (.xlsx).', 'INVALID_FILE_TYPE');
  }

  if (!buffer || buffer.length === 0) {
    throw new AppError(400, 'File Excel rỗng.', 'EMPTY_FILE');
  }

  const parsedMonth = parseTargetMonth(monthStr);
  if (parsedMonth) {
    const now = new Date();
    const hcmDateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
    }).format(now);
    const dateParts = hcmDateStr.split('-').map(Number);
    const curY = dateParts[0] ?? now.getFullYear();
    const curM = dateParts[1] ?? (now.getMonth() + 1);
    if (parsedMonth.year > curY || (parsedMonth.year === curY && parsedMonth.month > curM)) {
      throw new AppError(400, 'Tháng lựa chọn không hợp lệ, vui lòng chọn lại!', 'INVALID_MONTH');
    }
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } catch {
    throw new AppError(400, 'File Excel không hợp lệ, vui lòng kiểm tra lại!', 'INVALID_EXCEL_FILE');
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new AppError(400, 'File Excel không có dữ liệu chi phí.', 'EMPTY_EXCEL_FILE');
  }

  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new AppError(400, 'File Excel không có dữ liệu chi phí.', 'EMPTY_EXCEL_FILE');
  }

  const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
  if (!rawRows || rawRows.length === 0) {
    throw new AppError(400, 'File Excel không có dữ liệu chi phí.', 'EMPTY_EXCEL_FILE');
  }

  // Tìm hàng header đầu tiên
  let headerRowIndex = -1;
  let colDate = -1;
  let colCategory = -1;
  let colAmount = -1;
  let colNotes = -1;

  for (let r = 0; r < Math.min(rawRows.length, 5); r++) {
    const row = rawRows[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c++) {
      const cellText = String(row[c]).trim().toLowerCase();
      if (['ngày', 'date', 'thời gian', 'ngay'].some((kw) => cellText.includes(kw))) {
        colDate = c;
      }
      if (['loại', 'category', 'khoản chi', 'danh mục', 'chi phí'].some((kw) => cellText.includes(kw))) {
        colCategory = c;
      }
      if (['tiền', 'amount', 'số tiền', 'giá trị'].some((kw) => cellText.includes(kw))) {
        colAmount = c;
      }
      if (['ghi chú', 'mô tả', 'notes', 'note', 'nội dung'].some((kw) => cellText.includes(kw))) {
        colNotes = c;
      }
    }
    if (colDate !== -1 && colCategory !== -1 && colAmount !== -1) {
      headerRowIndex = r;
      break;
    }
  }

  // Nếu không thấy header rõ ràng, mặc định các cột 0: Ngày, 1: Loại, 2: Số tiền, 3: Ghi chú
  if (colDate === -1 || colCategory === -1 || colAmount === -1) {
    colDate = 0;
    colCategory = 1;
    colAmount = 2;
    colNotes = 3;
    headerRowIndex = -1;
  }

  const startRow = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;
  const errors: string[] = [];
  const items: ParsedExpenseRow[] = [];

  const now = new Date();
  const todayEndUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 23, 59, 59, 999));

  for (let r = startRow; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!Array.isArray(row)) continue;

    // Bỏ qua dòng trống hoàn toàn
    const isEmpty = row.every((c) => c === '' || c === null || c === undefined);
    if (isEmpty) continue;

    const excelRowNum = r + 1;
    let rowHasError = false;

    // 1. Kiểm tra ngày
    const rawDate = row[colDate];
    const parsedDate = parseExcelDate(rawDate);
    if (!parsedDate) {
      errors.push(`Hàng ${excelRowNum}, Cột "Ngày": Ngày không hợp lệ hoặc sai định dạng.`);
      rowHasError = true;
    } else {
      if (parsedDate > todayEndUtc) {
        errors.push(`Hàng ${excelRowNum}, Cột "Ngày": Ngày chi không được lớn hơn ngày hiện tại.`);
        rowHasError = true;
      }
      if (parsedMonth) {
        const itemYear = parsedDate.getUTCFullYear();
        const itemMonth = parsedDate.getUTCMonth() + 1;
        if (itemYear !== parsedMonth.year || itemMonth !== parsedMonth.month) {
          const formatted = `${itemYear}-${String(itemMonth).padStart(2, '0')}-${String(parsedDate.getUTCDate()).padStart(2, '0')}`;
          errors.push(`Hàng ${excelRowNum}, Cột "Ngày": Ngày (${formatted}) không thuộc tháng đã chọn (${parsedMonth.month}/${parsedMonth.year}).`);
          rowHasError = true;
        }
      }
    }

    // 2. Kiểm tra loại chi phí
    const rawCat = row[colCategory];
    const parsedCategory = parseCategory(rawCat);
    if (!parsedCategory) {
      errors.push(`Hàng ${excelRowNum}, Cột "Loại chi phí": Loại chi phí "${rawCat}" không hợp lệ (hỗ trợ: Điện, Mặt bằng, Lương, Khác).`);
      rowHasError = true;
    }

    // 3. Kiểm tra số tiền
    const rawAmount = row[colAmount];
    const parsedAmount = parseAmount(rawAmount);
    if (!parsedAmount) {
      errors.push(`Hàng ${excelRowNum}, Cột "Số tiền": Số tiền phải là số lớn hơn 0.`);
      rowHasError = true;
    }

    // 4. Ghi chú (tùy chọn)
    const rawNotes = colNotes >= 0 && colNotes < row.length ? row[colNotes] : undefined;
    const notes = rawNotes ? String(rawNotes).trim().slice(0, 500) : null;

    if (!rowHasError && parsedDate && parsedCategory && parsedAmount) {
      items.push({
        expenseDate: parsedDate,
        category: parsedCategory,
        amount: parsedAmount,
        notes,
      });
    }
  }

  if (items.length === 0 && errors.length === 0) {
    throw new AppError(400, 'File Excel không có dữ liệu chi phí.', 'EMPTY_EXCEL_FILE');
  }

  if (errors.length > 0) {
    throw new AppError(
      400,
      `Dữ liệu file Excel không hợp lệ:\n${errors.join('\n')}`,
      'INVALID_EXCEL_DATA'
    );
  }

  return {
    items,
    targetYear: parsedMonth?.year,
    targetMonth: parsedMonth?.month,
  };
}
