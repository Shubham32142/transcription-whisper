import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'node:path';

// Import configuration
import { config } from './config';

// Import database initialization
import './db/database';
import './repositories/apiKeys.repository';

// Import routes
import { transcribeRouter } from './routes/transcribe';
import { adminRouter } from './routes/admin';

// Import middleware
import { apiAuth } from './middleware/auth';
import { errorHandler, notFoundHandler, requestLogger } from './middleware/error';

const app = express();

// ==================== MIDDLEWARE SETUP ====================

// Security middleware
app.use(helmet());

// Logging middleware
app.use(morgan('combined'));
app.use(requestLogger);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (UI)
const publicPath = path.resolve(__dirname, '..', 'public');
app.use(express.static(publicPath));

// ==================== RATE LIMITING ====================

const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to transcribe endpoint
app.use(`/transcribe`, limiter);

// ==================== ROUTES ====================

// Health check (no auth required)
app.get('/health', (req, res, next) => {
  transcribeRouter.stack
    .find((layer: any) => layer.route?.path === '/health')
    ?.route?.stack[0].handle(req, res, next);
});

// Public API config
app.get('/api/config', (req, res, next) => {
  transcribeRouter.stack
    .find((layer: any) => layer.route?.path === '/api/config')
    ?.route?.stack[0].handle(req, res, next);
});

// Transcription routes (requires API key)
app.use('/transcribe', transcribeRouter);

// Admin routes (requires admin key)
app.use('/admin', adminRouter);

// ==================== ERROR HANDLING ====================

// 404 handler (must be before error handler)
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// ==================== SERVER STARTUP ====================

app.listen(config.port, () => {
  console.log(`WhisperSelf API listening on port ${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`ML Service: ${config.ml.serviceUrl}`);
  console.log(`Database: ${config.db.path}`);
});
