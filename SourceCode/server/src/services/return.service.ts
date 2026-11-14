import { Prisma } from '@prisma/client';
import { evidenceStorage } from '../config/evidence-storage.js';
import {
  returnRepository,
  type ReturnLine,
  type ReturnRecord,
  type ReturnSlipWrite,
} from '../repositories/return.repository.js';
import { AppError } from '../utils/AppError.js';
import { getHcmDateRange } from '../utils/date.js';
import type { AuthenticatedProfile } from '../types/auth.js';
import type {
  CreateReturnInput,
  ReturnItemInput,
  ReturnListQuery,
  UpdateReturnInput,
} from '../validators/return.validators.js';

type InvoiceSnapshot = NonNullable<Awaited<ReturnType<typeof returnRepository.findInvoice>>>;

interface ReturnableInvoiceSnapshot {
  details: {
    id: string;
    productId: string;
    productBarcode: string;
    productName: string;
    unit: string;
    quantity: number;
    unitPrice: Prisma.Decimal;
    costPrice: Prisma.Decimal;
  }[];
  returnSlips: {
    id: string;
    items: {
      kind: 'RETURNED' | 'EXCHANGED';
      invoiceDetailId: string | null;
      quantity: number;
    }[];
  }[];
}

export interface ReturnItemDto {
  product_barcode: string;
  product_name: string;
  quantity: number;
  selling_price: number;
  total_amount: number;
}

export interface ReturnDto {
  id: string;
  code: string;
  original_invoice_code: string;
  slip_date: string;
  creator_id: string;
  creator_name: string;
  status: 'pending' | 'approved' | 'rejected';
  type: 'return' | 'exchange';
  reason: string;
  items: ReturnItemDto[];
  exchange_items?: ReturnItemDto[];
  total_refund: number;
  difference_amount: number;
  proof_image_url: string;
  approved_by?: string;
  approved_at?: string;
}

