import { Request, Response, NextFunction } from 'express';
import { ApiResponseSuccess } from '../utils/response';
import { ValidationError, NotFoundError, ApiError } from '../utils/error';
import { ApiKeysRepository } from '../repositories/apiKeys.repository';
import { ApiKeyResponse } from '../types';

/**
 * AdminController - Handles all admin API key management requests
 * Requires admin authentication (X-Admin-Key header)
 */
export class AdminController {
  /**
   * GET /admin/keys
   * List all API keys with metadata
   */
  static async listKeys(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const keys = await ApiKeysRepository.findAll();

      // Mask sensitive key data (only show last 8 characters)
      const maskedKeys = keys.map((key) => ({
        name: key.name,
        created_at: key.created_at,
        last_used: key.last_used,
        is_active: key.is_active === 1,
        usage_count: key.usage_count,
      }));

      res.json(
        new ApiResponseSuccess(
          { keys: maskedKeys, total: maskedKeys.length },
          'API keys retrieved successfully',
        ),
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /admin/keys
   * Create a new API key
   * Body: { name: string }
   */
  static async createKey(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as { name?: string } | undefined;
      const { name } = body || {};

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        throw new ValidationError('Invalid API key name', {
          field: 'name',
          message: 'name must be a non-empty string',
        });
      }

      // Generate a new API key
      const newKey = ApiKeysRepository.generateApiKey();

      // Save to database
      const keyRecord = await ApiKeysRepository.create(newKey, name.trim());

      const response: ApiKeyResponse = {
        id: keyRecord.id,
        key: keyRecord.key,
        name: keyRecord.name,
        created_at: keyRecord.created_at,
        is_active: keyRecord.is_active === 1,
      };

      res.status(201).json(new ApiResponseSuccess(response, 'API key created successfully'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /admin/keys/:key
   * Deactivate an API key
   * Params: { key: string }
   */
  static async deleteKey(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      let { key } = req.params;

      // Handle case where key might be an array
      if (Array.isArray(key)) {
        key = key[0];
      }

      if (!key || typeof key !== 'string' || key.trim().length === 0) {
        throw new ValidationError('Invalid API key', {
          field: 'key',
          message: 'API key is required in URL path',
        });
      }

      key = key.trim();

      // Verify key exists
      const existingKey = await ApiKeysRepository.findByKey(key);
      if (!existingKey) {
        throw new NotFoundError('API key not found', {
          key: key.substring(0, 4) + '...',
        });
      }

      // Deactivate the key
      const success = await ApiKeysRepository.deactivate(key);

      if (!success) {
        throw new ApiError('Failed to deactivate API key', 500, 'DEACTIVATION_FAILED', {
          key: key.substring(0, 4) + '...',
        });
      }

      res.json(
        new ApiResponseSuccess(
          { key: key.substring(0, 4) + '...' },
          'API key deactivated successfully',
        ),
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/stats
   * Get API usage statistics
   */
  static async getStats(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await ApiKeysRepository.getStats();

      const responseStats = {
        total_api_keys: stats.total,
        active_api_keys: stats.active,
        total_requests_made: 0, // TODO: Implement request logging
        total_transcriptions: 0, // TODO: Implement transcription counting
        timestamp: new Date().toISOString(),
      };

      res.json(new ApiResponseSuccess(responseStats, 'Admin statistics retrieved successfully'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/keys/:key
   * Get details for a specific API key
   * Params: { key: string }
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  static async getKeyDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      let { key } = req.params;

      // Handle case where key might be an array
      if (Array.isArray(key)) {
        key = key[0];
      }

      if (!key || typeof key !== 'string' || key.trim().length === 0) {
        throw new ValidationError('Invalid API key', {
          field: 'key',
          message: 'API key is required in URL path',
        });
      }

      key = key.trim();

      const keyRecord = await ApiKeysRepository.findByKey(key);

      if (!keyRecord) {
        throw new NotFoundError('API key not found', {
          key: key.substring(0, 4) + '...',
        });
      }

      const response = {
        id: keyRecord.id,
        key:
          keyRecord.key.substring(0, 4) + '...' + keyRecord.key.substring(keyRecord.key.length - 8),
        name: keyRecord.name,
        created_at: keyRecord.created_at,
        last_used: keyRecord.last_used,
        is_active: keyRecord.is_active === 1,
        usage_count: keyRecord.usage_count,
      };

      res.json(new ApiResponseSuccess(response, 'API key details retrieved successfully'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /admin/keys/:key
   * Update API key name or status
   * Params: { key: string }
   * Body: { name?: string, is_active?: boolean }
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  static async updateKey(req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
      let { key } = req.params;

      // Handle case where key might be an array
      if (Array.isArray(key)) {
        key = key[0];
      }

      if (!key || typeof key !== 'string' || key.trim().length === 0) {
        throw new ValidationError('Invalid API key', {
          field: 'key',
          message: 'API key is required in URL path',
        });
      }

      key = key.trim();

      const keyRecord = await ApiKeysRepository.findByKey(key);
      if (!keyRecord) {
        throw new NotFoundError('API key not found', {
          key: key.substring(0, 4) + '...',
        });
      }

      // TODO: Implement update logic
      throw new ApiError('Update not implemented yet', 501, 'NOT_IMPLEMENTED', {
        feature: 'Update API key',
      });
    } catch (error) {
      next(error);
    }
  }
}

export default AdminController;
