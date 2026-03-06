import { Router, type Router as ExpressRouter } from 'express';
import { upload } from '../middleware/upload';
import { apiAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { TranscribeController } from '../controllers/transcribe.controller';
import { HealthController } from '../controllers/health.controller';

export const transcribeRouter: ExpressRouter = Router();

// Health check endpoint
transcribeRouter.get(
  '/health',
  asyncHandler((...args) => HealthController.health(...args)),
);

// Get public API configuration
transcribeRouter.get(
  '/api/config',
  asyncHandler((...args) => TranscribeController.getConfig(...args)),
);

// Transcribe audio file (requires API key)
transcribeRouter.post(
  '/',
  upload.single('file'),
  apiAuth,
  asyncHandler((...args) => TranscribeController.transcribe(...args)),
);

// Get transcription by ID (placeholder)
transcribeRouter.get(
  '/:id',
  apiAuth,
  asyncHandler((...args) => TranscribeController.getById(...args)),
);

// Delete transcription by ID (placeholder)
transcribeRouter.delete(
  '/:id',
  apiAuth,
  asyncHandler((...args) => TranscribeController.deleteById(...args)),
);
