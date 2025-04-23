const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Create Winston logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'audie-meta-agent' },
  transports: [
    // Write all logs to console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(
          info => `${info.timestamp} ${info.level}: ${info.message}`
        )
      )
    }),
    // Write to all logs with level 'info' and above to combined.log
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      level: 'info'
    }),
    // Write all logs with level 'error' and above to error.log
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error'
    })
  ]
});

// Add stream for Morgan middleware
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

// Log to database function (to be implemented later)
logger.logToDatabase = async (level, message, metadata) => {
  try {
    // This will be implemented after database setup
    // Will insert log entries into the logs table
  } catch (error) {
    logger.error(`Failed to log to database: ${error.message}`);
  }
};

module.exports = logger; 