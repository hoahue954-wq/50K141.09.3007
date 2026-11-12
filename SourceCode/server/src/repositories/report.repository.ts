import { prisma } from '../config/prisma.js';

export function activeSalesWhere(from: Date, to: Date) {
  return { isDeleted: false, createdAt: { gte: from, lt: to } };
}

function hcmRange(from: Date, to: Date) {
  return { gte: from, lt: to };
}

export const reportRepository = {
  async findSales(from: Date, to: Date) {
    return prisma.invoice.findMany({
      where: activeSalesWhere(from, to),
      select: {
        id: true,
        code: true,
        createdAt: true,
        totalAmount: true,
        paymentMethod: true,
        details: {
          select: {
            productBarcode: true,
            productName: true,
            quantity: true,
            lineTotal: true,
            costPrice: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  },

  async findApprovedReturns(from: Date, to: Date) {
    return prisma.returnSlip.findMany({
      where: {
        isDeleted: false,
        status: 'APPROVED',
        approvedAt: hcmRange(from, to),
      },
      select: {
        approvedAt: true,
        difference: true,
        invoice: { select: { paymentMethod: true } },
        items: {
          select: {
            kind: true,
            quantity: true,
            costPrice: true,
          },
        },
      },
      orderBy: { approvedAt: 'asc' },
    });
  },

  async findApprovedDisposals(from: Date, to: Date) {
    return prisma.disposalSlip.findMany({
      where: {
        isDeleted: false,
        status: 'APPROVED',
        approvedAt: hcmRange(from, to),
      },
      select: {
        approvedAt: true,
        items: { select: { totalValue: true } },
      },
      orderBy: { approvedAt: 'asc' },
    });
  },

  async findExpenses(fromDate: Date, toDate: Date) {
    return prisma.expense.findMany({
      where: { expenseDate: { gte: fromDate, lt: toDate } },
      select: { expenseDate: true, amount: true },
      orderBy: { expenseDate: 'asc' },
    });
  },
};
