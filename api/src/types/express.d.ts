import "express";
import type { ApiKeyRecord } from './index';

declare global {
  namespace Express {
    interface Request {
      apiKey?: string;
      apiKeyRecord?: ApiKeyRecord;
      isAdmin?: boolean;
    }
  }
}
