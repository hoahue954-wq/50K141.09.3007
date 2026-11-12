import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  InvoiceStatus,
  PaymentMethod,
  Prisma,
  ProfileStatus,
  RoleCode,
  type Customer,
  type Product,
} from '@prisma/client';
import type { Request, Response, NextFunction } from 'express';
import {
  decrementSaleStock,
  invoiceInclude,
  invoiceRepository,
  type SaleLine,
} from '../src/repositories/invoice.repository.js';
import type { InvoiceDto } from '../src/services/invoice.service.js';
import { invoiceService } from '../src/services/invoice.service.js';
import type { AuthenticatedProfile } from '../src/types/auth.js';
import { AppError } from '../src/utils/AppError.js';
import { assertInvoiceDeletable, assertFullPayment } from '../src/utils/invoiceRules.js';
import { requireRole } from '../src/middlewares/requireRole.js';
import { createInvoiceSchema } from '../src/validators/invoice.validators.js';

const profile: AuthenticatedProfile = {
  id: '98bd2a56-16a5-4db4-b867-3b4ea3a0ea4e',
  username: 'owner',
  fullName: 'Chủ cửa hàng',
  status: ProfileStatus.ACTIVE,
  createdAt: new Date(),
  role: { id: '7340d1db-6392-4e16-9718-a2d5a82f5bc1', code: RoleCode.OWNER, name: 'Chủ cửa hàng' },
};

const product: Product = {
  id: '2d4d61d2-f621-4930-ae7e-65053eb05b08',
  barcode: '8930000000001',
  name: 'Nước suối',
  categoryId: '4c4ae3f0-04db-4871-9c89-52335e13c6b0',
  costPrice: new Prisma.Decimal(4),
  sellingPrice: new Prisma.Decimal(10),
  unit: 'chai',
  stockQuantity: 5,
  minStock: 1,
  imageUrl: null,
  isDiscontinued: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const regularCustomer: Customer = {
  id: '37c43e7b-3276-425f-944a-3ca4ad95ce5a',
  code: 'KH000001',
  name: 'Khách quen',
  phone: null,
  isRegular: true,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const originalRepositoryMethods = {
  findProductsForSale: invoiceRepository.findProductsForSale,
  findCustomer: invoiceRepository.findCustomer,
  createSale: invoiceRepository.createSale,
  codeExists: invoiceRepository.codeExists,
};

afterEach(() => {
  Object.assign(invoiceRepository, originalRepositoryMethods);
});

function makeInvoice(input: {
  code: string;
  createdById: string;
  customerId?: string;
  paymentMethod: 'CASH' | 'TRANSFER' | 'DEBT';
  totalAmount: Prisma.Decimal;
  amountReceived?: Prisma.Decimal;
  changeGiven?: Prisma.Decimal;
  lines: SaleLine[];
}): Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }> {
  const id = '7c005949-92ea-42e5-b617-2e5ad1a30317';
  const createdAt = new Date();
  return {
    id,
    code: input.code,
    createdAt,
    totalAmount: input.totalAmount,
    cashGiven: input.amountReceived ?? null,
    changeGiven: input.changeGiven ?? null,
    paymentMethod: input.paymentMethod as PaymentMethod,
    status: input.paymentMethod === 'DEBT' ? InvoiceStatus.UNPAID : InvoiceStatus.PAID,
    customerId: input.customerId ?? null,
    createdById: input.createdById,
    paidAt: input.paymentMethod === 'DEBT' ? null : createdAt,
    paymentMethodSettled: null,
    isDeleted: false,
    deletedById: null,
    deletedAt: null,
    createdBy: { id: input.createdById, fullName: profile.fullName },
    customer: input.customerId ? { id: input.customerId, name: regularCustomer.name } : null,
    details: input.lines.map((line, index) => ({
      id: `c6d862b1-882e-48dd-a929-2ac5d33e0e0${index}`,
      invoiceId: id,
      productId: line.productId,
      productBarcode: line.productBarcode,
      productName: line.productName,
      unit: line.unit,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      costPrice: line.costPrice,
      lineTotal: line.unitPrice.mul(line.quantity),
      returnItems: [],
    })),
  };
}

function input(body: unknown) {
  return createInvoiceSchema.parse(body);
}

function assertAppError(action: () => Promise<unknown>, statusCode: number, code: string) {
  return assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, statusCode);
    assert.equal(error.code, code);
    return true;
  });
}

