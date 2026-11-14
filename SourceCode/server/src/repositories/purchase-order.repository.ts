import { InventoryTransactionType, Prisma, PurchaseOrderStatus } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/AppError.js';
import { generateCode } from '../utils/codes.js';
import type {
  CreatePurchaseOrderInput,
  PurchaseOrderListQuery,
  UpdatePurchaseOrderInput,
} from '../validators/purchase-order.validators.js';

export const purchaseOrderInclude = {
  createdBy: { select: { id: true, fullName: true } },
  approvedBy: { select: { id: true, fullName: true } },
  items: { orderBy: { productName: 'asc' as const } },
} satisfies Prisma.PurchaseOrderInclude;

export type PurchaseOrderRecord = Prisma.PurchaseOrderGetPayload<{
  include: typeof purchaseOrderInclude;
}>;

export type PurchaseOrderLine = {
  productId: string;
  productBarcode: string;
  productName: string;
  quantity: number;
  importPrice: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
};

export interface PurchaseOrderStockLine {
  productId: string;
  quantity: number;
  importPrice: Prisma.Decimal;
}

export async function applyPurchaseOrderStock(
  lines: PurchaseOrderStockLine[],
  adapter: {
    claimOrder(): Promise<boolean>;
    incrementStock(line: PurchaseOrderStockLine): Promise<number>;
    writeImportTransaction(line: PurchaseOrderStockLine, stockAfter: number): Promise<void>;
  },
): Promise<Map<string, number>> {
  if (!(await adapter.claimOrder())) {
    throw new AppError(409, 'Phiếu nhập đã được hoàn thành hoặc không còn ở trạng thái đã lưu.', 'PURCHASE_ORDER_NOT_SAVED');
  }

  const stockAfter = new Map<string, number>();
  for (const line of lines) {
    const stock = await adapter.incrementStock(line);
    stockAfter.set(line.productId, stock);
    await adapter.writeImportTransaction(line, stock);
  }
  return stockAfter;
}

export function assertPurchaseOrderSaved(order: {
  status: PurchaseOrderStatus;
  isDeleted: boolean;
} | null): void {
  if (!order || order.isDeleted) {
    throw new AppError(404, 'Không tìm thấy phiếu nhập.', 'PURCHASE_ORDER_NOT_FOUND');
  }
  if (order.status !== 'SAVED') {
    throw new AppError(409, 'Chỉ được thao tác với phiếu nhập đang ở trạng thái đã lưu.', 'PURCHASE_ORDER_NOT_SAVED');
  }
}

