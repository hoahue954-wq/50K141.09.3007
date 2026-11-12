import { InventoryTransactionType, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import type { InventoryTransactionQuery } from '../validators/inventory.validators.js';

const productInclude = {
  category: { select: { name: true } },
} satisfies Prisma.ProductInclude;

export const inventoryRepository = {
  async findProducts(options: { search?: string; categoryId?: string }) {
    return prisma.product.findMany({
      where: {
        ...(options.categoryId ? { categoryId: options.categoryId } : {}),
        ...(options.search
          ? {
              OR: [
                { name: { contains: options.search, mode: 'insensitive' } },
                { barcode: { contains: options.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: productInclude,
      orderBy: [{ stockQuantity: 'asc' }, { name: 'asc' }],
    });
  },

  async findLowStock() {
    return prisma.product.findMany({
      include: productInclude,
    });
  },

  async listTransactions(query: InventoryTransactionQuery, options: {
    dateRange?: { start: Date; end: Date };
  }) {
    const where: Prisma.InventoryTransactionWhereInput = {
      ...(query.product_id ? { productId: query.product_id } : {}),
      ...(query.barcode ? { product: { barcode: query.barcode } } : {}),
      ...(query.type ? { type: query.type as InventoryTransactionType } : {}),
      ...(options.dateRange
        ? { createdAt: { gte: options.dateRange.start, lt: options.dateRange.end } }
        : {}),
    };
    const [transactions, total] = await prisma.$transaction([
      prisma.inventoryTransaction.findMany({
        where,
        include: {
          product: { select: { barcode: true, name: true } },
          createdBy: { select: { fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.inventoryTransaction.count({ where }),
    ]);
    return { transactions, total };
  },
};
