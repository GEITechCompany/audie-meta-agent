/**
 * API Logger Middleware
 * Logs incoming API requests and their responses with performance metrics
 */

const logger = require('../utils/logger');
const ApiMetricsService = require('../services/ApiMetricsService');

/**
 * Middleware that logs API requests and responses
 * Includes detailed performance metrics and error tracking
 */
const apiLoggerMiddleware = async (req, res, next) => {
  // Skip logging for static assets
  if (req.path.startsWith('/static') || req.path.startsWith('/assets')) {
    return next();
  }

  // Record start time
  const startTime = process.hrtime();
  const requestTime = new Date();
  
  // Create a copy of request data for logging
  const requestData = {
    method: req.method,
    path: req.path,
    query: req.query,
    headers: {
      ...req.headers,
      authorization: req.headers.authorization ? '[REDACTED]' : undefined,
      cookie: req.headers.cookie ? '[REDACTED]' : undefined
    },
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.headers['user-agent']
  };
  
  // Log request
  logger.api(`API Request: ${req.method} ${req.path}`, {
    request: requestData,
    timestamp: requestTime
  });

  // Capture the original end method
  const originalEnd = res.end;
  let responseBody = null;
  
  // Override the res.end method to capture the response
  res.end = function(chunk, encoding) {
    // Calculate duration
    const hrDuration = process.hrtime(startTime);
    const duration = (hrDuration[0] * 1000 + hrDuration[1] / 1000000).toFixed(2);
    
    // Get response data
    responseBody = chunk;
    
    // Restore original end method and apply it
    res.end = originalEnd;
    res.end(chunk, encoding);
    
    // Prepare response data for logging
    const responseData = {
      statusCode: res.statusCode,
      statusMessage: res.statusMessage,
      headers: res.getHeaders(),
      duration: parseFloat(duration),
      size: chunk ? chunk.length : 0
    };
    
    // Log response
    const logLevel = res.statusCode >= 400 ? 'error' : 'info';
    logger[logLevel](`API Response: ${req.method} ${req.path} ${res.statusCode}`, {
      request: requestData,
      response: responseData,
      logType: 'api',
      duration: parseFloat(duration)
    });
    
    // Store metrics data in database
    try {
      const metricsData = {
        endpoint: req.path,
        method: req.method,
        statusCode: res.statusCode,
        responseTime: parseFloat(duration),
        timestamp: requestTime,
        success: res.statusCode < 400,
        source: 'app'
      };
      
      ApiMetricsService.saveApiMetrics(metricsData).catch(err => {
        logger.error('Failed to save API metrics', { error: err.message, stack: err.stack });
      });
    } catch (err) {
      logger.error('Error preparing API metrics data', { error: err.message, stack: err.stack });
    }
  };
  
  next();
};

module.exports = apiLoggerMiddleware; 