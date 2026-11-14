import { InventoryTransactionType, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/AppError.js';
import { claimPendingRecord } from '../utils/approval.js';
import { generateCode } from '../utils/codes.js';
import type { ReturnListQuery } from '../validators/return.validators.js';

export const returnInclude = {
  createdBy: { select: { id: true, fullName: true } },
  approvedBy: { select: { id: true, fullName: true } },
  invoice: { select: { id: true, code: true } },
  items: { orderBy: [{ kind: 'asc' as const }, { productName: 'asc' as const }] },
} satisfies Prisma.ReturnSlipInclude;

export type ReturnRecord = Prisma.ReturnSlipGetPayload<{ include: typeof returnInclude }>;

export interface ReturnLine {
  productId: string;
  invoiceDetailId: string | null;
  kind: 'RETURNED' | 'EXCHANGED';
  productBarcode: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  costPrice: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
}

export interface ReturnSlipWrite {
  type: 'RETURN' | 'EXCHANGE';
  reason: string;
  evidenceUrl: string;
  totalRefund: Prisma.Decimal;
  difference: Prisma.Decimal;
  items: ReturnLine[];
}

export function assertReturnQuantitiesAvailable(
  lines: Array<{ invoiceDetailId: string | null; quantity: number }>,
  boughtByDetail: Map<string, number>,
  alreadyReturnedByDetail: Map<string, number>,
): void {
  const requested = new Map<string, number>();
  for (const line of lines) {
    if (!line.invoiceDetailId) {
      throw new AppError(400, 'Sản phẩm trả không thuộc hóa đơn gốc.', 'RETURN_ITEM_NOT_IN_INVOICE');
    }
    requested.set(line.invoiceDetailId, (requested.get(line.invoiceDetailId) ?? 0) + line.quantity);
  }

  const exceeded = [...requested.entries()]
    .map(([invoiceDetailId, quantity]) => ({
      invoiceDetailId,
      quantity,
      available: (boughtByDetail.get(invoiceDetailId) ?? 0) -
        (alreadyReturnedByDetail.get(invoiceDetailId) ?? 0),
    }))
    .filter((line) => line.quantity > line.available);
  if (exceeded.length) {
    throw new AppError(409, 'Số lượng trả vượt quá số lượng còn được phép trả trên hóa đơn.', 'RETURN_QUANTITY_EXCEEDED', {
      products: exceeded.map((line) => ({
        invoice_detail_id: line.invoiceDetailId,
        available_quantity: Math.max(0, line.available),
        requested_quantity: line.quantity,
      })),
    });
  }
}

export async function applyReturnStock(
  items: ReturnLine[],
  adapter: {
    incrementStock(item: ReturnLine): Promise<number>;
    decrementIfAvailable(item: ReturnLine): Promise<number | null>;
    getCurrentStock(item: ReturnLine): Promise<number>;
    writeTransaction(item: ReturnLine, quantity: number, stockAfter: number): Promise<void>;
  },
): Promise<Map<string, number>> {
  const stockAfter = new Map<string, number>();
  const orderedItems = [
    ...items.filter((item) => item.kind === 'RETURNED'),
    ...items.filter((item) => item.kind === 'EXCHANGED'),
  ];

  for (const item of orderedItems) {
    const quantity = item.kind === 'RETURNED' ? item.quantity : -item.quantity;
    const remaining = item.kind === 'RETURNED'
      ? await adapter.incrementStock(item)
      : await adapter.decrementIfAvailable(item);
    if (remaining === null) {
      throw new AppError(409, 'Sản phẩm đổi không đủ tồn kho.', 'INSUFFICIENT_STOCK', {
        insufficient_products: [{
          barcode: item.productBarcode,
          name: item.productName,
          current_stock: await adapter.getCurrentStock(item),
          requested_quantity: item.quantity,
        }],
      });
    }
    stockAfter.set(item.productId, remaining);
    await adapter.writeTransaction(item, quantity, remaining);
  }
  return stockAfter;
}

export function returnStockAdjustments(previousItems: ReturnLine[], nextItems: ReturnLine[]): ReturnLine[] {
  const deltas = new Map<string, { quantity: number; item: ReturnLine }>();
  const accumulate = (item: ReturnLine, multiplier: number) => {
    const direction = item.kind === 'RETURNED' ? 1 : -1;
    const current = deltas.get(item.productId);
    deltas.set(item.productId, {
      quantity: (current?.quantity ?? 0) + direction * item.quantity * multiplier,
      item: current?.item ?? item,
    });
  };

  previousItems.forEach((item) => accumulate(item, -1));
  nextItems.forEach((item) => accumulate(item, 1));

  return [...deltas.values()]
    .filter(({ quantity }) => quantity !== 0)
    .map(({ quantity, item }) => ({
      ...item,
      kind: quantity > 0 ? 'RETURNED' : 'EXCHANGED',
      quantity: Math.abs(quantity),
      lineTotal: item.unitPrice.mul(Math.abs(quantity)),
    }));
}

function stockAdapter(tx: Prisma.TransactionClient, slipId: string, userId: string) {
  return {
    incrementStock: async (item: ReturnLine) => {
      const product = await tx.product.update({
        where: { id: item.productId },
        data: { stockQuantity: { increment: item.quantity } },
        select: { stockQuantity: true },
      });
      return product.stockQuantity;
    },
    decrementIfAvailable: async (item: ReturnLine) => {
      const updated = await tx.product.updateMany({
        where: {
          id: item.productId,
          stockQuantity: { gte: item.quantity },
        },
        data: { stockQuantity: { decrement: item.quantity } },
      });
      if (updated.count !== 1) return null;
      const product = await tx.product.findUniqueOrThrow({
        where: { id: item.productId },
        select: { stockQuantity: true },
      });
      return product.stockQuantity;
    },
    getCurrentStock: async (item: ReturnLine) => (await tx.product.findUnique({
      where: { id: item.productId },
      select: { stockQuantity: true },
    }))?.stockQuantity ?? 0,
    writeTransaction: async (item: ReturnLine, quantity: number, stockAfter: number) => {
      await tx.inventoryTransaction.create({
        data: {
          productId: item.productId,
          type: InventoryTransactionType.RETURN,
          quantity,
          stockAfter,
          refType: 'RETURN',
          refId: slipId,
          createdById: userId,
        },
      });
    },
  };
}

async function lockInvoiceAndCustomer(tx: Prisma.TransactionClient, invoiceId: string): Promise<void> {
  const invoice = await tx.invoice.findFirst({
    where: { id: invoiceId, isDeleted: false },
    select: { customerId: true },
  });
  if (!invoice) throw new AppError(404, 'Không tìm thấy hóa đơn gốc.', 'INVOICE_NOT_FOUND');
  if (invoice.customerId) {
    await tx.$queryRaw`SELECT "id" FROM "customers" WHERE "id" = ${invoice.customerId}::uuid FOR UPDATE`;
  }
  await tx.$queryRaw`SELECT "id" FROM "invoices" WHERE "id" = ${invoiceId}::uuid FOR UPDATE`;
}

async function applyReturnDebtCredit(
  tx: Prisma.TransactionClient,
  slip: ReturnRecord,
  reconcilePreviouslyCredited = false,
): Promise<Prisma.Decimal> {
  const invoice = await tx.invoice.findUnique({
    where: { id: slip.invoice.id },
    include: { debtRecord: true },
  });
  if (
    !invoice ||
    invoice.paymentMethod !== 'DEBT' ||
    (invoice.status !== 'UNPAID' && !reconcilePreviouslyCredited)
  ) {
    return new Prisma.Decimal(0);
  }
  if (!invoice.debtRecord) {
    throw new AppError(409, 'Không tìm thấy bản ghi công nợ của hóa đơn.', 'DEBT_RECORD_NOT_FOUND');
  }

  const [payments, priorCredits] = await Promise.all([
    tx.debtPayment.aggregate({
      where: { invoiceId: invoice.id },
      _sum: { amount: true },
    }),
    tx.returnSlip.aggregate({
      where: {
        invoiceId: invoice.id,
        id: { not: slip.id },
        status: 'APPROVED',
        isDeleted: false,
      },
      _sum: { debtCredit: true },
    }),
  ]);
  const paid = payments._sum.amount ?? new Prisma.Decimal(0);
  const credited = priorCredits._sum.debtCredit ?? new Prisma.Decimal(0);
  const outstanding = Prisma.Decimal.max(
    new Prisma.Decimal(0),
    invoice.totalAmount.sub(paid).sub(credited),
  );
  const netCredit = Prisma.Decimal.max(new Prisma.Decimal(0), slip.totalRefund.sub(
    slip.items
      .filter((item) => item.kind === 'EXCHANGED')
      .reduce((sum, item) => sum.add(item.lineTotal), new Prisma.Decimal(0)),
  ));
  const debtCredit = Prisma.Decimal.min(outstanding, netCredit);
  const remaining = outstanding.sub(debtCredit);
  const now = new Date();

  await tx.returnSlip.update({ where: { id: slip.id }, data: { debtCredit } });
  await tx.invoice.update({
    where: { id: invoice.id },
    data: remaining.isZero()
      ? { status: 'PAID', paidAt: invoice.paidAt ?? now }
      : { status: 'UNPAID', paidAt: null, paymentMethodSettled: null },
  });
  await tx.debtRecord.update({
    where: { id: invoice.debtRecord.id },
    data: { settledAt: remaining.isZero() ? now : null },
  });
  return debtCredit;
}

async function approveWithinTransaction(
  tx: Prisma.TransactionClient,
  id: string,
  userId: string,
  automaticallyRecorded = false,
): Promise<ReturnRecord> {
  const claimed = await claimPendingRecord(async () => (await tx.returnSlip.updateMany({
    where: { id, status: 'PENDING', isDeleted: false },
    data: {
      status: 'APPROVED',
      approvedById: automaticallyRecorded ? null : userId,
      approvedAt: new Date(),
    },
  })).count);
  if (!claimed) {
    const current = await tx.returnSlip.findUnique({
      where: { id },
      select: { status: true, isDeleted: true },
    });
    if (!current || current.isDeleted) throw new AppError(404, 'Không tìm thấy phiếu đổi/trả.', 'RETURN_NOT_FOUND');
    throw new AppError(409, 'Phiếu đổi/trả không ở trạng thái chờ duyệt.', 'RETURN_NOT_PENDING');
  }

  const slip = await tx.returnSlip.findUniqueOrThrow({ where: { id }, include: returnInclude });
  await applyReturnStock(slip.items, stockAdapter(tx, slip.id, userId));
  const debtCredit = await applyReturnDebtCredit(tx, slip);
  await tx.auditLog.create({
    data: {
      userId,
      action: automaticallyRecorded ? 'Ghi nhận phiếu đổi/trả' : 'Duyệt phiếu đổi/trả',
      target: 'Phiếu đổi trả',
      targetId: slip.id,
      details: `Mã ${slip.code}; hoàn ${slip.totalRefund.toString()}; chênh lệch ${slip.difference.toString()}; cấn nợ ${debtCredit.toString()}`,
    },
  });
  return tx.returnSlip.findUniqueOrThrow({ where: { id }, include: returnInclude });
}

function assertWithin24Hours(createdAt: Date): void {
  const elapsed = Date.now() - createdAt.getTime();
  if (elapsed < 0 || elapsed > 24 * 60 * 60 * 1000) {
    throw new AppError(400, 'Hóa đơn đã quá thời hạn đổi/trả 24 giờ.', 'RETURN_WINDOW_EXPIRED');
  }
}

export const returnRepository = {
  async findInvoice(identifier: { id?: string; code?: string }) {
    return prisma.invoice.findFirst({
      where: {
        isDeleted: false,
        ...(identifier.id ? { id: identifier.id } : { code: identifier.code }),
      },
      include: {
        details: true,
        returnSlips: {
          where: {
            isDeleted: false,
            status: { in: ['PENDING', 'APPROVED'] },
          },
          include: { items: true },
        },
      },
    });
  },

  async findProducts(identifiers: { ids: string[]; barcodes: string[] }) {
    return prisma.product.findMany({
      where: {
        isDiscontinued: false,
        OR: [
          ...(identifiers.ids.length ? [{ id: { in: identifiers.ids } }] : []),
          ...(identifiers.barcodes.length ? [{ barcode: { in: identifiers.barcodes } }] : []),
        ],
      },
    });
  },

  async create(input: {
    invoiceId: string;
    code: string;
    createdById: string;
    write: ReturnSlipWrite;
  }): Promise<ReturnRecord> {
    return prisma.$transaction(async (tx) => {
      await lockInvoiceAndCustomer(tx, input.invoiceId);
      const invoice = await tx.invoice.findFirst({
        where: { id: input.invoiceId, isDeleted: false },
        include: { details: true },
      });
      if (!invoice) throw new AppError(404, 'Không tìm thấy hóa đơn gốc.', 'INVOICE_NOT_FOUND');
      assertWithin24Hours(invoice.createdAt);

      const previous = await tx.returnSlip.findMany({
        where: {
          invoiceId: invoice.id,
          isDeleted: false,
          status: { in: ['PENDING', 'APPROVED'] },
        },
        select: { items: { where: { kind: 'RETURNED' }, select: { invoiceDetailId: true, quantity: true } } },
      });
      const bought = new Map(invoice.details.map((detail) => [detail.id, detail.quantity]));
      const returned = new Map<string, number>();
      for (const slip of previous) {
        for (const item of slip.items) {
          if (item.invoiceDetailId) {
            returned.set(item.invoiceDetailId, (returned.get(item.invoiceDetailId) ?? 0) + item.quantity);
          }
        }
      }
      assertReturnQuantitiesAvailable(
        input.write.items.filter((item) => item.kind === 'RETURNED'),
        bought,
        returned,
      );

      const slip = await tx.returnSlip.create({
        data: {
          code: input.code,
          invoiceId: invoice.id,
          createdById: input.createdById,
          reason: input.write.reason,
          evidenceUrl: input.write.evidenceUrl,
          type: input.write.type,
          status: 'PENDING',
          totalRefund: input.write.totalRefund,
          difference: input.write.difference,
          items: {
            create: input.write.items.map((item) => ({
              productId: item.productId,
              invoiceDetailId: item.invoiceDetailId,
              kind: item.kind,
              productBarcode: item.productBarcode,
              productName: item.productName,
              unit: item.unit,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              costPrice: item.costPrice,
              lineTotal: item.lineTotal,
            })),
          },
        },
        include: returnInclude,
      });
      await tx.auditLog.create({
        data: {
          userId: input.createdById,
          action: 'Tạo phiếu đổi/trả',
          target: 'Phiếu đổi trả',
          targetId: slip.id,
          details: `Mã ${slip.code}; hóa đơn ${invoice.code}; hoàn ${slip.totalRefund.toString()}; chênh lệch ${slip.difference.toString()}`,
        },
      });
      return approveWithinTransaction(tx, slip.id, input.createdById, true);
    }, { maxWait: 20000, timeout: 120000 });
  },

  async findMany(options: {
    creatorId?: string;
    status?: 'PENDING' | 'APPROVED' | 'REJECTED';
    type?: 'RETURN' | 'EXCHANGE';
    search?: string;
    invoiceCode?: string;
    dateRange?: { start: Date; end: Date };
    skip?: number;
    take?: number;
  }): Promise<ReturnRecord[]> {
    return prisma.returnSlip.findMany({
      where: {
        isDeleted: false,
        ...(options.creatorId ? { createdById: options.creatorId } : {}),
        ...(options.status ? { status: options.status } : {}),
        ...(options.type ? { type: options.type } : {}),
        ...(options.search
          ? {
              OR: [
                { code: { contains: options.search, mode: 'insensitive' } },
                { invoice: { code: { contains: options.search, mode: 'insensitive' } } },
              ],
            }
          : {}),
        ...(options.invoiceCode
          ? { invoice: { code: { contains: options.invoiceCode, mode: 'insensitive' } } }
          : {}),
        ...(options.dateRange
          ? { createdAt: { gte: options.dateRange.start, lt: options.dateRange.end } }
          : {}),
      },
      include: returnInclude,
      orderBy: { createdAt: 'desc' },
      ...(options.skip === undefined ? {} : { skip: options.skip }),
      ...(options.take === undefined ? {} : { take: options.take }),
    });
  },

  async findById(id: string, creatorId?: string): Promise<ReturnRecord | null> {
    return prisma.returnSlip.findFirst({
      where: { id, isDeleted: false, ...(creatorId ? { createdById: creatorId } : {}) },
      include: returnInclude,
    });
  },

  async update(id: string, userId: string, write: ReturnSlipWrite): Promise<ReturnRecord> {
    return prisma.$transaction(async (tx) => {
      const initial = await tx.returnSlip.findFirst({
        where: { id, isDeleted: false },
        select: { invoiceId: true },
      });
      if (!initial) throw new AppError(404, 'Không tìm thấy phiếu đổi/trả.', 'RETURN_NOT_FOUND');
      await lockInvoiceAndCustomer(tx, initial.invoiceId);
      const current = await tx.returnSlip.findFirst({
        where: { id, isDeleted: false },
        include: returnInclude,
      });
      if (!current) throw new AppError(404, 'Không tìm thấy phiếu đổi/trả.', 'RETURN_NOT_FOUND');
      if (current.status !== 'PENDING' && current.status !== 'APPROVED') {
        throw new AppError(409, 'Chỉ được sửa phiếu đổi/trả đã ghi nhận.', 'RETURN_NOT_PENDING');
      }

      const invoice = await tx.invoice.findFirst({
        where: { id: current.invoiceId, isDeleted: false },
        include: { details: true },
      });
      if (!invoice) throw new AppError(404, 'Không tìm thấy hóa đơn gốc.', 'INVOICE_NOT_FOUND');
      assertWithin24Hours(invoice.createdAt);
      const previous = await tx.returnSlip.findMany({
        where: {
          invoiceId: invoice.id,
          id: { not: id },
          isDeleted: false,
          status: { in: ['PENDING', 'APPROVED'] },
        },
        select: { items: { where: { kind: 'RETURNED' }, select: { invoiceDetailId: true, quantity: true } } },
      });
      const bought = new Map(invoice.details.map((detail) => [detail.id, detail.quantity]));
      const returned = new Map<string, number>();
      for (const slip of previous) {
        for (const item of slip.items) {
          if (item.invoiceDetailId) {
            returned.set(item.invoiceDetailId, (returned.get(item.invoiceDetailId) ?? 0) + item.quantity);
          }
        }
      }
      assertReturnQuantitiesAvailable(
        write.items.filter((item) => item.kind === 'RETURNED'),
        bought,
        returned,
      );

      const claimed = await tx.returnSlip.updateMany({
        where: { id, status: current.status, isDeleted: false },
        data: {
          type: write.type,
          reason: write.reason,
          evidenceUrl: write.evidenceUrl,
          totalRefund: write.totalRefund,
          difference: write.difference,
        },
      });
      if (claimed.count !== 1) {
        throw new AppError(409, 'Phiếu đổi/trả đã được cập nhật bởi thao tác khác.', 'RETURN_STATUS_CONFLICT');
      }
      await tx.returnItem.deleteMany({ where: { returnSlipId: id } });
      await tx.returnItem.createMany({
        data: write.items.map((item) => ({
          returnSlipId: id,
          productId: item.productId,
          invoiceDetailId: item.invoiceDetailId,
          kind: item.kind,
          productBarcode: item.productBarcode,
          productName: item.productName,
          unit: item.unit,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          costPrice: item.costPrice,
          lineTotal: item.lineTotal,
        })),
      });
      const updatedSlip = await tx.returnSlip.findUniqueOrThrow({ where: { id }, include: returnInclude });
      if (current.status === 'APPROVED') {
        await applyReturnStock(
          returnStockAdjustments(current.items, write.items),
          stockAdapter(tx, id, userId),
        );
        await applyReturnDebtCredit(tx, updatedSlip, !current.debtCredit.isZero());
      }
      const slip = await tx.returnSlip.findUniqueOrThrow({ where: { id }, include: returnInclude });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'Sửa phiếu đổi/trả',
          target: 'Phiếu đổi trả',
          targetId: id,
          details: `Mã ${slip.code}; hoàn ${slip.totalRefund.toString()}; chênh lệch ${slip.difference.toString()}`,
        },
      });
      return slip;
    }, { maxWait: 20000, timeout: 120000 });
  },

  async approve(id: string, userId: string): Promise<ReturnRecord> {
    return prisma.$transaction(async (tx) => {
      const current = await tx.returnSlip.findFirst({
        where: { id, isDeleted: false },
        select: { invoiceId: true },
      });
      if (!current) throw new AppError(404, 'Không tìm thấy phiếu đổi/trả.', 'RETURN_NOT_FOUND');
      await lockInvoiceAndCustomer(tx, current.invoiceId);
      return approveWithinTransaction(tx, id, userId);
    }, { maxWait: 20000, timeout: 120000 });
  },

  async reject(id: string, userId: string): Promise<ReturnRecord> {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.returnSlip.updateMany({
        where: { id, status: 'PENDING', isDeleted: false },
        data: { status: 'REJECTED', approvedById: userId, approvedAt: new Date() },
      });
      if (updated.count !== 1) {
        const current = await tx.returnSlip.findUnique({
          where: { id },
          select: { status: true, isDeleted: true },
        });
        if (!current || current.isDeleted) throw new AppError(404, 'Không tìm thấy phiếu đổi/trả.', 'RETURN_NOT_FOUND');
        throw new AppError(409, 'Phiếu đổi/trả không ở trạng thái chờ duyệt.', 'RETURN_NOT_PENDING');
      }
      const slip = await tx.returnSlip.findUniqueOrThrow({ where: { id }, include: returnInclude });
      await tx.auditLog.create({
        data: { userId, action: 'Từ chối phiếu đổi/trả', target: 'Phiếu đổi trả', targetId: id },
      });
      return slip;
    }, { maxWait: 20000, timeout: 120000 });
  },

  async softDelete(id: string, userId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.returnSlip.updateMany({
        where: { id, status: 'PENDING', isDeleted: false },
        data: { isDeleted: true, deletedAt: new Date(), deletedById: userId },
      });
      if (updated.count !== 1) {
        const current = await tx.returnSlip.findUnique({
          where: { id },
          select: { status: true, isDeleted: true },
        });
        if (!current || current.isDeleted) throw new AppError(404, 'Không tìm thấy phiếu đổi/trả.', 'RETURN_NOT_FOUND');
        throw new AppError(409, 'Chỉ được xóa phiếu đổi/trả đang chờ duyệt.', 'RETURN_NOT_PENDING');
      }
      await tx.auditLog.create({
        data: { userId, action: 'Xóa phiếu đổi/trả', target: 'Phiếu đổi trả', targetId: id },
      });
    }, { maxWait: 20000, timeout: 120000 });
  },

  createCode(): Promise<string> {
    return generateCode('return', async (code) =>
      Boolean(await prisma.returnSlip.findUnique({ where: { code }, select: { id: true } })),
    );
  },
};
