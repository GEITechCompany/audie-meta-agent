# Security Middleware Documentation

## Overview

This document outlines the security middleware implemented in the Audie Meta-Agent application. These middleware components provide protection against common web vulnerabilities, ensure secure authentication, and implement best practices for API security.

## Security Components

### 1. Authentication Middleware (`authMiddleware.js`)

The authentication middleware handles JWT verification and role-based access control:

- **JWT Verification**: Validates access tokens from the `Authorization` header
- **Role-Based Access Control**: Restricts access to routes based on user roles
- **Error Handling**: Returns consistent API responses for authentication failures
- **API Metrics**: Records authentication attempts and failures for monitoring

Usage:
```javascript
// Protect a route with authentication
router.get('/protected-route', authenticate, (req, res) => {
  // Access authenticated user via req.user
});

// Require admin role
router.get('/admin-route', authenticate, hasRole(['admin']), (req, res) => {
  // Only admins can access this route
});
```

### 2. Validation Middleware (`validationMiddleware.js`)

The validation middleware provides request validation and protection against injection attacks:

- **Schema Validation**: Validates request data against defined schemas
- **Input Sanitization**: Removes potentially dangerous content from inputs
- **Injection Protection**: Detects and blocks SQL and NoSQL injection attempts
- **Consistent Error Responses**: Returns detailed validation errors in a consistent format

Usage:
```javascript
// Validate registration data
router.post('/register', validateRegistration, (req, res) => {
  // req.body has been validated and sanitized
});

// Custom validation schema
const customSchema = {
  field1: {
    required: true,
    type: 'string',
    minLength: 5
  },
  field2: {
    type: 'number',
    min: 0,
    max: 100
  }
};

router.post('/custom', validateSchema(customSchema), (req, res) => {
  // Custom validation applied
});
```

### 3. CSRF Protection Middleware (`csrfMiddleware.js`)

Cross-Site Request Forgery protection for form submissions and state-changing operations:

- **Token Generation**: Creates secure random tokens for each session
- **Token Validation**: Verifies that form submissions include valid CSRF tokens
- **Cookie Management**: Stores tokens in HTTP-only cookies for security
- **Token Rotation**: Optional rotation of tokens after successful validation

Usage:
```javascript
// Apply to all routes under a path
app.use('/forms', csrfToken);
app.use('/forms', csrfProtection);

// In EJS templates, include the CSRF token
<form method="POST">
  <%- csrfField() %>
  <!-- form fields -->
</form>

// For AJAX requests, include the token in a header
const token = document.querySelector('meta[name="csrf-token"]').content;
fetch('/api/endpoint', {
  method: 'POST',
  headers: {
    'X-CSRF-Token': token
  },
  body: JSON.stringify(data)
});
```

### 4. Security Headers Middleware (`securityHeadersMiddleware.js`)

Adds security-related HTTP headers to prevent common web attacks:

- **Content-Security-Policy**: Restricts sources of content to prevent XSS
- **X-Content-Type-Options**: Prevents MIME type sniffing
- **X-Frame-Options**: Prevents clickjacking attacks
- **Strict-Transport-Security**: Forces HTTPS connections in production
- **Referrer-Policy**: Controls information sent in the Referer header
- **Permissions-Policy**: Restricts browser features

Usage:
```javascript
// Apply to all responses
app.use(securityHeaders);

// For static content with optimized headers
app.use('/static', staticContentHeaders);
app.use('/static', express.static('public'));
```

### 5. Rate Limiting Middleware (`rateLimitMiddleware.js`)

Protects endpoints from brute force attacks and abuse:

- **API Rate Limiting**: Limits general API requests
- **Auth Rate Limiting**: Stricter limits for authentication endpoints
- **Critical Endpoint Protection**: Very strict limits for sensitive operations
- **Custom Rate Limiters**: Create custom limiters for specific endpoints

Usage:
```javascript
// Apply general API rate limiting
app.use('/api', apiLimiter);

// Stricter limits for authentication
app.use('/api/auth', authLimiter);

// Custom rate limiter
const customLimiter = createRateLimiter({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 20 // 20 requests per 30 minutes
});
router.post('/sensitive-endpoint', customLimiter, (req, res) => {
  // Rate-limited endpoint
});
```

## Security Best Practices

1. **Environment Variables**: Store all secrets and configuration in environment variables, not in code
2. **HTTPS**: Always use HTTPS in production
3. **Input Validation**: Always validate and sanitize user input before processing
4. **Error Handling**: Don't expose sensitive information in error messages
5. **Authorization**: Implement proper access control for all routes
6. **Logging**: Log security events but avoid logging sensitive data
7. **Dependency Management**: Keep dependencies updated to avoid known vulnerabilities
8. **Content Security Policy**: Implement and enforce a strict CSP

## Security Configuration

Key security settings are configured through environment variables:

```dotenv
# Security Settings
NODE_ENV=production
JWT_SECRET=your-super-secure-jwt-secret-key
COOKIE_SECRET=your-cookie-signing-secret
CSRF_ROTATE_TOKENS=true
CORS_ORIGIN=https://yourdomain.com
```

## Monitoring and Alerts

The application includes monitoring of security events:

- Authentication failures are logged and tracked
- Rate limit violations are recorded
- Potential attack attempts (injection, CSRF) are logged with details
- API metrics are stored in the database for analysis

## Additional Resources

- [OWASP Top Ten](https://owasp.org/www-project-top-ten/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [JWT Security Best Practices](https://auth0.com/blog/a-look-at-the-latest-draft-for-jwt-bcp/)
- [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP) 