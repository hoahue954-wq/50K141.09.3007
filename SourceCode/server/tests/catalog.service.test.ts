import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import type { Category, Product } from '@prisma/client';
import { categoryRepository } from '../src/repositories/category.repository.js';
import { productRepository } from '../src/repositories/product.repository.js';
import { catalogService } from '../src/services/catalog.service.js';
import { AppError } from '../src/utils/AppError.js';
import {
  categoryCreateSchema,
  productCreateSchema,
  productUpdateSchema,
} from '../src/validators/catalog.validators.js';

const categoryFixture: Category = {
  id: '60c8a05a-0e22-4fb9-8c31-a860800e8ffe',
  code: 'DM001',
  name: 'Đồ uống',
  description: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const productFixture = {
  id: '767c721c-dada-45b7-9e83-0fa07fc89a16',
  barcode: '8930000000001',
  name: 'Nước suối',
  categoryId: categoryFixture.id,
  costPrice: 3000,
  sellingPrice: 5000,
  unit: 'chai',
  stockQuantity: 10,
  minStock: 2,
  imageUrl: null,
  isDiscontinued: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  category: { name: categoryFixture.name },
};

const originalCategoryMethods = {
  findById: categoryRepository.findById,
  findByName: categoryRepository.findByName,
  findByCode: categoryRepository.findByCode,
  create: categoryRepository.create,
  countProducts: categoryRepository.countProducts,
};
const originalProductMethods = {
  findByBarcode: productRepository.findByBarcode,
  findByName: productRepository.findByName,
  hasInvoiceDetails: productRepository.hasInvoiceDetails,
  discontinue: productRepository.discontinue,
};

afterEach(() => {
  Object.assign(categoryRepository, originalCategoryMethods);
  Object.assign(productRepository, originalProductMethods);
});

function assertAppError(action: () => Promise<unknown>, statusCode: number, code: string) {
  return assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, statusCode);
    assert.equal(error.code, code);
    return true;
  });
}

test('rejects blank category and product names', () => {
  const category = categoryCreateSchema.safeParse({ code: 'DM001', name: '  ' });
  const product = productCreateSchema.safeParse({
    barcode: '8930000000001',
    name: ' ',
    category_id: categoryFixture.id,
    selling_price: 10,
    unit: 'chai',
  });

  assert.equal(category.success, false);
  assert.equal(product.success, false);
});

test('validates category codes and 13-digit product barcodes', () => {
  assert.equal(categoryCreateSchema.safeParse({ code: 'DM001', name: 'Đồ uống' }).success, true);
  assert.equal(categoryCreateSchema.safeParse({ code: 'DRINK', name: 'Đồ uống' }).success, false);
  assert.equal(productCreateSchema.safeParse({
    barcode: '8936136163307',
    name: 'Nước suối',
    category_id: categoryFixture.id,
    cost_price: 3,
    selling_price: 5,
    unit: 'chai',
  }).success, true);
  assert.equal(productCreateSchema.safeParse({
    barcode: 'DEMO-0001',
    name: 'Nước suối',
    category_id: categoryFixture.id,
    cost_price: 3,
    selling_price: 5,
    unit: 'chai',
  }).success, false);
});

test('rejects duplicate category names', async () => {
  categoryRepository.findByName = async () => categoryFixture;
  await assertAppError(
    () => catalogService.createCategory({ code: 'DM002', name: 'Đồ uống' }),
    409,
    'CATEGORY_NAME_EXISTS',
  );
});

