import type { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { AuthError, ForbiddenError } from '../utils/error';
import { ApiKeysRepository } from '../repositories/apiKeys.repository';

/**
 * API Key Authentication Middleware
 * Validates X-Api-Key header and checks if the key is active
 * Throws AuthError if key is missing or inactive
 * Throws ValidationError if API key format is invalid
 */
export function apiAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const providedApiKey = req.header('x-api-key');

    if (!providedApiKey) {
      throw new AuthError('API key is required', {
        header: 'X-Api-Key',
        message: 'Missing required header',
      });
    }

    // Validate format (should start with 'wsp_')
    if (!providedApiKey.startsWith('wsp_')) {
      throw new AuthError('Invalid API key format', {
        expected: 'wsp_*',
        received: `${providedApiKey.substring(0, 4)}...`,
      });
    }

    // Check if key exists and is active
    const keyRecord = ApiKeysRepository.findByKey(providedApiKey);
    if (!keyRecord || keyRecord.is_active === 0) {
      throw new AuthError('Invalid or inactive API key', {
        key: `${providedApiKey.substring(0, 4)}...`,
      });
    }

    // Record usage
    ApiKeysRepository.recordUsage(providedApiKey);

    // Store API key in request for later use
    (req as any).apiKey = providedApiKey;
    (req as any).apiKeyRecord = keyRecord;

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Admin Authentication Middleware
 * Validates X-Admin-Key header against configured admin key
 * Throws ForbiddenError if key is missing or invalid
 */
export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const providedKey = req.header('x-admin-key');

    if (!providedKey) {
      throw new ForbiddenError('Admin key is required', {
        header: 'X-Admin-Key',
        message: 'Missing required authentication header',
      });
    }

    if (providedKey !== config.api.adminKey) {
      throw new ForbiddenError('Invalid admin key', {
        message: 'The provided admin key is incorrect',
      });
    }

    (req as any).isAdmin = true;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Alias for apiAuth for backward compatibility
 * @deprecated Use apiAuth instead
 */
export const apiKeyAuth = apiAuth;
