import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  InventoryTransactionType,
  Prisma,
  ProfileStatus,
  PurchaseOrderStatus,
  RoleCode,
  type Category,
  type Product,
} from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import {
  applyPurchaseOrderStock,
  assertPurchaseOrderSaved,
  purchaseOrderRepository,
  type PurchaseOrderRecord,
} from '../src/repositories/purchase-order.repository.js';
import { inventoryRepository } from '../src/repositories/inventory.repository.js';
import { inventoryService } from '../src/services/inventory.service.js';
import { purchaseOrderService } from '../src/services/purchase-order.service.js';
import type { AuthenticatedProfile } from '../src/types/auth.js';
import { AppError } from '../src/utils/AppError.js';
import { requireRole } from '../src/middlewares/requireRole.js';
import {
  createPurchaseOrderSchema,
  purchaseOrderListQuerySchema,
  updatePurchaseOrderSchema,
} from '../src/validators/purchase-order.validators.js';

const owner: AuthenticatedProfile = {
  id: '98bd2a56-16a5-4db4-b867-3b4ea3a0ea4e',
  username: 'owner',
  fullName: 'Chủ cửa hàng',
  status: ProfileStatus.ACTIVE,
  createdAt: new Date(),
  role: { id: '7340d1db-6392-4e16-9718-a2d5a82f5bc1', code: RoleCode.OWNER, name: 'Chủ cửa hàng' },
};

const staff: AuthenticatedProfile = {
  ...owner,
  id: 'b6adf083-c5a4-4d7b-8bc8-173e27c34e1c',
  username: 'staff',
  fullName: 'Nhân viên',
  role: { ...owner.role, code: RoleCode.STAFF, name: 'Nhân viên' },
};

const category: Category = {
  id: '4c4ae3f0-04db-4871-9c89-52335e13c6b0',
  code: 'DM001',
  name: 'Đồ uống',
  description: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const product: Product & { category: { name: string } } = {
  id: '2d4d61d2-f621-4930-ae7e-65053eb05b08',
  barcode: '8930000000001',
  name: 'Nước suối',
  categoryId: category.id,
  costPrice: new Prisma.Decimal(4),
  sellingPrice: new Prisma.Decimal(10),
  unit: 'chai',
  stockQuantity: 5,
  minStock: 1,
  imageUrl: null,
  isDiscontinued: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  category: { name: category.name },
};

const originalPurchaseMethods = {
  findProducts: purchaseOrderRepository.findProducts,
  create: purchaseOrderRepository.create,
  createCode: purchaseOrderRepository.createCode,
  findMany: purchaseOrderRepository.findMany,
  findById: purchaseOrderRepository.findById,
};
const originalInventoryMethods = {
  findProducts: inventoryRepository.findProducts,
  findLowStock: inventoryRepository.findLowStock,
};

afterEach(() => {
  Object.assign(purchaseOrderRepository, originalPurchaseMethods);
  Object.assign(inventoryRepository, originalInventoryMethods);
});

function assertAppError(action: () => Promise<unknown>, statusCode: number, code: string) {
  return assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, statusCode);
    assert.equal(error.code, code);
    return true;
  });
}

function makeOrder(input: Parameters<typeof purchaseOrderRepository.create>[0]): PurchaseOrderRecord {
  const createdAt = new Date();
  return {
    id: '7c005949-92ea-42e5-b617-2e5ad1a30317',
    code: input.code,
    status: PurchaseOrderStatus.SAVED,
    orderDate: input.orderDate,
    createdById: input.createdById,
    approvedById: null,
    deletedById: null,
    deletedAt: null,
    isDeleted: false,
    approvedAt: null,
    supplierName: input.supplierName,
    note: input.note,
    totalAmount: input.totalAmount,
    createdAt,
    completedAt: null,
    createdBy: { id: input.createdById, fullName: owner.fullName },
    approvedBy: null,
    items: input.items.map((item, index) => ({
      id: `c6d862b1-882e-48dd-a929-2ac5d33e0e0${index}`,
      purchaseOrderId: '7c005949-92ea-42e5-b617-2e5ad1a30317',
      productId: item.productId,
      productBarcode: item.productBarcode,
      productName: item.productName,
      quantity: item.quantity,
      importPrice: item.importPrice,
      lineTotal: item.lineTotal,
    })),
  };
}

