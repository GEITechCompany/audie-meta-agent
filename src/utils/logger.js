/**
 * Logger utility for consistent logging across the application
 * Uses Winston for flexible and configurable logging
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Create the logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'audie-meta-agent' },
  transports: [
    // Write to all logs with level 'info' and below to combined.log
    new winston.transports.File({ 
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Write all logs with level 'error' and below to error.log
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'), 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Write all logs with level 'api' to api.log (for API metrics)
    new winston.transports.File({ 
      filename: path.join(logDir, 'api.log'), 
      level: 'info',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ]
});

// If we're not in production, log to the console with colors
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Add custom logging methods
logger.api = (message, meta) => {
  logger.info(message, { ...meta, logType: 'api' });
};

logger.security = (message, meta) => {
  logger.warn(message, { ...meta, logType: 'security' });
};

logger.performance = (message, meta) => {
  logger.info(message, { ...meta, logType: 'performance' });
};

// Stream for Morgan HTTP request logging
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  }
};

module.exports = logger; 