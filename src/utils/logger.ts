/**
 * Shared logger using winston.
 * All modules should use createLogger(moduleName) for scoped logging.
 */

import winston from 'winston';

const { combine, timestamp, printf, colorize } = winston.format;

const consoleFormat = printf(({ level, message, timestamp, module }) => {
  const mod = module ? `[${module}]` : '';
  return `${timestamp} ${level} ${mod} ${message}`;
});

const logger = winston.createLogger({
  level: 'info',
  format: combine(timestamp({ format: 'HH:mm:ss' })),
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), consoleFormat),
    }),
  ],
});

export function createLogger(module: string) {
  return logger.child({ module });
}

export function setLogLevel(level: string) {
  logger.level = level;
}

export function addFileTransport(filePath: string) {
  logger.add(
    new winston.transports.File({
      filename: filePath,
      format: combine(timestamp(), winston.format.json()),
    }),
  );
}
