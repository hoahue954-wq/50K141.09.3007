import { Prisma } from '@prisma/client';
import { AppError } from './AppError.js';

export function assertFullPayment(receivedAmount: Prisma.Decimal, totalAmount: Prisma.Decimal): void {
  if (receivedAmount.lessThan(totalAmount)) {
    throw new AppError(400, 'Số tiền thanh toán phải bằng hoặc lớn hơn số tiền còn phải trả.', 'INSUFFICIENT_PAYMENT');
  }
}

export function assertInvoiceDeletable(hasReturns: boolean, hasDebtRecord: boolean): void {
  if (hasReturns) {
    throw new AppError(409, 'Không thể xóa hóa đơn đã có phiếu đổi/trả.', 'INVOICE_HAS_RETURNS');
  }
  if (hasDebtRecord) {
    throw new AppError(409, 'Không thể xóa hóa đơn đã phát sinh bản ghi công nợ.', 'INVOICE_HAS_DEBT');
  }
}
