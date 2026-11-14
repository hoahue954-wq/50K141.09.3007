import type { RequestHandler } from 'express';
import { catalogService } from '../services/catalog.service.js';
import {
  catalogSearchSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  productCreateSchema,
  productUpdateSchema,
} from '../validators/catalog.validators.js';
import { AppError } from '../utils/AppError.js';

function canViewCostPrice(roleCode: string | undefined): boolean {
  return roleCode === 'OWNER' || roleCode === 'STAFF';
}

function getParam(req: Parameters<RequestHandler>[0], name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string') {
    throw new AppError(400, 'Tham số đường dẫn không hợp lệ.', 'INVALID_PATH_PARAMETER');
  }
  return value;
}

export const listCategories: RequestHandler = async (req, res) => {
  const query = catalogSearchSchema.parse(req.query);
  res.json(await catalogService.listCategories(query.search));
};

export const getCategory: RequestHandler = async (req, res) => {
  res.json(await catalogService.getCategory(getParam(req, 'id')));
};

export const createCategory: RequestHandler = async (req, res) => {
  const input = categoryCreateSchema.parse(req.body);
  res.status(201).json(await catalogService.createCategory(input));
};

export const updateCategory: RequestHandler = async (req, res) => {
  const input = categoryUpdateSchema.parse(req.body);
  res.json(await catalogService.updateCategory(getParam(req, 'id'), input));
};

export const deleteCategory: RequestHandler = async (req, res) => {
  await catalogService.deleteCategory(getParam(req, 'id'));
  res.json({ message: 'Đã xóa danh mục thành công.' });
};

export const listProducts: RequestHandler = async (req, res) => {
  const query = catalogSearchSchema.parse(req.query);
  res.json(
    await catalogService.listProducts({
      search: query.search,
      categoryId: query.category_id,
      includeCostPrice: canViewCostPrice(res.locals.authProfile?.role.code),
    }),
  );
};

export const getProduct: RequestHandler = async (req, res) => {
  res.json(
    await catalogService.getProduct(
      getParam(req, 'barcode'),
      canViewCostPrice(res.locals.authProfile?.role.code),
    ),
  );
};

export const createProduct: RequestHandler = async (req, res) => {
  const input = productCreateSchema.parse(req.body);
  res.status(201).json(
    await catalogService.createProduct(input, canViewCostPrice(res.locals.authProfile?.role.code)),
  );
};

export const updateProduct: RequestHandler = async (req, res) => {
  const input = productUpdateSchema.parse(req.body);
  res.json(
    await catalogService.updateProduct(
      getParam(req, 'barcode'),
      input,
      canViewCostPrice(res.locals.authProfile?.role.code),
    ),
  );
};

export const deleteProduct: RequestHandler = async (req, res) => {
  await catalogService.deleteProduct(getParam(req, 'barcode'));
  res.json({ message: 'Đã ngừng kinh doanh sản phẩm thành công.' });
};
