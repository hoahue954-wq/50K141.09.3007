import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { authRouter } from './routes/auth.routes.js';
import { catalogRouter } from './routes/catalog.routes.js';
import { invoiceRouter } from './routes/invoice.routes.js';
import { customerRouter } from './routes/customer.routes.js';
import { purchaseOrderRouter } from './routes/purchase-order.routes.js';
import { inventoryRouter } from './routes/inventory.routes.js';
import { disposalRouter } from './routes/disposal.routes.js';
import { returnRouter } from './routes/return.routes.js';
import { debtRouter } from './routes/debt.routes.js';
import { reportRouter } from './routes/report.routes.js';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.FRONTEND_ORIGINS, credentials: true }));
app.use(express.json({ limit: '4mb' }));

app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api', authRouter);
app.use('/api', catalogRouter);
app.use('/api', invoiceRouter);
app.use('/api', customerRouter);
app.use('/api', purchaseOrderRouter);
app.use('/api', inventoryRouter);
app.use('/api', disposalRouter);
app.use('/api', returnRouter);
app.use('/api', debtRouter);
app.use('/api', reportRouter);
app.use(notFoundHandler);
app.use(errorHandler);
