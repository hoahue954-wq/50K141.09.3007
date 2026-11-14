import { Router } from 'express';
import { RoleCode } from '@prisma/client';
import {
  createInvoice,
  deleteInvoice,
  getDashboard,
  getInvoice,
  getInvoiceByCode,
  listInvoices,
  settleInvoice,
  settleInvoiceLegacy,
} from '../controllers/invoice.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireRole } from '../middlewares/requireRole.js';

export const invoiceRouter = Router();

invoiceRouter.use(authenticate);
invoiceRouter.get('/dashboard', getDashboard);
invoiceRouter.get('/reports/dashboard', getDashboard);
invoiceRouter.get('/invoices', listInvoices);
invoiceRouter.get('/invoices/code/:code', getInvoiceByCode);
invoiceRouter.get('/invoices/:id', getInvoice);
invoiceRouter.post('/invoices', createInvoice);
invoiceRouter.patch('/invoices/:id/status', settleInvoice);
invoiceRouter.post('/invoices/:id/settle', settleInvoiceLegacy);
invoiceRouter.delete('/invoices/:id', requireRole(RoleCode.OWNER), deleteInvoice);
