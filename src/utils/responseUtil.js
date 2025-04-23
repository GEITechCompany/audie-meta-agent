/**
 * Response utility functions for consistent API responses
 */

/**
 * Send a success response
 * @param {Object} res - Express response object
 * @param {Object|Array|string} data - Response data payload
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code (default: 200)
 */
const successResponse = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
};

/**
 * Send an error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code (default: 500)
 * @param {string} errorCode - Application-specific error code
 * @param {Object} errors - Additional error details (optional)
 */
const errorResponse = (res, message, statusCode = 500, errorCode = 'server_error', errors = null) => {
  const response = {
    success: false,
    message,
    error: errorCode
  };

  if (errors) {
    response.errors = errors;
  }

  return res.status(statusCode).json(response);
};

/**
 * Send a validation error response
 * @param {Object} res - Express response object
 * @param {Object} errors - Validation errors
 * @param {string} message - Error message
 */
const validationErrorResponse = (res, errors, message = 'Validation failed') => {
  return errorResponse(res, message, 400, 'validation_error', errors);
};

/**
 * Send a not found response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {string} errorCode - Application-specific error code
 */
const notFoundResponse = (res, message = 'Resource not found', errorCode = 'not_found') => {
  return errorResponse(res, message, 404, errorCode);
};

/**
 * Send an unauthorized response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {string} errorCode - Application-specific error code
 */
const unauthorizedResponse = (res, message = 'Unauthorized', errorCode = 'unauthorized') => {
  return errorResponse(res, message, 401, errorCode);
};

/**
 * Send a forbidden response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {string} errorCode - Application-specific error code
 */
const forbiddenResponse = (res, message = 'Forbidden', errorCode = 'forbidden') => {
  return errorResponse(res, message, 403, errorCode);
};

module.exports = {
  successResponse,
  errorResponse,
  validationErrorResponse,
  notFoundResponse,
  unauthorizedResponse,
  forbiddenResponse
}; 