import { Prisma } from '@prisma/client';
import { invoiceRepository } from '../repositories/invoice.repository.js';
import { calculateRevenueByDateRange } from './report.service.js';
import { debtService } from './debt.service.js';
import { AppError } from '../utils/AppError.js';
import { getHcmDateRange, getHcmDateString, getHcmWeekRange } from '../utils/date.js';
import { generateCode } from '../utils/codes.js';
import type { AuthenticatedProfile } from '../types/auth.js';
import type { CreateInvoiceInput, InvoiceListQuery, SettleInvoiceInput } from '../validators/invoice.validators.js';
import { invoiceInclude } from '../repositories/invoice.repository.js';

type InvoiceRecord = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

export interface InvoiceItemDto {
  product_barcode: string;
  product_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  cost_price?: number;
}

export interface InvoiceDto {
  id: string;
  code: string;
  created_at: string;
  seller_id: string;
  seller_name: string;
  customer_id?: string;
  customer_name?: string;
  payment_method: 'cash' | 'transfer' | 'debt';
  status: 'paid' | 'unpaid';
  cash_given?: number;
  change_given?: number;
  total_amount: number;
  paid_at?: string;
  payment_method_settled?: 'cash' | 'transfer';
  is_deleted: boolean;
  deleted_by?: string;
  deleted_at?: string;
  items: InvoiceItemDto[];
  qr?: { amount: number; transfer_content: string };
}

function paymentMethodToApi(method: string): InvoiceDto['payment_method'] {
  if (method === 'CASH') return 'cash';
  if (method === 'TRANSFER') return 'transfer';
  return 'debt';
}

function invoiceDto(invoice: InvoiceRecord, includeCostPrice: boolean): InvoiceDto {
  return {
    id: invoice.id,
    code: invoice.code,
    created_at: invoice.createdAt.toISOString(),
    seller_id: invoice.createdBy.id,
    seller_name: invoice.createdBy.fullName,
    ...(invoice.customerId ? { customer_id: invoice.customerId } : {}),
    ...(invoice.customer ? { customer_name: invoice.customer.name } : {}),
    payment_method: paymentMethodToApi(invoice.paymentMethod),
    status: invoice.status.toLowerCase() as 'paid' | 'unpaid',
    ...(invoice.cashGiven === null ? {} : { cash_given: Number(invoice.cashGiven) }),
    ...(invoice.changeGiven === null ? {} : { change_given: Number(invoice.changeGiven) }),
    total_amount: Number(invoice.totalAmount),
    ...(invoice.paidAt ? { paid_at: invoice.paidAt.toISOString() } : {}),
    ...(invoice.paymentMethodSettled &&
    (invoice.paymentMethodSettled === 'CASH' || invoice.paymentMethodSettled === 'TRANSFER')
      ? { payment_method_settled: invoice.paymentMethodSettled.toLowerCase() as 'cash' | 'transfer' }
      : {}),
    is_deleted: invoice.isDeleted,
    ...(invoice.deletedById ? { deleted_by: invoice.deletedById } : {}),
    ...(invoice.deletedAt ? { deleted_at: invoice.deletedAt.toISOString() } : {}),
    items: invoice.details.map((detail) => ({
      product_barcode: detail.productBarcode,
      product_name: detail.productName,
      unit: detail.unit,
      quantity: detail.quantity,
      unit_price: Number(detail.unitPrice),
      total_amount: Number(detail.lineTotal),
      ...(includeCostPrice ? { cost_price: Number(detail.costPrice) } : {}),
    })),
  };
}

