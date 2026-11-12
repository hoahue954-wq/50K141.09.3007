import { RoleCode } from '@prisma/client';
import { Router } from 'express';
import {
  completePurchaseOrder,
  createPurchaseOrder,
  deletePurchaseOrder,
  getPurchaseOrder,
  listPurchaseOrders,
  updatePurchaseOrder,
} from '../controllers/purchase-order.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireRole } from '../middlewares/requireRole.js';

export const purchaseOrderRouter = Router();

purchaseOrderRouter.use(authenticate);
purchaseOrderRouter.get('/purchase-orders', listPurchaseOrders);
purchaseOrderRouter.post('/purchase-orders', requireRole(RoleCode.OWNER, RoleCode.STAFF), createPurchaseOrder);
purchaseOrderRouter.get('/purchase-orders/:id', getPurchaseOrder);
purchaseOrderRouter.patch('/purchase-orders/:id', requireRole(RoleCode.OWNER), updatePurchaseOrder);
purchaseOrderRouter.put('/purchase-orders/:id', requireRole(RoleCode.OWNER), updatePurchaseOrder);
purchaseOrderRouter.post('/purchase-orders/:id/complete', requireRole(RoleCode.OWNER), completePurchaseOrder);
purchaseOrderRouter.delete('/purchase-orders/:id', requireRole(RoleCode.OWNER), deletePurchaseOrder);
