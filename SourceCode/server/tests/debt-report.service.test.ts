import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { InvoiceStatus, PaymentMethod, Prisma, ProfileStatus, RoleCode } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import {
  allocateDebtPayment,
  assertRegularCustomer,
  debtRepository,
  getDebtRecordBalance,
  resolvePaymentAmount,
} from '../src/repositories/debt.repository.js';
import { invoiceRepository } from '../src/repositories/invoice.repository.js';
import { activeSalesWhere, reportRepository } from '../src/repositories/report.repository.js';
import { debtService } from '../src/services/debt.service.js';
import { invoiceService } from '../src/services/invoice.service.js';
import { reportService } from '../src/services/report.service.js';
import type { AuthenticatedProfile } from '../src/types/auth.js';
import { AppError } from '../src/utils/AppError.js';
import { requireRole } from '../src/middlewares/requireRole.js';

const originalReportMethods = {
  findSales: reportRepository.findSales,
  findApprovedReturns: reportRepository.findApprovedReturns,
  findApprovedDisposals: reportRepository.findApprovedDisposals,
  findExpenses: reportRepository.findExpenses,
};
const originalDebtMethods = { recordPayment: debtRepository.recordPayment };
const originalInvoiceMethods = { findById: invoiceRepository.findById };
const owner: AuthenticatedProfile = {
  id: '98bd2a56-16a5-4db4-b867-3b4ea3a0ea4e',
  username: 'owner',
  fullName: 'Chủ cửa hàng',
  status: ProfileStatus.ACTIVE,
  createdAt: new Date(),
  role: { id: '7340d1db-6392-4e16-9718-a2d5a82f5bc1', code: RoleCode.OWNER, name: 'Chủ cửa hàng' },
};

afterEach(() => {
  Object.assign(reportRepository, originalReportMethods);
  Object.assign(debtRepository, originalDebtMethods);
  Object.assign(invoiceRepository, originalInvoiceMethods);
});

test('partial debt payments reduce the current balance and return credit cannot make it negative', () => {
  const partial = getDebtRecordBalance({
    amount: new Prisma.Decimal(100),
    payments: [{ amount: new Prisma.Decimal(25) }],
    invoice: { returnSlips: [{ debtCredit: new Prisma.Decimal(10) }] },
  });
  assert.equal(partial.outstanding.toNumber(), 65);

  const settled = getDebtRecordBalance({
    amount: new Prisma.Decimal(100),
    payments: [{ amount: new Prisma.Decimal(80) }],
    invoice: { returnSlips: [{ debtCredit: new Prisma.Decimal(30) }] },
  });
  assert.equal(settled.outstanding.toNumber(), 0);
});

test('debt payment allocation is oldest-first and partial payment targets one balance first', () => {
  const allocations = allocateDebtPayment([
    { debtRecordId: 'old', invoiceId: 'invoice-old', outstanding: new Prisma.Decimal(30) },
    { debtRecordId: 'new', invoiceId: 'invoice-new', outstanding: new Prisma.Decimal(50) },
  ], new Prisma.Decimal(45));

  assert.deepEqual(allocations.map((item) => [item.debtRecordId, item.amount.toNumber()]), [
    ['old', 30],
    ['new', 15],
  ]);
});

test('rejects payments above current debt and allows full invoice settlement only at or above its balance', () => {
  assert.throws(
    () => resolvePaymentAmount(new Prisma.Decimal(101), new Prisma.Decimal(100)),
    (error: unknown) => error instanceof AppError &&
      error.statusCode === 409 &&
      error.code === 'PAYMENT_EXCEEDS_DEBT',
  );
  assert.equal(
    resolvePaymentAmount(new Prisma.Decimal(120), new Prisma.Decimal(100), 'invoice-id').toNumber(),
    100,
  );
  assert.throws(
    () => resolvePaymentAmount(new Prisma.Decimal(99), new Prisma.Decimal(100), 'invoice-id'),
    (error: unknown) => error instanceof AppError &&
      error.statusCode === 400 &&
      error.code === 'INSUFFICIENT_PAYMENT',
  );
});

