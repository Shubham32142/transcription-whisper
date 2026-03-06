/**
 * Custom API Error class with status code
 */
export class ApiError extends Error {
  statusCode: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = "INTERNAL_ERROR",
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/**
 * Generic validation error
 */
export class ValidationError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, "VALIDATION_ERROR", details);
  }
}

/**
 * Authentication error
 */
export class AuthError extends ApiError {
  constructor(
    message: string = "Unauthorized",
    details?: Record<string, unknown>
  ) {
    super(message, 401, "AUTH_ERROR", details);
  }
}

/**
 * Authorization error
 */
export class ForbiddenError extends ApiError {
  constructor(
    message: string = "Forbidden",
    details?: Record<string, unknown>
  ) {
    super(message, 403, "FORBIDDEN", details);
  }
}

/**
 * Not found error
 */
export class NotFoundError extends ApiError {
  constructor(
    message: string = "Not Found",
    details?: Record<string, unknown>
  ) {
    super(message, 404, "NOT_FOUND", details);
  }
}

/**
 * Unsupported file type error
 */
export class UnsupportedFileTypeError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, "UNSUPPORTED_FILE_TYPE", details);
  }
}

/**
 * File too large error
 */
export class FileTooLargeError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 413, "FILE_TOO_LARGE", details);
  }
}
