import { Router } from "express";
import { adminAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { AdminController } from "../controllers/admin.controller";

export const adminRouter = Router();

// List all API keys
adminRouter.get(
  "/keys",
  adminAuth,
  asyncHandler(AdminController.listKeys),
);

// Create new API key
adminRouter.post(
  "/keys",
  adminAuth,
  asyncHandler(AdminController.createKey),
);

// Get specific API key details
adminRouter.get(
  "/keys/:key",
  adminAuth,
  asyncHandler(AdminController.getKeyDetails),
);

// Deactivate API key
adminRouter.delete(
  "/keys/:key",
  adminAuth,
  asyncHandler(AdminController.deleteKey),
);

// Update API key
adminRouter.patch(
  "/keys/:key",
  adminAuth,
  asyncHandler(AdminController.updateKey),
);

// Get API usage statistics
adminRouter.get(
  "/stats",
  adminAuth,
  asyncHandler(AdminController.getStats),
);
