import type { ApiErrorDetail, ApiResponse } from "../types";

/**
 * Standardized API Response Success wrapper
 */
export class ApiResponseSuccess<T = unknown> implements ApiResponse<T> {
  success = true;
  data?: T;
  message?: string;

  constructor(data?: T, message?: string) {
    this.data = data;
    this.message = message;
  }

  toJSON() {
    return {
      success: this.success,
      data: this.data,
      message: this.message,
    };
  }
}

/**
 * Standardized API Response Error wrapper
 */
export class ApiResponseError implements ApiResponse {
  success = false;
  error: ApiErrorDetail;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    this.error = { code, message, details };
  }

  toJSON() {
    return {
      success: this.success,
      error: this.error,
    };
  }
}
