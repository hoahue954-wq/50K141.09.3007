import { env } from '../config/env.js';
import { inventoryRepository } from '../repositories/inventory.repository.js';
import { AppError } from '../utils/AppError.js';
import { getHcmDateRange } from '../utils/date.js';
import type { InventoryQuery, InventoryTransactionQuery } from '../validators/inventory.validators.js';

type InventoryProductRecord = Awaited<ReturnType<typeof inventoryRepository.findProducts>>[number];

export interface InventoryProductDto {
  id: string;
  barcode: string;
  name: string;
  category_id: string;
  category_name: string;
  selling_price: number;
  unit: string;
  stock_quantity: number;
  min_stock: number;
  cost_price?: number;
  inventory_cost_value?: number;
}

function effectiveMinStock(product: InventoryProductRecord): number {
  return product.minStock === 0 ? env.DEFAULT_MIN_STOCK : product.minStock;
}

function productDto(product: InventoryProductRecord, includeCostPrice: boolean): InventoryProductDto {
  const costPrice = Number(product.costPrice);
  return {
    id: product.id,
    barcode: product.barcode,
    name: product.name,
    category_id: product.categoryId,
    category_name: product.category.name,
    selling_price: Number(product.sellingPrice),
    unit: product.unit,
    stock_quantity: product.stockQuantity,
    min_stock: effectiveMinStock(product),
    ...(includeCostPrice
      ? {
          cost_price: costPrice,
          inventory_cost_value: costPrice * product.stockQuantity,
        }
      : {}),
  };
}

function transactionDateRange(query: InventoryTransactionQuery): { start: Date; end: Date } | undefined {
  if (query.date) return getHcmDateRange(query.date);
  if (!query.start_date && !query.end_date) return undefined;
  const start = query.start_date
    ? /^\d{4}-\d{2}-\d{2}$/.test(query.start_date)
      ? getHcmDateRange(query.start_date).start
      : new Date(query.start_date)
    : new Date(0);
  const end = query.end_date
    ? /^\d{4}-\d{2}-\d{2}$/.test(query.end_date)
      ? getHcmDateRange(query.end_date).end
      : new Date(new Date(query.end_date).getTime() + 1)
    : new Date(8640000000000000);
  if (start >= end) throw new AppError(400, 'Khoảng thời gian lọc không hợp lệ.', 'INVALID_DATE_RANGE');
  return { start, end };
}

export const inventoryService = {
  async stats(query: InventoryQuery, includeCostPrice: boolean) {
    const records = await inventoryRepository.findProducts({
      ...(query.search ? { search: query.search } : {}),
      ...(query.category_id ? { categoryId: query.category_id } : {}),
    });
    const products = records.map((product) => productDto(product, includeCostPrice));
    const outOfStockProducts = products.filter((product) => product.stock_quantity <= 0);
    const lowStockProducts = products.filter(
      (product) => product.stock_quantity > 0 && product.stock_quantity <= product.min_stock,
    );
    return {
      products,
      lowStockProducts,
      outOfStockProducts,
      ...(includeCostPrice
        ? {
            total_inventory_cost_value: products.reduce(
              (total, product) => total + (product.inventory_cost_value ?? 0),
              0,
            ),
          }
        : {}),
    };
  },

  async lowStock(includeCostPrice: boolean) {
    const products = await inventoryRepository.findLowStock();
    return products
      .filter((product) => product.stockQuantity <= effectiveMinStock(product))
      .map((product) => productDto(product, includeCostPrice))
      .sort((left, right) => {
        const leftOut = left.stock_quantity <= 0;
        const rightOut = right.stock_quantity <= 0;
        if (leftOut !== rightOut) return leftOut ? -1 : 1;
        return left.stock_quantity - right.stock_quantity || left.name.localeCompare(right.name);
      });
  },

  async transactions(query: InventoryTransactionQuery) {
    const dateRange = transactionDateRange(query);
    const result = await inventoryRepository.listTransactions(query, {
      ...(dateRange ? { dateRange } : {}),
    });
    return {
      transactions: result.transactions.map((transaction) => ({
        id: transaction.id,
        product_id: transaction.productId,
        product_barcode: transaction.product.barcode,
        product_name: transaction.product.name,
        type: transaction.type.toLowerCase(),
        quantity: transaction.quantity,
        stock_after: transaction.stockAfter,
        ...(transaction.refType === null ? {} : { ref_type: transaction.refType }),
        ...(transaction.refId === null ? {} : { ref_id: transaction.refId }),
        created_by_id: transaction.createdById,
        created_by_name: transaction.createdBy.fullName,
        created_at: transaction.createdAt.toISOString(),
      })),
      page: query.page,
      limit: query.limit,
      total: result.total,
    };
  },
};
