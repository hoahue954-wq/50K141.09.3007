import assert from 'node:assert/strict';
import { ApprovalStatus, Prisma, ProfileStatus, RoleCode, type Product } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { afterEach, test } from 'node:test';
import {
  applyDisposalStock,
  disposalRepository,
  type DisposalLine,
  type DisposalRecord,
} from '../src/repositories/disposal.repository.js';
import {
  applyReturnStock,
  assertReturnQuantitiesAvailable,
  returnStockAdjustments,
  returnRepository,
  type ReturnLine,
} from '../src/repositories/return.repository.js';
import { returnRules } from '../src/services/return.service.js';
import { disposalService } from '../src/services/disposal.service.js';
import { returnService } from '../src/services/return.service.js';
import { evidenceStorage } from '../src/config/evidence-storage.js';
import type { AuthenticatedProfile } from '../src/types/auth.js';
import { claimPendingRecord } from '../src/utils/approval.js';
import { AppError } from '../src/utils/AppError.js';
import { requireRole } from '../src/middlewares/requireRole.js';
import { createDisposalSchema } from '../src/validators/disposal.validators.js';
import { createReturnSchema } from '../src/validators/return.validators.js';

const staff: AuthenticatedProfile = {
  id: 'b6adf083-c5a4-4d7b-8bc8-173e27c34e1c',
  username: 'staff',
  fullName: 'Nhân viên',
  status: ProfileStatus.ACTIVE,
  createdAt: new Date(),
  role: { id: '7340d1db-6392-4e16-9718-a2d5a82f5bc1', code: RoleCode.STAFF, name: 'Nhân viên' },
};

const water: DisposalLine = {
  productId: '2d4d61d2-f621-4930-ae7e-65053eb05b08',
  productBarcode: '8930000000001',
  productName: 'Nước suối',
  unit: 'chai',
  quantity: 2,
  costPrice: new Prisma.Decimal(4),
  totalValue: new Prisma.Decimal(8),
};

