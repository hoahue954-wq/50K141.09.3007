import { RoleCode } from '@prisma/client';
import { Router } from 'express';
import {
  approveReturn,
  createReturn,
  deleteReturn,
  getReturn,
  listReturns,
  rejectReturn,
  updateReturn,
} from '../controllers/return.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireRole } from '../middlewares/requireRole.js';

export const returnRouter = Router();

returnRouter.use(authenticate);
for (const path of ['/returns', '/return-slips']) {
  returnRouter.get(path, listReturns);
  returnRouter.post(path, requireRole(RoleCode.OWNER, RoleCode.STAFF), createReturn);
  returnRouter.get(`${path}/:id`, getReturn);
  returnRouter.post(`${path}/:id/approve`, requireRole(RoleCode.OWNER), approveReturn);
  returnRouter.post(`${path}/:id/reject`, requireRole(RoleCode.OWNER), rejectReturn);
  returnRouter.patch(`${path}/:id`, requireRole(RoleCode.OWNER), updateReturn);
  returnRouter.delete(`${path}/:id`, requireRole(RoleCode.OWNER), deleteReturn);
}
