import { Request, Response, NextFunction } from 'express';
import { cpus } from 'os';
import { config } from '../config';
import { ApiResponseSuccess } from '../utils/response';
import { ApiKeysRepository } from '../repositories/apiKeys.repository';

// Type definitions for dependency health checks
interface DependencyStatus {
  status: 'checking' | 'healthy' | 'unhealthy' | 'unreachable';
  statusCode?: number;
  error?: string;
  records?: number;
}

interface DependenciesResponse {
  ml_service: DependencyStatus & { url: string };
  database: DependencyStatus & { type: string; url: string };
}

/**
 * HealthController - System health and status monitoring
 * Provides endpoints to check API and dependencies health
 */
export class HealthController {
  /**
   * GET /health
   * Health check endpoint - verifies API is running and dependencies are accessible
   */
  static async health(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Check ML service connectivity
      const mlServiceUrl = `${config.ml.serviceUrl}/health`;
      let mlHealthy = false;
      let mlError: string | null = null;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(mlServiceUrl, {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        mlHealthy = response.ok;
      } catch (error) {
        mlHealthy = false;
        mlError = error instanceof Error ? error.message : 'Unknown error';
      }

      // Check database connectivity
      let dbHealthy = false;
      try {
        // Try a simple query
        await ApiKeysRepository.findAll();
        dbHealthy = true;
      } catch (error) {
        dbHealthy = false;
      }

      const status = {
        status: mlHealthy && dbHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        uptime: process.uptime(),
        environment: config.nodeEnv,
        services: {
          api: {
            status: 'healthy',
            port: config.port,
          },
          ml: {
            status: mlHealthy ? 'healthy' : 'unhealthy',
            url: config.ml.serviceUrl,
            error: mlError,
          },
          database: {
            status: dbHealthy ? 'healthy' : 'unhealthy',
            type: 'supabase',
            url: config.supabase.url ? 'configured' : 'not configured',
          },
        },
      };

      const httpStatus = mlHealthy && dbHealthy ? 200 : 503;
      res
        .status(httpStatus)
        .json(
          new ApiResponseSuccess(
            status,
            `API ${status.status === 'healthy' ? 'is' : 'is not'} fully operational`,
          ),
        );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /health/ready
   * Readiness check - returns 200 if API is ready to accept requests
   */
  static async ready(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Check if all critical services are available
      const keys = await ApiKeysRepository.findAll();

      const ready = Array.isArray(keys) && keys.length > 0;

      res
        .status(ready ? 200 : 503)
        .json(new ApiResponseSuccess({ ready }, ready ? 'API is ready' : 'API is not ready'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /health/live
   * Liveness check - returns 200 if API process is alive
   */
  static live(_req: Request, res: Response, next: NextFunction): void {
    try {
      res.json(new ApiResponseSuccess({ alive: true, uptime: process.uptime() }, 'API is alive'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /health/dependencies
   * Check all external dependencies
   */
  static async dependencies(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const deps: DependenciesResponse = {
        ml_service: {
          url: config.ml.serviceUrl,
          status: 'checking' as const,
        },
        database: {
          type: 'supabase',
          url: config.supabase.url || 'not configured',
          status: 'checking' as const,
        },
      };

      // Check ML service
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(`${config.ml.serviceUrl}/health`, {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        deps.ml_service.status = response.ok ? 'healthy' : 'unhealthy';
        deps.ml_service.statusCode = response.status;
      } catch (error) {
        deps.ml_service.status = 'unreachable';
        deps.ml_service.error = error instanceof Error ? error.message : 'Unknown error';
      }

      // Check database
      try {
        const keys = await ApiKeysRepository.findAll();
        deps.database.status = 'healthy';
        deps.database.records = keys.length;
      } catch (error) {
        deps.database.status = 'unreachable';
        deps.database.error = error instanceof Error ? error.message : 'Unknown error';
      }

      res.json(new ApiResponseSuccess(deps, 'Dependency status retrieved'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /health/metrics
   * Get API performance metrics (simplified)
   */
  static metrics(_req: Request, res: Response, next: NextFunction): void {
    try {
      const metrics = {
        uptime_seconds: process.uptime(),
        memory_usage: {
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',
          external: Math.round(process.memoryUsage().external / 1024 / 1024) + 'MB',
        },
        node_version: process.version,
        cpu_count: cpus().length,
      };

      res.json(new ApiResponseSuccess(metrics, 'API metrics retrieved'));
    } catch (error) {
      next(error);
    }
  }
}

export default HealthController;