test('generates a unique category code when none is provided', async () => {
  categoryRepository.findByName = async () => null;
  let codeLookups = 0;
  categoryRepository.findByCode = async () => {
    codeLookups += 1;
    return codeLookups === 1 ? categoryFixture : null;
  };
  categoryRepository.create = async (data) => ({
    ...categoryFixture,
    ...data,
    code: data.code,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const parsed = categoryCreateSchema.parse({ name: 'Đồ khô' });
  const created = await catalogService.createCategory(parsed);

  assert.match(created.code, /^DM\d{3}$/);
  assert.equal(codeLookups, 2);
});

test('rejects duplicate caller-provided category codes', async () => {
  categoryRepository.findByName = async () => null;
  categoryRepository.findByCode = async () => categoryFixture;

  await assertAppError(
    () => catalogService.createCategory({ code: 'DM001', name: 'Danh mục khác' }),
    409,
    'CATEGORY_CODE_EXISTS',
  );
});

test('rejects duplicate category names on update', async () => {
  categoryRepository.findById = async () => categoryFixture;
  categoryRepository.findByName = async () => ({
    ...categoryFixture,
    id: '2a5e591f-d88b-4702-8d0b-a2f09a51e833',
    name: 'Đồ uống mới',
  });

  await assertAppError(
    () => catalogService.updateCategory(categoryFixture.id, { name: 'Đồ uống mới' }),
    409,
    'CATEGORY_NAME_EXISTS',
  );
});

test('rejects duplicate product barcodes and names', async () => {
  productRepository.findByBarcode = async () => productFixture as unknown as Product & {
    category: { name: string };
  };
  await assertAppError(
    () => catalogService.createProduct({
      barcode: productFixture.barcode,
      name: 'Nước khác',
      category_id: categoryFixture.id,
      cost_price: 500,
      selling_price: 1000,
      unit: 'chai',
      min_stock: 0,
    }, true),
    409,
    'PRODUCT_BARCODE_EXISTS',
  );

  productRepository.findByBarcode = async () => null;
  productRepository.findByName = async () => productFixture as unknown as Product;
  await assertAppError(
    () => catalogService.createProduct({
      barcode: '8930000000002',
      name: 'Nước suối',
      category_id: categoryFixture.id,
      cost_price: 500,
      selling_price: 1000,
      unit: 'chai',
      min_stock: 0,
    }, true),
    409,
    'PRODUCT_NAME_EXISTS',
  );
});

test('requires a positive selling and cost price on create and update', () => {
  const validProduct = {
    barcode: '8930000000001',
    name: 'Nước suối',
    category_id: categoryFixture.id,
    cost_price: 100,
    selling_price: 10,
    unit: 'chai',
  };
  assert.equal(productCreateSchema.safeParse({ ...validProduct, selling_price: 0 }).success, false);
  assert.equal(productCreateSchema.safeParse({ ...validProduct, cost_price: 0 }).success, false);
  assert.equal(productCreateSchema.safeParse({ ...validProduct, cost_price: undefined }).success, false);

  assert.equal(productUpdateSchema.safeParse({ cost_price: 100, selling_price: 0 }).success, false);
  assert.equal(productUpdateSchema.safeParse({ cost_price: 0, selling_price: 10 }).success, false);
  assert.equal(productUpdateSchema.safeParse({ selling_price: 10 }).success, false);
});

test('prevents catalog requests from changing stock outside inventory transactions', () => {
  const createWithStock = productCreateSchema.safeParse({
    barcode: '8930000000001',
    name: 'Nước suối',
    category_id: categoryFixture.id,
    cost_price: 5,
    selling_price: 10,
    unit: 'chai',
    stock_quantity: 2,
  });
  const updateStock = productUpdateSchema.safeParse({ stock_quantity: 0 });

  assert.equal(createWithStock.success, false);
  assert.equal(updateStock.success, false);
});

test('rejects duplicate product names on update', async () => {
  productRepository.findByBarcode = async () => productFixture as unknown as Product & {
    category: { name: string };
  };
  productRepository.findByName = async () => ({
    ...productFixture,
    barcode: '8930000000002',
  }) as unknown as Product;

  await assertAppError(
    () => catalogService.updateProduct(productFixture.barcode, {
      name: 'Tên khác đã dùng',
      cost_price: 5,
    }, true),
    409,
    'PRODUCT_NAME_EXISTS',
  );
});

test('rejects products assigned to a missing category', async () => {
  productRepository.findByBarcode = async () => null;
  productRepository.findByName = async () => null;
  categoryRepository.findById = async () => null;

  await assertAppError(
    () => catalogService.createProduct({
      barcode: '8930000000001',
      name: 'Nước suối',
      category_id: categoryFixture.id,
      cost_price: 500,
      selling_price: 1000,
      unit: 'chai',
      min_stock: 0,
    }, true),
    400,
    'INVALID_CATEGORY',
  );
});

test('does not delete categories that still have products', async () => {
  categoryRepository.findById = async () => categoryFixture;
  categoryRepository.countProducts = async () => 1;

  await assertAppError(
    () => catalogService.deleteCategory(categoryFixture.id),
    409,
    'CATEGORY_HAS_PRODUCTS',
  );
});

test('does not discontinue products referenced by invoices', async () => {
  productRepository.findByBarcode = async () => productFixture as unknown as Product & {
    category: { name: string };
  };
  productRepository.hasInvoiceDetails = async () => true;
  productRepository.discontinue = async () => {
    throw new Error('Không được ngừng kinh doanh sản phẩm có hóa đơn');
  };

  await assertAppError(
    () => catalogService.deleteProduct(productFixture.barcode),
    409,
    'PRODUCT_HAS_INVOICES',
  );
});