test('creates a SAVED purchase order, merges duplicate products, and leaves stock unchanged', async () => {
  purchaseOrderRepository.findProducts = async () => [product];
  purchaseOrderRepository.createCode = async () => 'PHN000123';
  let stock = product.stockQuantity;
  let createInput: Parameters<typeof purchaseOrderRepository.create>[0] | undefined;
  purchaseOrderRepository.create = async (input) => {
    createInput = input;
    return makeOrder(input);
  };

  const result = await purchaseOrderService.create(createPurchaseOrderSchema.parse({
    order_date: '2026-11-12',
    supplier_name: 'Nhà cung cấp',
    notes: 'Giao buổi sáng',
    items: [
      { product_barcode: product.barcode, product_name: 'Tên từ client không tin', quantity: 2, cost_price: 8 },
      { barcode: product.barcode, quantity: 3, import_price: 8 },
    ],
  }), owner);

  assert.equal(result.status, 'saved');
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.quantity, 5);
  assert.equal(result.items[0]?.product_name, product.name);
  assert.equal(createInput?.totalAmount.toNumber(), 40);
  assert.equal(createInput?.orderDate.toISOString(), '2026-11-11T17:00:00.000Z');
  assert.equal(stock, product.stockQuantity);
});

test('rejects nonpositive quantity and import price', () => {
  const invalidCreate = createPurchaseOrderSchema.safeParse({
    items: [{ barcode: product.barcode, quantity: 0, import_price: 3 }],
  });
  const invalidUpdate = updatePurchaseOrderSchema.safeParse({
    items: [{ barcode: product.barcode, quantity: 1, cost_price: 0 }],
  });
  assert.equal(invalidCreate.success, false);
  assert.equal(invalidUpdate.success, false);
});

test('rejects duplicate product lines with conflicting import prices rather than losing value', async () => {
  purchaseOrderRepository.findProducts = async () => [product];
  await assertAppError(
    () => purchaseOrderService.create(createPurchaseOrderSchema.parse({
      items: [
        { barcode: product.barcode, quantity: 1, import_price: 5 },
        { barcode: product.barcode, quantity: 1, import_price: 6 },
      ],
    }), owner),
    400,
    'CONFLICTING_DUPLICATE_IMPORT_PRICE',
  );
});

test('completion increases stock and records one IMPORT transaction only once', async () => {
  const line = { productId: product.id, quantity: 4, importPrice: new Prisma.Decimal(9) };
  let saved = true;
  let stock = 2;
  const transactions: { type: InventoryTransactionType; quantity: number; stockAfter: number }[] = [];

  const complete = () => applyPurchaseOrderStock([line], {
    claimOrder: async () => {
      if (!saved) return false;
      saved = false;
      return true;
    },
    incrementStock: async (item) => {
      stock += item.quantity;
      return stock;
    },
    writeImportTransaction: async (item, stockAfter) => {
      transactions.push({
        type: InventoryTransactionType.IMPORT,
        quantity: item.quantity,
        stockAfter,
      });
    },
  });

  const stockAfter = await complete();
  assert.equal(stockAfter.get(product.id), 6);
  assert.equal(stock, 6);
  assert.deepEqual(transactions, [{ type: InventoryTransactionType.IMPORT, quantity: 4, stockAfter: 6 }]);

  await assert.rejects(complete(), (error: unknown) =>
    error instanceof AppError && error.statusCode === 409,
  );
  assert.equal(stock, 6);
  assert.equal(transactions.length, 1);
});

