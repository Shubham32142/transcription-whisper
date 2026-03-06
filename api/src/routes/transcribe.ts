import { Router } from 'express';
import { upload } from '../middleware/upload';
import { apiAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { TranscribeController } from '../controllers/transcribe.controller';
import { HealthController } from '../controllers/health.controller';

export const transcribeRouter = Router();

// Health check endpoint
transcribeRouter.get('/health', asyncHandler(HealthController.health));

// Get public API configuration
transcribeRouter.get('/api/config', asyncHandler(TranscribeController.getConfig));

// Transcribe audio file (requires API key)
transcribeRouter.post(
  '/',
  upload.single('file'),
  apiAuth,
  asyncHandler(TranscribeController.transcribe),
);

// Get transcription by ID (placeholder)
transcribeRouter.get('/:id', apiAuth, asyncHandler(TranscribeController.getById));

// Delete transcription by ID (placeholder)
transcribeRouter.delete('/:id', apiAuth, asyncHandler(TranscribeController.deleteById));
