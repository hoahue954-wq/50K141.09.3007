import { Prisma } from '@prisma/client';
import { debtRepository, getDebtRecordBalance, type DebtRecordWithRelations } from '../repositories/debt.repository.js';
import { invoiceRepository } from '../repositories/invoice.repository.js';
import { AppError } from '../utils/AppError.js';
import type { AuthenticatedProfile } from '../types/auth.js';
import type { CreateDebtInput, CreateDebtPaymentInput, DebtListQuery } from '../validators/debt.validators.js';

function paymentDto(payment: DebtRecordWithRelations['payments'][number]) {
  return {
    id: payment.id,
    amount: Number(payment.amount),
    payment_method: payment.paymentMethod?.toLowerCase() ?? null,
    paid_at: payment.paidAt.toISOString(),
    created_by_id: payment.createdBy.id,
    created_by_name: payment.createdBy.fullName,
    note: payment.note,
  };
}

function debtDto(record: DebtRecordWithRelations) {
  const balance = getDebtRecordBalance(record);
  return {
    id: record.id,
    customer_id: record.customerId,
    invoice_id: record.invoiceId,
    invoice_code: record.invoice?.code ?? null,
    created_at: record.createdAt.toISOString(),
    amount: Number(record.amount),
    paid_amount: balance.paid.toNumber(),
    debt_credit: balance.credit.toNumber(),
    outstanding_amount: balance.outstanding.toNumber(),
    settled_at: record.settledAt?.toISOString() ?? null,
    note: record.note,
    payments: record.payments.map(paymentDto),
  };
}

export const debtService = {
  async create(input: CreateDebtInput, profile: AuthenticatedProfile) {
    return debtDto(await debtRepository.create(input, profile.id));
  },

  async list(query: DebtListQuery) {
    const customers = await debtRepository.findDebtors(query);
    const debtors = customers
      .map((customer) => {
        const debts = customer.debtRecords.map((record) => ({
          record,
          balance: getDebtRecordBalance(record),
        }));
        const totalDebt = debts.reduce(
          (total, debt) => total.add(debt.balance.outstanding),
          new Prisma.Decimal(0),
        );
        return {
          id: customer.id,
          code: customer.code,
          name: customer.name,
          phone: customer.phone,
          total_debt: totalDebt.toNumber(),
          outstanding_invoices: debts
            .filter((debt) => debt.record.invoiceId && debt.balance.outstanding.greaterThan(0))
            .map(({ record, balance }) => ({
              invoice_id: record.invoiceId,
              invoice_code: record.invoice?.code ?? null,
              created_at: record.invoice?.createdAt.toISOString() ?? record.createdAt.toISOString(),
              outstanding_amount: balance.outstanding.toNumber(),
            })),
        };
      })
      .filter((customer) => customer.total_debt > 0);

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    return {
      debts: debtors.slice((page - 1) * limit, page * limit),
      page,
      limit,
      total: debtors.length,
    };
  },

  async getCustomerDebt(customerId: string) {
    const customer = await debtRepository.findCustomerForDebt(customerId);
    if (!customer) throw new AppError(404, 'Không tìm thấy khách hàng.', 'CUSTOMER_NOT_FOUND');
    const records = await debtRepository.findCustomerDebtRecords(customerId);
    const debts = records.map(debtDto);
    const totalDebt = records.reduce(
      (total, record) => total.add(getDebtRecordBalance(record).outstanding),
      new Prisma.Decimal(0),
    );
    const payments = records
      .flatMap((record) => record.payments.map((payment) => ({
        ...paymentDto(payment),
        debt_record_id: record.id,
        invoice_id: record.invoiceId,
        invoice_code: record.invoice?.code ?? null,
      })))
      .sort((left, right) => left.paid_at.localeCompare(right.paid_at));
    return {
      customer_id: customer.id,
      customer_name: customer.name,
      phone: customer.phone,
      total_debt: totalDebt.toNumber(),
      debts,
      payments,
    };
  },

  async pay(input: CreateDebtPaymentInput, profile: AuthenticatedProfile) {
    return debtRepository.recordPayment(input, profile.id);
  },

  async settleInvoice(
    invoiceId: string,
    input: { amountReceived?: Prisma.Decimal; paymentMethod: 'CASH' | 'TRANSFER' },
    profile: AuthenticatedProfile,
  ) {
    const invoice = await invoiceRepository.findById(invoiceId);
    if (!invoice) throw new AppError(404, 'Không tìm thấy hóa đơn!', 'INVOICE_NOT_FOUND');
    if (invoice.status !== 'UNPAID' || invoice.paymentMethod !== 'DEBT' || !invoice.customerId) {
      throw new AppError(409, 'Chỉ hóa đơn ghi nợ chưa thanh toán mới được gạch nợ.', 'INVOICE_NOT_UNPAID');
    }
    const payment: CreateDebtPaymentInput = {
      customer_id: invoice.customerId,
      amount: (input.amountReceived ?? invoice.totalAmount).toNumber(),
      payment_method: input.paymentMethod,
    };
    await debtRepository.recordPayment(payment, profile.id, invoiceId);
    const updated = await invoiceRepository.findById(invoiceId);
    if (!updated) throw new AppError(404, 'Không tìm thấy hóa đơn!', 'INVOICE_NOT_FOUND');
    return updated;
  },
};
