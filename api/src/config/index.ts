import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',

  api: {
    apiKey: process.env.API_KEY || 'test_key',
    adminKey: process.env.ADMIN_KEY || 'admin_secret_key',
  },

  upload: {
    maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB) || 100,
    dir: process.env.UPLOAD_DIR || './uploads',
    allowedTypes: (
      process.env.ALLOWED_AUDIO_TYPES || 'audio/mpeg,audio/wav,audio/webm,audio/mp4,audio/ogg'
    )
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  },

  ml: {
    serviceUrl: process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000',
    transcribePath: process.env.ML_TRANSCRIBE_PATH || '/transcribe',
    healthPath: process.env.ML_HEALTH_PATH || '/health',
    serviceToken: process.env.ML_SERVICE_TOKEN || '',
    healthCheckEnabled: process.env.ML_HEALTHCHECK_ENABLED !== 'false',
  },

  db: {
    path: process.env.DB_PATH || './whisperself.db',
  },

  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
  },

  rateLimit: {
    windowMs: 60 * 1000,
    max: 10,
  },

  bootstrap: {
    enableDefaultApiKey: process.env.ENABLE_DEFAULT_API_KEY === 'true',
  },
} as const;

export type Config = typeof config;
