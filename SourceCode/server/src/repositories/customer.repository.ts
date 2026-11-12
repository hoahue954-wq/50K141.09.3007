import { prisma } from '../config/prisma.js';
import { generateCode } from '../utils/codes.js';
import type { CreateCustomerInput, CustomerListQuery } from '../validators/customer.validators.js';

export const customerRepository = {
  async findMany(query: CustomerListQuery) {
    const regular = query.is_regular === 'true'
      ? true
      : query.is_regular === 'false'
        ? false
        : query.type === 'loyal'
          ? true
          : query.type === 'guest'
            ? false
            : undefined;

    return prisma.customer.findMany({
      where: {
        ...(regular === undefined ? {} : { isRegular: regular }),
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { phone: { contains: query.search } },
              ],
            }
          : {}),
      },
      include: {
        debtRecords: {
          where: {
            OR: [
              { invoiceId: null },
              { invoice: { is: { isDeleted: false } } },
            ],
          },
          select: {
            amount: true,
            payments: { select: { amount: true } },
            invoice: {
              select: {
                returnSlips: {
                  where: { status: 'APPROVED', isDeleted: false },
                  select: { debtCredit: true },
                },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  },

  async create(input: CreateCustomerInput) {
    const code = await generateCode('customer', async (candidate) =>
      Boolean(await prisma.customer.findUnique({ where: { code: candidate }, select: { id: true } })),
    );
    return prisma.customer.create({
      data: {
        code,
        name: input.name,
        phone: input.phone || null,
        isRegular: input.is_regular ?? (input.type === 'loyal'),
        notes: input.notes || null,
      },
    });
  },
};
