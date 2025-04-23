/**
 * API Test Utilities
 * Provides helper functions for testing API integrations, fallback mechanisms,
 * and error handling across the application
 */

const { google } = require('googleapis');
const nock = require('nock');

/**
 * API test utility class with methods for simulating failures and validating responses
 */
class ApiTestUtils {
  /**
   * Simulate Gmail API authentication failure
   * @param {Object} mockGoogle - The mocked Google API object
   * @param {string} errorMessage - Custom error message for the failure
   * @returns {Object} The configured mock 
   */
  static simulateGmailAuthFailure(mockGoogle, errorMessage = 'Authentication failed') {
    // Configure OAuth mock to throw authentication error
    mockGoogle.auth.OAuth2.mockImplementation(() => {
      throw new Error(errorMessage);
    });
    
    return mockGoogle;
  }

  /**
   * Simulate Gmail API request failure
   * @param {Object} mockGmail - The mocked Gmail API object
   * @param {string} method - API method to mock ('list', 'get', etc.)
   * @param {number} statusCode - HTTP status code to return
   * @param {string} errorMessage - Error message to return
   * @returns {Object} The configured mock
   */
  static simulateGmailRequestFailure(mockGmail, method = 'list', statusCode = 500, errorMessage = 'API error') {
    if (!mockGmail.users?.messages?.[method]) {
      throw new Error(`Method ${method} not available on mockGmail.users.messages`);
    }
    
    // Reject with appropriate error
    mockGmail.users.messages[method].mockRejectedValue({
      code: statusCode,
      message: errorMessage,
      errors: [{ message: errorMessage }]
    });
    
    return mockGmail;
  }

  /**
   * Simulate rate limit exceeded error (429)
   * @param {Object} mockGmail - The mocked Gmail API object
   * @param {string} method - API method to mock ('list', 'get', etc.)
   * @returns {Object} The configured mock
   */
  static simulateRateLimitExceeded(mockGmail, method = 'list') {
    return this.simulateGmailRequestFailure(
      mockGmail,
      method,
      429,
      'Rate limit exceeded. Please try again later.'
    );
  }

  /**
   * Simulate network failure
   * @param {Object} mockGmail - The mocked Gmail API object
   * @param {string} method - API method to mock ('list', 'get', etc.)
   * @returns {Object} The configured mock
   */
  static simulateNetworkFailure(mockGmail, method = 'list') {
    if (!mockGmail.users?.messages?.[method]) {
      throw new Error(`Method ${method} not available on mockGmail.users.messages`);
    }
    
    // Create network error
    const networkError = new Error('Network error');
    networkError.code = 'ECONNRESET';
    
    mockGmail.users.messages[method].mockRejectedValue(networkError);
    
    return mockGmail;
  }

  /**
   * Simulate timeout error
   * @param {Object} mockGmail - The mocked Gmail API object
   * @param {string} method - API method to mock ('list', 'get', etc.)
   * @returns {Object} The configured mock
   */
  static simulateTimeoutError(mockGmail, method = 'list') {
    if (!mockGmail.users?.messages?.[method]) {
      throw new Error(`Method ${method} not available on mockGmail.users.messages`);
    }
    
    // Create timeout error
    const timeoutError = new Error('Timeout error');
    timeoutError.code = 'ETIMEDOUT';
    
    mockGmail.users.messages[method].mockRejectedValue(timeoutError);
    
    return mockGmail;
  }