function getDateRange(query: ReturnListQuery): { start: Date; end: Date } | undefined {
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

async function toDto(slip: ReturnRecord): Promise<ReturnDto> {
  if (!slip.evidenceUrl) {
    throw new AppError(500, 'Phiếu đổi/trả không có đường dẫn minh chứng.', 'EVIDENCE_MISSING');
  }
  const evidenceUrl = await evidenceStorage.createSignedUrl(slip.evidenceUrl);
  const items = slip.items
    .filter((item) => item.kind === 'RETURNED')
    .map((item) => ({
      product_barcode: item.productBarcode,
      product_name: item.productName,
      quantity: item.quantity,
      selling_price: Number(item.unitPrice),
      total_amount: Number(item.lineTotal),
    }));
  const exchangeItems = slip.items
    .filter((item) => item.kind === 'EXCHANGED')
    .map((item) => ({
      product_barcode: item.productBarcode,
      product_name: item.productName,
      quantity: item.quantity,
      selling_price: Number(item.unitPrice),
      total_amount: Number(item.lineTotal),
    }));
  return {
    id: slip.id,
    code: slip.code,
    original_invoice_code: slip.invoice.code,
    slip_date: slip.createdAt.toISOString(),
    creator_id: slip.createdBy.id,
    creator_name: slip.createdBy.fullName,
    status: slip.status.toLowerCase() as 'pending' | 'approved' | 'rejected',
    type: slip.type.toLowerCase() as 'return' | 'exchange',
    reason: slip.reason ?? '',
    items,
    ...(exchangeItems.length ? { exchange_items: exchangeItems } : {}),
    total_refund: Number(slip.totalRefund),
    difference_amount: Number(slip.difference),
    proof_image_url: evidenceUrl,
    ...(slip.approvedBy ? { approved_by: slip.approvedBy.fullName } : {}),
    ...(slip.approvedAt ? { approved_at: slip.approvedAt.toISOString() } : {}),
  };
}

function assertWithin24Hours(createdAt: Date): void {
  const elapsed = Date.now() - createdAt.getTime();
  if (elapsed < 0 || elapsed > 24 * 60 * 60 * 1000) {
    throw new AppError(400, 'Hóa đơn đã quá thời hạn đổi/trả 24 giờ.', 'RETURN_WINDOW_EXPIRED');
  }
}

function resolveInvoiceDetails(
  snapshot: ReturnableInvoiceSnapshot,
  items: ReturnItemInput[],
  excludeSlipId?: string,
): ReturnLine[] {
  const priorReturnsByDetail = new Map<string, number>();
  for (const slip of snapshot.returnSlips) {
    if (slip.id === excludeSlipId) continue;
    for (const item of slip.items) {
      if (item.kind === 'RETURNED' && item.invoiceDetailId) {
        priorReturnsByDetail.set(
          item.invoiceDetailId,
          (priorReturnsByDetail.get(item.invoiceDetailId) ?? 0) + item.quantity,
        );
      }
    }
  }

  const requestedByProduct = new Map<string, number>();
  for (const item of items) {
    const barcode = item.barcode ?? item.product_barcode;
    const byId = item.product_id
      ? snapshot.details.find((detail) => detail.productId === item.product_id)
      : undefined;
    const byBarcode = barcode
      ? snapshot.details.find((detail) => detail.productBarcode === barcode)
      : undefined;
    const detail = item.product_id && barcode
      ? byId?.productId === byBarcode?.productId ? byId : undefined
      : byId ?? byBarcode;
    if (!detail) {
      throw new AppError(400, 'Sản phẩm trả không nằm trong hóa đơn gốc.', 'RETURN_ITEM_NOT_IN_INVOICE');
    }
    requestedByProduct.set(
      detail.productId,
      (requestedByProduct.get(detail.productId) ?? 0) + item.quantity,
    );
  }

  const result: ReturnLine[] = [];
  for (const [productId, requested] of requestedByProduct) {
    const details = snapshot.details.filter((detail) => detail.productId === productId);
    const availableByDetail = new Map(details.map((detail) => [
      detail.id,
      detail.quantity - (priorReturnsByDetail.get(detail.id) ?? 0),
    ]));
    let remaining = requested;
    for (const detail of details) {
      const available = Math.max(0, availableByDetail.get(detail.id) ?? 0);
      const quantity = Math.min(available, remaining);
      if (quantity <= 0) continue;
      const unitPrice = new Prisma.Decimal(detail.unitPrice);
      result.push({
        productId: detail.productId,
        invoiceDetailId: detail.id,
        kind: 'RETURNED',
        productBarcode: detail.productBarcode,
        productName: detail.productName,
        unit: detail.unit,
        quantity,
        unitPrice,
        costPrice: new Prisma.Decimal(detail.costPrice),
        lineTotal: unitPrice.mul(quantity),
      });
      remaining -= quantity;
    }
    if (remaining > 0) {
      const totalBought = details.reduce((sum, detail) => sum + detail.quantity, 0);
      const totalReturned = details.reduce(
        (sum, detail) => sum + (priorReturnsByDetail.get(detail.id) ?? 0),
        0,
      );
      throw new AppError(409, 'Số lượng trả vượt quá số lượng còn được phép trả trên hóa đơn.', 'RETURN_QUANTITY_EXCEEDED', {
        products: [{
          product_id: productId,
          available_quantity: Math.max(0, totalBought - totalReturned),
          requested_quantity: requested,
        }],
      });
    }
  }
  return result;
}

async function resolveExchangeItems(items: ReturnItemInput[] | undefined): Promise<ReturnLine[]> {
  if (!items?.length) return [];
  const products = await returnRepository.findProducts({
    ids: items.flatMap((item) => item.product_id ? [item.product_id] : []),
    barcodes: items.flatMap((item) => {
      const barcode = item.barcode ?? item.product_barcode;
      return barcode ? [barcode] : [];
    }),
  });
  const byId = new Map(products.map((product) => [product.id, product]));
  const byBarcode = new Map(products.map((product) => [product.barcode, product]));
  const quantities = new Map<string, number>();
  for (const item of items) {
    const barcode = item.barcode ?? item.product_barcode;
    const byItemId = item.product_id ? byId.get(item.product_id) : undefined;
    const byItemBarcode = barcode ? byBarcode.get(barcode) : undefined;
    const product = item.product_id && barcode
      ? byItemId?.id === byItemBarcode?.id ? byItemId : undefined
      : byItemId ?? byItemBarcode;
    if (!product) throw new AppError(404, 'Không tìm thấy sản phẩm đổi!', 'EXCHANGE_PRODUCT_NOT_FOUND');
    quantities.set(product.id, (quantities.get(product.id) ?? 0) + item.quantity);
  }
  return [...quantities.entries()].map(([productId, quantity]) => {
    const product = byId.get(productId)!;
    const unitPrice = new Prisma.Decimal(product.sellingPrice);
    return {
      productId,
      invoiceDetailId: null,
      kind: 'EXCHANGED',
      productBarcode: product.barcode,
      productName: product.name,
      unit: product.unit,
      quantity,
      unitPrice,
      costPrice: new Prisma.Decimal(product.costPrice),
      lineTotal: unitPrice.mul(quantity),
    };
  });
}

async function buildWrite(
  snapshot: ReturnableInvoiceSnapshot,
  type: 'RETURN' | 'EXCHANGE',
  reason: string,
  evidenceUrl: string,
  returnItems: ReturnItemInput[],
  exchangeItems?: ReturnItemInput[],
  excludeSlipId?: string,
): Promise<ReturnSlipWrite> {
  const returned = resolveInvoiceDetails(snapshot, returnItems, excludeSlipId);
  const exchanged = await resolveExchangeItems(exchangeItems);
  if (type === 'EXCHANGE' && exchanged.length === 0) {
    throw new AppError(400, 'Phiếu đổi hàng cần có ít nhất một sản phẩm đổi.', 'EXCHANGE_ITEMS_REQUIRED');
  }
  if (type === 'RETURN' && exchanged.length > 0) {
    throw new AppError(400, 'Phiếu chỉ trả hàng không được có sản phẩm đổi.', 'UNEXPECTED_EXCHANGE_ITEMS');
  }
  const totalRefund = returned.reduce((sum, item) => sum.add(item.lineTotal), new Prisma.Decimal(0));
  const exchangeTotal = exchanged.reduce((sum, item) => sum.add(item.lineTotal), new Prisma.Decimal(0));
  return {
    type,
    reason,
    evidenceUrl,
    totalRefund,
    difference: exchangeTotal.sub(totalRefund),
    items: [...returned, ...exchanged],
  };
}

export const returnService = {
  async list(query: ReturnListQuery, profile: AuthenticatedProfile): Promise<ReturnDto[]> {
    const hasPagination = query.page !== undefined || query.limit !== undefined;
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const dateRange = getDateRange(query);
    const slips = await returnRepository.findMany({
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.search ? { search: query.search } : {}),
      ...(query.invoice_code ? { invoiceCode: query.invoice_code } : {}),
      ...(dateRange ? { dateRange } : {}),
      ...(hasPagination ? { skip: (page - 1) * limit, take: limit } : {}),
    });
    return Promise.all(slips.map(toDto));
  },

  async getById(id: string, profile: AuthenticatedProfile): Promise<ReturnDto> {
    const slip = await returnRepository.findById(id);
    if (!slip) throw new AppError(404, 'Không tìm thấy phiếu đổi/trả.', 'RETURN_NOT_FOUND');
    return toDto(slip);
  },

  async create(input: CreateReturnInput, profile: AuthenticatedProfile): Promise<ReturnDto> {
    if (
      input.invoice_code &&
      input.original_invoice_code &&
      input.invoice_code !== input.original_invoice_code
    ) {
      throw new AppError(400, 'Mã hóa đơn được cung cấp không khớp.', 'INVOICE_IDENTIFIER_MISMATCH');
    }
    const identifier = input.invoice_id
      ? { id: input.invoice_id }
      : { code: input.invoice_code ?? input.original_invoice_code };
    const snapshot = await returnRepository.findInvoice(identifier);
    if (!snapshot) throw new AppError(404, 'Không tìm thấy hóa đơn gốc.', 'INVOICE_NOT_FOUND');
    if (input.invoice_id && (input.invoice_code ?? input.original_invoice_code) &&
      snapshot.code !== (input.invoice_code ?? input.original_invoice_code)) {
      throw new AppError(400, 'Mã hóa đơn và invoice_id không khớp.', 'INVOICE_IDENTIFIER_MISMATCH');
    }
    if (snapshot.isDeleted) throw new AppError(409, 'Không thể đổi/trả hóa đơn đã bị xóa.', 'INVOICE_DELETED');
    assertWithin24Hours(snapshot.createdAt);

    const evidenceUrl = await evidenceStorage.upload(input.proof_image_url, 'returns', profile.id);
    const write = await buildWrite(
      snapshot,
      input.type,
      input.reason,
      evidenceUrl,
      input.items,
      input.exchange_items,
    );
    const slip = await returnRepository.create({
      invoiceId: snapshot.id,
      code: await returnRepository.createCode(),
      createdById: profile.id,
      write,
    });
    return toDto(slip);
  },

  async update(id: string, input: UpdateReturnInput, profile: AuthenticatedProfile): Promise<ReturnDto> {
    const existing = await returnRepository.findById(id);
    if (!existing) throw new AppError(404, 'Không tìm thấy phiếu đổi/trả.', 'RETURN_NOT_FOUND');
    if (existing.status !== 'PENDING' && existing.status !== 'APPROVED') {
      throw new AppError(409, 'Chỉ được sửa phiếu đổi/trả đã ghi nhận.', 'RETURN_NOT_PENDING');
    }
    const snapshot = await returnRepository.findInvoice({ id: existing.invoice.id });
    if (!snapshot) throw new AppError(404, 'Không tìm thấy hóa đơn gốc.', 'INVOICE_NOT_FOUND');
    assertWithin24Hours(snapshot.createdAt);
    const type = input.type ?? existing.type;
    const proofImageUrl = input.proof_image_url ?? input.evidence_url;
    const evidenceUrl = proofImageUrl
      ? await evidenceStorage.upload(proofImageUrl, 'returns', profile.id)
      : existing.evidenceUrl;
    if (!evidenceUrl) {
      throw new AppError(400, 'Minh chứng phiếu đổi/trả bị thiếu.', 'EVIDENCE_MISSING');
    }
    const write = await buildWrite(
      snapshot,
      type,
      input.reason,
      evidenceUrl,
      input.items,
      input.exchange_items,
      id,
    );
    return toDto(await returnRepository.update(id, profile.id, write));
  },

  async approve(id: string, profile: AuthenticatedProfile): Promise<ReturnDto> {
    return toDto(await returnRepository.approve(id, profile.id));
  },

  async reject(id: string, profile: AuthenticatedProfile): Promise<ReturnDto> {
    return toDto(await returnRepository.reject(id, profile.id));
  },

  async delete(id: string, profile: AuthenticatedProfile): Promise<void> {
    await returnRepository.softDelete(id, profile.id);
  },
};

export const returnRules = {
  assertWithin24Hours,
  resolveInvoiceDetails,
  buildWrite,
};