export const invoiceService = {
  async create(input: CreateInvoiceInput, profile: AuthenticatedProfile) {
    const identifiers = {
      ids: input.items.flatMap((item) => item.product_id ? [item.product_id] : []),
      barcodes: input.items.flatMap((item) => {
        const barcode = item.barcode ?? item.product_barcode;
        return barcode ? [barcode] : [];
      }),
    };
    const products = await invoiceRepository.findProductsForSale(identifiers);
    const productsById = new Map(products.map((product) => [product.id, product]));
    const productsByBarcode = new Map(products.map((product) => [product.barcode, product]));
    const quantityByProduct = new Map<string, number>();

    for (const item of input.items) {
      const byId = item.product_id ? productsById.get(item.product_id) : undefined;
      const barcode = item.barcode ?? item.product_barcode;
      const byBarcode = barcode ? productsByBarcode.get(barcode) : undefined;
      const product = item.product_id && barcode
        ? byId?.id === byBarcode?.id ? byId : undefined
        : byId ?? byBarcode;
      if (!product) {
        throw new AppError(404, 'Không tìm thấy sản phẩm!', 'PRODUCT_NOT_FOUND');
      }
      quantityByProduct.set(product.id, (quantityByProduct.get(product.id) ?? 0) + item.quantity);
    }

    const lines = [...quantityByProduct.entries()].map(([productId, quantity]) => {
      const product = productsById.get(productId)!;
      return {
        productId: product.id,
        productBarcode: product.barcode,
        productName: product.name,
        unit: product.unit,
        quantity,
        unitPrice: new Prisma.Decimal(product.sellingPrice),
        costPrice: new Prisma.Decimal(product.costPrice),
        available: product.stockQuantity,
      };
    });

    const insufficientProducts = lines
      .filter((line) => line.quantity > line.available)
      .map((line) => ({
        barcode: line.productBarcode,
        name: line.productName,
        current_stock: line.available,
        requested_quantity: line.quantity,
      }));
    if (insufficientProducts.length > 0) {
      throw new AppError(409, 'Sản phẩm không đủ tồn kho.', 'INSUFFICIENT_STOCK', {
        insufficient_products: insufficientProducts,
      });
    }

    const totalAmount = lines.reduce(
      (total, line) => total.add(line.unitPrice.mul(line.quantity)),
      new Prisma.Decimal(0),
    );

    if (input.payment_method === 'CASH' &&
      (input.amount_received === undefined || new Prisma.Decimal(input.amount_received).lessThan(totalAmount))) {
      throw new AppError(400, 'Số tiền khách đưa phải lớn hơn hoặc bằng tổng tiền hóa đơn.', 'INSUFFICIENT_PAYMENT');
    }

    let customerId: string | undefined;
    if (input.payment_method === 'DEBT') {
      if (!input.customer_id) {
        throw new AppError(400, 'Ghi nợ bắt buộc phải chọn khách quen.', 'CUSTOMER_REQUIRED');
      }
      const customer = await invoiceRepository.findCustomer(input.customer_id);
      if (!customer) throw new AppError(400, 'Mã khách hàng không hợp lệ.', 'INVALID_CUSTOMER');
      if (!customer.isRegular) {
        throw new AppError(400, 'Khách vãng lai không được ghi nợ.', 'CUSTOMER_NOT_REGULAR');
      }
      customerId = customer.id;
    } else if (input.customer_id) {
      const customer = await invoiceRepository.findCustomer(input.customer_id);
      if (!customer) throw new AppError(400, 'Mã khách hàng không hợp lệ.', 'INVALID_CUSTOMER');
      customerId = customer.id;
    }

    const amountReceived = input.payment_method === 'CASH'
      ? new Prisma.Decimal(input.amount_received!)
      : undefined;
    const changeGiven = amountReceived?.sub(totalAmount);
    const saved = await invoiceRepository.createSale({
      code: await generateCode('invoice', (code) => invoiceRepository.codeExists(code)),
      createdById: profile.id,
      ...(customerId ? { customerId } : {}),
      paymentMethod: input.payment_method,
      totalAmount,
      ...(amountReceived ? { amountReceived } : {}),
      ...(changeGiven ? { changeGiven } : {}),
      lines: lines.map(({ available: _available, ...line }) => line),
    });
    const result = invoiceDto(saved, profile.role.code === 'OWNER');

    if (input.payment_method === 'TRANSFER') {
      return {
        ...result,
        qr: {
          amount: Number(totalAmount),
          transfer_content: result.code,
        },
      };
    }
    return result;
  },

  async list(query: InvoiceListQuery, includeCostPrice: boolean) {
    const invoices = await invoiceRepository.listWithQuery(query);
    return invoices.map((invoice) => invoiceDto(invoice, includeCostPrice));
  },

  async getById(id: string, includeCostPrice: boolean) {
    const invoice = await invoiceRepository.findById(id);
    if (!invoice) throw new AppError(404, 'Không tìm thấy hóa đơn!', 'INVOICE_NOT_FOUND');
    return invoiceDto(invoice, includeCostPrice);
  },

  async getByCode(code: string, includeCostPrice: boolean) {
    const invoice = await invoiceRepository.findByCode(code);
    if (!invoice) throw new AppError(404, 'Không tìm thấy hóa đơn!', 'INVOICE_NOT_FOUND');
    return invoiceDto(invoice, includeCostPrice);
  },

  async settle(id: string, input: SettleInvoiceInput, profile: AuthenticatedProfile) {
    const amount = input.amount_received === undefined
      ? undefined
      : new Prisma.Decimal(input.amount_received);
    const saved = await debtService.settleInvoice(id, {
      amountReceived: amount,
      paymentMethod: input.payment_method,
    }, profile);
    return invoiceDto(saved, profile.role.code === 'OWNER');
  },

  async delete(id: string, profile: AuthenticatedProfile): Promise<void> {
    await invoiceRepository.softDelete(id, profile.id);
  },

  async dashboard(profile: AuthenticatedProfile) {
    const today = getHcmDateString(new Date());
    const { start, end } = getHcmDateRange(today);

    if (profile.role.code === 'STAFF') {
      const { aggregate, count } = await invoiceRepository.staffDayMetrics(profile.id, start, end);
      return {
        date: today,
        shift: {
          first_sale_at: aggregate._min.createdAt?.toISOString() ?? null,
          last_sale_at: aggregate._max.createdAt?.toISOString() ?? null,
          invoice_count: count,
          sales_amount: Number(aggregate._sum.totalAmount ?? 0),
        },
      };
    }

    const revenueData = await calculateRevenueByDateRange(today, today);
    const metrics = await invoiceRepository.todayMetrics(start, end);
    const week = getHcmWeekRange(new Date());
    const topProducts = await invoiceRepository.topSellingProducts(week.start, week.end);

    return {
      todayRevenue: revenueData.totalRevenue.toNumber(),
      todayCash: revenueData.payments.cash.toNumber(),
      todayTransfer: revenueData.payments.transfer.toNumber(),
      todayDebt: revenueData.payments.debt.toNumber(),
      lowStockCount: metrics.lowStockCount,
      todayInvoiceCount: revenueData.invoiceCount,
      latestInvoices: metrics.invoices.map((invoice) => invoiceDto(invoice, true)),
      topSellingProducts: topProducts.map((product) => ({
        barcode: product.productBarcode,
        name: product.productName,
        quantity: product._sum.quantity ?? 0,
        total_amount: Number(product._sum.lineTotal ?? 0),
        unit: product.unit || 'sản phẩm',
        image_url: product.imageUrl || null,
      })),
    };
  },
};

export function getInvoiceDateRange(date: string) {
  return getHcmDateRange(date);
}
