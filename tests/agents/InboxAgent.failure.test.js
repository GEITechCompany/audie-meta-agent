const InboxAgent = require('../../src/agents/InboxAgent');
const Task = require('../../src/models/Task');
const logger = require('../../src/utils/logger');
const { google } = require('googleapis');
const ApiTestUtils = require('../utils/api-test-utils');

// Mock modules
jest.mock('../../src/models/Task');
jest.mock('../../src/utils/logger');
jest.mock('googleapis');

describe('InboxAgent Error Handling & Fallbacks', () => {
  let inboxAgent;
  let mockGmail;
  let originalEnv;

  beforeEach(() => {
    // Save original environment and reset mocks
    originalEnv = { ...process.env };
    jest.clearAllMocks();

    // Mock Gmail API
    mockGmail = {
      users: {
        messages: {
          list: jest.fn(),
          get: jest.fn()
        }
      }
    };

    // Setup Google API mock
    google.auth = {
      OAuth2: jest.fn().mockImplementation(() => ({
        setCredentials: jest.fn()
      }))
    };
    google.gmail = jest.fn().mockReturnValue(mockGmail);

    // Create InboxAgent instance
    inboxAgent = new InboxAgent();
    
    // Mock Task implementation
    Task.mockImplementation((data) => ({
      ...data,
      save: jest.fn().mockResolvedValue({ id: 'mock-task-id', ...data })
    }));
  });

  afterEach(() => {
    // Restore environment variables
    process.env = originalEnv;
  });

  describe('API Failure Handling', () => {
    // Helper to set up valid Gmail credentials
    const setupValidCredentials = () => {
      process.env.GMAIL_CLIENT_ID = 'test-client-id';
      process.env.GMAIL_CLIENT_SECRET = 'test-client-secret';
      process.env.GMAIL_REDIRECT_URI = 'http://localhost:3000/auth/callback';
      process.env.GMAIL_REFRESH_TOKEN = 'test-refresh-token';
    };

    test('should handle authentication failures by falling back to mock emails', async () => {
      // Setup credentials but make auth fail
      setupValidCredentials();
      
      // Use utility to simulate auth failure
      ApiTestUtils.simulateGmailAuthFailure(google, 'Invalid credentials');
      
      // Test the fallback behavior
      const result = await ApiTestUtils.verifyFallbackBehavior(
        // API function that should have fallback
        () => inboxAgent.checkEmails({ count: 2 }),
        
        // No additional setup needed, auth failure already configured
        async () => {},
        
        // Validator to confirm fallback worked correctly
        (response) => {
          return (
            response.is_mock === true && 
            response.emails.length > 0 &&
            logger.error.mock.calls.some(call => 
              call[0].includes('Error initializing Gmail API')
            )
          );
        }
      );
      
      expect(result).toBe(true);
    });
    
    test('should handle API server errors (500) by falling back to mock emails', async () => {
      // Setup valid credentials
      setupValidCredentials();
      
      // Test the fallback behavior
      const result = await ApiTestUtils.verifyFallbackBehavior(
        // API function
        () => inboxAgent.checkEmails({ count: 2 }),
        
        // Setup server error
        async () => {
          await inboxAgent.initialize();
          ApiTestUtils.simulateGmailRequestFailure(
            mockGmail, 
            'list', 
            500, 
            'Internal server error'
          );
        },
        
        // Validator
        (response) => {
          return (
            response.is_mock === true && 
            response.emails.length > 0 &&
            logger.error.mock.calls.some(call => 
              call[0].includes('Error checking emails')
            )
          );
        }
      );
      
      expect(result).toBe(true);
    });
    
    test('should handle rate limit errors (429) by falling back to mock emails', async () => {
      // Setup valid credentials
      setupValidCredentials();
      
      // Test the fallback behavior
      const result = await ApiTestUtils.verifyFallbackBehavior(
        // API function
        () => inboxAgent.checkEmails({ count: 2 }),
        
        // Setup rate limit error
        async () => {
          await inboxAgent.initialize();
          ApiTestUtils.simulateRateLimitExceeded(mockGmail, 'list');
        },
        
        // Validator
        (response) => {
          return (
            response.is_mock === true && 
            response.emails.length > 0 &&
            logger.error.mock.calls.some(call => 
              call[0].includes('Error checking emails') &&
              call[0].includes('Rate limit exceeded')
            )
          );
        }
      );
      
      expect(result).toBe(true);
    });
    
    test('should handle network failures by falling back to mock emails', async () => {
      // Setup valid credentials
      setupValidCredentials();
      
      // Test the fallback behavior
      const result = await ApiTestUtils.verifyFallbackBehavior(
        // API function
        () => inboxAgent.checkEmails({ count: 2 }),
        
        // Setup network failure
        async () => {
          await inboxAgent.initialize();
          ApiTestUtils.simulateNetworkFailure(mockGmail, 'list');
        },
        
        // Validator
        (response) => {
          return (
            response.is_mock === true && 
            response.emails.length > 0 &&
            logger.error.mock.calls.some(call => 
              call[0].includes('Error checking emails') &&
              call[0].includes('Network error')
            )
          );
        }
      );
      
      expect(result).toBe(true);
    });
    
    test('should handle timeout errors by falling back to mock emails', async () => {
      // Setup valid credentials
      setupValidCredentials();
      
      // Test the fallback behavior
      const result = await ApiTestUtils.verifyFallbackBehavior(
        // API function
        () => inboxAgent.checkEmails({ count: 2 }),
        
        // Setup timeout error
        async () => {
          await inboxAgent.initialize();
          ApiTestUtils.simulateTimeoutError(mockGmail, 'list');
        },
        
        // Validator
        (response) => {
          return (
            response.is_mock === true && 
            response.emails.length > 0 &&
            logger.error.mock.calls.some(call => 
              call[0].includes('Error checking emails') &&
              call[0].includes('Timeout error')
            )
          );
        }
      );
      
      expect(result).toBe(true);
    });
  });

  describe('Response Format Consistency', () => {
    // Helper to set up valid Gmail credentials
    const setupValidCredentials = () => {
      process.env.GMAIL_CLIENT_ID = 'test-client-id';
      process.env.GMAIL_CLIENT_SECRET = 'test-client-secret';
      process.env.GMAIL_REDIRECT_URI = 'http://localhost:3000/auth/callback';
      process.env.GMAIL_REFRESH_TOKEN = 'test-refresh-token';
    };
    
    // Helper to mock successful Gmail API response
    const mockSuccessfulGmailResponse = () => {
      // Mock Gmail API responses
      mockGmail.users.messages.list.mockResolvedValue({
        data: {
          messages: [{ id: 'email-1' }, { id: 'email-2' }],
          resultSizeEstimate: 2
        }
      });

      mockGmail.users.messages.get.mockImplementation((params) => {
        return Promise.resolve({
          data: {
            id: params.id,
            threadId: `thread-${params.id}`,
            labelIds: ['INBOX', 'UNREAD'],
            snippet: 'This is a test email snippet',
            payload: {
              headers: [
                { name: 'Subject', value: 'Test Email Subject' },
                { name: 'From', value: 'test@example.com' },
                { name: 'To', value: 'me@example.com' },
                { name: 'Date', value: new Date().toISOString() }
              ],
              parts: [
                {
                  mimeType: 'text/plain',
                  body: {
                    data: Buffer.from('This is a test email body with a task request.').toString('base64')
                  }
                }
              ]
            }
          }
        });
      });
    };

    test('real API and mock data responses should have consistent formats', async () => {
      // Setup valid credentials
      setupValidCredentials();
      
      // Setup successful API response
      mockSuccessfulGmailResponse();
      await inboxAgent.initialize();
      
      // Get real API response
      const realResponse = await inboxAgent.checkEmails({ count: 2 });
      
      // Reset agent and get mock response
      inboxAgent.gmail = null;
      const mockResponse = await inboxAgent.getMockEmails({ count: 2 });
      
      // Validate formats match
      const validation = ApiTestUtils.validateResponseFormat(realResponse, mockResponse);
      
      // Output detailed validation results if there are mismatches
      if (!validation.isValid) {
        console.log('Format validation failed with the following mismatches:');
        validation.mismatches.forEach(mismatch => {
          console.log(`- Path: ${mismatch.path}`);
          if (mismatch.issue === 'type_mismatch') {
            console.log(`  Type mismatch: real=${mismatch.realType}, mock=${mismatch.mockType}`);
          } else if (mismatch.issue === 'missing_property') {
            console.log(`  Missing property: ${mismatch.details}`);
          } else {
            console.log(`  Real value: ${JSON.stringify(mismatch.realValue)}`);
            console.log(`  Mock value: ${JSON.stringify(mismatch.mockValue)}`);
          }
        });
      }
      
      expect(validation.isValid).toBe(true);
      
      // Verify essential properties exist in both responses
      const requiredProperties = ['message', 'emails', 'count'];
      requiredProperties.forEach(prop => {
        expect(realResponse).toHaveProperty(prop);
        expect(mockResponse).toHaveProperty(prop);
      });
      
      // Verify email objects have the same structure
      if (realResponse.emails.length > 0 && mockResponse.emails.length > 0) {
        const realEmail = realResponse.emails[0];
        const mockEmail = mockResponse.emails[0];
        
        const emailProperties = ['id', 'subject', 'from', 'to', 'snippet', 'body'];
        emailProperties.forEach(prop => {
          expect(realEmail).toHaveProperty(prop);
          expect(mockEmail).toHaveProperty(prop);
        });
      }
    });
  });

  describe('Comprehensive Error Path Testing', () => {
    test('should handle all error paths without crashing', async () => {
      // Define error scenarios to test
      const errorScenarios = [
        {
          name: 'missing_credentials',
          setup: () => {
            process.env.GMAIL_CLIENT_ID = undefined;
            process.env.GMAIL_CLIENT_SECRET = undefined;
          },
          expectsError: false
        },
        {
          name: 'auth_failure',
          setup: () => {
            process.env.GMAIL_CLIENT_ID = 'test-client-id';
            process.env.GMAIL_CLIENT_SECRET = 'test-client-secret';
            process.env.GMAIL_REDIRECT_URI = 'http://localhost:3000/auth/callback';
            process.env.GMAIL_REFRESH_TOKEN = 'test-refresh-token';
            
            ApiTestUtils.simulateGmailAuthFailure(google);
          },
          expectsError: false
        },
        {
          name: 'server_error',
          setup: async () => {
            process.env.GMAIL_CLIENT_ID = 'test-client-id';
            process.env.GMAIL_CLIENT_SECRET = 'test-client-secret';
            process.env.GMAIL_REDIRECT_URI = 'http://localhost:3000/auth/callback';
            process.env.GMAIL_REFRESH_TOKEN = 'test-refresh-token';
            
            await inboxAgent.initialize();
            ApiTestUtils.simulateGmailRequestFailure(mockGmail, 'list', 500);
          },
          expectsError: false
        },
        {
          name: 'rate_limit',
          setup: async () => {
            process.env.GMAIL_CLIENT_ID = 'test-client-id';
            process.env.GMAIL_CLIENT_SECRET = 'test-client-secret';
            process.env.GMAIL_REDIRECT_URI = 'http://localhost:3000/auth/callback';
            process.env.GMAIL_REFRESH_TOKEN = 'test-refresh-token';
            
            await inboxAgent.initialize();
            ApiTestUtils.simulateRateLimitExceeded(mockGmail, 'list');
          },
          expectsError: false
        },
        {
          name: 'network_error',
          setup: async () => {
            process.env.GMAIL_CLIENT_ID = 'test-client-id';
            process.env.GMAIL_CLIENT_SECRET = 'test-client-secret';
            process.env.GMAIL_REDIRECT_URI = 'http://localhost:3000/auth/callback';
            process.env.GMAIL_REFRESH_TOKEN = 'test-refresh-token';
            
            await inboxAgent.initialize();
            ApiTestUtils.simulateNetworkFailure(mockGmail, 'list');
          },
          expectsError: false
        },
        {
          name: 'timeout_error',
          setup: async () => {
            process.env.GMAIL_CLIENT_ID = 'test-client-id';
            process.env.GMAIL_CLIENT_SECRET = 'test-client-secret';
            process.env.GMAIL_REDIRECT_URI = 'http://localhost:3000/auth/callback';
            process.env.GMAIL_REFRESH_TOKEN = 'test-refresh-token';
            
            await inboxAgent.initialize();
            ApiTestUtils.simulateTimeoutError(mockGmail, 'list');
          },
          expectsError: false
        },
        {
          name: 'task_creation_failure',
          setup: async () => {
            process.env.GMAIL_CLIENT_ID = 'test-client-id';
            process.env.GMAIL_CLIENT_SECRET = 'test-client-secret';
            process.env.GMAIL_REDIRECT_URI = 'http://localhost:3000/auth/callback';
            process.env.GMAIL_REFRESH_TOKEN = 'test-refresh-token';
            
            // Make task creation fail
            Task.mockImplementation(() => ({
              save: jest.fn().mockRejectedValue(new Error('Database error'))
            }));
          },
          expectsError: false
        }
      ];
      
      // Test function that will execute for each scenario
      const testFunction = async (scenario) => {
        // Apply the scenario setup
        await scenario.setup();
        
        // Test the checkEmails method which should have robust error handling
        const result = await inboxAgent.checkEmails({ count: 2 });
        
        // If we get here without exceptions, the error handling worked
        return result;
      };
      
      // Run all error scenarios
      const results = await ApiTestUtils.testErrorHandling(testFunction, errorScenarios);
      
      // Verify all scenarios executed without crashing
      results.forEach(result => {
        expect(result.crashed).toBe(false);
        expect(result.success).toBe(true);
      });
      
      // Verify all results include a fallback to mock data
      results.forEach(result => {
        expect(result.result.is_mock).toBe(true);
        expect(result.result.emails.length).toBeGreaterThan(0);
      });
    });
  });
}); 