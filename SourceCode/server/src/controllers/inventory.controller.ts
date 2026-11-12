import type { RequestHandler } from 'express';
import { inventoryService } from '../services/inventory.service.js';
import { inventoryQuerySchema, inventoryTransactionQuerySchema } from '../validators/inventory.validators.js';

function isOwner(res: Parameters<RequestHandler>[1]): boolean {
  return res.locals.authProfile?.role.code === 'OWNER';
}

export const getInventoryStats: RequestHandler = async (req, res) => {
  const query = inventoryQuerySchema.parse(req.query);
  res.json(await inventoryService.stats(query, isOwner(res)));
};

export const getLowStock: RequestHandler = async (_req, res) => {
  res.json(await inventoryService.lowStock(isOwner(res)));
};

export const getInventoryTransactions: RequestHandler = async (req, res) => {
  const query = inventoryTransactionQuerySchema.parse(req.query);
  res.json(await inventoryService.transactions(query));
};
