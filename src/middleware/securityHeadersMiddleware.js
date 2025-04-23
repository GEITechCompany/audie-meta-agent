/**
 * Security Headers Middleware
 * Adds security-related HTTP headers to prevent common attacks
 */

const logger = require('../utils/logger');

/**
 * Apply security headers to all responses
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const securityHeaders = (req, res, next) => {
  // Content-Security-Policy (CSP)
  // Restrict sources of content to prevent XSS
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // Allow inline styles for convenience
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "frame-src 'self'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "base-uri 'self'",
    "upgrade-insecure-requests"
  ];
  
  // X-Content-Type-Options
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // X-Frame-Options
  // Prevent clickjacking attacks
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  
  // X-XSS-Protection
  // Additional protection against XSS in older browsers
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Strict-Transport-Security (HSTS)
  // Force HTTPS connections
  if (process.env.NODE_ENV === 'production') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }
  
  // Content-Security-Policy
  // Apply CSP directives
  res.setHeader('Content-Security-Policy', cspDirectives.join('; '));
  
  // Referrer-Policy
  // Control information sent in the Referer header
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions-Policy (formerly Feature-Policy)
  // Restrict browser features
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(self), payment=(), usb=(), bluetooth=()'
  );
  
  // Cache-Control
  // Prevent caching of sensitive information
  if (req.path.includes('/api/') || req.path.includes('/auth/')) {
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  
  next();
};

/**
 * Relaxed security headers for static content like CSS and JS
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const staticContentHeaders = (req, res, next) => {
  // Content-Security-Policy for static assets
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // More permissive for static assets
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "object-src 'none'"
  ];
  
  // Set basic security headers for static content
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', cspDirectives.join('; '));
  
  // Allow caching of static assets
  const maxAge = 86400; // 24 hours
  res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
  
  next();
};

module.exports = {
  securityHeaders,
  staticContentHeaders
}; 