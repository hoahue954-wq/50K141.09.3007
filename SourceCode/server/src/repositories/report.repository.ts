import { prisma } from '../config/prisma.js';

export function activeSalesWhere(from: Date, to: Date) {
  return {
    isDeleted: false,
    status: 'PAID' as const,
    OR: [
      { paidAt: { gte: from, lt: to } },
      { paidAt: null, createdAt: { gte: from, lt: to } },
    ],
  };
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
        paidAt: true,
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

  async saveExpenses(
    expenses: Array<{
      expenseDate: Date;
      category: any;
      amount: any;
      notes?: string | null;
    }>,
    createdById: string,
    replaceRange?: { from: Date; to: Date },
  ) {
    return prisma.$transaction(async (tx) => {
      if (replaceRange) {
        await tx.expense.deleteMany({
          where: {
            expenseDate: {
              gte: replaceRange.from,
              lte: replaceRange.to,
            },
          },
        });
      }
      const created = await tx.expense.createMany({
        data: expenses.map((e) => ({
          expenseDate: e.expenseDate,
          category: e.category,
          amount: e.amount,
          notes: e.notes ?? null,
          createdById,
        })),
      });
      await tx.auditLog.create({
        data: {
          userId: createdById,
          action: 'Nhập chi phí từ Excel',
          target: 'Chi phí',
          targetId: 'expenses',
          details: `Nhập thành công ${expenses.length} dòng chi phí`,
        },
      });
      return created;
    });
  },
};