test('sells available stock, uses database prices, and merges duplicate product lines', async () => {
  invoiceRepository.findProductsForSale = async () => [product];
  invoiceRepository.codeExists = async () => false;
  let saleInput: Parameters<typeof invoiceRepository.createSale>[0] | undefined;
  invoiceRepository.createSale = async (data) => {
    saleInput = data;
    return makeInvoice(data);
  };

  const result = await invoiceService.create(input({
    payment_method: 'cash',
    cash_given: 40,
    items: [
      { product_barcode: product.barcode, product_name: product.name, unit: 'chai', quantity: 1, unit_price: 999 },
      { barcode: product.barcode, quantity: 2 },
    ],
  }), profile);

  assert.equal(saleInput?.lines.length, 1);
  assert.equal(saleInput?.lines[0]?.quantity, 3);
  assert.equal(saleInput?.lines[0]?.unitPrice.toNumber(), 10);
  assert.equal(saleInput?.totalAmount.toNumber(), 30);
  assert.equal(saleInput?.changeGiven?.toNumber(), 10);
  assert.equal((result as InvoiceDto).items[0]?.total_amount, 30);
});

test('allows selling exactly the available stock quantity', async () => {
  invoiceRepository.findProductsForSale = async () => [product];
  invoiceRepository.codeExists = async () => false;
  let soldQuantity = 0;
  invoiceRepository.createSale = async (data) => {
    soldQuantity = data.lines[0]?.quantity ?? 0;
    return makeInvoice(data);
  };

  await invoiceService.create(input({
    payment_method: 'CASH',
    amount_received: 50,
    items: [{ barcode: product.barcode, quantity: product.stockQuantity }],
  }), profile);

  assert.equal(soldQuantity, product.stockQuantity);
});

test('rejects overselling with 409 and the insufficient product details before changing stock', async () => {
  invoiceRepository.findProductsForSale = async () => [{ ...product, stockQuantity: 2 }];
  let createSaleCalled = false;
  invoiceRepository.createSale = async (data) => {
    createSaleCalled = true;
    return makeInvoice(data);
  };

  await assertAppError(
    () => invoiceService.create(input({
      payment_method: 'CASH',
      amount_received: 40,
      items: [{ barcode: product.barcode, quantity: 3 }],
    }), profile),
    409,
    'INSUFFICIENT_STOCK',
  );
  assert.equal(createSaleCalled, false);
});

test('only one concurrent sale can consume the last unit', async () => {
  let stock = 1;
  const saleLine = {
    productId: product.id,
    productBarcode: product.barcode,
    productName: product.name,
    quantity: 1,
  };
  const decrement = () => decrementSaleStock([saleLine], {
    decrementIfAvailable: async (line) => {
      if (stock < line.quantity) return null;
      stock -= line.quantity;
      await Promise.resolve();
      return stock;
    },
    getCurrentStock: async () => ({
      barcode: product.barcode,
      name: product.name,
      stockQuantity: stock,
    }),
  });

  const results = await Promise.allSettled([
    decrement(),
    decrement(),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.equal(stock, 0);
  const rejection = results.find((result) => result.status === 'rejected');
  assert.ok(rejection?.status === 'rejected' && rejection.reason instanceof AppError);
  assert.equal(rejection.reason.statusCode, 409);
});

test('rejects CASH payment below invoice total', async () => {
  invoiceRepository.findProductsForSale = async () => [product];
  await assertAppError(
    () => invoiceService.create(input({
      payment_method: 'CASH',
      amount_received: 9,
      items: [{ barcode: product.barcode, quantity: 1 }],
    }), profile),
    400,
    'INSUFFICIENT_PAYMENT',
  );
});

test('rejects DEBT for a customer who is not regular', async () => {
  invoiceRepository.findProductsForSale = async () => [product];
  invoiceRepository.findCustomer = async () => ({ ...regularCustomer, isRegular: false });
  await assertAppError(
    () => invoiceService.create(input({
      payment_method: 'DEBT',
      customer_id: regularCustomer.id,
      items: [{ barcode: product.barcode, quantity: 1 }],
    }), profile),
    400,
    'CUSTOMER_NOT_REGULAR',
  );
});

test('rejects debt settlement below the invoice total', () => {
  assert.throws(
    () => assertFullPayment(new Prisma.Decimal(9), new Prisma.Decimal(10)),
    (error: unknown) => error instanceof AppError &&
      error.statusCode === 400 &&
      error.code === 'INSUFFICIENT_PAYMENT',
  );
});

test('blocks invoice deletion when there is any return or debt record', () => {
  assert.throws(
    () => assertInvoiceDeletable(false, true),
    (error: unknown) => error instanceof AppError && error.code === 'INVOICE_HAS_DEBT',
  );
  assert.throws(
    () => assertInvoiceDeletable(true, false),
    (error: unknown) => error instanceof AppError && error.code === 'INVOICE_HAS_RETURNS',
  );
});

test('STAFF cannot pass the OWNER invoice-delete authorization guard', () => {
  const middleware = requireRole(RoleCode.OWNER);
  const response = {
    locals: {
      authProfile: {
        ...profile,
        role: { ...profile.role, code: RoleCode.STAFF },
      },
    },
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
