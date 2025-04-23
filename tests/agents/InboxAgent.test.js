const InboxAgent = require('../../src/agents/InboxAgent');
const Task = require('../../src/models/Task');
const logger = require('../../src/utils/logger');
const { google } = require('googleapis');

// Mock modules
jest.mock('../../src/models/Task');
jest.mock('../../src/utils/logger');
jest.mock('googleapis');

describe('InboxAgent', () => {
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

  test('should initialize properly', () => {
    expect(inboxAgent).toBeDefined();
    expect(inboxAgent.name).toBe('InboxAgent');
    expect(inboxAgent.gmail).toBeNull();
    expect(logger.info).toHaveBeenCalledWith('InboxAgent initialized');
  });

  describe('initialize method', () => {
    test('should initialize Gmail API with valid credentials', async () => {
      // Setup environment variables
      process.env.GMAIL_CLIENT_ID = 'test-client-id';
      process.env.GMAIL_CLIENT_SECRET = 'test-client-secret';
      process.env.GMAIL_REDIRECT_URI = 'http://localhost:3000/auth/callback';
      process.env.GMAIL_REFRESH_TOKEN = 'test-refresh-token';

      const result = await inboxAgent.initialize();

      expect(result).toBe(true);
      expect(inboxAgent.gmail).not.toBeNull();
      expect(google.auth.OAuth2).toHaveBeenCalledWith(
        'test-client-id',
        'test-client-secret',
        'http://localhost:3000/auth/callback'
      );
      expect(logger.info).toHaveBeenCalledWith('Gmail API initialized');
    });

    test('should fail to initialize when credentials are missing', async () => {
      // Missing credentials
      process.env.GMAIL_CLIENT_ID = undefined;
      process.env.GMAIL_CLIENT_SECRET = undefined;
      process.env.GMAIL_REDIRECT_URI = undefined;

      const result = await inboxAgent.initialize();

      expect(result).toBe(false);
      expect(inboxAgent.gmail).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith('Missing Gmail API credentials in environment variables');
    });

    test('should fail to initialize when refresh token is missing', async () => {
      // Setup partial credentials without refresh token
      process.env.GMAIL_CLIENT_ID = 'test-client-id';
      process.env.GMAIL_CLIENT_SECRET = 'test-client-secret';
      process.env.GMAIL_REDIRECT_URI = 'http://localhost:3000/auth/callback';
      process.env.GMAIL_REFRESH_TOKEN = undefined;

      const result = await inboxAgent.initialize();

      expect(result).toBe(false);
      expect(inboxAgent.gmail).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith('No Gmail credentials found, using mock email data');
    });

    test('should handle initialization errors', async () => {
      // Setup credentials
      process.env.GMAIL_CLIENT_ID = 'test-client-id';
      process.env.GMAIL_CLIENT_SECRET = 'test-client-secret';
      process.env.GMAIL_REDIRECT_URI = 'http://localhost:3000/auth/callback';
      process.env.GMAIL_REFRESH_TOKEN = 'test-refresh-token';

      // Force an error during initialization
      google.auth.OAuth2.mockImplementation(() => {
        throw new Error('API initialization error');
      });

      const result = await inboxAgent.initialize();

      expect(result).toBe(false);
      expect(inboxAgent.gmail).toBeNull();
      expect(logger.error).toHaveBeenCalledWith('Error initializing Gmail API: API initialization error');
    });
  });

  describe('checkEmails method', () => {
    test('should fetch emails from Gmail API', async () => {
      // Setup environment and mock responses
      process.env.GMAIL_CLIENT_ID = 'test-client-id';
      process.env.GMAIL_CLIENT_SECRET = 'test-client-secret';
      process.env.GMAIL_REDIRECT_URI = 'http://localhost:3000/auth/callback';
      process.env.GMAIL_REFRESH_TOKEN = 'test-refresh-token';

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

      // Pre-initialize gmail property
      await inboxAgent.initialize();
      
      // Call the method
      const result = await inboxAgent.checkEmails({ count: 2 });

      // Verify API calls
      expect(mockGmail.users.messages.list).toHaveBeenCalledWith({
        userId: 'me',
        q: 'is:unread',
        maxResults: 2
      });
      
      expect(mockGmail.users.messages.get).toHaveBeenCalledTimes(2);
      expect(result.emails.length).toBe(2);
      expect(result.is_mock).toBeUndefined(); // Should not be mock data
    });

    test('should fall back to mock emails when Gmail API is unavailable', async () => {
      // Ensure initialize fails
      process.env.GMAIL_CLIENT_ID = undefined;
      process.env.GMAIL_CLIENT_SECRET = undefined;
      process.env.GMAIL_REDIRECT_URI = undefined;

      const result = await inboxAgent.checkEmails({ count: 2 });

      // Should use mock data
      expect(result.is_mock).toBe(true);
      expect(result.emails.length).toBeLessThanOrEqual(2);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Using mock email data'));
    });

    test('should fall back to mock emails when Gmail API throws an error', async () => {
      // Setup credentials
      process.env.GMAIL_CLIENT_ID = 'test-client-id';
      process.env.GMAIL_CLIENT_SECRET = 'test-client-secret';
      process.env.GMAIL_REDIRECT_URI = 'http://localhost:3000/auth/callback';
      process.env.GMAIL_REFRESH_TOKEN = 'test-refresh-token';

      // Initialize successfully but make API call fail
      await inboxAgent.initialize();
      
      // Make the API call fail
      mockGmail.users.messages.list.mockRejectedValue(new Error('API error'));

      const result = await inboxAgent.checkEmails({ count: 2 });

      // Should fall back to mock data
      expect(result.is_mock).toBe(true);
      expect(logger.error).toHaveBeenCalledWith('Error checking emails: API error');
    });
  });

  describe('processEmailsForTasks method', () => {
    test('should extract tasks from emails containing task keywords', async () => {
      // Setup test emails
      const testEmails = [
        {
          id: 'email-1',
          subject: 'Request for help with project',
          from: 'client@example.com',
          body: 'I need your help with the current project, this is urgent.',
          snippet: 'I need your help with the current project'
        },
        {
          id: 'email-2',
          subject: 'Normal update email',
          from: 'team@example.com',
          body: 'Just checking in with the latest updates.',
          snippet: 'Just checking in with the latest updates'
        },
        {
          id: 'email-3',
          subject: 'Please complete this task',
          from: 'manager@example.com',
          body: 'Please finish the documentation by Friday.',
          snippet: 'Please finish the documentation by Friday'
        }
      ];

      const tasks = await inboxAgent.processEmailsForTasks(testEmails);

      // Should create tasks from emails 1 and 3 (which contain task keywords)
      expect(tasks.length).toBe(2);
      expect(Task).toHaveBeenCalledTimes(2);
      
      // Check task data
      expect(Task.mock.calls[0][0]).toEqual({
        title: 'Email: Request for help with project',
        description: expect.stringContaining('client@example.com'),
        status: 'pending',
        priority: 'medium',
        source: 'email'
      });
    });

    test('should handle errors during task creation', async () => {
      // Setup test email
      const testEmails = [
        {
          id: 'email-1',
          subject: 'Request for help',
          from: 'client@example.com',
          body: 'I need your help with this task',
          snippet: 'I need your help with this task'
        }
      ];

      // Make task creation fail
      Task.mockImplementation(() => ({
        save: jest.fn().mockRejectedValue(new Error('Database error'))
      }));

      const tasks = await inboxAgent.processEmailsForTasks(testEmails);

      // Should attempt to create task but fail
      expect(tasks.length).toBe(0);
      expect(Task).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error creating task from email'));
    });
  });

  describe('isEmailTaskRequest method', () => {
    test('should identify emails containing task-related keywords', () => {
      const taskEmail = {
        subject: 'Action needed',
        body: 'Please help with this request'
      };

      const regularEmail = {
        subject: 'Meeting notes',
        body: 'These are the notes from our meeting'
      };

      expect(inboxAgent.isEmailTaskRequest(taskEmail)).toBe(true);
      expect(inboxAgent.isEmailTaskRequest(regularEmail)).toBe(false);
    });
  });

  describe('getUnreadCount method', () => {
    test('should return unread count from Gmail API', async () => {
      // Setup environment
      process.env.GMAIL_CLIENT_ID = 'test-client-id';
      process.env.GMAIL_CLIENT_SECRET = 'test-client-secret';
      process.env.GMAIL_REDIRECT_URI = 'http://localhost:3000/auth/callback';
      process.env.GMAIL_REFRESH_TOKEN = 'test-refresh-token';

      // Initialize API
      await inboxAgent.initialize();
      
      // Mock API response
      mockGmail.users.messages.list.mockResolvedValue({
        data: {
          resultSizeEstimate: 5
        }
      });

      const count = await inboxAgent.getUnreadCount();

      expect(count).toBe(5);
      expect(mockGmail.users.messages.list).toHaveBeenCalledWith({
        userId: 'me',
        q: 'is:unread',
        maxResults: 1
      });
    });

    test('should return mock count when Gmail API is unavailable', async () => {
      // Ensure initialize fails
      process.env.GMAIL_CLIENT_ID = undefined;
      
      const count = await inboxAgent.getUnreadCount();

      // Should use mock count
      expect(count).toBe(3); // The mock count from the implementation
    });

    test('should return mock count when Gmail API throws an error', async () => {
      // Setup environment
      process.env.GMAIL_CLIENT_ID = 'test-client-id';
      process.env.GMAIL_CLIENT_SECRET = 'test-client-secret';
      process.env.GMAIL_REDIRECT_URI = 'http://localhost:3000/auth/callback';
      process.env.GMAIL_REFRESH_TOKEN = 'test-refresh-token';

      // Initialize API
      await inboxAgent.initialize();
      
      // Make the API call fail
      mockGmail.users.messages.list.mockRejectedValue(new Error('API error'));

      const count = await inboxAgent.getUnreadCount();

      // Should use mock count
      expect(count).toBe(3);
      expect(logger.error).toHaveBeenCalledWith('Error getting unread count: API error');
    });
  });

  describe('getMockEmails method', () => {
    test('should return mock email data with the requested count', () => {
      const result = inboxAgent.getMockEmails({ count: 2 });

      expect(result.emails.length).toBe(2);
      expect(result.is_mock).toBe(true);
      expect(logger.info).toHaveBeenCalledWith('Using mock email data with count 2');
    });

    test('should include task extraction from mock emails', () => {
      // Call with a specific count
      const result = inboxAgent.getMockEmails({ count: 3 });

      // Check email contents
      expect(result.emails.length).toBe(3);
      
      // Verify some mock emails are converted to tasks based on content
      expect(result.tasks.length).toBeGreaterThan(0);
      
      // Check task data structure
      result.tasks.forEach(task => {
        expect(task).toHaveProperty('id');
        expect(task).toHaveProperty('title');
        expect(task).toHaveProperty('description');
        expect(task).toHaveProperty('status', 'pending');
        expect(task).toHaveProperty('priority', 'medium');
        expect(task).toHaveProperty('source', 'email');
      });
    });
  });
}); 