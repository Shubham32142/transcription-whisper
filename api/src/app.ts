import express, { type Express } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'node:path';

import { config } from './config';
import { registerRoutes } from './routes';
import { errorHandler, notFoundHandler, requestLogger } from './middleware/error.middleware';

import './repositories/apiKeys.repository';

export const app: Express = express();

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
  }),
);

app.use(morgan('combined'));
app.use(requestLogger);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const publicPath = path.resolve(__dirname, '..', 'public');
app.use(express.static(publicPath));

const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/transcribe', limiter);

registerRoutes(app);

app.use(notFoundHandler);
app.use(errorHandler);
