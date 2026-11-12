import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InventoryTransactionType, Prisma } from '@prisma/client';
import {
  decrementSaleStock,
  restoreInvoiceStock,
} from '../src/repositories/invoice.repository.js';
import { applyPurchaseOrderStock } from '../src/repositories/purchase-order.repository.js';
import { applyDisposalStock } from '../src/repositories/disposal.repository.js';
import { applyReturnStock, type ReturnLine } from '../src/repositories/return.repository.js';

type Transaction = {
  productId: string;
  type: InventoryTransactionType;
  quantity: number;
  stockAfter: number;
};

test('mixed stock operations preserve the ledger invariant and never go negative', async () => {
  const productA = {
    id: '2d4d61d2-f621-4930-ae7e-65053eb05b08',
    barcode: '8930000000001',
    name: 'Nước suối',
  };
  const productB = {
    id: '3d4d61d2-f621-4930-ae7e-65053eb05b08',
    barcode: '8930000000002',
    name: 'Nước ngọt',
  };
  const stock = new Map<string, number>([[productA.id, 0], [productB.id, 0]]);
  const transactions: Transaction[] = [];

  const record = (productId: string, type: InventoryTransactionType, quantity: number) => {
    const current = stock.get(productId) ?? 0;
    const next = current + quantity;
    assert.ok(next >= 0, `stock for ${productId} would become negative`);
    stock.set(productId, next);
    transactions.push({ productId, type, quantity, stockAfter: next });
    assert.equal(stock.get(productId), transactions
      .filter((entry) => entry.productId === productId)
      .at(-1)?.stockAfter);
  };

  record(productA.id, InventoryTransactionType.ADJUSTMENT, 10);
  record(productB.id, InventoryTransactionType.ADJUSTMENT, 3);

  await decrementSaleStock([{
    productId: productA.id,
    productBarcode: productA.barcode,
    productName: productA.name,
    quantity: 2,
  }], {
    decrementIfAvailable: async (line) => {
      const current = stock.get(line.productId) ?? 0;
      if (current < line.quantity) return null;
      record(line.productId, InventoryTransactionType.SALE, -line.quantity);
      return stock.get(line.productId)!;
    },
    getCurrentStock: async (productId) => ({
      barcode: productA.barcode,
      name: productA.name,
      stockQuantity: stock.get(productId) ?? 0,
    }),
  });

  await applyPurchaseOrderStock([{
    productId: productA.id,
    quantity: 3,
    importPrice: new Prisma.Decimal(4),
  }], {
    claimOrder: async () => true,
    incrementStock: async (line) => {
      record(line.productId, InventoryTransactionType.IMPORT, line.quantity);
      return stock.get(line.productId)!;
    },
    writeImportTransaction: async (line) => {
      assert.equal(transactions.at(-1)?.type, InventoryTransactionType.IMPORT);
      assert.equal(transactions.at(-1)?.quantity, line.quantity);
    },
  });

  await applyDisposalStock([{
    productId: productA.id,
    productBarcode: productA.barcode,
    productName: productA.name,
    unit: 'chai',
    quantity: 2,
    costPrice: new Prisma.Decimal(4),
    totalValue: new Prisma.Decimal(8),
  }], {
    decrementIfAvailable: async (line) => {
      const current = stock.get(line.productId) ?? 0;
      if (current < line.quantity) return null;
      record(line.productId, InventoryTransactionType.DISPOSAL, -line.quantity);
      return stock.get(line.productId)!;
    },
    getCurrentStock: async (line) => stock.get(line.productId) ?? 0,
    writeTransaction: async (line) => {
      assert.equal(transactions.at(-1)?.quantity, -line.quantity);
    },
  });

  const returnLine = (
    product: typeof productA,
    kind: ReturnLine['kind'],
    quantity: number,
  ): ReturnLine => ({
    productId: product.id,
    invoiceDetailId: kind === 'RETURNED' ? 'invoice-detail-id' : null,
    kind,
    productBarcode: product.barcode,
    productName: product.name,
    unit: 'chai',
    quantity,
    unitPrice: new Prisma.Decimal(10),
    costPrice: new Prisma.Decimal(4),
    lineTotal: new Prisma.Decimal(10 * quantity),
  });

  await applyReturnStock([
    returnLine(productA, 'RETURNED', 1),
    returnLine(productB, 'EXCHANGED', 1),
  ], {
    incrementStock: async (line) => {
      record(line.productId, InventoryTransactionType.RETURN, line.quantity);
      return stock.get(line.productId)!;
    },
    decrementIfAvailable: async (line) => {
      const current = stock.get(line.productId) ?? 0;
      if (current < line.quantity) return null;
      record(line.productId, InventoryTransactionType.RETURN, -line.quantity);
      return stock.get(line.productId)!;
    },
    getCurrentStock: async (line) => stock.get(line.productId) ?? 0,
    writeTransaction: async (line, quantity) => {
      assert.equal(transactions.at(-1)?.quantity, quantity);
      assert.equal(transactions.at(-1)?.productId, line.productId);
    },
  });

  await restoreInvoiceStock([{ productId: productA.id, quantity: 2 }], {
    incrementStock: async (line) => {
      record(line.productId, InventoryTransactionType.ADJUSTMENT, line.quantity);
      return stock.get(line.productId)!;
    },
    writeTransaction: async (line, stockAfter) => {
      const transaction = transactions.at(-1);
      assert.equal(transaction?.productId, line.productId);
      assert.equal(transaction?.type, InventoryTransactionType.ADJUSTMENT);
      assert.equal(transaction?.quantity, line.quantity);
      assert.equal(transaction?.stockAfter, stockAfter);
    },
  });

  for (const [productId, finalStock] of stock) {
    const ledgerTotal = transactions
      .filter((transaction) => transaction.productId === productId)
      .reduce((total, transaction) => total + transaction.quantity, 0);
    assert.equal(finalStock, ledgerTotal);
    assert.ok(finalStock >= 0);
  }
  assert.equal(stock.get(productA.id), 12);
  assert.equal(stock.get(productB.id), 2);
});
