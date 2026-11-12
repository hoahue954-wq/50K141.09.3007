import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/AppError.js';
import type { CreateDebtInput, CreateDebtPaymentInput, DebtListQuery } from '../validators/debt.validators.js';

const debtInclude = {
  payments: {
    orderBy: { paidAt: 'asc' as const },
    include: { createdBy: { select: { id: true, fullName: true } } },
  },
  invoice: {
    select: {
      id: true,
      code: true,
      createdAt: true,
      status: true,
      isDeleted: true,
      returnSlips: {
        where: { status: 'APPROVED', isDeleted: false },
        select: { debtCredit: true },
      },
    },
  },
} satisfies Prisma.DebtRecordInclude;

export type DebtRecordWithRelations = Prisma.DebtRecordGetPayload<{ include: typeof debtInclude }>;

export function getDebtRecordBalance(record: {
  amount: Prisma.Decimal;
  payments: { amount: Prisma.Decimal }[];
  invoice: { returnSlips: { debtCredit: Prisma.Decimal }[] } | null;
}): { paid: Prisma.Decimal; credit: Prisma.Decimal; outstanding: Prisma.Decimal } {
  const paid = record.payments.reduce(
    (total, payment) => total.add(payment.amount),
    new Prisma.Decimal(0),
  );
  const credit = (record.invoice?.returnSlips ?? []).reduce(
    (total, slip) => total.add(slip.debtCredit),
    new Prisma.Decimal(0),
  );
  const outstanding = Prisma.Decimal.max(
    new Prisma.Decimal(0),
    record.amount.sub(paid).sub(credit),
  );
  return { paid, credit, outstanding };
}

export function allocateDebtPayment(
  balances: Array<{ debtRecordId: string; invoiceId: string | null; outstanding: Prisma.Decimal }>,
  amount: Prisma.Decimal,
): Array<{ debtRecordId: string; invoiceId: string | null; amount: Prisma.Decimal }> {
  let remaining = amount;
  const allocations: Array<{ debtRecordId: string; invoiceId: string | null; amount: Prisma.Decimal }> = [];
  for (const balance of balances) {
    if (remaining.isZero()) break;
    if (balance.outstanding.isZero()) continue;
    const applied = Prisma.Decimal.min(remaining, balance.outstanding);
    allocations.push({
      debtRecordId: balance.debtRecordId,
      invoiceId: balance.invoiceId,
      amount: applied,
    });
    remaining = remaining.sub(applied);
  }
  return allocations;
}

export function resolvePaymentAmount(
  requested: Prisma.Decimal,
  totalOutstanding: Prisma.Decimal,
  targetInvoiceId?: string,
): Prisma.Decimal {
  if (targetInvoiceId) {
    if (requested.lessThan(totalOutstanding)) {
      throw new AppError(400, 'Số tiền thanh toán phải bằng hoặc lớn hơn số dư hóa đơn.', 'INSUFFICIENT_PAYMENT');
    }
    if (totalOutstanding.isZero()) {
      throw new AppError(409, 'Hóa đơn không còn khoản nợ cần thanh toán.', 'NO_OUTSTANDING_DEBT');
    }
    return totalOutstanding;
  }
  if (requested.greaterThan(totalOutstanding)) {
    throw new AppError(409, 'Số tiền trả vượt quá dư nợ hiện tại.', 'PAYMENT_EXCEEDS_DEBT', {
      outstanding_amount: totalOutstanding.toNumber(),
      requested_amount: requested.toNumber(),
    });
  }
  return requested;
}

export function assertRegularCustomer(isRegular: boolean): void {
  if (!isRegular) {
    throw new AppError(400, 'Chỉ khách quen mới được ghi nợ.', 'CUSTOMER_NOT_REGULAR');
  }
}

