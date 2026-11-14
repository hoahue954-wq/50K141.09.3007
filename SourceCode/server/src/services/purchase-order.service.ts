import { Prisma } from '@prisma/client';
import { purchaseOrderRepository, type PurchaseOrderRecord } from '../repositories/purchase-order.repository.js';
import { AppError } from '../utils/AppError.js';
import { getHcmDateRange } from '../utils/date.js';
import type { AuthenticatedProfile } from '../types/auth.js';
import type {
  CreatePurchaseOrderInput,
  PurchaseOrderItemInput,
  PurchaseOrderListQuery,
  UpdatePurchaseOrderInput,
} from '../validators/purchase-order.validators.js';

export interface PurchaseOrderDto {
  id: string;
  code: string;
  order_date: string;
  creator_id: string;
  creator_name: string;
  status: 'saved' | 'completed';
  supplier_name?: string;
  notes?: string;
  total_amount: number;
  items: {
    product_barcode: string;
    product_name: string;
    quantity: number;
    cost_price?: number;
  }[];
  completed_at?: string;
  completed_by?: string;
}

function purchaseOrderDto(order: PurchaseOrderRecord, includeCostPrice: boolean): PurchaseOrderDto {
  return {
    id: order.id,
    code: order.code,
    order_date: order.orderDate.toISOString(),
    creator_id: order.createdBy.id,
    creator_name: order.createdBy.fullName,
    status: order.status.toLowerCase() as 'saved' | 'completed',
    ...(order.supplierName === null ? {} : { supplier_name: order.supplierName }),
    ...(order.note === null ? {} : { notes: order.note }),
    total_amount: Number(order.totalAmount),
    items: order.items.map((item) => ({
      product_barcode: item.productBarcode,
      product_name: item.productName,
      quantity: item.quantity,
      ...(includeCostPrice ? { cost_price: Number(item.importPrice) } : {}),
    })),
    ...(order.completedAt ? { completed_at: order.completedAt.toISOString() } : {}),
    ...(order.approvedBy ? { completed_by: order.approvedBy.fullName } : {}),
  };
}

function orderDate(value?: string): Date {
  if (!value) return new Date();
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00+07:00`)
    : new Date(value);
}

function listDateRange(query: PurchaseOrderListQuery): { start: Date; end: Date } | undefined {
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

function makeLines(items: PurchaseOrderItemInput[], products: Awaited<ReturnType<typeof purchaseOrderRepository.findProducts>>) {
  const byId = new Map(products.map((product) => [product.id, product]));
  const byBarcode = new Map(products.map((product) => [product.barcode, product]));
  const lineByProduct = new Map<string, {
    product: (typeof products)[number];
    quantity: number;
    importPrice: Prisma.Decimal;
  }>();

  for (const item of items) {
    const barcode = item.barcode ?? item.product_barcode;
    const byItemId = item.product_id ? byId.get(item.product_id) : undefined;
    const byItemBarcode = barcode ? byBarcode.get(barcode) : undefined;
    const product = item.product_id && barcode
      ? byItemId?.id === byItemBarcode?.id ? byItemId : undefined
      : byItemId ?? byItemBarcode;
    if (!product) {
      throw new AppError(404, 'Không tìm thấy sản phẩm!', 'PRODUCT_NOT_FOUND');
    }

    const importPrice = new Prisma.Decimal(item.import_price);
    const current = lineByProduct.get(product.id);
    if (current && !current.importPrice.equals(importPrice)) {
      throw new AppError(
        400,
        `Các dòng trùng sản phẩm "${product.name}" phải có cùng giá nhập để gộp.`,
        'CONFLICTING_DUPLICATE_IMPORT_PRICE',
      );
    }
    lineByProduct.set(product.id, {
      product,
      quantity: (current?.quantity ?? 0) + item.quantity,
      importPrice,
    });
  }

  return [...lineByProduct.values()].map(({ product, quantity, importPrice }) => ({
    productId: product.id,
    productBarcode: product.barcode,
    productName: product.name,
    quantity,
    importPrice,
    lineTotal: importPrice.mul(quantity),
  }));
}

async function resolveLines(items: PurchaseOrderItemInput[]) {
  const products = await purchaseOrderRepository.findProducts({
    ids: items.flatMap((item) => item.product_id ? [item.product_id] : []),
    barcodes: items.flatMap((item) => {
      const barcode = item.barcode ?? item.product_barcode;
      return barcode ? [barcode] : [];
    }),
  });
  return makeLines(items, products);
}

export const purchaseOrderService = {
  async create(input: CreatePurchaseOrderInput, profile: AuthenticatedProfile): Promise<PurchaseOrderDto> {
    if (input.code) {
      const existing = await purchaseOrderRepository.findByCode(input.code);
      if (existing) {
        return purchaseOrderDto(existing, true);
      }
    }
    const lines = await resolveLines(input.items);
    const totalAmount = lines.reduce((sum, line) => sum.add(line.lineTotal), new Prisma.Decimal(0));
    try {
      const saved = await purchaseOrderRepository.create({
        code: input.code || (await purchaseOrderRepository.createCode()),
        orderDate: orderDate(input.order_date),
        createdById: profile.id,
        supplierName: input.supplier_name || null,
        note: input.notes ?? input.note ?? null,
        totalAmount,
        items: lines,
      });
      return purchaseOrderDto(saved, true);
    } catch (err: any) {
      if (input.code && (err?.code === 'P2002' || err?.message?.includes('Unique constraint'))) {
        const existing = await purchaseOrderRepository.findByCode(input.code);
        if (existing) {
          return purchaseOrderDto(existing, profile.role.code === 'OWNER');
        }
      }
      throw err;
    }
  },

  async list(query: PurchaseOrderListQuery, profile: AuthenticatedProfile): Promise<PurchaseOrderDto[]> {
    const hasPagination = query.page !== undefined || query.limit !== undefined;
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const dateRange = listDateRange(query);
    const orders = await purchaseOrderRepository.findMany({
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { search: query.search } : {}),
      ...(dateRange ? { dateRange } : {}),
      ...(hasPagination ? { skip: (page - 1) * limit, take: limit } : {}),
    });
    return orders.map((order) => purchaseOrderDto(order, true));
  },

  async getById(id: string, profile: AuthenticatedProfile): Promise<PurchaseOrderDto> {
    const order = await purchaseOrderRepository.findById(id);
    if (!order) throw new AppError(404, 'Không tìm thấy phiếu nhập.', 'PURCHASE_ORDER_NOT_FOUND');
    return purchaseOrderDto(order, true);
  },

  async update(id: string, input: UpdatePurchaseOrderInput, profile: AuthenticatedProfile): Promise<PurchaseOrderDto> {
    const lines = await resolveLines(input.items);
    const totalAmount = lines.reduce((sum, line) => sum.add(line.lineTotal), new Prisma.Decimal(0));
    const saved = await purchaseOrderRepository.update(id, profile.id, {
      ...(input.supplier_name === undefined ? {} : { supplierName: input.supplier_name }),
      ...((input.notes ?? input.note) === undefined ? {} : { note: input.notes ?? input.note }),
      totalAmount,
      items: lines,
    });
    return purchaseOrderDto(saved, profile.role.code === 'OWNER');
  },

  async complete(id: string, profile: AuthenticatedProfile): Promise<PurchaseOrderDto> {
    return purchaseOrderDto(
      await purchaseOrderRepository.complete(id, profile.id),
      profile.role.code === 'OWNER',
    );
  },

  async delete(id: string, profile: AuthenticatedProfile): Promise<void> {
    await purchaseOrderRepository.softDelete(id, profile.id);
  },
};
