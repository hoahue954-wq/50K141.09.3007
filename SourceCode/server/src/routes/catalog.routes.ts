import { Router } from 'express';
import { RoleCode } from '@prisma/client';
import {
  createCategory,
  createProduct,
  deleteCategory,
  deleteProduct,
  getCategory,
  getProduct,
  listCategories,
  listProducts,
  updateCategory,
  updateProduct,
} from '../controllers/catalog.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireRole } from '../middlewares/requireRole.js';

export const catalogRouter = Router();

catalogRouter.use(authenticate);

catalogRouter.get('/categories', listCategories);
catalogRouter.get('/categories/:id', getCategory);
catalogRouter.post('/categories', requireRole(RoleCode.OWNER), createCategory);
catalogRouter.put('/categories/:id', requireRole(RoleCode.OWNER), updateCategory);
catalogRouter.delete('/categories/:id', requireRole(RoleCode.OWNER), deleteCategory);

catalogRouter.get('/products', listProducts);
catalogRouter.get('/products/:barcode', getProduct);
catalogRouter.post('/products', requireRole(RoleCode.OWNER), createProduct);
catalogRouter.put('/products/:barcode', requireRole(RoleCode.OWNER), updateProduct);
catalogRouter.delete('/products/:barcode', requireRole(RoleCode.OWNER), deleteProduct);
