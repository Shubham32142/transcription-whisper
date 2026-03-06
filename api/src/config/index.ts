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
    allowedTypes: (
      process.env.ALLOWED_AUDIO_TYPES || 'audio/mpeg,audio/wav,audio/webm,audio/mp4,audio/ogg'
    )
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  },

  ml: {
    serviceUrl: process.env.ML_SERVICE_URL || 'http://localhost:8000',
  },

  db: {
    path: process.env.DB_PATH || './whisperself.db',
  },

  rateLimit: {
    windowMs: 60 * 1000,
    max: 10,
  },
} as const;

export type Config = typeof config;