  /**
   * Verify that response formats match between real and mock data
   * @param {Object} realResponse - Response from the real API
   * @param {Object} mockResponse - Response from the mock data
   * @returns {Object} Validation result with success flag and any mismatches
   */
  static validateResponseFormat(realResponse, mockResponse) {
    const result = {
      isValid: true,
      mismatches: []
    };
    
    // Helper function to check structure recursively
    const checkStructure = (real, mock, path = '') => {
      // If either value is null or undefined, they must both be
      if (real === null || real === undefined || mock === null || mock === undefined) {
        if ((real === null || real === undefined) && (mock === null || mock === undefined)) {
          return; // Both are null/undefined, structure matches
        } else {
          result.isValid = false;
          result.mismatches.push({
            path,
            realValue: real,
            mockValue: mock
          });
          return;
        }
      }
      
      // Check type match
      if (typeof real !== typeof mock) {
        result.isValid = false;
        result.mismatches.push({
          path,
          issue: 'type_mismatch',
          realType: typeof real,
          mockType: typeof mock
        });
        return;
      }
      
      // If arrays, check each element
      if (Array.isArray(real) && Array.isArray(mock)) {
        // If empty arrays, no further checks needed
        if (real.length === 0 && mock.length === 0) {
          return;
        }
        
        // Check at least the first element if available
        if (real.length > 0 && mock.length > 0) {
          checkStructure(real[0], mock[0], `${path}[0]`);
        }
        return;
      }
      
      // If objects, check all properties
      if (typeof real === 'object' && typeof mock === 'object') {
        // Get all properties from both objects
        const realProps = Object.keys(real);
        const mockProps = Object.keys(mock);
        
        // Check if the mock has all required properties (by examining the real data)
        for (const prop of realProps) {
          if (typeof real[prop] !== 'function') { // Skip methods
            if (!(prop in mock)) {
              result.isValid = false;
              result.mismatches.push({
                path: path ? `${path}.${prop}` : prop,
                issue: 'missing_property',
                details: `Property exists in real data but missing in mock`
              });
            } else {
              // Recursively check nested structure
              checkStructure(real[prop], mock[prop], path ? `${path}.${prop}` : prop);
            }
          }
        }
      }
    };
    
    checkStructure(realResponse, mockResponse);
    return result;
  }

  /**
   * Test if all error paths are properly handled without crashing
   * @param {Function} testFunction - Async function to test
   * @param {Array} errorScenarios - Array of error scenarios to test
   * @returns {Promise<Array>} Array of test results for each scenario
   */
  static async testErrorHandling(testFunction, errorScenarios) {
    const results = [];
    
    for (const scenario of errorScenarios) {
      try {
        const result = await testFunction(scenario);
        
        results.push({
          scenario: scenario.name,
          success: true,
          crashed: false,
          returned: !!result,
          errorHandled: scenario.expectsError === true,
          result
        });
      } catch (error) {
        results.push({
          scenario: scenario.name,
          success: false,
          crashed: true,
          error: error.message,
          stack: error.stack
        });
      }
    }
    
    return results;
  }

  /**
   * Simulate API responses with nock for real HTTP requests
   * @param {string} baseUrl - API base URL
   * @param {string} path - API endpoint path
   * @param {Object} response - Response object or error to return
   * @param {number} statusCode - HTTP status code
   * @param {Object} options - Additional options
   * @returns {Object} Nock interceptor
   */
  static mockHttpResponse(baseUrl, path, response, statusCode = 200, options = {}) {
    const scope = nock(baseUrl);
    
    if (statusCode >= 200 && statusCode < 300) {
      // Success response
      return scope
        .get(path)
        .reply(statusCode, response, options.headers || {});
    } else {
      // Error response
      return scope
        .get(path)
        .replyWithError(response);
    }
  }

  /**
   * Verify that the API's fallback mechanism is working properly
   * @param {Function} apiFunction - Function that calls the API and has fallback
   * @param {Function} failureSetup - Function to set up the failure scenario
   * @param {Function} validator - Function to validate the fallback worked
   * @returns {Promise<boolean>} True if fallback works as expected
   */
  static async verifyFallbackBehavior(apiFunction, failureSetup, validator) {
    // Setup failure condition
    await failureSetup();
    
    // Call the API function that should trigger fallback
    const result = await apiFunction();
    
    // Validate the fallback worked as expected
    return validator(result);
  }
}

module.exports = ApiTestUtils; 