test('only one concurrent completion can claim a SAVED order', async () => {
  let saved = true;
  let stock = 0;
  const line = { productId: product.id, quantity: 3, importPrice: new Prisma.Decimal(7) };
  const complete = () => applyPurchaseOrderStock([line], {
    claimOrder: async () => {
      if (!saved) return false;
      saved = false;
      return true;
    },
    incrementStock: async (item) => {
      stock += item.quantity;
      return stock;
    },
    writeImportTransaction: async () => undefined,
  });

  const results = await Promise.allSettled([complete(), complete()]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.equal(stock, 3);
});

test('rejects editing or deleting a completed purchase order', () => {
  assert.throws(
    () => assertPurchaseOrderSaved({ status: PurchaseOrderStatus.COMPLETED, isDeleted: false }),
    (error: unknown) => error instanceof AppError &&
      error.statusCode === 409 &&
      error.code === 'PURCHASE_ORDER_NOT_SAVED',
  );
});

test('STAFF can list purchase orders from all store users', async () => {
  let creatorId: string | undefined;
  purchaseOrderRepository.findMany = async (options) => {
    creatorId = options.creatorId;
    return [];
  };
  await purchaseOrderService.list(purchaseOrderListQuerySchema.parse({}), staff);
  assert.equal(creatorId, undefined);
});

test('STAFF receives import prices from purchase-order create, list, and detail responses', async () => {
  purchaseOrderRepository.findProducts = async () => [product];
  purchaseOrderRepository.createCode = async () => 'PHN000124';
  purchaseOrderRepository.create = async (input) => makeOrder(input);
  purchaseOrderRepository.findMany = async () => [makeOrder({
    code: 'PHN000001',
    orderDate: new Date(),
    createdById: staff.id,
    supplierName: null,
    note: null,
    totalAmount: new Prisma.Decimal(8),
    items: [{
      productId: product.id,
      productBarcode: product.barcode,
      productName: product.name,
      quantity: 2,
      importPrice: new Prisma.Decimal(4),
      lineTotal: new Prisma.Decimal(8),
    }],
  })];
  purchaseOrderRepository.findById = async () => purchaseOrderRepository.findMany({}).then((orders) => orders[0] ?? null);

  const created = await purchaseOrderService.create(createPurchaseOrderSchema.parse({
    items: [{ barcode: product.barcode, quantity: 2, import_price: 4 }],
  }), staff);
  const listed = await purchaseOrderService.list(purchaseOrderListQuerySchema.parse({}), staff);
  const detail = await purchaseOrderService.getById('order-id', staff);

  for (const response of [created, listed[0], detail]) {
    assert.ok(response);
    assert.equal(response.items[0]?.cost_price, 4);
    assert.equal(JSON.stringify(response).includes('import_price'), false);
  }
});

test('OWNER still receives import prices in purchase-order responses', async () => {
  purchaseOrderRepository.findProducts = async () => [product];
  purchaseOrderRepository.createCode = async () => 'PHN000125';
  purchaseOrderRepository.create = async (input) => makeOrder(input);

  const result = await purchaseOrderService.create(createPurchaseOrderSchema.parse({
    items: [{ barcode: product.barcode, quantity: 2, import_price: 4 }],
  }), owner);

  assert.equal(result.items[0]?.cost_price, 4);
});

test('STAFF cannot complete a purchase order or read the owner-only low-stock endpoint', () => {
  const middleware = requireRole(RoleCode.OWNER);
  const response = {
    locals: { authProfile: staff },
  } as Response;
  let receivedError: unknown;
  const next: NextFunction = (error) => {
    receivedError = error;
  };
  middleware({} as Request, response, next);
  assert.ok(receivedError instanceof AppError);
  assert.equal(receivedError.statusCode, 403);
  assert.equal(receivedError.code, 'FORBIDDEN');
});

test('inventory stats omit cost fields for STAFF', async () => {
  inventoryRepository.findProducts = async () => [product];
  const result = await inventoryService.stats({}, false);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('cost_price'), false);
  assert.equal(serialized.includes('inventory_cost_value'), false);
});

test('low-stock results put out-of-stock products first and sort each group by quantity', async () => {
  const outOfStock = { ...product, id: 'a', name: 'Hết hàng', stockQuantity: 0, minStock: 5 };
  const lowOne = { ...product, id: 'b', name: 'Còn một', stockQuantity: 1, minStock: 3 };
  const lowTwo = { ...product, id: 'c', name: 'Còn hai', stockQuantity: 2, minStock: 0 };
  inventoryRepository.findLowStock = async () => [lowTwo, lowOne, outOfStock];
  const result = await inventoryService.lowStock(true);
  assert.deepEqual(result.map((item) => item.name), ['Hết hàng', 'Còn một', 'Còn hai']);
});
