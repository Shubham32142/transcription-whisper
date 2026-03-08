import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { ApiResponseSuccess } from '../utils/response';
import {
  ValidationError,
  FileTooLargeError,
  UnsupportedFileTypeError,
  ApiError,
} from '../utils/error';
import { logger } from '../config/logger';
import { transcribeService } from '../services/transcriber';
import { TranscriptionRequest } from '../types';

/**
 * TranscribeController - Handles all transcription-related requests
 * Request/Response validation and business logic delegation
 */
export class TranscribeController {
  /**
   * POST /transcribe
   * Transcribe audio file to text
   * Multipart form data: file, language (optional), task (optional)
   */
  static async transcribe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate file presence
      if (!req.file) {
        throw new ValidationError('No file provided', {
          field: 'file',
          message: 'Audio file is required',
        });
      }

      // Validate file size (convert MB to bytes)
      const maxFileSizeBytes = config.upload.maxFileSizeMb * 1024 * 1024;
      if (req.file.size > maxFileSizeBytes) {
        throw new FileTooLargeError(`File size exceeds limit of ${config.upload.maxFileSizeMb}MB`, {
          maxSize: maxFileSizeBytes,
          actualSize: req.file.size,
        });
      }

      // Validate file type
      const contentType = req.file.mimetype;
      if (!config.upload.allowedTypes.includes(contentType)) {
        throw new UnsupportedFileTypeError(
          `File type not supported. Allowed: ${config.upload.allowedTypes.join(', ')}`,
          {
            provided: contentType,
            allowed: config.upload.allowedTypes,
          },
        );
      }

      // Extract language, task, and model from request
      const body = req.body as { language?: string; task?: string; model?: string } | undefined;
      const language = body?.language || 'auto';
      const task = body?.task || 'transcribe';
      const model = body?.model || 'small';

      // Validate language
      const supportedLanguages = ['auto', 'en', 'es', 'fr', 'de', 'ja', 'zh', 'ar', 'pt', 'ru'];
      if (!supportedLanguages.includes(language)) {
        throw new ValidationError('Invalid language', {
          field: 'language',
          message: `Unsupported language: ${language}`,
          supported: supportedLanguages,
        });
      }

      // Validate task
      if (!['transcribe', 'translate'].includes(task)) {
        throw new ValidationError('Invalid task', {
          field: 'task',
          message: `Task must be 'transcribe' or 'translate', got: ${task}`,
        });
      }

      // Validate model
      const supportedModels = ['tiny', 'base', 'small', 'medium', 'large'];
      if (!supportedModels.includes(model)) {
        throw new ValidationError('Invalid model', {
          field: 'model',
          message: `Unsupported model: ${model}`,
          supported: supportedModels,
        });
      }

      // Build transcription request
      const transcriptionRequest: TranscriptionRequest = {
        filePath: req.file.path,
        fileName: req.file.originalname,
        language,
        task: task as 'transcribe' | 'translate',
        model: model as 'tiny' | 'base' | 'small' | 'medium' | 'large',
      };

      // Call transcriber service
      const result = await transcribeService.transcribe(transcriptionRequest);

      // Extract API key for usage recording (if present)
      const apiKey = req.apiKey;
      if (apiKey) {
        // Record usage - fire and forget (don't await to avoid slowing down response)
        transcribeService.recordUsage(apiKey).catch((error: unknown) => {
          logger.warn('Failed to record API key usage', {
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }

      // Return success response
      res.json(
        new ApiResponseSuccess(
          {
            transcript: result.transcript,
            language: result.language || language,
            duration: result.duration,
            segments: result.segments || [],
            fileName: req.file.originalname,
          },
          'Transcription completed successfully',
        ),
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /health
   * Health check endpoint to verify API is running
   */
  static async health(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Check ML service connectivity
      const mlServiceUrl = `${config.ml.serviceUrl}/health`;
      let mlHealthy = false;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(mlServiceUrl, {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        mlHealthy = response.ok;
      } catch {
        mlHealthy = false;
      }

      const status = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        services: {
          api: 'healthy',
          ml: mlHealthy ? 'healthy' : 'unhealthy',
        },
      };

      res.json(new ApiResponseSuccess(status, 'Health check passed'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/config
   * Get public API configuration (upload limits, supported languages, etc.)
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  static async getConfig(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const publicConfig = {
        upload: {
          maxFileSizeMb: config.upload.maxFileSizeMb,
          allowedMimeTypes: config.upload.allowedTypes,
          maxDurationSeconds: 3600,
        },
        transcription: {
          supportedLanguages: ['auto', 'en', 'es', 'fr', 'de', 'ja', 'zh', 'ar', 'pt', 'ru'],
          supportedTasks: ['transcribe', 'translate'],
        },
        rateLimit: {
          windowMs: config.rateLimit.windowMs,
          maxRequests: config.rateLimit.max,
        },
      };

      res.json(new ApiResponseSuccess(publicConfig, 'Public API configuration retrieved'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /transcribe/:id
   * Get transcription result by ID (placeholder for future implementation)
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  static async getById(req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        throw new ValidationError('Missing transcription ID', {
          field: 'id',
          message: 'Transcription ID is required in URL path',
        });
      }

      // TODO: Implement transcription history retrieval
      throw new ApiError('Not implemented yet', 501, 'NOT_IMPLEMENTED', {
        feature: 'Get transcription by ID',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /transcribe/:id
   * Delete transcription result by ID (placeholder for future implementation)
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  static async deleteById(req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        throw new ValidationError('Missing transcription ID', {
          field: 'id',
          message: 'Transcription ID is required in URL path',
        });
      }

      // TODO: Implement transcription history deletion
      throw new ApiError('Not implemented yet', 501, 'NOT_IMPLEMENTED', {
        feature: 'Delete transcription by ID',
      });
    } catch (error) {
      next(error);
    }
  }
}

export default TranscribeController;
