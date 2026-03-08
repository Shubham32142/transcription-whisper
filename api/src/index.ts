import { config } from './config';
import { logger } from './config/logger';
import { app } from './app';

app.listen(config.port, () => {
  logger.info(`WhisperSelf API listening on port ${config.port}`);
  logger.info(`Environment: ${config.nodeEnv}`);
  logger.info(`ML Service: ${config.ml.serviceUrl}`);
  logger.info(`Database: ${config.db.path}`);
});
