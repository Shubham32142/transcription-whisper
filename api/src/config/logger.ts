type LogMetadata = Record<string, unknown>;

function formatMeta(meta?: LogMetadata): string {
  if (!meta || Object.keys(meta).length === 0) {
    return '';
  }

  return ` ${JSON.stringify(meta)}`;
}

export const logger = {
  info(message: string, meta?: LogMetadata): void {
    console.info(`[INFO] ${message}${formatMeta(meta)}`);
  },

  warn(message: string, meta?: LogMetadata): void {
    console.warn(`[WARN] ${message}${formatMeta(meta)}`);
  },

  error(message: string, meta?: LogMetadata): void {
    console.error(`[ERROR] ${message}${formatMeta(meta)}`);
  },
};
