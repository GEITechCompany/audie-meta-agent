const { describe, it, beforeEach, afterEach } = require('jest');
const SchedulerAgent = require('../../src/agents/SchedulerAgent');
const logger = require('../../src/utils/logger');
const nock = require('nock');

// Spy on logger
jest.spyOn(logger, 'info');
jest.spyOn(logger, 'warn');
jest.spyOn(logger, 'error');

describe('SchedulerAgent', () => {
  let schedulerAgent;
  let originalEnv;

  // Save original environment variables before tests
  beforeEach(() => {
    originalEnv = { ...process.env };
    schedulerAgent = new SchedulerAgent();
  });

  // Restore original environment variables after tests
  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
    nock.cleanAll();
  });

  describe('initialize()', () => {
    it('should initialize successfully with valid credentials', async () => {
      // Set mock environment variables
      process.env.GCAL_CLIENT_ID = 'valid-client-id';
      process.env.GCAL_CLIENT_SECRET = 'valid-client-secret';
      process.env.GCAL_REDIRECT_URI = 'http://localhost:3000/auth/calendar/callback';
      process.env.GCAL_REFRESH_TOKEN = 'valid-refresh-token';

      // Mock the Google OAuth2 token refresh
      nock('https://oauth2.googleapis.com')
        .post('/token')
        .reply(200, { access_token: 'mock-access-token', expires_in: 3600 });

      const result = await schedulerAgent.initialize();

      expect(result).toBe(true);
      expect(schedulerAgent.calendar).not.toBeNull();
      expect(logger.info).toHaveBeenCalledWith('Google Calendar API initialized');
    });

    it('should fall back to mock data when credentials are missing', async () => {
      // Clear environment variables
      delete process.env.GCAL_CLIENT_ID;
      delete process.env.GCAL_CLIENT_SECRET;
      delete process.env.GCAL_REDIRECT_URI;
      delete process.env.GCAL_REFRESH_TOKEN;

      const result = await schedulerAgent.initialize();

      expect(result).toBe(false);
      expect(schedulerAgent.calendar).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith('Missing Google Calendar API credentials in environment variables');
    });

    it('should handle API errors gracefully', async () => {
      // Set mock environment variables
      process.env.GCAL_CLIENT_ID = 'valid-client-id';
      process.env.GCAL_CLIENT_SECRET = 'valid-client-secret';
      process.env.GCAL_REDIRECT_URI = 'http://localhost:3000/auth/calendar/callback';
      process.env.GCAL_REFRESH_TOKEN = 'valid-refresh-token';

      // Mock API error
      nock('https://oauth2.googleapis.com')
        .post('/token')
        .replyWithError('API error');

      const result = await schedulerAgent.initialize();

      expect(result).toBe(false);
      expect(schedulerAgent.calendar).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error initializing Google Calendar API'));
    });
  });

  describe('getSchedule()', () => {
    it('should fetch schedule from API when credentials are valid', async () => {
      // Mock successful initialization
      jest.spyOn(schedulerAgent, 'initialize').mockResolvedValue(true);
      schedulerAgent.calendar = {
        events: {
          list: jest.fn().mockResolvedValue({
            data: {
              items: [
                {
                  id: 'event1',
                  summary: 'Test Event',
                  description: 'Test Description',
                  start: { dateTime: '2023-05-01T10:00:00Z' },
                  end: { dateTime: '2023-05-01T11:00:00Z' },
                  location: 'Test Location'
                }
              ]
            }
          })
        }
      };

      const result = await schedulerAgent.getSchedule({ type: 'day', value: 'today' });

      expect(result.events.length).toBe(1);
      expect(result.events[0].title).toBe('Test Event');
      expect(result.is_mock).toBeUndefined();
    });

    it('should fall back to mock data when credentials are missing', async () => {
      // Mock failed initialization
      jest.spyOn(schedulerAgent, 'initialize').mockResolvedValue(false);
      jest.spyOn(schedulerAgent, 'getMockSchedule').mockImplementation((params) => ({
        message: 'Mock schedule',
        events: [{ id: 'mock-1', title: 'Mock Event' }],
        timeframe: params,
        is_mock: true
      }));

      const result = await schedulerAgent.getSchedule({ type: 'day', value: 'today' });

      expect(result.events.length).toBe(1);
      expect(result.events[0].title).toBe('Mock Event');
      expect(result.is_mock).toBe(true);
    });

    it('should handle API errors gracefully', async () => {
      // Mock successful initialization but API error
      jest.spyOn(schedulerAgent, 'initialize').mockResolvedValue(true);
      schedulerAgent.calendar = {
        events: {
          list: jest.fn().mockRejectedValue(new Error('API error'))
        }
      };
      
      jest.spyOn(schedulerAgent, 'getMockSchedule').mockImplementation((params) => ({
        message: 'Mock schedule',
        events: [{ id: 'mock-1', title: 'Mock Event' }],
        timeframe: params,
        is_mock: true
      }));

      const result = await schedulerAgent.getSchedule({ type: 'day', value: 'today' });

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error fetching schedule'));
      expect(result.events.length).toBe(1);
      expect(result.events[0].title).toBe('Mock Event');
      expect(result.is_mock).toBe(true);
    });

    it('should handle rate limiting by falling back to mock data', async () => {
      // Mock successful initialization but rate limit error
      jest.spyOn(schedulerAgent, 'initialize').mockResolvedValue(true);
      schedulerAgent.calendar = {
        events: {
          list: jest.fn().mockRejectedValue({
            code: 429,
            errors: [{ message: 'Rate limit exceeded' }]
          })
        }
      };
      
      jest.spyOn(schedulerAgent, 'getMockSchedule').mockImplementation((params) => ({
        message: 'Mock schedule',
        events: [{ id: 'mock-1', title: 'Mock Event' }],
        timeframe: params,
        is_mock: true
      }));

      const result = await schedulerAgent.getSchedule({ type: 'day', value: 'today' });

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error fetching schedule'));
      expect(result.events.length).toBe(1);
      expect(result.events[0].title).toBe('Mock Event');
      expect(result.is_mock).toBe(true);
    });
  });

  describe('data format consistency', () => {
    it('should return consistent data format between real API and mock data', async () => {
      // First get mock data
      jest.spyOn(schedulerAgent, 'initialize').mockResolvedValue(false);
      const mockResult = await schedulerAgent.getSchedule({ type: 'day', value: 'today' });
      
      // Then get "real" API data
      jest.clearAllMocks();
      jest.spyOn(schedulerAgent, 'initialize').mockResolvedValue(true);
      schedulerAgent.calendar = {
        events: {
          list: jest.fn().mockResolvedValue({
            data: {
              items: [
                {
                  id: 'event1',
                  summary: 'Test Event',
                  description: 'Test Description',
                  start: { dateTime: '2023-05-01T10:00:00Z' },
                  end: { dateTime: '2023-05-01T11:00:00Z' },
                  location: 'Test Location'
                }
              ]
            }
          })
        }
      };
      
      const apiResult = await schedulerAgent.getSchedule({ type: 'day', value: 'today' });
      
      // Verify structure consistency (not specific values)
      expect(Object.keys(mockResult)).toEqual(expect.arrayContaining(['message', 'events', 'timeframe']));
      expect(Object.keys(apiResult)).toEqual(expect.arrayContaining(['message', 'events', 'timeframe']));
      
      // Event structure should be consistent
      if (mockResult.events.length > 0 && apiResult.events.length > 0) {
        const mockEventKeys = Object.keys(mockResult.events[0]);
        const apiEventKeys = Object.keys(apiResult.events[0]);
        
        // Core fields should be present in both
        const requiredFields = ['id', 'title', 'start_time', 'end_time'];
        requiredFields.forEach(field => {
          expect(mockEventKeys).toContain(field);
          expect(apiEventKeys).toContain(field);
        });
      }
    });
  });
});
