# API Test Utilities

This directory contains utility classes for testing API integrations, with particular focus on error handling, fallback mechanisms, and response format validation.

## `api-test-utils.js`

Provides helper functions for comprehensive API testing across the application.

### Key Features

1. **API Failure Simulation**
   - Simulate various API failures including authentication, server errors, rate limiting, network issues, and timeouts
   - Works with both synchronous and asynchronous API calls
   - Configurable error types and messages

2. **Response Format Validation**
   - Compare response formats between real API and mock data
   - Detailed mismatch reporting for debugging
   - Type and structure validation

3. **Error Path Testing**
   - Comprehensively test all error paths without system crashes
   - Run multiple error scenarios in sequence
   - Validate fallback behavior works as expected

4. **HTTP Request Mocking**
   - Mock external HTTP requests using nock
   - Simulate different response codes and error types
   - Test code behavior with controlled API responses

### Usage Examples

#### Simulating API Failures

```javascript
// Authentication failures
ApiTestUtils.simulateGmailAuthFailure(mockGoogle, 'Invalid credentials');

// Server errors (e.g., 500 Internal Server Error)
ApiTestUtils.simulateGmailRequestFailure(mockGmail, 'list', 500, 'Internal server error');

// Rate limiting (429 Too Many Requests)
ApiTestUtils.simulateRateLimitExceeded(mockGmail, 'list');

// Network failures
ApiTestUtils.simulateNetworkFailure(mockGmail, 'list');

// Timeout errors
ApiTestUtils.simulateTimeoutError(mockGmail, 'list');
```

#### Validating Response Format Consistency

```javascript
// Get responses from both real API and mock data
const realResponse = await apiFunction();
const mockResponse = await mockFunction();

// Validate the formats match
const validation = ApiTestUtils.validateResponseFormat(realResponse, mockResponse);

if (!validation.isValid) {
  console.log('Format mismatches found:', validation.mismatches);
}
```

#### Testing Error Handling

```javascript
// Define your error scenarios
const errorScenarios = [
  {
    name: 'auth_failure',
    setup: () => {
      ApiTestUtils.simulateGmailAuthFailure(google);
    },
    expectsError: false  // We expect the function to handle this error
  },
  // Add more scenarios...
];

// Test function that should handle all these errors
const testFunction = async (scenario) => {
  await scenario.setup();
  return await apiObject.methodWithErrorHandling();
};

// Run all scenarios and get results
const results = await ApiTestUtils.testErrorHandling(testFunction, errorScenarios);

// Check results
results.forEach(result => {
  expect(result.crashed).toBe(false);  // No scenario should crash
});
```

#### Verifying Fallback Behavior

```javascript
// Test the fallback behavior
const result = await ApiTestUtils.verifyFallbackBehavior(
  // API function that should have fallback
  () => apiObject.methodWithFallback(),
  
  // Setup the failure condition
  async () => {
    ApiTestUtils.simulateNetworkFailure(mockApi);
  },
  
  // Validator to confirm fallback worked correctly
  (response) => {
    return response.is_fallback === true && response.data !== null;
  }
);

expect(result).toBe(true);  // Fallback behavior worked correctly
```

### Best Practices

1. **Setup and Teardown**: Always clean up after tests, especially when modifying global objects.
2. **Isolate Tests**: Each test should be independent and not rely on the state from previous tests.
3. **Test Actual Behavior**: Focus on testing that fallbacks actually work, not just that errors are caught.
4. **Mock External Services**: Always mock external API calls to avoid hitting real services during tests.
5. **Verify Format Consistency**: Regular responses and fallback responses should maintain format consistency.
6. **Error Scenario Coverage**: Try to cover all possible error scenarios that might occur in production.

### See Also

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Nock HTTP Mocking Library](https://github.com/nock/nock)
- [API Fallback Patterns](https://github.com/GEITechCompany/audie-meta-agent/blob/main/docs/api-fallback-patterns.md) 