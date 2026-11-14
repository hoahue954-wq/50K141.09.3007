import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ProfileStatus, RoleCode } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import type { Router } from 'express';
import { authenticate } from '../src/middlewares/authenticate.js';
import { requireRole } from '../src/middlewares/requireRole.js';
import { authRouter } from '../src/routes/auth.routes.js';
import { catalogRouter } from '../src/routes/catalog.routes.js';
import { customerRouter } from '../src/routes/customer.routes.js';
import { debtRouter } from '../src/routes/debt.routes.js';
import { disposalRouter } from '../src/routes/disposal.routes.js';
import { inventoryRouter } from '../src/routes/inventory.routes.js';
import { invoiceRouter } from '../src/routes/invoice.routes.js';
import { purchaseOrderRouter } from '../src/routes/purchase-order.routes.js';
import { reportRouter } from '../src/routes/report.routes.js';
import { returnRouter } from '../src/routes/return.routes.js';
import type { AuthenticatedProfile } from '../src/types/auth.js';
import { AppError } from '../src/utils/AppError.js';

const staffProfile: AuthenticatedProfile = {
  id: 'b6adf083-c5a4-4d7b-8bc8-173e27c34e1c',
  username: 'staff',
  fullName: 'Nhân viên',
  status: ProfileStatus.ACTIVE,
  createdAt: new Date(),
  role: {
    id: '7340d1db-6392-4e16-9718-a2d5a82f5bc1',
    code: RoleCode.STAFF,
    name: 'Nhân viên',
  },
};

const businessRouters: Array<[string, Router]> = [
  ['auth', authRouter],
  ['catalog', catalogRouter],
  ['invoices and dashboard', invoiceRouter],
  ['customers', customerRouter],
  ['purchase orders', purchaseOrderRouter],
  ['inventory', inventoryRouter],
  ['disposals', disposalRouter],
  ['returns', returnRouter],
  ['debts', debtRouter],
  ['reports', reportRouter],
];

const ownerOnlyEndpoints = [
  'POST /categories',
  'PUT /categories/:id',
  'DELETE /categories/:id',
  'POST /products',
  'PUT /products/:barcode',
  'DELETE /products/:barcode',
  'DELETE /invoices/:id',
  'PATCH /purchase-orders/:id',
  'PUT /purchase-orders/:id',
  'POST /purchase-orders/:id/complete',
  'DELETE /purchase-orders/:id',
  'GET /inventory',
  'GET /inventory/stats',
  'GET /inventory/low-stock',
  'GET /inventory/transactions',
  'POST /disposals/:id/approve',
  'POST /disposals/:id/reject',
  'PATCH /disposals/:id',
  'DELETE /disposals/:id',
  'POST /disposal-slips/:id/approve',
  'POST /disposal-slips/:id/reject',
  'PATCH /disposal-slips/:id',
  'PUT /disposal-slips/:id',
  'DELETE /disposal-slips/:id',
  'POST /returns/:id/approve',
  'POST /returns/:id/reject',
  'PATCH /returns/:id',
  'DELETE /returns/:id',
  'POST /return-slips/:id/approve',
  'POST /return-slips/:id/reject',
  'PATCH /return-slips/:id',
  'DELETE /return-slips/:id',
  'POST /debts/payments',
  'GET /reports/revenue',
  'GET /reports/profit',
  'GET /reports/daily',
  'GET /reports/monthly',
  'POST /reports/expenses/import',
];

function routerHasAuthenticate(router: Router): boolean {
  const containsAuthenticate = (stack: unknown): boolean => {
    if (!Array.isArray(stack)) return false;
    return stack.some((layer: unknown) => {
      if (typeof layer !== 'object' || layer === null) return false;
      if (Reflect.get(layer, 'handle') === authenticate) return true;
      const route = Reflect.get(layer, 'route');
      return typeof route === 'object' &&
        route !== null &&
        containsAuthenticate(Reflect.get(route, 'stack'));
    });
  };
  return containsAuthenticate(Reflect.get(router, 'stack'));
}

function invoke(
  middleware: ReturnType<typeof requireRole>,
  profile?: AuthenticatedProfile,
): unknown {
  const response = { locals: { authProfile: profile } } as Response;
  let receivedError: unknown;
  const next: NextFunction = (error) => {
    receivedError = error;
  };
  middleware({} as Request, response, next);
  return receivedError;
}

for (const [name, router] of businessRouters) {
  test(`business router requires authentication: ${name}`, () => {
    assert.equal(routerHasAuthenticate(router), true);
  });
}

test('authenticate middleware returns 401 when no bearer token is supplied', () => {
  let receivedError: unknown;
  const request = { header: () => undefined } as unknown as Request;
  const response = {} as Response;
  const next: NextFunction = (error) => {
    receivedError = error;
  };

  void authenticate(request, response, next);
  assert.ok(receivedError instanceof AppError);
  assert.equal(receivedError.statusCode, 401);
  assert.equal(receivedError.code, 'AUTH_REQUIRED');
});

for (const endpoint of ownerOnlyEndpoints) {
  test(`OWNER-only endpoint guard rejects STAFF and missing auth: ${endpoint}`, () => {
    const middleware = requireRole(RoleCode.OWNER);
    const staffError = invoke(middleware, staffProfile);
    const unauthenticatedError = invoke(middleware);

    assert.ok(staffError instanceof AppError);
    assert.equal(staffError.statusCode, 403);
    assert.equal(staffError.code, 'FORBIDDEN');
    assert.ok(unauthenticatedError instanceof AppError);
    assert.equal(unauthenticatedError.statusCode, 401);
    assert.equal(unauthenticatedError.code, 'AUTH_REQUIRED');
  });
}
