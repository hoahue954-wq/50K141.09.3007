import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';

export const categoryRepository = {
  async findAll(search?: string) {
    return prisma.category.findMany({
      where: search ? { name: { contains: search, mode: 'insensitive' } } : undefined,
      orderBy: { name: 'asc' },
    });
  },

  async findById(id: string) {
    return prisma.category.findUnique({ where: { id } });
  },

  async findByName(name: string, excludeId?: string) {
    return prisma.category.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  },

  async findByCode(code: string, excludeId?: string) {
    return prisma.category.findFirst({
      where: {
        code,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  },

  async create(data: Prisma.CategoryCreateInput) {
    return prisma.category.create({ data });
  },

  async update(id: string, data: Prisma.CategoryUpdateInput) {
    return prisma.category.update({ where: { id }, data });
  },

  async countProducts(categoryId: string) {
    return prisma.product.count({ where: { categoryId } });
  },

  async delete(id: string) {
    return prisma.category.delete({ where: { id } });
  },
};
