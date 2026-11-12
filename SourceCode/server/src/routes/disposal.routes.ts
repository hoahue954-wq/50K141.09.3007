import { RoleCode } from '@prisma/client';
import { Router } from 'express';
import {
  approveDisposal,
  createDisposal,
  deleteDisposal,
  getDisposal,
  listDisposals,
  rejectDisposal,
  updateDisposal,
} from '../controllers/disposal.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireRole } from '../middlewares/requireRole.js';

export const disposalRouter = Router();

disposalRouter.use(authenticate);
for (const path of ['/disposals', '/disposal-slips']) {
  disposalRouter.get(path, listDisposals);
  disposalRouter.post(path, requireRole(RoleCode.OWNER, RoleCode.STAFF), createDisposal);
  disposalRouter.get(`${path}/:id`, getDisposal);
  disposalRouter.post(`${path}/:id/approve`, requireRole(RoleCode.OWNER), approveDisposal);
  disposalRouter.post(`${path}/:id/reject`, requireRole(RoleCode.OWNER), rejectDisposal);
  disposalRouter.patch(`${path}/:id`, requireRole(RoleCode.OWNER), updateDisposal);
  disposalRouter.put(`${path}/:id`, requireRole(RoleCode.OWNER), updateDisposal);
  disposalRouter.delete(`${path}/:id`, requireRole(RoleCode.OWNER), deleteDisposal);
}
