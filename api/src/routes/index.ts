import type { Express } from 'express';

import { HealthController } from '../controllers/health.controller';
import { TranscribeController } from '../controllers/transcribe.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { adminRouter } from './admin.routes';
import { transcribeRouter } from './transcribe.routes';

export function registerRoutes(app: Express): void {
  app.get('/health', asyncHandler((...args) => HealthController.health(...args)));
  app.get('/api/config', asyncHandler((...args) => TranscribeController.getConfig(...args)));

  app.use('/transcribe', transcribeRouter);
  app.use('/admin', adminRouter);
}
