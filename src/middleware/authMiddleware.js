/**
 * Authentication middleware for JWT-based authentication
 * Provides route protection and role-based access control
 */

const AuthService = require('../services/AuthService');
const { errorResponse } = require('../utils/responseUtil');
const logger = require('../utils/logger');
const ApiMetricsService = require('../services/ApiMetricsService');

// Rate limiting dependencies
const rateLimit = require('express-rate-limit');

// Rate limiter for authentication endpoints (login, register)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { 
    success: false, 
    message: 'Too many authentication attempts, please try again later',
    error: 'rate_limit_exceeded'
  }
});

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { 
    success: false, 
    message: 'Too many requests, please try again later',
    error: 'rate_limit_exceeded'
  }
});

// Rate limiter for sensitive operations
const criticalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 requests per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { 
    success: false, 
    message: 'Too many sensitive operations, please try again later',
    error: 'rate_limit_exceeded'
  }
});

/**
 * Middleware to verify JWT token and attach user to request
 * @returns {Function} Express middleware function
 */
const authenticate = async (req, res, next) => {
  const startTime = Date.now();
  const endpoint = 'auth/verify';
  
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Record authentication failure (no Bearer prefix)
      await ApiMetricsService.recordApiCall({
        endpoint,
        method: 'MIDDLEWARE',
        status: 401,
        source: 'authMiddleware',
        is_mock: false,
        duration: Date.now() - startTime,
        error_type: 'AuthenticationError',
        error_message: 'No Bearer prefix in Authorization header'
      });
      
      return errorResponse(res, 'Authentication required', 401, 'auth_required');
    }

    // Extract token from header
    const token = authHeader.split(' ')[1];
    if (!token) {
      // Record authentication failure (no token)
      await ApiMetricsService.recordApiCall({
        endpoint,
        method: 'MIDDLEWARE',
        status: 401,
        source: 'authMiddleware',
        is_mock: false,
        duration: Date.now() - startTime,
        error_type: 'AuthenticationError',
        error_message: 'No token provided'
      });
      
      return errorResponse(res, 'Invalid authentication token', 401, 'invalid_token');
    }

    // Verify the token
    const decodedToken = await AuthService.verifyAccessToken(token);
    if (!decodedToken) {
      // Record authentication failure (invalid token)
      await ApiMetricsService.recordApiCall({
        endpoint,
        method: 'MIDDLEWARE',
        status: 401,
        source: 'authMiddleware',
        is_mock: false,
        duration: Date.now() - startTime,
        error_type: 'AuthenticationError',
        error_message: 'Invalid or expired token'
      });
      
      return errorResponse(res, 'Invalid or expired token', 401, 'invalid_token');
    }

    // Attach user to request object
    req.user = decodedToken;
    logger.debug(`Authenticated user: ${req.user.username} (${req.user.id})`);

    // Record successful authentication
    await ApiMetricsService.recordApiCall({
      endpoint,
      method: 'MIDDLEWARE',
      status: 200,
      source: 'authMiddleware',
      is_mock: false,
      duration: Date.now() - startTime,
      response_data: { userId: decodedToken.id }
    });
    
    next();
  } catch (error) {
    logger.error(`Authentication error: ${error.message}`);
    
    // Record authentication failure
    await ApiMetricsService.recordApiCall({
      endpoint,
      method: 'MIDDLEWARE',
      status: 401,
      source: 'authMiddleware',
      is_mock: false,
      duration: Date.now() - startTime,
      error_type: error.name,
      error_message: error.message
    });
    
    if (error.name === 'TokenExpiredError') {
      return errorResponse(res, 'Token has expired', 401, 'token_expired');
    }
    
    if (error.name === 'JsonWebTokenError') {
      return errorResponse(res, 'Invalid token', 401, 'invalid_token');
    }
    
    return errorResponse(res, 'Authentication failed', 500, 'auth_error');
  }
};

/**
 * Middleware to check if user has required role
 * @param {string|Array} roles - Required role(s)
 * @returns {Function} Express middleware function
 */
const hasRole = (roles) => {
  return async (req, res, next) => {
    const startTime = Date.now();
    
    if (!req.user) {
      // Record authorization failure (no user)
      await ApiMetricsService.recordApiCall({
        endpoint: 'auth/authorize',
        method: 'MIDDLEWARE',
        status: 401,
        source: 'authMiddleware',
        is_mock: false,
        duration: Date.now() - startTime,
        error_type: 'AuthorizationError',
        error_message: 'User not authenticated'
      });
      
      return errorResponse(res, 'Authentication required', 401, 'auth_required');
    }

    const userRole = req.user.role;
    const requiredRoles = Array.isArray(roles) ? roles : [roles];

    if (!requiredRoles.includes(userRole)) {
      logger.warn(`Access denied: User ${req.user.username} (${req.user.id}) with role ${userRole} attempted to access endpoint requiring ${requiredRoles.join(', ')}`);
      // Record authorization failure (insufficient permissions)
      await ApiMetricsService.recordApiCall({
        endpoint: 'auth/authorize',
        method: 'MIDDLEWARE',
        status: 403,
        source: 'authMiddleware',
        is_mock: false,
        duration: Date.now() - startTime,
        error_type: 'AuthorizationError',
        error_message: 'Insufficient permissions',
        response_data: { 
          userId: req.user.id,
          role: req.user.role,
          requiredRoles: requiredRoles
        }
      });
      
      return errorResponse(res, 'Insufficient permissions', 403, 'forbidden');
    }

    // Record successful authorization
    await ApiMetricsService.recordApiCall({
      endpoint: 'auth/authorize',
      method: 'MIDDLEWARE',
      status: 200,
      source: 'authMiddleware',
      is_mock: false,
      duration: Date.now() - startTime,
      response_data: { 
        userId: req.user.id,
        role: req.user.role,
        authorized: true
      }
    });
    
    next();
  };
};

// Shorthand middleware for admin access
const isAdmin = hasRole('admin');

module.exports = {
  authenticate,
  hasRole,
  isAdmin,
  authLimiter,
  apiLimiter,
  criticalLimiter
}; 