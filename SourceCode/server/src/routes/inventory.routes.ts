import { RoleCode } from '@prisma/client';
import { Router } from 'express';
import {
  getInventoryStats,
  getInventoryTransactions,
  getLowStock,
} from '../controllers/inventory.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireRole } from '../middlewares/requireRole.js';

export const inventoryRouter = Router();

inventoryRouter.use(authenticate, requireRole(RoleCode.OWNER));
inventoryRouter.get('/inventory', getInventoryStats);
inventoryRouter.get('/inventory/stats', getInventoryStats);
inventoryRouter.get('/inventory/low-stock', getLowStock);
inventoryRouter.get('/inventory/transactions', getInventoryTransactions);
