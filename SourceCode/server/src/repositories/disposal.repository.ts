import { InventoryTransactionType, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/AppError.js';
import { claimPendingRecord } from '../utils/approval.js';
import { generateCode } from '../utils/codes.js';
import type { DisposalListQuery } from '../validators/disposal.validators.js';

export const disposalInclude = {
  createdBy: { select: { id: true, fullName: true } },
  approvedBy: { select: { id: true, fullName: true } },
  items: { orderBy: { productName: 'asc' as const } },
} satisfies Prisma.DisposalSlipInclude;

export type DisposalRecord = Prisma.DisposalSlipGetPayload<{ include: typeof disposalInclude }>;

export interface DisposalLine {
  productId: string;
  productBarcode: string;
  productName: string;
  unit: string;
  quantity: number;
  costPrice: Prisma.Decimal;
  totalValue: Prisma.Decimal;
}

export async function applyDisposalStock(
  items: DisposalLine[],
  adapter: {
    decrementIfAvailable(item: DisposalLine): Promise<number | null>;
    getCurrentStock(item: DisposalLine): Promise<number>;
    writeTransaction(item: DisposalLine, stockAfter: number): Promise<void>;
  },
): Promise<Map<string, number>> {
  const insufficient: {
    barcode: string;
    name: string;
    current_stock: number;
    requested_quantity: number;
  }[] = [];
  const stockAfter = new Map<string, number>();

  for (const item of items) {
    const remaining = await adapter.decrementIfAvailable(item);
    if (remaining === null) {
      insufficient.push({
        barcode: item.productBarcode,
        name: item.productName,
        current_stock: await adapter.getCurrentStock(item),
        requested_quantity: item.quantity,
      });
      continue;
    }
    stockAfter.set(item.productId, remaining);
    await adapter.writeTransaction(item, remaining);
  }
  if (insufficient.length) {
    throw new AppError(409, 'Tồn kho không đủ để duyệt phiếu hủy.', 'INSUFFICIENT_STOCK', {
      insufficient_products: insufficient,
    });
  }
  return stockAfter;
}

export const disposalRepository = {
  async findProducts(identifiers: { ids: string[]; barcodes: string[] }) {
    return prisma.product.findMany({
      where: {
        OR: [
          ...(identifiers.ids.length ? [{ id: { in: identifiers.ids } }] : []),
          ...(identifiers.barcodes.length ? [{ barcode: { in: identifiers.barcodes } }] : []),
        ],
      },
    });
  },

  async create(input: {
    code: string;
    createdById: string;
    reason: string;
    evidenceUrl: string;
    totalValue: Prisma.Decimal;
    items: DisposalLine[];
  }): Promise<DisposalRecord> {
    return prisma.$transaction(async (tx) => {
      const slip = await tx.disposalSlip.create({
        data: {
          code: input.code,
          createdById: input.createdById,
          reason: input.reason,
          evidenceUrl: input.evidenceUrl,
          items: {
            create: input.items.map((item) => ({
              productId: item.productId,
              productBarcode: item.productBarcode,
              productName: item.productName,
              unit: item.unit,
              quantity: item.quantity,
              costPrice: item.costPrice,
              totalValue: item.totalValue,
            })),
          },
        },
        include: disposalInclude,
      });
      await tx.auditLog.create({
        data: {
          userId: input.createdById,
          action: 'Tạo phiếu hủy',
          target: 'Phiếu hủy',
          targetId: slip.id,
          details: `Mã ${slip.code}; ${slip.reason}; giá trị hủy ${input.totalValue.toString()}`,
        },
      });
      return slip;
    }, { maxWait: 20000, timeout: 120000 });
  },

  async findMany(options: {
    creatorId?: string;
    status?: 'PENDING' | 'APPROVED' | 'REJECTED';
    search?: string;
    dateRange?: { start: Date; end: Date };
    skip?: number;
    take?: number;
  }): Promise<DisposalRecord[]> {
    return prisma.disposalSlip.findMany({
      where: {
        isDeleted: false,
        ...(options.creatorId ? { createdById: options.creatorId } : {}),
        ...(options.status ? { status: options.status } : {}),
        ...(options.search
          ? {
              OR: [
                { code: { contains: options.search, mode: 'insensitive' } },
                { reason: { contains: options.search, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(options.dateRange
          ? { createdAt: { gte: options.dateRange.start, lt: options.dateRange.end } }
          : {}),
      },
      include: disposalInclude,
      orderBy: { createdAt: 'desc' },
      ...(options.skip === undefined ? {} : { skip: options.skip }),
      ...(options.take === undefined ? {} : { take: options.take }),
    });
  },

  async findById(id: string, creatorId?: string): Promise<DisposalRecord | null> {
    return prisma.disposalSlip.findFirst({
      where: { id, isDeleted: false, ...(creatorId ? { createdById: creatorId } : {}) },
      include: disposalInclude,
    });
  },

  async update(id: string, userId: string, input: {
    reason: string;
    evidenceUrl: string;
    totalValue: Prisma.Decimal;
    items: DisposalLine[];
  }): Promise<DisposalRecord> {
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.disposalSlip.updateMany({
        where: { id, status: 'PENDING', isDeleted: false },
        data: { reason: input.reason, evidenceUrl: input.evidenceUrl },
      });
      if (claimed.count !== 1) {
        const current = await tx.disposalSlip.findUnique({
          where: { id },
          select: { status: true, isDeleted: true },
        });
        if (!current || current.isDeleted) {
          throw new AppError(404, 'Không tìm thấy phiếu hủy.', 'DISPOSAL_NOT_FOUND');
        }
        throw new AppError(409, 'Chỉ được sửa phiếu hủy đang chờ duyệt.', 'DISPOSAL_NOT_PENDING');
      }

      await tx.disposalItem.deleteMany({ where: { disposalSlipId: id } });
      await tx.disposalItem.createMany({
        data: input.items.map((item) => ({
          disposalSlipId: id,
          productId: item.productId,
          productBarcode: item.productBarcode,
          productName: item.productName,
          unit: item.unit,
          quantity: item.quantity,
          costPrice: item.costPrice,
          totalValue: item.totalValue,
        })),
      });
      const slip = await tx.disposalSlip.findUniqueOrThrow({
        where: { id },
        include: disposalInclude,
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'Sửa phiếu hủy',
          target: 'Phiếu hủy',
          targetId: id,
          details: `Mã ${slip.code}; ${slip.reason}; giá trị hủy ${input.totalValue.toString()}`,
        },
      });
      return slip;
    }, { maxWait: 20000, timeout: 120000 });
  },

  async approve(id: string, userId: string): Promise<DisposalRecord> {
    return prisma.$transaction(async (tx) => {
      const claimed = await claimPendingRecord(async () => (await tx.disposalSlip.updateMany({
        where: { id, status: 'PENDING', isDeleted: false },
        data: { status: 'APPROVED', approvedById: userId, approvedAt: new Date() },
      })).count);
      if (!claimed) {
        const current = await tx.disposalSlip.findUnique({
          where: { id },
          select: { status: true, isDeleted: true },
        });
        if (!current || current.isDeleted) {
          throw new AppError(404, 'Không tìm thấy phiếu hủy.', 'DISPOSAL_NOT_FOUND');
        }
        throw new AppError(409, 'Phiếu hủy không ở trạng thái chờ duyệt.', 'DISPOSAL_NOT_PENDING');
      }

      const slip = await tx.disposalSlip.findUniqueOrThrow({
        where: { id },
        include: disposalInclude,
      });
      const stockAfter = await applyDisposalStock(slip.items, {
        decrementIfAvailable: async (item) => {
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
        getCurrentStock: async (item) => (await tx.product.findUnique({
          where: { id: item.productId },
          select: { stockQuantity: true },
        }))?.stockQuantity ?? 0,
        writeTransaction: async (item, quantityAfter) => {
          await tx.inventoryTransaction.create({
            data: {
              productId: item.productId,
              type: InventoryTransactionType.DISPOSAL,
              quantity: -item.quantity,
              stockAfter: quantityAfter,
              refType: 'DISPOSAL',
              refId: slip.id,
              createdById: userId,
            },
          });
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'Duyệt phiếu hủy',
          target: 'Phiếu hủy',
          targetId: slip.id,
          details: `Mã ${slip.code}; tồn sau khi hủy: ${[...stockAfter.values()].join(', ')}`,
        },
      });
      return slip;
    }, { maxWait: 20000, timeout: 120000 });
  },

  async reject(id: string, userId: string): Promise<DisposalRecord> {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.disposalSlip.updateMany({
        where: { id, status: 'PENDING', isDeleted: false },
        data: { status: 'REJECTED', approvedById: userId, approvedAt: new Date() },
      });
      if (updated.count !== 1) {
        const current = await tx.disposalSlip.findUnique({
          where: { id },
          select: { status: true, isDeleted: true },
        });
        if (!current || current.isDeleted) {
          throw new AppError(404, 'Không tìm thấy phiếu hủy.', 'DISPOSAL_NOT_FOUND');
        }
        throw new AppError(409, 'Phiếu hủy không ở trạng thái chờ duyệt.', 'DISPOSAL_NOT_PENDING');
      }
      const slip = await tx.disposalSlip.findUniqueOrThrow({
        where: { id },
        include: disposalInclude,
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'Từ chối phiếu hủy',
          target: 'Phiếu hủy',
          targetId: id,
          details: `Mã ${slip.code}`,
        },
      });
      return slip;
    }, { maxWait: 20000, timeout: 120000 });
  },

  async softDelete(id: string, userId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.disposalSlip.updateMany({
        where: { id, status: 'PENDING', isDeleted: false },
        data: { isDeleted: true, deletedAt: new Date(), deletedById: userId },
      });
      if (updated.count !== 1) {
        const current = await tx.disposalSlip.findUnique({
          where: { id },
          select: { status: true, isDeleted: true },
        });
        if (!current || current.isDeleted) {
          throw new AppError(404, 'Không tìm thấy phiếu hủy.', 'DISPOSAL_NOT_FOUND');
        }
        throw new AppError(409, 'Chỉ được xóa phiếu hủy đang chờ duyệt.', 'DISPOSAL_NOT_PENDING');
      }
      await tx.auditLog.create({
        data: { userId, action: 'Xóa phiếu hủy', target: 'Phiếu hủy', targetId: id },
      });
    }, { maxWait: 20000, timeout: 120000 });
  },

  createCode(): Promise<string> {
    return generateCode('disposal', async (code) =>
      Boolean(await prisma.disposalSlip.findUnique({ where: { code }, select: { id: true } })),
    );
  },
};
