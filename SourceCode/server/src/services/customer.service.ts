import { customerRepository } from '../repositories/customer.repository.js';
import type { CreateCustomerInput, CustomerListQuery } from '../validators/customer.validators.js';

function customerDto(customer: {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  isRegular: boolean;
  notes: string | null;
  debtRecords?: {
    amount: unknown;
    payments: { amount: unknown }[];
    invoice: {
      returnSlips: { debtCredit: unknown }[];
    } | null;
  }[];
}) {
  return {
    id: customer.id,
    code: customer.code,
    name: customer.name,
    ...(customer.phone === null ? {} : { phone: customer.phone }),
    type: customer.isRegular ? 'loyal' as const : 'guest' as const,
    ...(customer.notes === null ? {} : { notes: customer.notes }),
    total_debt: (customer.debtRecords ?? []).reduce(
      (total, record) => total + Math.max(
        0,
        Number(record.amount) -
          record.payments.reduce((paid, payment) => paid + Number(payment.amount), 0) -
          (record.invoice?.returnSlips ?? []).reduce((credit, slip) => credit + Number(slip.debtCredit), 0),
      ),
      0,
    ),
  };
}

export const customerService = {
  async list(query: CustomerListQuery) {
    return (await customerRepository.findMany(query)).map(customerDto);
  },

  async create(input: CreateCustomerInput) {
    return customerDto(await customerRepository.create(input));
  },
};
