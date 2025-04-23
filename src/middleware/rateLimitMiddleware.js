/**
 * Rate Limiting Middleware
 * Protects API endpoints from brute force attacks and abuse
 */

const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');
const ApiMetricsService = require('../services/ApiMetricsService');

// Store for rate limit events
const rateLimitEvents = {
  total: 0,
  byIP: {}
};

/**
 * Log rate limit hit
 * @param {Object} req - Express request object
 */
const logRateLimitHit = async (req) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const endpoint = req.originalUrl || req.url || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  
  // Update rate limit event counters
  rateLimitEvents.total += 1;
  rateLimitEvents.byIP[ip] = (rateLimitEvents.byIP[ip] || 0) + 1;
  
  // Log rate limit event
  logger.warn(`Rate limit exceeded for ${ip} on ${endpoint}`, {
    metadata: {
      ip,
      endpoint,
      userAgent,
      component: 'rateLimitMiddleware'
    }
  });
  
  // Record rate limit in API metrics
  try {
    await ApiMetricsService.recordApiCall({
      endpoint: 'rate-limit/exceeded',
      method: req.method,
      status: 429,
      source: 'rateLimitMiddleware',
      is_mock: false,
      duration: null,
      error_type: 'RateLimitExceeded',
      error_message: 'Too many requests',
      request_data: {
        ip,
        endpoint,
        userAgent
      }
    });
  } catch (error) {
    logger.error(`Error recording rate limit event: ${error.message}`, {
      component: 'rateLimitMiddleware',
      error
    });
  }
};

/**
 * Create rate limiter with custom settings
 * @param {Object} options - Rate limiter options
 * @returns {Function} Rate limiter middleware
 */
const createRateLimiter = (options = {}) => {
  const defaultOptions = {
    windowMs: 15 * 60 * 1000, // 15 minutes by default
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: {
      success: false,
      error: 'Too many requests',
      message: 'Please try again later'
    },
    handler: (req, res, next, options) => {
      logRateLimitHit(req);
      res.status(429).json(options.message);
    }
  };
  
  return rateLimit({
    ...defaultOptions,
    ...options
  });
};

// General API rate limiter
const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // 100 requests per 15 minutes
});

// Strict rate limiter for authentication endpoints
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per 15 minutes
  message: {
    success: false,
    error: 'Too many login attempts',
    message: 'Please try again after 15 minutes'
  }
});

// Very strict rate limiter for password reset and critical endpoints
const criticalLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 requests per hour
  message: {
    success: false,
    error: 'Too many attempts',
    message: 'For security reasons, please try again after 1 hour'
  }
});

// Get rate limit statistics
const getRateLimitStats = () => {
  return {
    total: rateLimitEvents.total,
    byIP: Object.keys(rateLimitEvents.byIP).map(ip => ({
      ip,
      count: rateLimitEvents.byIP[ip]
    })).sort((a, b) => b.count - a.count)
  };
};

module.exports = {
  apiLimiter,
  authLimiter,
  criticalLimiter,
  createRateLimiter,
  getRateLimitStats
}; 