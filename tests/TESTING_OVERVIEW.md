# Testing Overview

This document provides an overview of the testing approach and infrastructure for the Audie Meta-Agent project.

## Test Infrastructure

The Audie Meta-Agent project uses Jest as its primary testing framework, with additional utilities for API testing, mocking, and reporting:

- **Jest**: Core testing framework
- **jest-html-reporter**: HTML report generation for better visualization
- **nock**: HTTP request mocking for external API calls
- **Custom API test utilities**: Specialized tools for testing API fallbacks and error handling

## Directory Structure

```
tests/
├── agents/                  # Tests for agent components
│   ├── InboxAgent.test.js   # Core functionality tests
│   ├── InboxAgent.failure.test.js  # API failure and fallback tests
│   └── SchedulerAgent.test.js     # Scheduler agent tests
│
├── utils/                   # Test utilities
│   ├── api-test-utils.js    # API testing utilities
│   └── README.md            # Documentation for test utilities
│
└── TESTING_OVERVIEW.md      # This file
```

## Running Tests

The following npm scripts are available for running tests:

```bash
# Run all tests
npm test

# Run specific agent tests
npm run test:inbox
npm run test:scheduler

# Run API failure tests
npm run test:failures

# Run tests with specific pattern
npm run test:api

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## Coverage Report

HTML coverage reports are generated in the `coverage/` directory. Current coverage stats:

- **InboxAgent.js**: 96.8% line coverage
- **API test utilities**: 71.21% line coverage

## Key Test Features

### 1. Basic Functionality Testing

Standard unit and integration tests verify:
- Core agent functionality
- Task extraction and creation
- API interactions

### 2. API Error Handling & Fallbacks

Specialized tests verify:
- Authentication failures trigger appropriate fallbacks
- Network errors are handled gracefully
- Server errors (500) result in fallback to mock data
- Rate limit errors (429) are properly handled
- Timeouts don't crash the system

### 3. Response Format Validation

Tests ensure:
- Real API responses and mock data have consistent formats
- All required fields are present in both real and mock responses
- Data types match between real and mock responses

### 4. Comprehensive Error Path Testing

A systematic approach tests:
- All possible error paths without crashing
- Multiple error scenarios in sequence
- Validation that fallback mechanisms work correctly in each case

## Best Practices

1. **Use Mocks**: Never call real external APIs in tests
2. **Validate Fallbacks**: Ensure fallback mechanisms work as expected
3. **Check Format Consistency**: Ensure mock data has the same structure as real data
4. **Clean Environment**: Always reset the environment between tests
5. **Complete Coverage**: Test all error paths, not just happy paths
6. **Detailed Reports**: Use HTML reports to visualize test results

## Future Improvements

1. **Increase Coverage**: Improve test coverage for SchedulerAgent and other components
2. **Integration Tests**: Add more integration tests between components
3. **End-to-End Tests**: Add browser-based E2E tests for UI flows
4. **Performance Testing**: Add performance tests for critical paths
5. **Continuous Integration**: Set up CI/CD pipeline with automated testing 