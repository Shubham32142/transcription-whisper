import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { ApiResponseSuccess, ApiResponseError } from '../utils/response';
import { ApiError } from '../utils/error';

/**
 * HealthController - System health and status monitoring
 * Provides endpoints to check API and dependencies health
 */
export class HealthController {
  /**
   * GET /health
   * Health check endpoint - verifies API is running and dependencies are accessible
   */
  static async health(req: Request, res: Response, next: NextFunction): Promise<void> {
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
        const { ApiKeysRepository } = require('../repositories/apiKeys.repository');
        ApiKeysRepository.findAll();
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
            path: config.db.path,
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
  static async ready(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Check if all critical services are available
      const { ApiKeysRepository } = require('../repositories/apiKeys.repository');
      const keys = ApiKeysRepository.findAll();

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
  static async live(req: Request, res: Response, next: NextFunction): Promise<void> {
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
  static async dependencies(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const deps: Record<string, any> = {
        ml_service: {
          url: config.ml.serviceUrl,
          status: 'checking',
        },
        database: {
          path: config.db.path,
          status: 'checking',
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
        const { ApiKeysRepository } = require('../repositories/apiKeys.repository');
        const count = ApiKeysRepository.findAll().length;
        deps.database.status = 'healthy';
        deps.database.records = count;
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
  static async metrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const metrics = {
        uptime_seconds: process.uptime(),
        memory_usage: {
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',
          external: Math.round(process.memoryUsage().external / 1024 / 1024) + 'MB',
        },
        node_version: process.version,
        cpu_count: require('os').cpus().length,
      };

      res.json(new ApiResponseSuccess(metrics, 'API metrics retrieved'));
    } catch (error) {
      next(error);
    }
  }
}

export default HealthController;
