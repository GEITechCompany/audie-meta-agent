/**
 * CSRF Protection Middleware
 * Provides protection against Cross-Site Request Forgery attacks
 */

const crypto = require('crypto');
const { errorResponse } = require('../utils/responseUtil');
const logger = require('../utils/logger');
const ApiMetricsService = require('../services/ApiMetricsService');

// Configuration
const CSRF_COOKIE_NAME = 'csrf-token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';
const TOKEN_LENGTH = 32; // Length in bytes
const CSRF_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 24 * 60 * 60 * 1000 // 24 hours
};

/**
 * Generate a secure random token
 * @returns {string} Secure random token
 */
const generateToken = () => {
  return crypto.randomBytes(TOKEN_LENGTH).toString('hex');
};

/**
 * Set a CSRF token cookie
 * @param {Object} res - Express response object
 * @returns {string} The generated token
 */
const setTokenCookie = (res) => {
  const token = generateToken();
  res.cookie(CSRF_COOKIE_NAME, token, CSRF_COOKIE_OPTIONS);
  return token;
};

/**
 * Middleware to issue a CSRF token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const csrfToken = (req, res, next) => {
  // Check if a token is already in the cookie
  let token = req.cookies[CSRF_COOKIE_NAME];
  
  // If no token exists, create one
  if (!token) {
    token = setTokenCookie(res);
  }
  
  // Add token to response locals for template rendering
  res.locals.csrfToken = token;
  
  // Provide a method to add the token to a form
  res.locals.csrfField = () => {
    return `<input type="hidden" name="_csrf" value="${token}">`;
  };
  
  next();
};

/**
 * Middleware to verify CSRF token on requests that modify state
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const csrfProtection = async (req, res, next) => {
  const startTime = Date.now();
  
  // Skip CSRF check for safe methods (GET, HEAD, OPTIONS)
  const safeMethod = /^(GET|HEAD|OPTIONS)$/i.test(req.method);
  if (safeMethod) {
    return next();
  }
  
  // Get stored token from cookie
  const cookieToken = req.cookies[CSRF_COOKIE_NAME];
  
  // Get token from request
  const requestToken = 
    req.body._csrf || // Form submissions
    req.headers[CSRF_HEADER_NAME.toLowerCase()] || // AJAX requests
    req.query._csrf; // Query parameter
  
  // If no token in the cookie, issue a new one
  if (!cookieToken) {
    setTokenCookie(res);
    
    // Log and record the missing token
    logger.security('CSRF token missing in cookie', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.headers['user-agent']
    });
    
    await ApiMetricsService.recordApiCall({
      endpoint: req.path,
      method: req.method,
      status: 403,
      source: 'csrfMiddleware',
      is_mock: false,
      duration: Date.now() - startTime,
      error_type: 'CSRFError',
      error_message: 'CSRF token missing in cookie'
    });
    
    return errorResponse(
      res, 
      'Invalid or missing CSRF token', 
      403, 
      'csrf_error'
    );
  }
  
  // Verify that tokens match
  if (!requestToken || requestToken !== cookieToken) {
    // Log the potential CSRF attack
    logger.security('CSRF token validation failed', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.headers['user-agent'],
      cookieToken: cookieToken ? '[PRESENT]' : '[MISSING]',
      requestToken: requestToken ? '[PRESENT]' : '[MISSING]',
      match: requestToken === cookieToken
    });
    
    await ApiMetricsService.recordApiCall({
      endpoint: req.path,
      method: req.method,
      status: 403,
      source: 'csrfMiddleware',
      is_mock: false,
      duration: Date.now() - startTime,
      error_type: 'CSRFError',
      error_message: 'CSRF token validation failed'
    });
    
    return errorResponse(
      res, 
      'Invalid or missing CSRF token', 
      403, 
      'csrf_error'
    );
  }
  
  // Optionally rotate the token after successful validation
  if (process.env.CSRF_ROTATE_TOKENS === 'true') {
    setTokenCookie(res);
  }
  
  next();
};

/**
 * Add CSRF protection to all routes under a specific path
 * @param {Object} app - Express application
 * @param {string} path - Base path to protect
 */
const protectRoutes = (app, path = '/') => {
  app.use(path, csrfToken);
  app.use(path, csrfProtection);
};

module.exports = {
  csrfToken,
  csrfProtection,
  protectRoutes,
  generateToken,
  setTokenCookie
}; 