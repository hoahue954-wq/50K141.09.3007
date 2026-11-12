import { Router } from 'express';
import { getCurrentUser } from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/authenticate.js';

export const authRouter = Router();

authRouter.get('/auth/me', authenticate, getCurrentUser);
