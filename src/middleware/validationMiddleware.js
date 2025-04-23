/**
 * Validation Middleware
 * Provides request validation, sanitization, and protection against injection attacks
 */

const { validationErrorResponse } = require('../utils/responseUtil');
const logger = require('../utils/logger');
const ApiMetricsService = require('../services/ApiMetricsService');

/**
 * Sanitize a string to prevent XSS attacks
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
const sanitizeString = (str) => {
  if (!str || typeof str !== 'string') return str;
  
  // Remove script tags and other potentially dangerous HTML
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .replace(/eval\s*\(/gi, '')
    .replace(/document\.cookie/gi, '');
};

/**
 * Sanitize an object recursively
 * @param {Object} obj - Object to sanitize
 * @returns {Object} Sanitized object
 */
const sanitizeObject = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  
  const result = Array.isArray(obj) ? [] : {};
  
  Object.keys(obj).forEach(key => {
    if (typeof obj[key] === 'string') {
      result[key] = sanitizeString(obj[key]);
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      result[key] = sanitizeObject(obj[key]);
    } else {
      result[key] = obj[key];
    }
  });
  
  return result;
};

/**
 * Basic SQL injection prevention by escaping SQL wildcards and keywords
 * @param {string} str - String to check
 * @returns {boolean} Whether string contains SQL injection patterns
 */
