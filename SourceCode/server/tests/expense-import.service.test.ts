import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { ExpenseCategory, Prisma, ProfileStatus, RoleCode } from '@prisma/client';
import * as XLSX from 'xlsx';
import { reportRepository } from '../src/repositories/report.repository.js';
import { reportService } from '../src/services/report.service.js';
import type { AuthenticatedProfile } from '../src/types/auth.js';
import { AppError } from '../src/utils/AppError.js';
import { requireRole } from '../src/middlewares/requireRole.js';
import { parseAndValidateExpensesExcel } from '../src/validators/expense.validators.js';

const originalReportMethods = {
  findSales: reportRepository.findSales,
  findApprovedReturns: reportRepository.findApprovedReturns,
  findApprovedDisposals: reportRepository.findApprovedDisposals,
  findExpenses: reportRepository.findExpenses,
  saveExpenses: reportRepository.saveExpenses,
};

const owner: AuthenticatedProfile = {
  id: '98bd2a56-16a5-4db4-b867-3b4ea3a0ea4e',
  username: 'owner',
  fullName: 'Chủ cửa hàng',
  status: ProfileStatus.ACTIVE,
  createdAt: new Date(),
  role: { id: '7340d1db-6392-4e16-9718-a2d5a82f5bc1', code: RoleCode.OWNER, name: 'Chủ cửa hàng' },
};

const staff: AuthenticatedProfile = {
  id: 'a1b2c3d4-1111-2222-3333-444455556666',
  username: 'staff',
  fullName: 'Nhân viên',
  status: ProfileStatus.ACTIVE,
  createdAt: new Date(),
  role: { id: 'b2c3d4e5-2222-3333-4444-555566667777', code: RoleCode.STAFF, name: 'Nhân viên' },
};