test('serialized concurrent debt payments cannot exceed the remaining balance', async () => {
  let outstanding = new Prisma.Decimal(100);
  let previous = Promise.resolve();
  const pay = async (amount: Prisma.Decimal) => {
    let release = () => {};
    const turn = previous;
    previous = new Promise<void>((resolve) => { release = resolve; });
    await turn;
    try {
      const applied = resolvePaymentAmount(amount, outstanding);
      await Promise.resolve();
      outstanding = outstanding.sub(applied);
      return applied;
    } finally {
      release();
    }
  };

  const results = await Promise.allSettled([
    pay(new Prisma.Decimal(60)),
    pay(new Prisma.Decimal(60)),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.equal(outstanding.toNumber(), 40);
});

test('only regular customers may have debt records', () => {
  assert.throws(
    () => assertRegularCustomer(false),
    (error: unknown) => error instanceof AppError &&
      error.statusCode === 400 &&
      error.code === 'CUSTOMER_NOT_REGULAR',
  );
  assert.doesNotThrow(() => assertRegularCustomer(true));
});

test('STAFF cannot collect debt payments', () => {
  const ownerOnly = requireRole(RoleCode.OWNER);
  const profile: AuthenticatedProfile = {
    id: 'b6adf083-c5a4-4d7b-8bc8-173e27c34e1c',
    username: 'staff',
    fullName: 'Nhân viên',
    status: ProfileStatus.ACTIVE,
    createdAt: new Date(),
    role: { id: '7340d1db-6392-4e16-9718-a2d5a82f5bc1', code: RoleCode.STAFF, name: 'Nhân viên' },
  };
  const response = { locals: { authProfile: profile } } as Response;
  let receivedError: unknown;
  const next: NextFunction = (error) => { receivedError = error; };

  ownerOnly({} as Request, response, next);
  assert.ok(receivedError instanceof AppError);
  assert.equal(receivedError.statusCode, 403);
});

test('STAFF cannot access OWNER-only reports', () => {
  const ownerOnly = requireRole(RoleCode.OWNER);
  const response = {
    locals: {
      authProfile: {
        ...owner,
        role: { ...owner.role, code: RoleCode.STAFF },
      },
    },
  } as Response;
  let receivedError: unknown;
  const next: NextFunction = (error) => { receivedError = error; };

  ownerOnly({} as Request, response, next);
  assert.ok(receivedError instanceof AppError);
  assert.equal(receivedError.statusCode, 403);
});

test('invoice settle alias and customer debt payment use the same ledger operation', async () => {
  const invoiceId = '7c005949-92ea-42e5-b617-2e5ad1a30317';
  const customerId = '37c43e7b-3276-425f-944a-3ca4ad95ce5a';
  const debtRecordId = '9c102f0e-d76a-4a14-8f12-709d0378419e';
  const baseInvoice: NonNullable<Awaited<ReturnType<typeof invoiceRepository.findById>>> = {
    id: invoiceId,
    code: 'BH000001',
    createdAt: new Date(),
    totalAmount: new Prisma.Decimal(100),
    cashGiven: null,
    changeGiven: null,
    paymentMethod: PaymentMethod.DEBT,
    status: InvoiceStatus.UNPAID,
    customerId,
    createdById: owner.id,
    paidAt: null,
    paymentMethodSettled: null,
    isDeleted: false,
    deletedById: null,
    deletedAt: null,
    createdBy: { id: owner.id, fullName: owner.fullName },
    customer: { id: customerId, name: 'Khách quen' },
    details: [],
    debtRecord: {
      id: debtRecordId,
      customerId,
      invoiceId,
      amount: new Prisma.Decimal(100),
      note: null,
      settledAt: null,
      createdAt: new Date(),
    },
    returnSlips: [],
  };
  let outstanding = new Prisma.Decimal(100);
  let currentInvoice = baseInvoice;
  const ledgerCalls: Array<{ targetInvoiceId?: string; amount: number; method: string }> = [];
  debtRepository.recordPayment = async (input, _createdById, targetInvoiceId) => {
    const paid = targetInvoiceId ? outstanding : new Prisma.Decimal(input.amount);
    if (paid.greaterThan(outstanding)) throw new Error('test payment exceeded outstanding balance');
    outstanding = outstanding.sub(paid);
    ledgerCalls.push({
      ...(targetInvoiceId ? { targetInvoiceId } : {}),
      amount: paid.toNumber(),
      method: input.payment_method,
    });
    if (outstanding.isZero()) {
      currentInvoice = {
        ...currentInvoice,
        status: InvoiceStatus.PAID,
        paidAt: new Date(),
        paymentMethodSettled: PaymentMethod.CASH,
        debtRecord: { ...baseInvoice.debtRecord!, settledAt: new Date() },
      };
    }
    return {
      amountPaid: paid,
      paymentMethod: input.payment_method,
      paidAt: new Date(),
      allocations: [{ debt_record_id: debtRecordId, invoice_id: invoiceId, amount: paid.toNumber() }],
      totalDebt: outstanding,
      customerId,
    };
  };
  invoiceRepository.findById = async () => currentInvoice;

  await invoiceService.settle(invoiceId, {
    payment_method: 'CASH',
    amount_received: 100,
  }, owner);
  assert.equal(outstanding.toNumber(), 0);

  outstanding = new Prisma.Decimal(100);
  currentInvoice = baseInvoice;
  await debtService.pay({
    customer_id: customerId,
    amount: 100,
    payment_method: 'CASH',
  }, owner);
  assert.equal(outstanding.toNumber(), 0);
  assert.deepEqual(ledgerCalls.map((call) => [call.amount, call.method]), [
    [100, 'CASH'],
    [100, 'CASH'],
  ]);
  assert.equal(ledgerCalls[0]?.targetInvoiceId, invoiceId);
  assert.equal(ledgerCalls[1]?.targetInvoiceId, undefined);
});

test('revenue and profit reports use HCMC calendar dates and saved cost snapshots', async () => {
  reportRepository.findSales = async () => [{
    id: 'invoice',
    code: 'BH000001',
    createdAt: new Date('2026-03-10T16:30:00.000Z'),
    totalAmount: new Prisma.Decimal(20),
    paymentMethod: 'CASH',
    details: [{
      productBarcode: '8930000000001',
      productName: 'Sản phẩm',
      quantity: 2,
      lineTotal: new Prisma.Decimal(20),
      costPrice: new Prisma.Decimal(3),
    }],
  }];
  reportRepository.findApprovedReturns = async () => [{
    approvedAt: new Date('2026-03-10T16:45:00.000Z'),
    difference: new Prisma.Decimal(-10),
    invoice: { paymentMethod: 'CASH' },
    items: [{
      kind: 'RETURNED',
      quantity: 1,
      costPrice: new Prisma.Decimal(3),
    }],
  }];
  reportRepository.findApprovedDisposals = async () => [{
    approvedAt: new Date('2026-03-10T16:50:00.000Z'),
    items: [{ totalValue: new Prisma.Decimal(2) }],
  }];
  reportRepository.findExpenses = async () => [{
    expenseDate: new Date('2026-03-10T00:00:00.000Z'),
    amount: new Prisma.Decimal(1),
  }];

  const daily = await reportService.revenue({
    from: '2026-03-10',
    to: '2026-03-10',
    group_by: 'day',
  });
  assert.equal(daily.summary.total_revenue, 10);
  assert.equal(daily.data[0]?.payment_methods.cash, 10);
  assert.equal(daily.summary.invoice_count, 1);

  const dailyProfit = await reportService.profit({
    from: '2026-03-10',
    to: '2026-03-10',
    group_by: 'day',
  });
  assert.equal(dailyProfit.summary.gross_profit, 5);
  assert.equal(dailyProfit.summary.net_profit, 5);

  const monthly = await reportService.profit({
    from: '2026-03-01',
    to: '2026-03-31',
    group_by: 'month',
  });
  assert.equal(monthly.summary.cost_of_goods_sold, 6);
  assert.equal(monthly.summary.returned_cost, 3);
  assert.equal(monthly.summary.disposal_cost, 2);
  assert.equal(monthly.summary.expenses, 1);
  assert.equal(monthly.summary.net_profit, 4);
});

test('empty report range returns zero-valued periods without errors', async () => {
  reportRepository.findSales = async () => [];
  reportRepository.findApprovedReturns = async () => [];
  reportRepository.findApprovedDisposals = async () => [];
  reportRepository.findExpenses = async () => [];

  const result = await reportService.revenue({
    from: '2026-04-04',
    to: '2026-04-04',
    group_by: 'day',
  });
  assert.equal(result.summary.total_revenue, 0);
  assert.equal(result.summary.invoice_count, 0);
  assert.equal(result.data[0]?.revenue, 0);
});

test('sales report query excludes soft-deleted invoices', () => {
  const from = new Date('2026-03-10T17:00:00.000Z');
  const to = new Date('2026-03-11T17:00:00.000Z');

  assert.deepEqual(activeSalesWhere(from, to), {
    isDeleted: false,
    createdAt: { gte: from, lt: to },
  });
});