async function lockCustomer(tx: Prisma.TransactionClient, customerId: string): Promise<void> {
  const customers = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "customers" WHERE "id" = ${customerId}::uuid FOR UPDATE
  `;
  if (customers.length === 0) throw new AppError(404, 'Không tìm thấy khách hàng.', 'CUSTOMER_NOT_FOUND');
}

export const debtRepository = {
  async create(input: CreateDebtInput, createdById: string) {
    return prisma.$transaction(async (tx) => {
      await lockCustomer(tx, input.customer_id);
      const customer = await tx.customer.findUnique({ where: { id: input.customer_id } });
      if (!customer) throw new AppError(404, 'Không tìm thấy khách hàng.', 'CUSTOMER_NOT_FOUND');
      assertRegularCustomer(customer.isRegular);

      if (input.invoice_id) {
        await tx.$queryRaw`SELECT "id" FROM "invoices" WHERE "id" = ${input.invoice_id}::uuid FOR UPDATE`;
        const invoice = await tx.invoice.findUnique({
          where: { id: input.invoice_id },
          select: { id: true, code: true, customerId: true, paymentMethod: true, status: true, totalAmount: true, isDeleted: true },
        });
        if (!invoice || invoice.isDeleted) {
          throw new AppError(404, 'Không tìm thấy hóa đơn.', 'INVOICE_NOT_FOUND');
        }
        if (invoice.customerId !== input.customer_id) {
          throw new AppError(400, 'Hóa đơn không thuộc khách hàng đã chọn.', 'INVOICE_CUSTOMER_MISMATCH');
        }
        if (invoice.paymentMethod !== 'DEBT') {
          throw new AppError(400, 'Chỉ hóa đơn ghi nợ mới được gắn bản ghi công nợ.', 'INVOICE_NOT_DEBT');
        }
        const existing = await tx.debtRecord.findUnique({ where: { invoiceId: invoice.id } });
        if (existing) {
          if (existing.customerId === input.customer_id && existing.amount.equals(input.amount)) {
            return tx.debtRecord.findUniqueOrThrow({
              where: { id: existing.id },
              include: debtInclude,
            });
          }
          throw new AppError(409, 'Hóa đơn đã có bản ghi công nợ khác.', 'DEBT_ALREADY_RECORDED');
        }
        if (invoice.status !== 'UNPAID') {
          throw new AppError(409, 'Chỉ hóa đơn ghi nợ chưa thanh toán mới được ghi nhận công nợ.', 'INVOICE_NOT_UNPAID');
        }
        if (!invoice.totalAmount.equals(input.amount)) {
          throw new AppError(400, 'Số tiền công nợ phải bằng tổng tiền hóa đơn.', 'DEBT_AMOUNT_MISMATCH');
        }
      }

      const record = await tx.debtRecord.create({
        data: {
          customerId: input.customer_id,
          invoiceId: input.invoice_id ?? null,
          amount: new Prisma.Decimal(input.amount),
          note: input.note || (input.invoice_id ? `Công nợ hóa đơn` : null),
        },
        include: debtInclude,
      });
      await tx.auditLog.create({
        data: {
          userId: createdById,
          action: 'Ghi nhận công nợ',
          target: 'Công nợ khách hàng',
          targetId: record.id,
          details: `Số tiền ${record.amount.toString()}${record.invoice ? `; hóa đơn ${record.invoice.code}` : ''}`,
        },
      });
      return record;
    }, { maxWait: 20000, timeout: 120000 });
  },

  async findCustomerDebtRecords(customerId: string) {
    return prisma.debtRecord.findMany({
      where: { customerId },
      include: debtInclude,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  },

  async findCustomerForDebt(customerId: string) {
    return prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true, phone: true, isRegular: true },
    });
  },

  async findDebtors(query: DebtListQuery) {
    return prisma.customer.findMany({
      where: {
        isRegular: true,
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { phone: { contains: query.search } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        code: true,
        name: true,
        phone: true,
        debtRecords: {
          include: debtInclude,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: { name: 'asc' },
    });
  },

  async recordPayment(input: CreateDebtPaymentInput, createdById: string, targetInvoiceId?: string) {
    return prisma.$transaction(async (tx) => {
      await lockCustomer(tx, input.customer_id);
      if (targetInvoiceId) {
        await tx.$queryRaw`SELECT "id" FROM "invoices" WHERE "id" = ${targetInvoiceId}::uuid FOR UPDATE`;
      }

      const records = await tx.debtRecord.findMany({
        where: {
          customerId: input.customer_id,
          ...(targetInvoiceId ? { invoiceId: targetInvoiceId } : {}),
          OR: [
            { invoiceId: null },
            { invoice: { is: { status: 'UNPAID', paymentMethod: 'DEBT', isDeleted: false } } },
          ],
        },
        include: debtInclude,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      if (records.length === 0) {
        if (targetInvoiceId) {
          const invoice = await tx.invoice.findUnique({ where: { id: targetInvoiceId }, select: { id: true, isDeleted: true } });
          if (!invoice || invoice.isDeleted) throw new AppError(404, 'Không tìm thấy hóa đơn.', 'INVOICE_NOT_FOUND');
          throw new AppError(409, 'Hóa đơn không còn khoản nợ cần thanh toán.', 'INVOICE_NOT_UNPAID');
        }
        throw new AppError(409, 'Khách hàng hiện không có khoản nợ cần thanh toán.', 'NO_OUTSTANDING_DEBT');
      }

      const balances = records.map((record) => ({ record, ...getDebtRecordBalance(record) }));
      const totalOutstanding = balances.reduce(
        (total, balance) => total.add(balance.outstanding),
        new Prisma.Decimal(0),
      );
      const requested = new Prisma.Decimal(input.amount);
      const paymentAmount = resolvePaymentAmount(requested, totalOutstanding, targetInvoiceId);

      const now = new Date();
      const paymentAllocations = allocateDebtPayment(
        balances.map(({ record, outstanding }) => ({
          debtRecordId: record.id,
          invoiceId: record.invoiceId,
          outstanding,
        })),
        paymentAmount,
      );
      const balancesById = new Map(balances.map((balance) => [balance.record.id, balance]));
      let remaining = paymentAmount;
      const allocations: { debt_record_id: string; invoice_id: string | null; amount: number }[] = [];
      for (const allocation of paymentAllocations) {
        const balance = balancesById.get(allocation.debtRecordId);
        if (!balance) {
          throw new AppError(500, 'Không thể phân bổ khoản thanh toán công nợ.', 'DEBT_ALLOCATION_FAILED');
        }
        const applied = allocation.amount;
        await tx.debtPayment.create({
          data: {
            customerId: input.customer_id,
            debtRecordId: allocation.debtRecordId,
            invoiceId: balance.record.invoiceId,
            amount: applied,
            paymentMethod: input.payment_method,
            paidAt: now,
            createdById,
            note: input.note || null,
          },
        });
        remaining = remaining.sub(applied);
        const newOutstanding = balance.outstanding.sub(applied);
        allocations.push({
          debt_record_id: allocation.debtRecordId,
          invoice_id: allocation.invoiceId,
          amount: applied.toNumber(),
        });
        if (newOutstanding.isZero()) {
          await tx.debtRecord.update({
            where: { id: balance.record.id },
            data: { settledAt: now },
          });
          if (balance.record.invoiceId) {
            const updated = await tx.invoice.updateMany({
              where: {
                id: balance.record.invoiceId,
                customerId: input.customer_id,
                status: 'UNPAID',
                paymentMethod: 'DEBT',
                isDeleted: false,
              },
              data: {
                status: 'PAID',
                paymentMethodSettled: input.payment_method,
                paidAt: now,
              },
            });
            if (updated.count !== 1) {
              throw new AppError(409, 'Hóa đơn đã được cập nhật bởi thao tác khác.', 'INVOICE_STATUS_CONFLICT');
            }
          }
        }
      }
      if (!remaining.isZero()) {
        throw new AppError(409, 'Số tiền trả vượt quá dư nợ hiện tại.', 'PAYMENT_EXCEEDS_DEBT');
      }
      await tx.auditLog.create({
        data: {
          userId: createdById,
          action: 'Ghi nhận thanh toán công nợ',
          target: 'Công nợ khách hàng',
          targetId: input.customer_id,
          details: `Số tiền ${paymentAmount.toString()}; phương thức ${input.payment_method}; phân bổ ${allocations.length} khoản`,
        },
      });
      return {
        amountPaid: paymentAmount,
        paymentMethod: input.payment_method,
        paidAt: now,
        allocations,
        totalDebt: totalOutstanding.sub(paymentAmount),
        customerId: input.customer_id,
      };
    }, { maxWait: 20000, timeout: 120000 });
  },

};