export const purchaseOrderRepository = {
  async findProducts(identifiers: { ids: string[]; barcodes: string[] }) {
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

  async create(input: {
    code: string;
    orderDate: Date;
    createdById: string;
    supplierName: string | null;
    note: string | null;
    totalAmount: Prisma.Decimal;
    items: PurchaseOrderLine[];
  }): Promise<PurchaseOrderRecord> {
    return prisma.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.create({
        data: {
          code: input.code,
          orderDate: input.orderDate,
          createdById: input.createdById,
          supplierName: input.supplierName,
          note: input.note,
          totalAmount: input.totalAmount,
          items: {
            createMany: {
              data: input.items.map((item) => ({
                productId: item.productId,
                productBarcode: item.productBarcode,
                productName: item.productName,
                quantity: item.quantity,
                importPrice: item.importPrice,
                lineTotal: item.lineTotal,
              })),
            },
          },
        },
        include: purchaseOrderInclude,
      });

      await tx.auditLog.create({
        data: {
          userId: input.createdById,
          action: 'Lập phiếu nhập hàng',
          target: 'Phiếu nhập',
          targetId: order.id,
          details: `Mã ${order.code}, tổng tiền ${order.totalAmount.toString()}`,
        },
      });
      return order;
    }, { maxWait: 5000, timeout: 30000 });
  },

  async findByCode(code: string): Promise<PurchaseOrderRecord | null> {
    return prisma.purchaseOrder.findUnique({
      where: { code },
      include: purchaseOrderInclude,
    });
  },

  async findMany(options: {
    creatorId?: string;
    dateRange?: { start: Date; end: Date };
    status?: 'SAVED' | 'COMPLETED';
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<PurchaseOrderRecord[]> {
    return prisma.purchaseOrder.findMany({
      where: {
        isDeleted: false,
        ...(options.creatorId ? { createdById: options.creatorId } : {}),
        ...(options.dateRange
          ? { orderDate: { gte: options.dateRange.start, lt: options.dateRange.end } }
          : {}),
        ...(options.status ? { status: options.status } : {}),
        ...(options.search
          ? {
              OR: [
                { code: { contains: options.search, mode: 'insensitive' } },
                { supplierName: { contains: options.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: purchaseOrderInclude,
      orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
      ...(options.skip === undefined ? {} : { skip: options.skip }),
      ...(options.take === undefined ? {} : { take: options.take }),
    });
  },

  async findById(id: string, creatorId?: string): Promise<PurchaseOrderRecord | null> {
    return prisma.purchaseOrder.findFirst({
      where: { id, isDeleted: false, ...(creatorId ? { createdById: creatorId } : {}) },
      include: purchaseOrderInclude,
    });
  },

  async update(id: string, userId: string, input: {
    supplierName?: string;
    note?: string;
    totalAmount: Prisma.Decimal;
    items: PurchaseOrderLine[];
  }): Promise<PurchaseOrderRecord> {
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.purchaseOrder.updateMany({
        where: { id, status: 'SAVED', isDeleted: false },
        data: {
          ...(input.supplierName === undefined ? {} : { supplierName: input.supplierName }),
          ...(input.note === undefined ? {} : { note: input.note }),
          totalAmount: input.totalAmount,
        },
      });
      if (claimed.count !== 1) {
        const order = await tx.purchaseOrder.findUnique({
          where: { id },
          select: { status: true, isDeleted: true },
        });
        assertPurchaseOrderSaved(order);
        throw new AppError(409, 'Phiếu nhập vừa được thay đổi, vui lòng tải lại.', 'PURCHASE_ORDER_CONFLICT');
      }

      await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
      await tx.purchaseOrderItem.createMany({
        data: input.items.map((item) => ({
          purchaseOrderId: id,
          productId: item.productId,
          productBarcode: item.productBarcode,
          productName: item.productName,
          quantity: item.quantity,
          importPrice: item.importPrice,
          lineTotal: item.lineTotal,
        })),
      });

      const order = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id },
        include: purchaseOrderInclude,
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'Sửa phiếu nhập hàng',
          target: 'Phiếu nhập',
          targetId: id,
          details: `Mã ${order.code}, tổng tiền ${order.totalAmount.toString()}`,
        },
      });
      return order;
    }, { maxWait: 20000, timeout: 120000 });
  },

  async complete(id: string, userId: string): Promise<PurchaseOrderRecord> {
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.purchaseOrder.updateMany({
        where: { id, status: 'SAVED', isDeleted: false },
        data: {
          status: 'COMPLETED',
          approvedById: userId,
          approvedAt: new Date(),
          completedAt: new Date(),
        },
      });

      if (claimed.count !== 1) {
        const order = await tx.purchaseOrder.findUnique({
          where: { id },
          select: { id: true, isDeleted: true },
        });
        if (!order || order.isDeleted) {
          throw new AppError(404, 'Không tìm thấy phiếu nhập.', 'PURCHASE_ORDER_NOT_FOUND');
        }
        throw new AppError(409, 'Phiếu nhập này đã được hoàn thành trước đó.', 'PURCHASE_ORDER_NOT_SAVED');
      }

      const items = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: id } });
      const lines = items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        importPrice: item.importPrice,
      }));
      const stockAfter = await applyPurchaseOrderStock(lines, {
        claimOrder: async () => true,
        incrementStock: async (line) => {
          const product = await tx.product.update({
            where: { id: line.productId },
            data: {
              stockQuantity: { increment: line.quantity },
              costPrice: line.importPrice,
            },
            select: { stockQuantity: true },
          });
          return product.stockQuantity;
        },
        writeImportTransaction: async (line, stock) => {
          await tx.inventoryTransaction.create({
            data: {
              productId: line.productId,
              type: InventoryTransactionType.IMPORT,
              quantity: line.quantity,
              stockAfter: stock,
              refType: 'PURCHASE_ORDER',
              refId: id,
              createdById: userId,
            },
          });
        },
      });

      const order = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id },
        include: purchaseOrderInclude,
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'Duyệt phiếu nhập hàng',
          target: 'Phiếu nhập',
          targetId: id,
          details: `Mã ${order.code}; ${lines.length} dòng hàng; tồn sau nhập ${[...stockAfter.values()].join(', ')}`,
        },
      });
      return order;
    }, { maxWait: 20000, timeout: 120000 });
  },

  async softDelete(id: string, userId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseOrder.updateMany({
        where: { id, status: 'SAVED', isDeleted: false },
        data: { isDeleted: true, deletedAt: new Date(), deletedById: userId },
      });
      if (updated.count !== 1) {
        const order = await tx.purchaseOrder.findUnique({
          where: { id },
          select: { status: true, isDeleted: true },
        });
        assertPurchaseOrderSaved(order);
        throw new AppError(409, 'Phiếu nhập vừa được thay đổi, vui lòng tải lại.', 'PURCHASE_ORDER_CONFLICT');
      }

      await tx.auditLog.create({
        data: {
          userId,
          action: 'Xóa phiếu nhập hàng',
          target: 'Phiếu nhập',
          targetId: id,
        },
      });
    }, { maxWait: 20000, timeout: 120000 });
  },

  createCode(): Promise<string> {
    return generateCode('purchaseOrder', async (code) =>
      Boolean(await prisma.purchaseOrder.findUnique({ where: { code }, select: { id: true } })),
    );
  },
};
