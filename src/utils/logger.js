const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create logs subfolders if they don't exist
const apiLogsDir = path.join(logsDir, 'api');
if (!fs.existsSync(apiLogsDir)) {
  fs.mkdirSync(apiLogsDir, { recursive: true });
}

// Performance metrics storage
const metrics = {
  apiCalls: {
    total: 0,
    success: 0,
    failed: 0,
    mock: 0,
    real: 0,
    duration: {
      sum: 0,
      count: 0,
      max: 0,
      min: Number.MAX_SAFE_INTEGER
    }
  },
  endpoints: {},
  errors: {}
};

// Custom log format with colorization based on data source
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] }),
  winston.format.json()
);

// Format specifically for console output
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(info => {
    const meta = info.metadata || {};
    const source = meta.source || '';
    const duration = meta.duration ? ` (${meta.duration}ms)` : '';
    
    // Colorize based on data source
    let prefix = '';
    if (source === 'mock') {
      prefix = '[MOCK] ';
    } else if (source === 'api') {
      prefix = '[API] ';
    }
    
    // Include tags if present
    const tags = meta.tags ? ` [${meta.tags.join(', ')}]` : '';
    
    return `${info.timestamp} ${info.level}: ${prefix}${info.message}${duration}${tags}`;
  })
);

// Create Winston logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'audie-meta-agent' },
  transports: [
    // Write all logs to console with custom format
    new winston.transports.Console({
      format: consoleFormat
    }),
    // Write to all logs with level 'info' and above to combined.log
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      level: 'info'
    }),
    // Write all API-related logs to api.log
    new winston.transports.File({
      filename: path.join(apiLogsDir, 'api.log'),
      level: 'debug',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
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

// Log API calls specifically with detailed information
logger.apiCall = (endpoint, status, duration, options = {}) => {
  const { source = 'api', error = null, mock = false, metadata = {} } = options;
  const level = error ? 'error' : 'info';
  
  // Update metrics
  metrics.apiCalls.total++;
  if (error) {
    metrics.apiCalls.failed++;
    // Track error types
    const errorType = error.name || 'UnknownError';
    metrics.errors[errorType] = (metrics.errors[errorType] || 0) + 1;
  } else {
    metrics.apiCalls.success++;
  }
  
  if (mock) {
    metrics.apiCalls.mock++;
  } else {
    metrics.apiCalls.real++;
  }
  
  // Track endpoint metrics
  if (!metrics.endpoints[endpoint]) {
    metrics.endpoints[endpoint] = { count: 0, success: 0, failed: 0, mock: 0, real: 0, durations: [] };
  }
  metrics.endpoints[endpoint].count++;
  if (error) {
    metrics.endpoints[endpoint].failed++;
  } else {
    metrics.endpoints[endpoint].success++;
  }
  
  if (mock) {
    metrics.endpoints[endpoint].mock++;
  } else {
    metrics.endpoints[endpoint].real++;
  }
  
  // Track duration
  if (duration) {
    metrics.apiCalls.duration.sum += duration;
    metrics.apiCalls.duration.count++;
    metrics.apiCalls.duration.max = Math.max(metrics.apiCalls.duration.max, duration);
    metrics.apiCalls.duration.min = Math.min(metrics.apiCalls.duration.min, duration);
    metrics.endpoints[endpoint].durations.push(duration);
  }
  
  // Format message based on whether it's a mock or real API call
  const source_tag = mock ? 'mock' : 'api';
  const statusText = error ? `failed (${status})` : `succeeded (${status})`;
  const message = `${endpoint} ${statusText}`;
  
  // Log with metadata for filtering and analysis
  logger.log(level, message, { 
    metadata: {
      source: source_tag,
      endpoint,
      status,
      duration,
      mock,
      error: error ? {
        name: error.name,
        message: error.message,
        code: error.code,
        stack: error.stack
      } : null,
      ...metadata
    }
  });
};

// Log a mock data usage specifically
logger.mockData = (component, reason, data = {}) => {
  const message = `${component} using mock data: ${reason}`;
  logger.info(message, { 
    metadata: {
      source: 'mock',
      component,
      reason,
      ...data
    }
  });
};

// Get current API metrics
logger.getApiMetrics = () => {
  // Calculate averages
  const totalCalls = metrics.apiCalls.total;
  const avgDuration = metrics.apiCalls.duration.count > 0 ? 
    metrics.apiCalls.duration.sum / metrics.apiCalls.duration.count : 0;
  
  // Format result
  return {
    totalCalls,
    successful: metrics.apiCalls.success,
    failed: metrics.apiCalls.failed,
    mockUsage: metrics.apiCalls.mock,
    realApiUsage: metrics.apiCalls.real,
    mockPercentage: totalCalls > 0 ? (metrics.apiCalls.mock / totalCalls * 100).toFixed(2) + '%' : '0%',
    avgDuration: avgDuration.toFixed(2) + 'ms',
    maxDuration: metrics.apiCalls.duration.max + 'ms',
    minDuration: metrics.apiCalls.duration.min === Number.MAX_SAFE_INTEGER ? 'N/A' : metrics.apiCalls.duration.min + 'ms',
    endpointStats: Object.keys(metrics.endpoints).map(endpoint => {
      const endpointData = metrics.endpoints[endpoint];
      const avgEndpointDuration = endpointData.durations.length > 0 ? 
        endpointData.durations.reduce((sum, val) => sum + val, 0) / endpointData.durations.length : 0;
        
      return {
        endpoint,
        calls: endpointData.count,
        successful: endpointData.success,
        failed: endpointData.failed,
        mockUsage: endpointData.mock,
        realApiUsage: endpointData.real,
        avgDuration: avgEndpointDuration.toFixed(2) + 'ms'
      };
    }),
    errorTypes: Object.keys(metrics.errors).map(errorType => ({
      type: errorType,
      count: metrics.errors[errorType]
    }))
  };
};

// Log to database function
logger.logToDatabase = async (level, message, metadata) => {
  try {
    const { getDatabase } = require('../database');
    const db = getDatabase();
    
    // Convert metadata to JSON string if present
    const metadataStr = metadata ? JSON.stringify(metadata) : null;
    
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO logs (level, message, metadata, created_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `;
      
      db.run(query, [level, message, metadataStr], function(err) {
        if (err) {
          logger.error(`Failed to log to database: ${err.message}`);
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  } catch (error) {
    logger.error(`Failed to log to database: ${error.message}`);
    return null;
  }
};

module.exports = logger; 