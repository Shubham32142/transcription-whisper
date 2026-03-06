import { Router, type Router as ExpressRouter } from 'express';
import { adminAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { AdminController } from '../controllers/admin.controller';

export const adminRouter: ExpressRouter = Router();

// List all API keys
adminRouter.get('/keys', adminAuth, asyncHandler((...args) => AdminController.listKeys(...args)));

// Create new API key
adminRouter.post('/keys', adminAuth, asyncHandler((...args) => AdminController.createKey(...args)));

// Get specific API key details
adminRouter.get('/keys/:key', adminAuth, asyncHandler((...args) => AdminController.getKeyDetails(...args)));

// Deactivate API key
adminRouter.delete('/keys/:key', adminAuth, asyncHandler((...args) => AdminController.deleteKey(...args)));

// Update API key
adminRouter.patch('/keys/:key', adminAuth, asyncHandler((...args) => AdminController.updateKey(...args)));

// Get API usage statistics
adminRouter.get('/stats', adminAuth, asyncHandler((...args) => AdminController.getStats(...args)));
