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
export interface WordTimestamp {
  start: number;
  end: number;
  word: string;
  probability: number;
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string | null;
  words?: WordTimestamp[];
}

export interface TranscriptionUtterance {
  speaker: string | null;
  start: number;
  end: number;
  text: string;
  timestamp: string;
}

export interface TranscriptionResult {
  transcript: string;
  language: string;
  duration: number;
  segments: TranscriptionSegment[];
  utterances: TranscriptionUtterance[];
  structuredTranscript: string;
  speakerLabelsAvailable: boolean;
}

export interface TranscriptionRequest {
  filePath: string;
  fileName: string;
  language: string;
  task: 'transcribe' | 'translate';
  model?: 'tiny' | 'base' | 'small' | 'medium' | 'distil-large-v3' | 'large';
  // Number of CPU cores/threads the ML service should use (0 = server default).
  cpuThreads?: number;
}

export interface TranscriptionJobProgress {
  stage: string;
  percentage: number;
  processedSeconds: number;
  totalSeconds: number | null;
  elapsedSeconds: number;
  currentText?: string;
}

export interface TranscriptionJob {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  fileName: string;
  model: string;
  language: string;
  task: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  error: string | null;
  progress: TranscriptionJobProgress;
  result: TranscriptionResult | null;
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
