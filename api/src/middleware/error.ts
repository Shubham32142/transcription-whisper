import { Request, Response, NextFunction } from 'express';
import { ApiResponseError } from '../utils/response';
import { ApiError } from '../utils/error';

// Multer error type definition
interface MulterError {
  code: string;
  field?: string;
  limit?: number;
  size?: number;
}

/**
 * Global Error Handling Middleware
 * Catches all errors thrown in route handlers and formats responses
 * Must be registered LAST in the middleware chain
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Log error for debugging
  console.error('Error caught by error handler:', {
    message: err instanceof Error ? err.message : String(err),
    type: err instanceof ApiError ? 'ApiError' : typeof err,
    stack: err instanceof Error ? err.stack : undefined,
  });

  // Handle custom ApiError instances
  if (err instanceof ApiError) {
    const errorResponse = new ApiResponseError(err.code, err.message, err.details);

    res.status(err.statusCode).json(errorResponse);
    return;
  }

  // Handle multer file upload errors
  if (err && typeof err === 'object' && 'code' in err) {
    const error = err as MulterError;

    // Multer file size limit error
    if (error.code === 'LIMIT_FILE_SIZE') {
      const errorResponse = new ApiResponseError(
        'FILE_TOO_LARGE',
        'File size exceeds the maximum allowed limit',
        { maxSize: error.limit, receivedSize: error.size },
      );
      res.status(413).json(errorResponse);
      return;
    }

    // Multer unexpected file error
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      const errorResponse = new ApiResponseError(
        'INVALID_UPLOAD',
        'Unexpected file field in multipart request',
        { field: error.field },
      );
      res.status(400).json(errorResponse);
      return;
    }

    // Multer invalid field name
    if (error.code === 'LIMIT_PART_COUNT') {
      const errorResponse = new ApiResponseError(
        'INVALID_UPLOAD',
        'Too many parts in multipart request',
      );
      res.status(400).json(errorResponse);
      return;
    }
  }

  // Handle standard Error instances
  if (err instanceof Error) {
    let statusCode = 500;
    let errorCode = 'INTERNAL_SERVER_ERROR';
    const message = err.message || 'An unexpected error occurred';

    // Parse specific error messages for better error codes
    if (message.includes('ENOENT')) {
      errorCode = 'FILE_NOT_FOUND';
      statusCode = 404;
    } else if (message.includes('EACCES')) {
      errorCode = 'PERMISSION_DENIED';
      statusCode = 403;
    } else if (message.includes('timeout')) {
      errorCode = 'REQUEST_TIMEOUT';
      statusCode = 408;
    } else if (message.toLowerCase().includes('validation')) {
      errorCode = 'VALIDATION_ERROR';
      statusCode = 400;
    }

    const errorResponse = new ApiResponseError(errorCode, message);
    res.status(statusCode).json(errorResponse);
    return;
  }

  // Fallback for completely unknown errors
  const errorResponse = new ApiResponseError('UNKNOWN_ERROR', 'An unexpected error occurred');
  res.status(500).json(errorResponse);
}

/**
 * 404 Not Found Middleware
 * Should be registered after all route handlers
 */
export function notFoundHandler(req: Request, res: Response, _next: NextFunction): void {
  const errorResponse = new ApiResponseError(
    'NOT_FOUND',
    `Route not found: ${req.method} ${req.path}`,
    { method: req.method, path: req.path },
  );

  res.status(404).json(errorResponse);
}

/**
 * Request logging middleware
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  // Capture response status
  const originalJson = res.json.bind(res);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res.json = function (body: any) {
    const duration = Date.now() - start;

    // eslint-disable-next-line no-console
    console.log({
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return originalJson(body);
  };

  next();
}