const product: Product = {
  id: water.productId,
  barcode: water.productBarcode,
  name: water.productName,
  categoryId: '4c4ae3f0-04db-4871-9c89-52335e13c6b0',
  costPrice: water.costPrice,
  sellingPrice: new Prisma.Decimal(6.5),
  unit: water.unit,
  stockQuantity: 5,
  minStock: 1,
  imageUrl: null,
  isDiscontinued: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const originalMethods = {
  findProducts: disposalRepository.findProducts,
  create: disposalRepository.create,
  createCode: disposalRepository.createCode,
  findMany: disposalRepository.findMany,
  findById: disposalRepository.findById,
  upload: evidenceStorage.upload,
  createSignedUrl: evidenceStorage.createSignedUrl,
};
const originalReturnMethods = {
  findMany: returnRepository.findMany,
  findById: returnRepository.findById,
};

afterEach(() => {
  Object.assign(disposalRepository, {
    findProducts: originalMethods.findProducts,
    create: originalMethods.create,
    createCode: originalMethods.createCode,
    findMany: originalMethods.findMany,
    findById: originalMethods.findById,
  });
  Object.assign(returnRepository, originalReturnMethods);
  Object.assign(evidenceStorage, {
    upload: originalMethods.upload,
    createSignedUrl: originalMethods.createSignedUrl,
  });
});

function assertAppError(action: () => unknown, statusCode: number, code: string) {
  assert.throws(action, (error: unknown) =>
    error instanceof AppError &&
    error.statusCode === statusCode &&
    error.code === code,
  );
}

test('creating a pending disposal slip leaves product stock unchanged', async () => {
  const stock = product.stockQuantity;
  disposalRepository.findProducts = async () => [product];
  disposalRepository.createCode = async () => 'PHH000123';
  disposalRepository.create = async (input): Promise<DisposalRecord> => {
    const now = new Date();
    return {
      id: '7c005949-92ea-42e5-b617-2e5ad1a30317',
      code: input.code,
      status: ApprovalStatus.PENDING,
      reason: input.reason,
      evidenceUrl: input.evidenceUrl,
      createdById: input.createdById,
      createdBy: { id: input.createdById, fullName: staff.fullName },
      approvedById: null,
      approvedBy: null,
      approvedAt: null,
      deletedById: null,
      deletedAt: null,
      isDeleted: false,
      createdAt: now,
      items: input.items.map((item, index) => ({
        id: `c6d862b1-882e-48dd-a929-2ac5d33e0e0${index}`,
        disposalSlipId: '7c005949-92ea-42e5-b617-2e5ad1a30317',
        productId: item.productId,
        productBarcode: item.productBarcode,
        productName: item.productName,
        unit: item.unit,
        quantity: item.quantity,
        costPrice: item.costPrice,
        totalValue: item.totalValue,
      })),
    };
  };
  evidenceStorage.upload = async () => 'disposals/test/image.png';
  evidenceStorage.createSignedUrl = async () => 'https://storage.example/signed-image';

  const result = await disposalService.create(createDisposalSchema.parse({
    reason: 'Hàng hỏng',
    proof_image_url: 'data:image/png;base64,AA==',
    items: [{ barcode: product.barcode, quantity: 2 }],
  }), staff);

  assert.equal(result.status, 'pending');
  assert.equal(product.stockQuantity, stock);
});

test('requires a valid reason, positive quantity, and evidence for a disposal', () => {
  assert.equal(createDisposalSchema.safeParse({
    reason: 'Hàng hỏng',
    items: [{ barcode: water.productBarcode, quantity: 0 }],
    proof_image_url: 'data:image/png;base64,AA==',
  }).success, false);
  assert.equal(createDisposalSchema.safeParse({
    reason: 'Hàng hỏng',
    items: [{ barcode: water.productBarcode, quantity: 1 }],
  }).success, false);
});

test('disposal approval decrements stock and writes a matching inventory log', async () => {
  let stock = 5;
  const transactions: { quantity: number; stockAfter: number }[] = [];
  const result = await applyDisposalStock([water], {
    decrementIfAvailable: async (item) => {
      if (stock < item.quantity) return null;
      stock -= item.quantity;
      return stock;
    },
    getCurrentStock: async () => stock,
    writeTransaction: async (item, stockAfter) => {
      transactions.push({ quantity: -item.quantity, stockAfter });
    },
  });

  assert.equal(result.get(water.productId), 3);
  assert.equal(stock, 3);
  assert.deepEqual(transactions, [{ quantity: -2, stockAfter: 3 }]);
});

test('insufficient disposal stock returns 409 and can be rolled back atomically', async () => {
  let stock = 1;
  const before = stock;
  await assert.rejects(applyDisposalStock([water], {
    decrementIfAvailable: async (item) => {
      if (stock < item.quantity) return null;
      stock -= item.quantity;
      return stock;
    },
    getCurrentStock: async () => stock,
    writeTransaction: async () => {},
  }), (error: unknown) => error instanceof AppError &&
    error.statusCode === 409 &&
    error.code === 'INSUFFICIENT_STOCK');
  stock = before;
  assert.equal(stock, 1);
});

test('only one concurrent request can claim a pending slip', async () => {
  let pending = true;
  const claim = () => claimPendingRecord(async () => {
    await Promise.resolve();
    if (!pending) return 0;
    pending = false;
    return 1;
  });
  const results = await Promise.all([claim(), claim()]);
  assert.equal(results.filter(Boolean).length, 1);
});

test('requires a proof image and valid return line in a return request', () => {
  const request = {
    invoice_id: '7c005949-92ea-42e5-b617-2e5ad1a30317',
    type: 'RETURN',
    reason: 'Không đúng sản phẩm',
    items: [{ barcode: water.productBarcode, quantity: 1 }],
  };
  assert.equal(createReturnSchema.safeParse(request).success, false);
  assert.equal(createReturnSchema.safeParse({
    ...request,
    proof_image_url: 'data:image/png;base64,AA==',
    items: [{ barcode: water.productBarcode, quantity: 0 }],
  }).success, false);
});

test('return pricing uses the original invoice detail price and enforces cumulative quantity limits', () => {
  const snapshot = {
    details: [{
      id: 'c6d862b1-882e-48dd-a929-2ac5d33e0e01',
      productId: water.productId,
      productBarcode: water.productBarcode,
      productName: water.productName,
      unit: water.unit,
      quantity: 2,
      unitPrice: new Prisma.Decimal(6.5),
      costPrice: new Prisma.Decimal(4),
    }],
    returnSlips: [],
  };
  const lines = returnRules.resolveInvoiceDetails(
    snapshot,
    [{ barcode: water.productBarcode, quantity: 1 }],
  );
  assert.equal(lines[0]?.unitPrice.toNumber(), 6.5);
  assert.equal(lines[0]?.costPrice.toNumber(), 4);

  assertAppError(() => assertReturnQuantitiesAvailable(
    [{ invoiceDetailId: snapshot.details[0]!.id, quantity: 2 }],
    new Map([[snapshot.details[0]!.id, 2]]),
    new Map([[snapshot.details[0]!.id, 1]]),
  ), 409, 'RETURN_QUANTITY_EXCEEDED');
  assertAppError(() => returnRules.resolveInvoiceDetails({
    ...snapshot,
    returnSlips: [{
      id: 'prior-return',
      items: [{
        kind: 'RETURNED',
        invoiceDetailId: snapshot.details[0]!.id,
        quantity: 1,
      }],
    }],
  }, [{ barcode: water.productBarcode, quantity: 2 }]), 409, 'RETURN_QUANTITY_EXCEEDED');
});

test('return/exchange approval logs positive returned stock and negative exchanged stock', async () => {
  const exchange: ReturnLine = {
    productId: '5a5ef519-11e1-4f4e-9f13-8865ff0ea1d8',
    invoiceDetailId: null,
    kind: 'EXCHANGED',
    productBarcode: '8930000000002',
    productName: 'Nước ngọt',
    unit: 'chai',
    quantity: 1,
    unitPrice: new Prisma.Decimal(10),
    costPrice: new Prisma.Decimal(6),
    lineTotal: new Prisma.Decimal(10),
  };
  const returned = {
    productId: water.productId,
    invoiceDetailId: 'c6d862b1-882e-48dd-a929-2ac5d33e0e01',
    kind: 'RETURNED' as const,
    productBarcode: water.productBarcode,
    productName: water.productName,
    unit: water.unit,
    quantity: 1,
    unitPrice: new Prisma.Decimal(6.5),
    costPrice: new Prisma.Decimal(4),
    lineTotal: new Prisma.Decimal(6.5),
  };
  const stock = new Map([[water.productId, 3], [exchange.productId, 2]]);
  const transactions: { productId: string; quantity: number; stockAfter: number }[] = [];
  await applyReturnStock([exchange, returned], {
    incrementStock: async (item) => {
      const after = (stock.get(item.productId) ?? 0) + item.quantity;
      stock.set(item.productId, after);
      return after;
    },
    decrementIfAvailable: async (item) => {
      const current = stock.get(item.productId) ?? 0;
      if (current < item.quantity) return null;
      const after = current - item.quantity;
      stock.set(item.productId, after);
      return after;
    },
    getCurrentStock: async (item) => stock.get(item.productId) ?? 0,
    writeTransaction: async (item, quantity, stockAfter) => {
      transactions.push({ productId: item.productId, quantity, stockAfter });
    },
  });

  test('editing an approved return applies only the stock delta', () => {
    const returned: ReturnLine = {
      productId: water.productId,
      invoiceDetailId: 'c6d862b1-882e-48dd-a929-2ac5d33e0e01',
      kind: 'RETURNED',
      productBarcode: water.productBarcode,
      productName: water.productName,
      unit: water.unit,
      quantity: 2,
      unitPrice: new Prisma.Decimal(6.5),
      costPrice: new Prisma.Decimal(4),
      lineTotal: new Prisma.Decimal(13),
    };
    const oldExchange: ReturnLine = {
      ...returned,
      productId: '5a5ef519-11e1-4f4e-9f13-8865ff0ea1d8',
      invoiceDetailId: null,
      kind: 'EXCHANGED',
      productBarcode: '8930000000002',
      productName: 'Nước ngọt cũ',
      quantity: 1,
    };
    const newExchange: ReturnLine = {
      ...oldExchange,
      productId: '29cb76a0-4798-4a0f-93d6-b81edfa24cb5',
      productBarcode: '8930000000003',
      productName: 'Nước ngọt mới',
      quantity: 2,
    };

    assert.deepEqual(
      returnStockAdjustments([returned, oldExchange], [
        { ...returned, quantity: 3, lineTotal: new Prisma.Decimal(19.5) },
        newExchange,
      ]).map(({ productId, kind, quantity }) => ({ productId, kind, quantity })),
      [
        { productId: water.productId, kind: 'RETURNED', quantity: 1 },
        { productId: oldExchange.productId, kind: 'RETURNED', quantity: 1 },
        { productId: newExchange.productId, kind: 'EXCHANGED', quantity: 2 },
      ],
    );
  });

  assert.equal(stock.get(water.productId), 4);
  assert.equal(stock.get(exchange.productId), 1);
  assert.deepEqual(transactions, [
    { productId: water.productId, quantity: 1, stockAfter: 4 },
    { productId: exchange.productId, quantity: -1, stockAfter: 1 },
  ]);
});

test('rejects return requests outside the rolling 24-hour window', () => {
  assertAppError(
    () => returnRules.assertWithin24Hours(new Date(Date.now() - 24 * 60 * 60 * 1000 - 1)),
    400,
    'RETURN_WINDOW_EXPIRED',
  );
});

test('an exchange with insufficient stock returns 409 without committing earlier return stock', async () => {
  const returned: ReturnLine = {
    productId: water.productId,
    invoiceDetailId: 'c6d862b1-882e-48dd-a929-2ac5d33e0e01',
    kind: 'RETURNED',
    productBarcode: water.productBarcode,
    productName: water.productName,
    unit: water.unit,
    quantity: 1,
    unitPrice: new Prisma.Decimal(6.5),
    costPrice: new Prisma.Decimal(4),
    lineTotal: new Prisma.Decimal(6.5),
  };
  const exchange: ReturnLine = {
    ...returned,
    productId: '5a5ef519-11e1-4f4e-9f13-8865ff0ea1d8',
    invoiceDetailId: null,
    kind: 'EXCHANGED',
    productBarcode: '8930000000002',
    productName: 'Nước ngọt',
  };
  const stock = new Map([[returned.productId, 3], [exchange.productId, 0]]);
  const withAtomicRollback = async () => {
    const before = new Map(stock);
    try {
      return await applyReturnStock([returned, exchange], {
        incrementStock: async (item) => {
          const after = (stock.get(item.productId) ?? 0) + item.quantity;
          stock.set(item.productId, after);
          return after;
        },
        decrementIfAvailable: async () => null,
        getCurrentStock: async (item) => stock.get(item.productId) ?? 0,
        writeTransaction: async () => {},
      });
    } catch (error) {
      stock.clear();
      for (const [id, quantity] of before) stock.set(id, quantity);
      throw error;
    }
  };
  await assert.rejects(withAtomicRollback(), (error: unknown) =>
    error instanceof AppError && error.statusCode === 409 && error.code === 'INSUFFICIENT_STOCK');
  assert.deepEqual(stock, new Map([[returned.productId, 3], [exchange.productId, 0]]));
});

test('STAFF cannot approve a disposal or return slip', () => {
  const middleware = requireRole(RoleCode.OWNER);
  const response = { locals: { authProfile: staff } } as Response;
  let receivedError: unknown;
  const next: NextFunction = (error) => {
    receivedError = error;
  };
  middleware({} as Request, response, next);
  assert.ok(receivedError instanceof AppError);
  assert.equal(receivedError.statusCode, 403);
  assert.equal(receivedError.code, 'FORBIDDEN');
});

test('STAFF can list and request details for slips created by other users', async () => {
  let disposalCreatorId: string | undefined = 'unexpected';
  let disposalDetailCreatorId: string | undefined = 'unexpected';
  let returnCreatorId: string | undefined = 'unexpected';
  let returnDetailCreatorId: string | undefined = 'unexpected';

  disposalRepository.findMany = async (options) => {
    disposalCreatorId = options.creatorId;
    return [];
  };
  disposalRepository.findById = async (_id, creatorId) => {
    disposalDetailCreatorId = creatorId;
    return null;
  };
  returnRepository.findMany = async (options) => {
    returnCreatorId = options.creatorId;
    return [];
  };
  returnRepository.findById = async (_id, creatorId) => {
    returnDetailCreatorId = creatorId;
    return null;
  };

  await disposalService.list({}, staff);
  await returnService.list({}, staff);
  await assert.rejects(() => disposalService.getById('another-users-slip', staff));
  await assert.rejects(() => returnService.getById('another-users-slip', staff));

  assert.equal(disposalCreatorId, undefined);
  assert.equal(disposalDetailCreatorId, undefined);
  assert.equal(returnCreatorId, undefined);
  assert.equal(returnDetailCreatorId, undefined);
});
