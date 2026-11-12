import { Prisma } from '@prisma/client';
import { invoiceService } from './invoice.service.js';
import { reportRepository } from '../repositories/report.repository.js';
import { getHcmDateRange, getHcmDateString } from '../utils/date.js';
import type { ReportRangeQuery } from '../validators/report.validators.js';

type PaymentBreakdown = { cash: Prisma.Decimal; transfer: Prisma.Decimal; debt: Prisma.Decimal };
type PeriodMetrics = {
  key: string;
  invoiceCount: number;
  revenue: Prisma.Decimal;
  payments: PaymentBreakdown;
  costOfGoodsSold: Prisma.Decimal;
  returnedCost: Prisma.Decimal;
  exchangedCost: Prisma.Decimal;
  disposalCost: Prisma.Decimal;
  expenses: Prisma.Decimal;
};

const zero = () => new Prisma.Decimal(0);

function addDays(date: string, days: number): string {
  const result = new Date(`${date}T12:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function weekStart(date: string): string {
  const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

function periodKey(date: string, groupBy: ReportRangeQuery['group_by']): string {
  if (groupBy === 'month') return date.slice(0, 7);
  if (groupBy === 'week') return weekStart(date);
  return date;
}

function periodDates(key: string, groupBy: ReportRangeQuery['group_by']) {
  if (groupBy === 'month') {
    const [yearText, monthText] = key.split('-');
    const year = Number(yearText);
    const month = Number(monthText);
    const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { start: `${key}-01`, end: `${key}-${String(endDay).padStart(2, '0')}` };
  }
  if (groupBy === 'week') return { start: key, end: addDays(key, 6) };
  return { start: key, end: key };
}

function createMetrics(key: string): PeriodMetrics {
  return {
    key,
    invoiceCount: 0,
    revenue: zero(),
    payments: { cash: zero(), transfer: zero(), debt: zero() },
    costOfGoodsSold: zero(),
    returnedCost: zero(),
    exchangedCost: zero(),
    disposalCost: zero(),
    expenses: zero(),
  };
}

function addPaymentAmount(metrics: PeriodMetrics, paymentMethod: string, amount: Prisma.Decimal) {
  if (paymentMethod === 'CASH') metrics.payments.cash = metrics.payments.cash.add(amount);
  else if (paymentMethod === 'TRANSFER') metrics.payments.transfer = metrics.payments.transfer.add(amount);
  else metrics.payments.debt = metrics.payments.debt.add(amount);
}

async function collect(query: ReportRangeQuery) {
  const start = getHcmDateRange(query.from).start;
  const end = getHcmDateRange(query.to).end;
  const fromExpense = new Date(`${query.from}T00:00:00.000Z`);
  const toExpense = new Date(`${addDays(query.to, 1)}T00:00:00.000Z`);
  const [sales, returns, disposals, expenses] = await Promise.all([
    reportRepository.findSales(start, end),
    reportRepository.findApprovedReturns(start, end),
    reportRepository.findApprovedDisposals(start, end),
    reportRepository.findExpenses(fromExpense, toExpense),
  ]);
  const metrics = new Map<string, PeriodMetrics>();
  const ensure = (date: string) => {
    const key = periodKey(date, query.group_by);
    let value = metrics.get(key);
    if (!value) {
      value = createMetrics(key);
      metrics.set(key, value);
    }
    return value;
  };

  for (let date = query.from; date <= query.to; date = addDays(date, 1)) {
    const key = periodKey(date, query.group_by);
    if (!metrics.has(key)) metrics.set(key, createMetrics(key));
  }

  for (const invoice of sales) {
    const bucket = ensure(getHcmDateString(invoice.createdAt));
    bucket.invoiceCount += 1;
    bucket.revenue = bucket.revenue.add(invoice.totalAmount);
    addPaymentAmount(bucket, invoice.paymentMethod, invoice.totalAmount);
    for (const detail of invoice.details) {
      bucket.costOfGoodsSold = bucket.costOfGoodsSold.add(detail.costPrice.mul(detail.quantity));
    }
  }

  for (const slip of returns) {
    if (!slip.approvedAt) continue;
    const bucket = ensure(getHcmDateString(slip.approvedAt));
    bucket.revenue = bucket.revenue.add(slip.difference);
    addPaymentAmount(bucket, slip.invoice.paymentMethod, slip.difference);
    for (const item of slip.items) {
      const cost = item.costPrice.mul(item.quantity);
      if (item.kind === 'RETURNED') bucket.returnedCost = bucket.returnedCost.add(cost);
      else bucket.exchangedCost = bucket.exchangedCost.add(cost);
    }
  }

  for (const slip of disposals) {
    if (!slip.approvedAt) continue;
    const bucket = ensure(getHcmDateString(slip.approvedAt));
    for (const item of slip.items) bucket.disposalCost = bucket.disposalCost.add(item.totalValue);
  }

  for (const expense of expenses) {
    const date = expense.expenseDate.toISOString().slice(0, 10);
    const bucket = ensure(date);
    bucket.expenses = bucket.expenses.add(expense.amount);
  }

  return [...metrics.values()].sort((left, right) => left.key.localeCompare(right.key));
}

function bucketDto(metrics: PeriodMetrics, groupBy: ReportRangeQuery['group_by']) {
  const dates = periodDates(metrics.key, groupBy);
  const grossProfit = metrics.revenue
    .sub(metrics.costOfGoodsSold)
    .add(metrics.returnedCost)
    .sub(metrics.exchangedCost)
    .sub(metrics.disposalCost);
  const expensesToDeduct = groupBy === 'month' ? metrics.expenses : zero();
  return {
    period: metrics.key,
    period_start: dates.start,
    period_end: dates.end,
    revenue: metrics.revenue.toNumber(),
    invoice_count: metrics.invoiceCount,
    payment_methods: {
      cash: metrics.payments.cash.toNumber(),
      transfer: metrics.payments.transfer.toNumber(),
      debt: metrics.payments.debt.toNumber(),
    },
    cost_of_goods_sold: metrics.costOfGoodsSold.toNumber(),
    returned_cost: metrics.returnedCost.toNumber(),
    exchanged_cost: metrics.exchangedCost.toNumber(),
    disposal_cost: metrics.disposalCost.toNumber(),
    expenses: metrics.expenses.toNumber(),
    gross_profit: grossProfit.toNumber(),
    net_profit: grossProfit.sub(expensesToDeduct).toNumber(),
  };
}

function totalMetrics(metrics: PeriodMetrics[]): PeriodMetrics {
  return metrics.reduce((total, item) => ({
    key: 'total',
    invoiceCount: total.invoiceCount + item.invoiceCount,
    revenue: total.revenue.add(item.revenue),
    payments: {
      cash: total.payments.cash.add(item.payments.cash),
      transfer: total.payments.transfer.add(item.payments.transfer),
      debt: total.payments.debt.add(item.payments.debt),
    },
    costOfGoodsSold: total.costOfGoodsSold.add(item.costOfGoodsSold),
    returnedCost: total.returnedCost.add(item.returnedCost),
    exchangedCost: total.exchangedCost.add(item.exchangedCost),
    disposalCost: total.disposalCost.add(item.disposalCost),
    expenses: total.expenses.add(item.expenses),
  }), createMetrics('total'));
}

function toRangeQuery(from: string, to: string, groupBy: ReportRangeQuery['group_by']): ReportRangeQuery {
  return { from, to, group_by: groupBy };
}

export const reportService = {
  async revenue(query: ReportRangeQuery) {
    const metrics = await collect(query);
    const total = totalMetrics(metrics);
    return {
      from: query.from,
      to: query.to,
      group_by: query.group_by,
      summary: {
        total_revenue: total.revenue.toNumber(),
        invoice_count: total.invoiceCount,
        payment_methods: {
          cash: total.payments.cash.toNumber(),
          transfer: total.payments.transfer.toNumber(),
          debt: total.payments.debt.toNumber(),
        },
      },
      data: metrics.map((item) => {
        const bucket = bucketDto(item, query.group_by);
        return {
          period: bucket.period,
          period_start: bucket.period_start,
          period_end: bucket.period_end,
          revenue: bucket.revenue,
          invoice_count: bucket.invoice_count,
          payment_methods: bucket.payment_methods,
        };
      }),
    };
  },

  async profit(query: ReportRangeQuery) {
    const metrics = await collect(query);
    const total = totalMetrics(metrics);
    return {
      from: query.from,
      to: query.to,
      group_by: query.group_by,
      summary: {
        revenue: total.revenue.toNumber(),
        cost_of_goods_sold: total.costOfGoodsSold.toNumber(),
        returned_cost: total.returnedCost.toNumber(),
        exchanged_cost: total.exchangedCost.toNumber(),
        disposal_cost: total.disposalCost.toNumber(),
        expenses: total.expenses.toNumber(),
        gross_profit: total.revenue
          .sub(total.costOfGoodsSold)
          .add(total.returnedCost)
          .sub(total.exchangedCost)
          .sub(total.disposalCost)
          .toNumber(),
        net_profit: total.revenue
          .sub(total.costOfGoodsSold)
          .add(total.returnedCost)
          .sub(total.exchangedCost)
          .sub(total.disposalCost)
          .sub(query.group_by === 'month' ? total.expenses : zero())
          .toNumber(),
      },
      data: metrics.map((item) => bucketDto(item, query.group_by)),
    };
  },

  async daily(date: string) {
    const query = toRangeQuery(date, date, 'day');
    const [report, invoices] = await Promise.all([
      this.profit(query),
      invoiceService.list({ date }, true),
    ]);
    const paymentMethods = report.data[0]?.payment_methods ?? { cash: 0, transfer: 0, debt: 0 };
    return {
      date,
      totalRevenue: report.summary.revenue,
      cashAmount: paymentMethods.cash,
      transferAmount: paymentMethods.transfer,
      debtAmount: paymentMethods.debt,
      grossProfit: report.summary.gross_profit,
      invoices,
    };
  },

  async monthly(year: number, month: number) {
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const query = toRangeQuery(from, to, 'month');
    const [report, sales] = await Promise.all([
      this.profit(query),
      reportRepository.findSales(getHcmDateRange(from).start, getHcmDateRange(to).end),
    ]);
    const products = new Map<string, { barcode: string; name: string; quantity: number; totalAmount: number }>();
    for (const invoice of sales) {
      for (const detail of invoice.details) {
        const current = products.get(detail.productBarcode) ?? {
          barcode: detail.productBarcode,
          name: detail.productName,
          quantity: 0,
          totalAmount: 0,
        };
        current.quantity += detail.quantity;
        current.totalAmount += Number(detail.lineTotal);
        products.set(detail.productBarcode, current);
      }
    }
    return {
      year,
      month,
      totalRevenue: report.summary.revenue,
      totalExpenses: report.summary.expenses,
      netProfit: report.summary.net_profit,
      soldProducts: [...products.values()].sort((left, right) => right.quantity - left.quantity),
    };
  },
};
