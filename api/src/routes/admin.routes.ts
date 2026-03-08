import { Router, type Router as ExpressRouter } from 'express';

import { AdminController } from '../controllers/admin.controller';
import { adminAuth } from '../middleware/auth.middleware';
import { asyncHandler } from '../utils/asyncHandler';

export const adminRouter: ExpressRouter = Router();

adminRouter.get('/keys', adminAuth, asyncHandler((...args) => AdminController.listKeys(...args)));
adminRouter.post('/keys', adminAuth, asyncHandler((...args) => AdminController.createKey(...args)));
adminRouter.get(
  '/keys/:key',
  adminAuth,
  asyncHandler((...args) => AdminController.getKeyDetails(...args)),
);
adminRouter.delete(
  '/keys/:key',
  adminAuth,
  asyncHandler((...args) => AdminController.deleteKey(...args)),
);
adminRouter.patch('/keys/:key', adminAuth, asyncHandler((...args) => AdminController.updateKey(...args)));
adminRouter.get('/stats', adminAuth, asyncHandler((...args) => AdminController.getStats(...args)));