function createExcelBuffer(rows: any[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Chi phí');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

afterEach(() => {
  Object.assign(reportRepository, originalReportMethods);
});

test('STAFF is forbidden from importing expenses (OWNER-only)', () => {
  const middleware = requireRole(RoleCode.OWNER);
  let caughtError: unknown;
  const next = (err?: unknown) => {
    caughtError = err;
  };
  const res = { locals: { authProfile: staff } } as any;
  middleware({} as any, res, next);

  assert.ok(caughtError instanceof AppError);
  assert.equal(caughtError.statusCode, 403);
  assert.equal(caughtError.code, 'FORBIDDEN');
});

test('parseAndValidateExpensesExcel parses valid rows with Vietnamese headers and categories', () => {
  const buffer = createExcelBuffer([
    ['Ngày chi', 'Loại chi phí', 'Số tiền (VNĐ)', 'Ghi chú'],
    ['2026-10-05', 'Điện', '1.500.000', 'Tiền điện tháng 10'],
    ['2026-10-10', 'Mặt bằng', 5000000, 'Thuê mặt bằng'],
    ['2026-10-20', 'Lương', '10,000,000', 'Lương nhân viên ca sáng'],
    ['2026-10-25', 'Khác', 300000, 'Mua bao bì túi bóng'],
  ]);

  const result = parseAndValidateExpensesExcel(buffer, 'chi_phi_thang_10.xlsx', '10/2026');
  assert.equal(result.items.length, 4);
  assert.equal(result.targetMonth, 10);
  assert.equal(result.targetYear, 2026);

  assert.equal(result.items[0]?.category, ExpenseCategory.ELECTRICITY);
  assert.equal(result.items[0]?.amount.toNumber(), 1500000);
  assert.equal(result.items[0]?.notes, 'Tiền điện tháng 10');

  assert.equal(result.items[1]?.category, ExpenseCategory.RENT);
  assert.equal(result.items[1]?.amount.toNumber(), 5000000);

  assert.equal(result.items[2]?.category, ExpenseCategory.SALARY);
  assert.equal(result.items[2]?.amount.toNumber(), 10000000);

  assert.equal(result.items[3]?.category, ExpenseCategory.OTHER);
  assert.equal(result.items[3]?.amount.toNumber(), 300000);
});

test('parseAndValidateExpensesExcel rejects invalid file format (non-.xlsx)', () => {
  assert.throws(
    () => parseAndValidateExpensesExcel(Buffer.from('not an excel'), 'data.csv'),
    (err: any) => err instanceof AppError && err.code === 'INVALID_FILE_TYPE'
  );
});

test('parseAndValidateExpensesExcel rejects empty file', () => {
  assert.throws(
    () => parseAndValidateExpensesExcel(Buffer.alloc(0), 'empty.xlsx'),
    (err: any) => err instanceof AppError && err.code === 'EMPTY_FILE'
  );
});

test('parseAndValidateExpensesExcel rejects future target month', () => {
  const buffer = createExcelBuffer([
    ['Ngày', 'Loại', 'Số tiền'],
    ['2099-12-01', 'Điện', 100000],
  ]);

  assert.throws(
    () => parseAndValidateExpensesExcel(buffer, 'future.xlsx', '12/2099'),
    (err: any) => err instanceof AppError && err.code === 'INVALID_MONTH' && err.message.includes('Tháng lựa chọn không hợp lệ')
  );
});

test('parseAndValidateExpensesExcel identifies specific row and column errors (all-or-nothing)', () => {
  const buffer = createExcelBuffer([
    ['Ngày', 'Loại chi phí', 'Số tiền', 'Ghi chú'],
    ['2026-10-05', 'Điện', 1500000, 'Hàng 2 hợp lệ'],
    ['invalid-date', 'Điện', 2000000, 'Hàng 3 sai ngày'],
    ['2026-10-10', 'Vay nợ vô lý', 3000000, 'Hàng 4 sai loại chi phí'],
    ['2026-10-15', 'Mặt bằng', -500000, 'Hàng 5 số tiền âm'],
    ['2026-09-01', 'Khác', 100000, 'Hàng 6 sai tháng (tháng 9 thay vì tháng 10)'],
  ]);

  try {
    parseAndValidateExpensesExcel(buffer, 'test_errors.xlsx', '10/2026');
    assert.fail('Expected parseAndValidateExpensesExcel to throw');
  } catch (err: any) {
    assert.ok(err instanceof AppError);
    assert.equal(err.code, 'INVALID_EXCEL_DATA');
    assert.ok(err.message.includes('Hàng 3, Cột "Ngày"'));
    assert.ok(err.message.includes('Hàng 4, Cột "Loại chi phí"'));
    assert.ok(err.message.includes('Hàng 5, Cột "Số tiền"'));
    assert.ok(err.message.includes('Hàng 6, Cột "Ngày"'));
  }
});

test('reportService.importExpensesExcel persists valid items and does not save if validation fails', async () => {
  let savedItems: any[] | null = null;
  let savedUserId: string | null = null;
  let replaceRange: { from: Date; to: Date } | undefined;

  reportRepository.saveExpenses = async (items: any[], userId: string, range?: any) => {
    savedItems = items;
    savedUserId = userId;
    replaceRange = range;
    return { count: items.length } as any;
  };

  const validBuffer = createExcelBuffer([
    ['Ngày', 'Loại', 'Số tiền', 'Ghi chú'],
    ['2026-10-01', 'Điện', 1200000, 'Điện'],
    ['2026-10-15', 'Lương', 6000000, 'Lương'],
  ]);

  const res = await reportService.importExpensesExcel(validBuffer, 'chi_phi.xlsx', '10/2026', owner.id);
  assert.equal(res.success, true);
  assert.equal(res.imported_count, 2);
  assert.equal(res.total_amount, 7200000);
  assert.equal(savedUserId, owner.id);
  assert.equal((savedItems as any[] | null)?.length, 2);
  assert.ok(replaceRange);

  // Thử file lỗi: đảm bảo saveExpenses không được gọi lại
  savedItems = null;
  const invalidBuffer = createExcelBuffer([
    ['Ngày', 'Loại', 'Số tiền'],
    ['2026-10-01', 'Loại bậy bạ', 1000],
  ]);

  await assert.rejects(
    () => reportService.importExpensesExcel(invalidBuffer, 'invalid.xlsx', '10/2026', owner.id),
    (err: any) => err instanceof AppError && err.code === 'INVALID_EXCEL_DATA'
  );
  assert.equal(savedItems, null, 'Nothing should be saved when there are validation errors (all-or-nothing)');
});

test('monthly report accounts for saved expenses and subtracts them from net profit', async () => {
  reportRepository.findSales = async () => [
    {
      id: 'inv-1',
      code: 'HD-001',
      createdAt: new Date('2026-10-15T08:00:00.000Z'),
      paidAt: new Date('2026-10-15T08:00:00.000Z'),
      totalAmount: new Prisma.Decimal(10000000),
      paymentMethod: 'CASH',
      details: [
        {
          productBarcode: '8934567890123',
          productName: 'Bia Tiger',
          quantity: 10,
          lineTotal: new Prisma.Decimal(10000000),
          costPrice: new Prisma.Decimal(600000), // Giá vốn: 6.000.000
        },
      ],
    },
  ];
  reportRepository.findApprovedReturns = async () => [];
  reportRepository.findApprovedDisposals = async () => [];
  reportRepository.findExpenses = async () => [
    {
      expenseDate: new Date('2026-10-05T00:00:00.000Z'),
      amount: new Prisma.Decimal(1500000),
    },
    {
      expenseDate: new Date('2026-10-20T00:00:00.000Z'),
      amount: new Prisma.Decimal(500000),
    },
  ];

  const report = await reportService.monthly(2026, 10);
  assert.equal(report.totalRevenue, 10000000);
  assert.equal(report.totalExpenses, 2000000);
  // Doanh thu (10tr) - Giá vốn (6tr) - Chi phí (2tr) = Lợi nhuận ròng (2tr)
  assert.equal(report.netProfit, 2000000);
});
