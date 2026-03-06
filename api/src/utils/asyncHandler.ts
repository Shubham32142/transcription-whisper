import type { Request, Response, NextFunction } from 'express';

/**
 * Wraps async route handlers to automatically catch errors
 * Prevents "Error: Cannot set headers after they are sent to the client"
 */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    return Promise.resolve(fn(req, res, next)).catch(next);
  };
