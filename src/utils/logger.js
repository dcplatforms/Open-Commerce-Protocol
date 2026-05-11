/**
 * Logger Utility
 *
 * Centralized logging using Winston
 */

const winston = require('winston');
const config = require('../config');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: { service: 'ocp-sdk' },
  transports: []
});

// Console transport for development
if (config.logging.console) {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let msg = `${timestamp} [${level}]: ${message}`;
        if (Object.keys(meta).length > 0) {
          msg += ` ${JSON.stringify(meta)}`;
        }
        return msg;
      })
    )
  }));
}

// File transport for production
if (config.logging.file && config.server.nodeEnv === 'production') {
  logger.add(new winston.transports.File({
    filename: config.logging.file,
    maxsize: 10485760, // 10MB
    maxFiles: 5
  }));

  // Separate file for errors
  logger.add(new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    maxsize: 10485760,
    maxFiles: 5
  }));
}

module.exports = logger;
