import fs from 'node:fs';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { ApiResponseSuccess } from '../utils/response';
import {
  ValidationError,
  FileTooLargeError,
  UnsupportedFileTypeError,
} from '../utils/error';
import { logger } from '../config/logger';
import {
  createTranscriptionJobWithMlService,
  deleteTranscriptionJobFromMlService,
  getTranscriptionJobFromMlService,
  transcribeService,
} from '../services/transcriber';
import { TranscriptionRequest } from '../types';
import { isAllowedUpload } from '../utils/fileValidation';

const supportedLanguages = ['auto', 'en', 'es', 'fr', 'de', 'ja', 'zh', 'ar', 'pt', 'ru'];
const supportedModels = ['tiny', 'base', 'small', 'medium', 'distil-large-v3', 'large'];
const supportedTasks = ['transcribe', 'translate'];

function buildTranscriptionRequest(req: Request): TranscriptionRequest {
  if (!req.file) {
    throw new ValidationError('No file provided', {
      field: 'file',
      message: 'Audio file is required',
    });
  }

  const hardMaxFileSizeBytes = config.upload.hardMaxFileSizeMb * 1024 * 1024;
  if (req.file.size > hardMaxFileSizeBytes) {
    throw new FileTooLargeError(
      `File size exceeds the maximum of ${config.upload.hardMaxFileSizeMb}MB`,
      {
        maxSize: hardMaxFileSizeBytes,
        actualSize: req.file.size,
      },
    );
  }

  const contentType = req.file.mimetype;
  if (!isAllowedUpload(contentType, req.file.originalname)) {
    throw new UnsupportedFileTypeError(
      `File type not supported. Allowed: ${config.upload.allowedTypes.join(', ')}`,
      {
        provided: contentType,
        allowed: config.upload.allowedTypes,
      },
    );
  }

  const body = req.body as
    | { language?: string; task?: string; model?: string; cpuThreads?: string }
    | undefined;
  const language = body?.language || 'auto';
  const task = body?.task || 'transcribe';
  const model = body?.model || 'distil-large-v3';

  // Optional CPU core count. 0/absent means "use the ML server default".
  let cpuThreads = 0;
  if (body?.cpuThreads !== undefined && body.cpuThreads !== '') {
    const parsed = Number(body.cpuThreads);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 128) {
      throw new ValidationError('Invalid cpuThreads', {
        field: 'cpuThreads',
        message: `cpuThreads must be an integer between 1 and 128, got: ${body.cpuThreads}`,
      });
    }
    cpuThreads = parsed;
  }

  if (!supportedLanguages.includes(language)) {
    throw new ValidationError('Invalid language', {
      field: 'language',
      message: `Unsupported language: ${language}`,
      supported: supportedLanguages,
    });
  }

  if (!supportedTasks.includes(task)) {
    throw new ValidationError('Invalid task', {
      field: 'task',
      message: `Task must be 'transcribe' or 'translate', got: ${task}`,
    });
  }

  if (!supportedModels.includes(model)) {
    throw new ValidationError('Invalid model', {
      field: 'model',
      message: `Unsupported model: ${model}`,
      supported: supportedModels,
    });
  }

  return {
    filePath: req.file.path,
    fileName: req.file.originalname,
    language,
    task: task as 'transcribe' | 'translate',
    model: model as 'tiny' | 'base' | 'small' | 'medium' | 'distil-large-v3' | 'large',
    cpuThreads,
  };
}

function recordUsage(apiKey: string | undefined): void {
  if (!apiKey) {
    return;
  }

  transcribeService.recordUsage(apiKey).catch((error: unknown) => {
    logger.warn('Failed to record API key usage', {
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

function getRequiredIdParam(req: Request): string {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  if (!id) {
    throw new ValidationError('Missing transcription ID', {
      field: 'id',
      message: 'Transcription ID is required in URL path',
    });
  }

  return id;
}

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
      const transcriptionRequest = buildTranscriptionRequest(req);

      const uploadedFilePath = transcriptionRequest.filePath;
      let result;
      try {
        // Call transcriber service
        result = await transcribeService.transcribe(transcriptionRequest);
      } finally {
        // Always delete the original upload from disk after processing
        fs.promises.unlink(uploadedFilePath).catch(() => {
          // Ignore cleanup errors
        });
      }

      // Extract API key for usage recording (if present)
      recordUsage(req.apiKey);

      // Return success response
      res.json(
        new ApiResponseSuccess(
          {
            transcript: result.transcript,
            language: result.language || transcriptionRequest.language,
            duration: result.duration,
            segments: result.segments || [],
            utterances: result.utterances || [],
            structuredTranscript: result.structuredTranscript || '',
            speakerLabelsAvailable: result.speakerLabelsAvailable ?? false,
            fileName: transcriptionRequest.fileName,
          },
          'Transcription completed successfully',
        ),
      );
    } catch (error) {
      next(error);
    }
  }

  static async createJob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const transcriptionRequest = buildTranscriptionRequest(req);
      const uploadedFilePath = transcriptionRequest.filePath;

      try {
        const job = await createTranscriptionJobWithMlService(
          transcriptionRequest.filePath,
          transcriptionRequest.fileName,
          transcriptionRequest.language,
          transcriptionRequest.task,
          transcriptionRequest.model,
          transcriptionRequest.cpuThreads,
        );

        recordUsage(req.apiKey);
        res.status(202).json(new ApiResponseSuccess(job, 'Transcription job created successfully'));
      } finally {
        fs.promises.unlink(uploadedFilePath).catch(() => {
          // Ignore cleanup errors
        });
      }
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
          hardMaxFileSizeMb: config.upload.hardMaxFileSizeMb,
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
  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = getRequiredIdParam(req);

      const job = await getTranscriptionJobFromMlService(id);
      res.json(new ApiResponseSuccess(job, 'Transcription job status retrieved successfully'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /transcribe/:id
   * Delete transcription result by ID (placeholder for future implementation)
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  static async deleteById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = getRequiredIdParam(req);

      const deleted = await deleteTranscriptionJobFromMlService(id);
      res.json(new ApiResponseSuccess(deleted, 'Transcription job deleted successfully'));
    } catch (error) {
      next(error);
    }
  }
}

export default TranscribeController;
