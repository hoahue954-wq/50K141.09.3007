import { Prisma } from '@prisma/client';
import { evidenceStorage } from '../config/evidence-storage.js';
import { disposalRepository, type DisposalRecord, type DisposalLine } from '../repositories/disposal.repository.js';
import { AppError } from '../utils/AppError.js';
import { getHcmDateRange } from '../utils/date.js';
import type { AuthenticatedProfile } from '../types/auth.js';
import type {
  CreateDisposalInput,
  DisposalItemInput,
  DisposalListQuery,
  UpdateDisposalInput,
} from '../validators/disposal.validators.js';

export interface DisposalDto {
  id: string;
  code: string;
  slip_date: string;
  creator_id: string;
  creator_name: string;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
  proof_image_url: string;
  items: {
    product_barcode: string;
    product_name: string;
    unit: string;
    quantity: number;
    cost_price?: number;
    total_value?: number;
  }[];
  total_value?: number;
  approved_by?: string;
  approved_at?: string;
}

function getDateRange(query: DisposalListQuery): { start: Date; end: Date } | undefined {
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

async function toDto(slip: DisposalRecord, includeCostPrice: boolean): Promise<DisposalDto> {
  if (!slip.evidenceUrl) {
    throw new AppError(500, 'Phiếu hủy không có đường dẫn minh chứng.', 'EVIDENCE_MISSING');
  }
  const evidenceUrl = await evidenceStorage.createSignedUrl(slip.evidenceUrl);
  const items = slip.items.map((item) => ({
    product_barcode: item.productBarcode,
    product_name: item.productName,
    unit: item.unit,
    quantity: item.quantity,
    ...(includeCostPrice
      ? {
          cost_price: Number(item.costPrice),
          total_value: Number(item.totalValue),
        }
      : {}),
  }));
  return {
    id: slip.id,
    code: slip.code,
    slip_date: slip.createdAt.toISOString(),
    creator_id: slip.createdBy.id,
    creator_name: slip.createdBy.fullName,
    status: slip.status.toLowerCase() as 'pending' | 'approved' | 'rejected',
    reason: slip.reason,
    proof_image_url: evidenceUrl,
    items,
    ...(includeCostPrice
      ? { total_value: items.reduce((sum, item) => sum + (item.total_value ?? 0), 0) }
      : {}),
    ...(slip.approvedBy ? { approved_by: slip.approvedBy.fullName } : {}),
    ...(slip.approvedAt ? { approved_at: slip.approvedAt.toISOString() } : {}),
  };
}

async function resolveLines(items: DisposalItemInput[]): Promise<DisposalLine[]> {
  const products = await disposalRepository.findProducts({
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
    if (!product) throw new AppError(404, 'Không tìm thấy sản phẩm!', 'PRODUCT_NOT_FOUND');
    quantities.set(product.id, (quantities.get(product.id) ?? 0) + item.quantity);
  }

  const lines = [...quantities.entries()].map(([productId, quantity]) => {
    const product = byId.get(productId)!;
    const costPrice = new Prisma.Decimal(product.costPrice);
    return {
      productId,
      productBarcode: product.barcode,
      productName: product.name,
      unit: product.unit,
      quantity,
      costPrice,
      totalValue: costPrice.mul(quantity),
      stockQuantity: product.stockQuantity,
    };
  });
  const insufficient = lines
    .filter((line) => line.quantity > line.stockQuantity)
    .map((line) => ({
      barcode: line.productBarcode,
      name: line.productName,
      current_stock: line.stockQuantity,
      requested_quantity: line.quantity,
    }));
  if (insufficient.length) {
    throw new AppError(409, 'Số lượng hủy vượt quá tồn kho.', 'INSUFFICIENT_STOCK', {
      insufficient_products: insufficient,
    });
  }
  return lines.map(({ stockQuantity: _stockQuantity, ...line }) => line);
}

async function createOrUpdate(
  reason: string,
  proofImageUrl: string,
  items: DisposalItemInput[],
  userId: string,
): Promise<{ reason: string; evidenceUrl: string; totalValue: Prisma.Decimal; items: DisposalLine[] }> {
  const lines = await resolveLines(items);
  const evidenceUrl = await evidenceStorage.upload(proofImageUrl, 'disposals', userId);
  return {
    reason,
    evidenceUrl,
    totalValue: lines.reduce((sum, item) => sum.add(item.totalValue), new Prisma.Decimal(0)),
    items: lines,
  };
}

export const disposalService = {
  async list(query: DisposalListQuery, profile: AuthenticatedProfile): Promise<DisposalDto[]> {
    const hasPagination = query.page !== undefined || query.limit !== undefined;
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const dateRange = getDateRange(query);
    const slips = await disposalRepository.findMany({
      ...(profile.role.code === 'STAFF' ? { creatorId: profile.id } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { search: query.search } : {}),
      ...(dateRange ? { dateRange } : {}),
      ...(hasPagination ? { skip: (page - 1) * limit, take: limit } : {}),
    });
    return Promise.all(slips.map((slip) => toDto(slip, profile.role.code === 'OWNER')));
  },

  async getById(id: string, profile: AuthenticatedProfile): Promise<DisposalDto> {
    const slip = await disposalRepository.findById(
      id,
      profile.role.code === 'STAFF' ? profile.id : undefined,
    );
    if (!slip) throw new AppError(404, 'Không tìm thấy phiếu hủy.', 'DISPOSAL_NOT_FOUND');
    return toDto(slip, profile.role.code === 'OWNER');
  },

  async create(input: CreateDisposalInput, profile: AuthenticatedProfile): Promise<DisposalDto> {
    const data = await createOrUpdate(input.reason, input.proof_image_url, input.items, profile.id);
    const slip = await disposalRepository.create({
      code: await disposalRepository.createCode(),
      createdById: profile.id,
      ...data,
    });
    return toDto(slip, profile.role.code === 'OWNER');
  },

  async update(id: string, input: UpdateDisposalInput, profile: AuthenticatedProfile): Promise<DisposalDto> {
    const existing = await disposalRepository.findById(id);
    if (!existing) throw new AppError(404, 'Không tìm thấy phiếu hủy.', 'DISPOSAL_NOT_FOUND');
    if (existing.status !== 'PENDING') {
      throw new AppError(409, 'Chỉ được sửa phiếu hủy đang chờ duyệt.', 'DISPOSAL_NOT_PENDING');
    }
    const data = await createOrUpdate(input.reason, input.proof_image_url, input.items, profile.id);
    const slip = await disposalRepository.update(id, profile.id, data);
    return toDto(slip, true);
  },

  async approve(id: string, profile: AuthenticatedProfile): Promise<DisposalDto> {
    return toDto(await disposalRepository.approve(id, profile.id), true);
  },

  async reject(id: string, profile: AuthenticatedProfile): Promise<DisposalDto> {
    return toDto(await disposalRepository.reject(id, profile.id), true);
  },

  async delete(id: string, profile: AuthenticatedProfile): Promise<void> {
    await disposalRepository.softDelete(id, profile.id);
  },
};
