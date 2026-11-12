import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';

const productInclude = { category: { select: { name: true } } } satisfies Prisma.ProductInclude;

export const productRepository = {
  async findAll(options: { search?: string; categoryId?: string }) {
    const where: Prisma.ProductWhereInput = {
      isDiscontinued: false,
      ...(options.categoryId ? { categoryId: options.categoryId } : {}),
      ...(options.search
        ? { name: { contains: options.search, mode: 'insensitive' } }
        : {}),
    };

    return prisma.product.findMany({
      where,
      include: productInclude,
      orderBy: { name: 'asc' },
    });
  },

  async findByBarcode(barcode: string, includeDiscontinued = false) {
    return prisma.product.findFirst({
      where: { barcode, ...(includeDiscontinued ? {} : { isDiscontinued: false }) },
      include: productInclude,
    });
  },

  async findByName(name: string, excludeBarcode?: string) {
    return prisma.product.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(excludeBarcode ? { barcode: { not: excludeBarcode } } : {}),
      },
    });
  },

  async findById(id: string) {
    return prisma.product.findUnique({ where: { id } });
  },

  async create(data: Prisma.ProductCreateInput) {
    return prisma.product.create({ data, include: productInclude });
  },

  async update(id: string, data: Prisma.ProductUpdateInput) {
    return prisma.product.update({ where: { id }, data, include: productInclude });
  },

  async hasInvoiceDetails(productId: string) {
    return prisma.invoiceDetail.count({ where: { productId } }).then((count) => count > 0);
  },

  async discontinue(id: string) {
    return prisma.product.update({ where: { id }, data: { isDiscontinued: true } });
  },
};
