import { Router, type Router as ExpressRouter } from 'express';

import { TranscribeController } from '../controllers/transcribe.controller';
import { upload } from '../middleware/upload.middleware';
import { asyncHandler } from '../utils/asyncHandler';

export const transcribeRouter: ExpressRouter = Router();

transcribeRouter.post(
  '/',
  upload.single('file'),
  asyncHandler((...args) => TranscribeController.transcribe(...args)),
);
transcribeRouter.get('/:id', asyncHandler((...args) => TranscribeController.getById(...args)));
transcribeRouter.delete('/:id', asyncHandler((...args) => TranscribeController.deleteById(...args)));
