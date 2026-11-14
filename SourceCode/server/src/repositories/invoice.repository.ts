import { InventoryTransactionType, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/AppError.js';
import { assertInvoiceDeletable } from '../utils/invoiceRules.js';
import type { InvoiceListQuery } from '../validators/invoice.validators.js';

export const invoiceInclude = {
  createdBy: { select: { id: true, fullName: true } },
  customer: { select: { id: true, name: true } },
  details: true,
} satisfies Prisma.InvoiceInclude;

export type SaleLine = {
  productId: string;
  productBarcode: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  costPrice: Prisma.Decimal;
};

export interface SaleStockLine {
  productId: string;
  productBarcode: string;
  productName: string;
  quantity: number;
}

export interface InvoiceRestoreLine {
  productId: string;
  quantity: number;
}

export async function restoreInvoiceStock(
  lines: InvoiceRestoreLine[],
  adapter: {
    incrementStock(line: InvoiceRestoreLine): Promise<number>;
    writeTransaction(line: InvoiceRestoreLine, stockAfter: number): Promise<void>;
  },
): Promise<Map<string, number>> {
  const stockAfter = new Map<string, number>();
  for (const line of lines) {
    const remaining = await adapter.incrementStock(line);
    stockAfter.set(line.productId, remaining);
    await adapter.writeTransaction(line, remaining);
  }
  return stockAfter;
}

export async function decrementSaleStock(
  lines: SaleStockLine[],
  adapter: {
    decrementIfAvailable(line: SaleStockLine): Promise<number | null>;
    getCurrentStock(productId: string): Promise<{ barcode: string; name: string; stockQuantity: number } | null>;
  },
): Promise<Map<string, number>> {
  const stockAfter = new Map<string, number>();

  for (const line of lines) {
    const remaining = await adapter.decrementIfAvailable(line);
    if (remaining !== null) {
      stockAfter.set(line.productId, remaining);
      continue;
    }

    const current = await adapter.getCurrentStock(line.productId);
    throw new AppError(409, 'Sản phẩm không đủ tồn kho.', 'INSUFFICIENT_STOCK', {
      insufficient_products: [{
        barcode: current?.barcode ?? line.productBarcode,
        name: current?.name ?? line.productName,
        current_stock: current?.stockQuantity ?? 0,
        requested_quantity: line.quantity,
      }],
    });
  }

  return stockAfter;
}

export const invoiceRepository = {
  async findProductsForSale(identifiers: { ids: string[]; barcodes: string[] }) {
    return prisma.product.findMany({
      where: {
        isDiscontinued: false,
        OR: [
          ...(identifiers.ids.length > 0 ? [{ id: { in: identifiers.ids } }] : []),
          ...(identifiers.barcodes.length > 0 ? [{ barcode: { in: identifiers.barcodes } }] : []),
        ],
      },
    });
  },

  async findCustomer(id: string) {
    return prisma.customer.findUnique({ where: { id } });
  },

  async createSale(input: {
    code: string;
    createdById: string;
    customerId?: string;
    paymentMethod: 'CASH' | 'TRANSFER' | 'DEBT';
    totalAmount: Prisma.Decimal;
    amountReceived?: Prisma.Decimal;
    changeGiven?: Prisma.Decimal;
    lines: SaleLine[];
  }) {
    return prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          code: input.code,
          createdById: input.createdById,
          customerId: input.customerId,
          paymentMethod: input.paymentMethod,
          status: input.paymentMethod === 'DEBT' ? 'UNPAID' : 'PAID',
          totalAmount: input.totalAmount,
          cashGiven: input.amountReceived,
          changeGiven: input.changeGiven,
          paidAt: input.paymentMethod === 'DEBT' ? null : new Date(),
          details: {
            create: input.lines.map((line) => ({
              productId: line.productId,
              productBarcode: line.productBarcode,
              productName: line.productName,
              unit: line.unit,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              costPrice: line.costPrice,
              lineTotal: line.unitPrice.mul(line.quantity),
            })),
          },
          ...(input.paymentMethod === 'DEBT' && input.customerId
            ? {
                debtRecord: {
                  create: {
                    customerId: input.customerId,
                    amount: input.totalAmount,
                    note: `Công nợ hóa đơn ${input.code}`,
                  },
                },
              }
            : {}),
        },
        include: invoiceInclude,
      });

      const stockAfter = await decrementSaleStock(input.lines, {
        decrementIfAvailable: async (line) => {
          const updated = await tx.product.updateMany({
            where: {
              id: line.productId,
              isDiscontinued: false,
              stockQuantity: { gte: line.quantity },
            },
            data: { stockQuantity: { decrement: line.quantity } },
          });
          if (updated.count !== 1) return null;

          const current = await tx.product.findUniqueOrThrow({
            where: { id: line.productId },
            select: { stockQuantity: true },
          });
          return current.stockQuantity;
        },
        getCurrentStock: (productId) => tx.product.findUnique({
          where: { id: productId },
          select: { barcode: true, name: true, stockQuantity: true },
        }),
      });

      for (const line of input.lines) {
        await tx.inventoryTransaction.create({
          data: {
            productId: line.productId,
            type: InventoryTransactionType.SALE,
            quantity: -line.quantity,
            stockAfter: stockAfter.get(line.productId)!,
            refType: 'INVOICE',
            refId: invoice.id,
            createdById: input.createdById,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: input.createdById,
          action: 'Tạo hóa đơn',
          target: 'Hóa đơn',
          targetId: invoice.id,
          details: `Mã ${invoice.code}, tổng tiền ${invoice.totalAmount.toString()}`,
        },
      });

      return invoice;
    }, { maxWait: 20000, timeout: 120000 });
  },

  async findMany(options: {
    dateRange?: { start: Date; end: Date };
    status?: 'PAID' | 'UNPAID';
    paymentMethod?: 'CASH' | 'TRANSFER' | 'DEBT';
    search?: string;
    skip?: number;
    take?: number;
  }) {
    return prisma.invoice.findMany({
      where: {
        isDeleted: false,
        ...(options.dateRange
          ? { createdAt: { gte: options.dateRange.start, lt: options.dateRange.end } }
          : {}),
        ...(options.status ? { status: options.status } : {}),
        ...(options.paymentMethod ? { paymentMethod: options.paymentMethod } : {}),
        ...(options.search
          ? {
              OR: [
                { code: { contains: options.search, mode: 'insensitive' } },
                { customer: { name: { contains: options.search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: invoiceInclude,
      orderBy: { createdAt: 'desc' },
      ...(options.skip === undefined ? {} : { skip: options.skip }),
      ...(options.take === undefined ? {} : { take: options.take }),
    });
  },

  async findById(id: string) {
    return prisma.invoice.findFirst({
      where: { id, isDeleted: false },
      include: { ...invoiceInclude, debtRecord: true, returnSlips: { select: { id: true } } },
    });
  },

  async findByCode(code: string) {
    return prisma.invoice.findFirst({
      where: { code, isDeleted: false },
      include: invoiceInclude,
    });
  },

  async codeExists(code: string) {
    return Boolean(await prisma.invoice.findUnique({ where: { code }, select: { id: true } }));
  },

  async softDelete(id: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id, isDeleted: false },
        include: { details: true, debtRecord: true, returnSlips: { select: { id: true } } },
      });
      if (!invoice) throw new AppError(404, 'Không tìm thấy hóa đơn!', 'INVOICE_NOT_FOUND');
      assertInvoiceDeletable(
        invoice.returnSlips.length > 0,
        Boolean(invoice.debtRecord) || invoice.status === 'UNPAID',
      );

      await restoreInvoiceStock(invoice.details, {
        incrementStock: async (detail) => {
          const product = await tx.product.update({
            where: { id: detail.productId },
            data: { stockQuantity: { increment: detail.quantity } },
            select: { stockQuantity: true },
          });
          return product.stockQuantity;
        },
        writeTransaction: async (detail, stockAfter) => {
          await tx.inventoryTransaction.create({
            data: {
              productId: detail.productId,
              type: InventoryTransactionType.ADJUSTMENT,
              quantity: detail.quantity,
              stockAfter,
              refType: 'INVOICE_DELETE',
              refId: invoice.id,
              createdById: userId,
            },
          });
        },
      });

      await tx.invoice.update({
        where: { id },
        data: { isDeleted: true, deletedById: userId, deletedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'Xóa hóa đơn',
          target: 'Hóa đơn',
          targetId: invoice.id,
          details: `Hoàn tồn ${invoice.details.length} dòng sản phẩm`,
        },
      });
    }, { maxWait: 20000, timeout: 120000 });
  },

  async todayMetrics(start: Date, end: Date) {
    const [sum, byMethod, count, invoices, lowStockCount] = await Promise.all([
      prisma.invoice.aggregate({
        where: { isDeleted: false, createdAt: { gte: start, lt: end } },
        _sum: { totalAmount: true },
      }),
      prisma.invoice.groupBy({
        by: ['paymentMethod'],
        where: { isDeleted: false, createdAt: { gte: start, lt: end } },
        _sum: { totalAmount: true },
      }),
      prisma.invoice.count({ where: { isDeleted: false, createdAt: { gte: start, lt: end } } }),
      prisma.invoice.findMany({
        where: { isDeleted: false, createdAt: { gte: start, lt: end } },
        include: invoiceInclude,
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.product.findMany({
        where: { isDiscontinued: false },
        select: { stockQuantity: true, minStock: true },
      }),
    ]);

    return {
      totalRevenue: sum._sum.totalAmount ?? new Prisma.Decimal(0),
      byMethod,
      count,
      invoices,
      lowStockCount: lowStockCount.filter((product) => product.stockQuantity <= product.minStock).length,
    };
  },

  async staffDayMetrics(userId: string, start: Date, end: Date) {
    const where = {
      createdById: userId,
      isDeleted: false,
      status: 'PAID' as const,
      OR: [
        { paidAt: { gte: start, lt: end } },
        { paidAt: null, createdAt: { gte: start, lt: end } },
      ],
    };
    const [aggregate, count] = await Promise.all([
      prisma.invoice.aggregate({
        where,
        _sum: { totalAmount: true },
        _min: { createdAt: true },
        _max: { createdAt: true },
      }),
      prisma.invoice.count({ where }),
    ]);
    return { aggregate, count };
  },

  async staffRecentInvoices(userId: string, limit = 25) {
    return prisma.invoice.findMany({
      where: {
        createdById: userId,
        isDeleted: false,
      },
      include: invoiceInclude,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },

  async topSellingProducts(start: Date, end: Date) {
    const grouped = await prisma.invoiceDetail.groupBy({
      by: ['productId', 'productBarcode', 'productName'],
      where: { invoice: { isDeleted: false, createdAt: { gte: start, lt: end } } },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 5,
    });

    const barcodes = grouped.map((g) => g.productBarcode);
    const products = barcodes.length
      ? await prisma.product.findMany({
          where: { barcode: { in: barcodes } },
          select: { barcode: true, unit: true, imageUrl: true },
        })
      : [];
    const productMap = new Map(products.map((p) => [p.barcode, p]));

    return grouped.map((item) => ({
      ...item,
      unit: productMap.get(item.productBarcode)?.unit || 'sản phẩm',
      imageUrl: productMap.get(item.productBarcode)?.imageUrl || null,
    }));
  },

  async listWithQuery(query: InvoiceListQuery) {
    const dateRange = query.date ? getDateRange(query.date) : undefined;
    return this.findMany({
      dateRange,
      status: query.status?.toUpperCase() as 'PAID' | 'UNPAID' | undefined,
      paymentMethod: query.payment_method?.toUpperCase() as 'CASH' | 'TRANSFER' | 'DEBT' | undefined,
      search: query.search,
      ...(query.page !== undefined || query.limit !== undefined
        ? {
            skip: ((query.page ?? 1) - 1) * (query.limit ?? 20),
            take: query.limit ?? 20,
          }
        : {}),
    });
  },
};

function getDateRange(date: string): { start: Date; end: Date } {
  const start = new Date(`${date}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}
