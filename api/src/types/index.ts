// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiErrorDetail;
  message?: string;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Transcription Types
export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  transcript: string;
  language: string;
  duration: number;
  segments: TranscriptionSegment[];
}

export interface TranscriptionRequest {
  filePath: string;
  fileName: string;
  language: string;
  task: 'transcribe' | 'translate';
}

// API Key Types
export interface ApiKeyRecord {
  id: number;
  key: string;
  name: string;
  created_at: string;
  last_used: string | null;
  is_active: number;
  usage_count: number;
}

export interface ApiKeyResponse {
  id?: number;
  key: string;
  name: string;
  created_at: string;
  is_active?: boolean;
}

// Config Types
export interface ServerConfig {
  maxFileSizeMB: number;
  allowedTypes: string[];
}

// Admin Stats
export interface AdminStats {
  total_keys: number;
  active_keys: number;
  total_transcriptions: number;
}

// Legacy types (deprecated but kept for backward compatibility)
export interface TranscriptionResponse extends TranscriptionResult {}
export interface ApiResponseSuccess extends TranscriptionResult {
  success: true;
}
export interface ApiResponseError {
  success: false;
  error: string;
}