const containsSqlInjection = (str) => {
  if (!str || typeof str !== 'string') return false;
  
  // Test for common SQL injection patterns
  const sqlPatterns = [
    /(\s|'|"|`|;|\(|\)|\/\*|\*\/|--|\|)+\s*(UNION|SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|EXEC|EXECUTE|sp_executesql)/i,
    /(\s|'|"|`|;|\(|\)|\/\*|\*\/|--|\|)+\s*(OR|AND)(\s|'|"|`|\()+\s*['"]?\d+['"]?\s*=\s*['"]?\d+['"]/i,
    /(SLEEP\s*\(\s*\d+\s*\))/i,
    /(BENCHMARK\s*\(\s*\d+\s*,\s*.*\))/i,
    /(LOAD_FILE\s*\(\s*'.*'\s*\))/i,
    /(INTO\s+OUTFILE\s*'.*')/i
  ];
  
  return sqlPatterns.some(pattern => pattern.test(str));
};

/**
 * Check string for NoSQL injection patterns
 * @param {string} str - String to check
 * @returns {boolean} Whether string contains NoSQL injection patterns 
 */
const containsNoSqlInjection = (str) => {
  if (!str || typeof str !== 'string') return false;
  
  // Test for common NoSQL injection patterns
  const noSqlPatterns = [
    /\{\s*\$\w+\s*:/i,           // MongoDB operators like $gt, $lt, etc.
    /\.\s*\$\w+\s*\(/i,           // MongoDB function calls
    /\$where\s*:/i,               // $where operator
    /\$\w+:\s*function\s*\(/i     // JavaScript injection in queries
  ];
  
  return noSqlPatterns.some(pattern => pattern.test(str));
};

/**
 * Middleware that validates request data against a schema
 * @param {Object} schema - Validation schema (field name => validator function)
 * @param {string} source - Request property to validate ('body', 'query', 'params')
 * @returns {Function} Express middleware function
 */
const validateSchema = (schema, source = 'body') => {
  return async (req, res, next) => {
    const startTime = Date.now();
    const data = req[source];
    const errors = {};
    
    if (!data) {
      return validationErrorResponse(res, { [source]: 'No data provided' }, `${source} validation failed`);
    }
    
    // Check for injection attempts in string values
    const findInjectionAttempts = (obj, path = '') => {
      if (!obj || typeof obj !== 'object') return;
      
      Object.keys(obj).forEach(key => {
        const currentPath = path ? `${path}.${key}` : key;
        
        if (typeof obj[key] === 'string') {
          if (containsSqlInjection(obj[key])) {
            errors[currentPath] = 'Contains potential SQL injection patterns';
          } else if (containsNoSqlInjection(obj[key])) {
            errors[currentPath] = 'Contains potential NoSQL injection patterns';
          }
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          findInjectionAttempts(obj[key], currentPath);
        }
      });
    };
    
    // Find any injection attempts
    findInjectionAttempts(data);
    
    // If we found injection attempts, reject the request
    if (Object.keys(errors).length > 0) {
      // Log the potential attack
      logger.security(`Potential injection attack detected in ${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        data: JSON.stringify(data),
        errors
      });
      
      // Record API metrics for the attack attempt
      await ApiMetricsService.recordApiCall({
        endpoint: req.path,
        method: req.method,
        status: 400,
        source: 'validationMiddleware',
        is_mock: false,
        duration: Date.now() - startTime,
        error_type: 'SecurityViolation',
        error_message: 'Potential injection attack detected'
      });
      
      return validationErrorResponse(res, errors, 'Security validation failed');
    }
    
    // Validate against schema
    if (schema) {
      for (const field in schema) {
        if (schema.hasOwnProperty(field)) {
          const validator = schema[field];
          
          // Skip if field doesn't exist and isn't required
          if (data[field] === undefined && !validator.required) {
            continue;
          }
          
          // Check required fields
          if (validator.required && (data[field] === undefined || data[field] === null || data[field] === '')) {
            errors[field] = validator.message || `${field} is required`;
            continue;
          }
          
          // Skip validation if field is undefined or null
          if (data[field] === undefined || data[field] === null) {
            continue;
          }
          
          // Type validation
          if (validator.type) {
            const type = validator.type.toLowerCase();
            let isValid = true;
            
            switch (type) {
              case 'string':
                isValid = typeof data[field] === 'string';
                break;
              case 'number':
                isValid = !isNaN(Number(data[field]));
                break;
              case 'boolean':
                isValid = typeof data[field] === 'boolean' || data[field] === 'true' || data[field] === 'false';
                break;
              case 'array':
                isValid = Array.isArray(data[field]);
                break;
              case 'object':
                isValid = typeof data[field] === 'object' && !Array.isArray(data[field]) && data[field] !== null;
                break;
              case 'email':
                isValid = /^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(data[field]);
                break;
            }
            
            if (!isValid) {
              errors[field] = validator.typeMessage || `${field} must be a valid ${type}`;
              continue;
            }
          }
          
          // Min/max length for strings
          if (typeof data[field] === 'string') {
            if (validator.minLength && data[field].length < validator.minLength) {
              errors[field] = validator.minLengthMessage || `${field} must be at least ${validator.minLength} characters`;
              continue;
            }
            
            if (validator.maxLength && data[field].length > validator.maxLength) {
              errors[field] = validator.maxLengthMessage || `${field} cannot exceed ${validator.maxLength} characters`;
              continue;
            }
          }
          
          // Min/max value for numbers
          if (typeof data[field] === 'number' || !isNaN(Number(data[field]))) {
            const numValue = Number(data[field]);
            
            if (validator.min !== undefined && numValue < validator.min) {
              errors[field] = validator.minMessage || `${field} must be at least ${validator.min}`;
              continue;
            }
            
            if (validator.max !== undefined && numValue > validator.max) {
              errors[field] = validator.maxMessage || `${field} cannot exceed ${validator.max}`;
              continue;
            }
          }
          
          // Regex pattern validation
          if (validator.pattern && !validator.pattern.test(data[field])) {
            errors[field] = validator.patternMessage || `${field} has an invalid format`;
            continue;
          }
          
          // Custom validation function
          if (validator.validate && typeof validator.validate === 'function') {
            try {
              const isValid = await validator.validate(data[field], data);
              if (!isValid) {
                errors[field] = validator.message || `${field} is invalid`;
                continue;
              }
            } catch (error) {
              errors[field] = validator.message || `${field} validation failed: ${error.message}`;
              continue;
            }
          }
        }
      }
    }
    
    // If there are validation errors, respond with an error
    if (Object.keys(errors).length > 0) {
      // Record API metrics for validation failure
      await ApiMetricsService.recordApiCall({
        endpoint: req.path,
        method: req.method,
        status: 400,
        source: 'validationMiddleware',
        is_mock: false,
        duration: Date.now() - startTime,
        error_type: 'ValidationError',
        error_message: 'Input validation failed'
      });
      
      return validationErrorResponse(res, errors, 'Validation failed');
    }
    
    // Sanitize the validated data to prevent XSS
    req[source] = sanitizeObject(data);
    
    // Record API metrics for successful validation
    await ApiMetricsService.recordApiCall({
      endpoint: req.path,
      method: req.method,
      status: 200,
      source: 'validationMiddleware',
      is_mock: false,
      duration: Date.now() - startTime
    });
    
    next();
  };
};

/**
 * Predefined validation schemas for common API operations
 */
const validationSchemas = {
  // User registration schema
  register: {
    username: {
      required: true,
      type: 'string',
      minLength: 3,
      maxLength: 30,
      pattern: /^[a-zA-Z0-9_]+$/,
      message: 'Username must be 3-30 characters and can only contain letters, numbers, and underscores'
    },
    email: {
      required: true,
      type: 'email',
      message: 'Please provide a valid email address'
    },
    password: {
      required: true,
      type: 'string',
      minLength: 8,
      message: 'Password must be at least 8 characters long'
    },
    first_name: {
      type: 'string',
      maxLength: 50
    },
    last_name: {
      type: 'string',
      maxLength: 50
    }
  },
  
  // Login schema
  login: {
    username: {
      required: true,
      type: 'string'
    },
    password: {
      required: true,
      type: 'string'
    }
  },
  
  // Refresh token schema
  refreshToken: {
    refreshToken: {
      required: true,
      type: 'string'
    }
  },
  
  // Task creation schema
  createTask: {
    title: {
      required: true,
      type: 'string',
      minLength: 3,
      maxLength: 100
    },
    description: {
      type: 'string',
      maxLength: 1000
    },
    status: {
      type: 'string',
      validate: (value) => ['pending', 'in_progress', 'completed', 'cancelled'].includes(value),
      message: 'Status must be one of: pending, in_progress, completed, cancelled'
    },
    priority: {
      type: 'string',
      validate: (value) => ['low', 'medium', 'high', 'urgent'].includes(value),
      message: 'Priority must be one of: low, medium, high, urgent'
    },
    due_date: {
      type: 'string',
      validate: (value) => !isNaN(Date.parse(value)),
      message: 'Due date must be a valid date string'
    }
  }
};

// Helper middleware for quick validation of common endpoints
const validateRegistration = validateSchema(validationSchemas.register, 'body');
const validateLogin = validateSchema(validationSchemas.login, 'body');
const validateRefreshToken = validateSchema(validationSchemas.refreshToken, 'body');
const validateCreateTask = validateSchema(validationSchemas.createTask, 'body');

/**
 * Validates task update request
 */
const validateUpdateTask = (req, res, next) => {
  try {
    // Ensure at least one field to update is provided
    if (Object.keys(req.body).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: 'No fields provided for update'
      });
    }

    // Sanitize inputs if provided
    if (req.body.title) {
      req.body.title = sanitizeString(req.body.title);
    }
    
    if (req.body.description) {
      req.body.description = sanitizeString(req.body.description);
    }
    
    // Validate status
    if (req.body.status && !['pending', 'in_progress', 'completed', 'cancelled'].includes(req.body.status)) {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: 'Invalid status value'
      });
    }

    // Validate priority
    if (req.body.priority && !['low', 'medium', 'high', 'urgent'].includes(req.body.priority)) {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: 'Invalid priority value'
      });
    }

    // Validate due_date format if provided
    if (req.body.due_date) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(req.body.due_date) || isNaN(Date.parse(req.body.due_date))) {
        return res.status(400).json({
          success: false,
          error: 'validation_error',
          message: 'Invalid due date format. Use YYYY-MM-DD'
        });
      }
    }

    // Prevent changing user_id in updates
    if (req.body.user_id) {
      delete req.body.user_id;
    }

    next();
  } catch (error) {
    logger.error(`Task update validation error: ${error.message}`, { userId: req.user?.id });
    return res.status(500).json({
      success: false,
      error: 'server_error',
      message: 'Server error during validation'
    });
  }
};

module.exports = {
  sanitizeString,
  sanitizeObject,
  validateSchema,
  validationSchemas,
  // Convenience middleware for common operations
  validateRegistration,
  validateLogin,
  validateRefreshToken,
  validateCreateTask,
  validateUpdateTask
}; 