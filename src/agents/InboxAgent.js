// Core imports
const { EventEmitter } = require('events');
const { google } = require('googleapis');

// Internal imports
const logger = require('../utils/logger');
const { getDatabase } = require('../database');
const ApiMetricsService = require('../services/ApiMetricsService');
const Task = require('../models/Task');
const { getGmailApi } = require('../services/GmailService');

/**
 * InboxAgent - Parses and processes emails for task creation
 * Integrates with Gmail API to fetch and analyze emails
 */
class InboxAgent {
  constructor() {
    this.name = 'InboxAgent';
    this.gmail = null;
    logger.info(`${this.name} initialized`);
  }

  /**
   * Initialize Gmail API connection
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    try {
      // This is a placeholder for the actual Gmail API setup
      // In a production app, this would use proper OAuth2 authentication
      
      if (!process.env.GMAIL_API_KEY || !process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET) {
        logger.warn('Gmail API credentials missing', {
          metadata: {
            source: this.name,
            status: 'Missing credentials'
          }
        });
        return false;
      }
      
      const auth = new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        process.env.GMAIL_REDIRECT_URI
      );
      
      // Set credentials from environment if available
      if (process.env.GMAIL_REFRESH_TOKEN) {
        auth.setCredentials({
          refresh_token: process.env.GMAIL_REFRESH_TOKEN
        });
        
        this.gmail = google.gmail({ version: 'v1', auth });
        logger.info('Gmail API initialized');
        return true;
      } else {
        // Fall back to mock mode if no credentials
        logger.mockData('InboxAgent', 'No Gmail credentials found', {
          component: 'InboxAgent.initialize',
          requiredCredentials: ['GMAIL_REFRESH_TOKEN']
        });
        this.gmail = null;
        return false;
      }
    } catch (error) {
      logger.error(`${this.name} initialization failed: ${error.message}`, {
        metadata: {
          source: this.name,
          error: error.message,
          stack: error.stack
        }
      });
      
      // Record API initialization error
      await ApiMetricsService.recordApiCall({
        endpoint: 'gmail/initialize',
        method: 'INIT',
        status: 'ERROR',
        source: this.name,
        is_mock: false,
        error_type: error.name || 'InitializationError',
        error_message: error.message
      });
      
      this.gmail = null;
      return false;
    }
  }

  /**
   * Check for new unread emails
   * @param {object} params - Parameters for email check
   * @returns {Promise<object>} Email check results
   */
  async checkEmails(params = { count: 5 }) {
    const startTime = Date.now();
    
    try {
      // Initialize Gmail if not already done
      if (!this.gmail && !(await this.initialize())) {
        // Fall back to mock data if initialization fails
        logger.mockData('InboxAgent', 'Gmail API initialization failed', {
          component: 'InboxAgent.checkEmails',
          params
        });
        
        // Record mock data usage in metrics
        await ApiMetricsService.recordApiCall({
          endpoint: 'gmail/messages/list',
          method: 'GET',
          status: 200, // Mock returns "success"
          source: this.name,
          is_mock: true,
          duration: 0,
          response_data: { 
            resultSizeEstimate: params.count,
            mockReason: 'initialization_failed'
          }
        });
        
        // Update daily summary for mock usage
        await ApiMetricsService.updateDailySummary({
          endpoint: 'gmail/messages/list',
          mock_calls: 1
        });
        
        return this.getMockEmails(params);
      }
      
      // Query Gmail for unread messages
      let messageList;
      try {
        // Track API call start time for performance metrics
        const apiStartTime = Date.now();
        
        const response = await this.gmail.users.messages.list({
          userId: 'me',
          q: 'is:unread',
          maxResults: params.count
        });
        
        // Calculate API call duration for metrics
        const apiDuration = Date.now() - apiStartTime;
        
        // Log successful API call with metrics
        logger.apiCall('gmail/messages.list', 200, apiDuration, {
          mock: false,
          metadata: {
            resultCount: response.data.messages?.length || 0,
            params
          }
        });
        
        // Record successful API call in metrics database
        await ApiMetricsService.recordApiCall({
          endpoint: 'gmail/messages/list',
          method: 'GET',
          status: 200,
          source: this.name,
          is_mock: false,
          duration: apiDuration,
          response_data: {
            resultCount: response.data.messages?.length || 0,
            resultSizeEstimate: response.data.resultSizeEstimate || 0
          }
        });
        
        // Update daily summary
        await ApiMetricsService.updateDailySummary({
          endpoint: 'gmail/messages/list',
          successful_calls: 1,
          real_calls: 1,
          avg_duration: apiDuration,
          max_duration: apiDuration,
          min_duration: apiDuration
        });
        
        messageList = response.data.messages || [];
      } catch (error) {
        // Log the API failure with details
        logger.apiCall('gmail/messages.list', error.code || 500, null, {
          error,
          mock: false,
          metadata: {
            params,
            tags: ['gmail', 'api_error']
          }
        });
        
        // Record failed API call in metrics
        await ApiMetricsService.recordApiCall({
          endpoint: 'gmail/messages/list',
          method: 'GET',
          status: error.code || 'ERROR',
          source: this.name,
          is_mock: false,
          duration: Date.now() - apiStartTime,
          error_type: error.name || 'APIError',
          error_message: error.message
        });
        
        // Update daily summary for failure
        await ApiMetricsService.updateDailySummary({
          endpoint: 'gmail/messages/list',
          failed_calls: 1,
          real_calls: 1
        });
        
        // Record that we're using mock data after a failure
        await ApiMetricsService.recordApiCall({
          endpoint: 'gmail/messages/list',
          method: 'GET',
          status: 200, // Mock returns "success"
          source: this.name,
          is_mock: true,
          duration: 0,
          response_data: { 
            resultSizeEstimate: params.count,
            mockReason: 'api_error'
          }
        });
        
        // Update daily summary for mock usage
        await ApiMetricsService.updateDailySummary({
          endpoint: 'gmail/messages/list',
          mock_calls: 1
        });
        
        // Fall back to mock data
        return this.getMockEmails(params);
      }
      
      const emails = [];
      
      // Fetch details for each message
      for (const message of messageList) {
        try {
          const detailStartTime = Date.now();
          
          const messageDetails = await this.gmail.users.messages.get({
            userId: 'me',
            id: message.id,
            format: 'full'
          });
          
          const detailDuration = Date.now() - detailStartTime;
          
          // Log successful API call for message details
          logger.apiCall(`gmail/messages.get/${message.id}`, 200, detailDuration, {
            mock: false,
            metadata: {
              messageId: message.id
            }
          });
          
          // Record successful message details API call
          await ApiMetricsService.recordApiCall({
            endpoint: 'gmail/messages/get',
            method: 'GET',
            status: 200,
            source: this.name,
            is_mock: false,
            duration: detailDuration,
            request_data: { messageId: message.id },
            response_data: { 
              messageSize: JSON.stringify(messageDetails.data).length,
              labelIds: messageDetails.data.labelIds
            }
          });
          
          // Update daily summary for message details
          await ApiMetricsService.updateDailySummary({
            endpoint: 'gmail/messages/get',
            successful_calls: 1,
            real_calls: 1,
            avg_duration: detailDuration,
            max_duration: detailDuration,
            min_duration: detailDuration
          });
          
          const parsedEmail = this.parseEmailMessage(messageDetails.data);
          emails.push(parsedEmail);
        } catch (error) {
          // Log error fetching specific message
          logger.apiCall(`gmail/messages.get/${message.id}`, error.code || 500, null, {
            error,
            mock: false,
            metadata: {
              messageId: message.id,
              tags: ['gmail', 'api_error']
            }
          });
          
          // Record failed message details API call
          await ApiMetricsService.recordApiCall({
            endpoint: 'gmail/messages/get',
            method: 'GET',
            status: error.code || 'ERROR',
            source: this.name,
            is_mock: false,
            duration: Date.now() - detailStartTime,
            request_data: { messageId: message.id },
            error_type: error.name || 'APIError',
            error_message: error.message
          });
          
          // Update daily summary for failed message details
          await ApiMetricsService.updateDailySummary({
            endpoint: 'gmail/messages/get',
            failed_calls: 1,
            real_calls: 1
          });
          
          // Continue with other messages - don't abort entire operation for one failed message
          continue;
        }
      }
      
      // Process emails for potential tasks
      const tasks = await this.processEmailsForTasks(emails);
      
      // Calculate total duration for the entire operation
      const totalDuration = Date.now() - startTime;
      
      // Create result object
      const result = {
        message: this.formatEmailSummary(emails),
        emails,
        tasks,
        count: emails.length
      };
      
      // Log the overall operation completion with performance metrics
      logger.info(`Retrieved ${emails.length} emails from Gmail API`, {
        metadata: {
          source: 'api',
          duration: totalDuration,
          emailCount: emails.length,
          taskCount: tasks.length,
          component: 'InboxAgent.checkEmails'
        }
      });
      
      return result;
    } catch (error) {
      // Log any uncaught errors in the overall process
      logger.error(`Error checking emails: ${error.message}`, {
        metadata: {
          source: 'api',
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack
          },
          component: 'InboxAgent.checkEmails'
        }
      });
      
      // Record overall process error
      await ApiMetricsService.recordApiCall({
        endpoint: 'gmail/process',
        method: 'PROCESS',
        status: 'ERROR',
        source: this.name,
        is_mock: false,
        duration: Date.now() - startTime,
        error_type: error.name || 'ProcessError',
        error_message: error.message
      });
      
      // Record that we're using mock data after a process error
      await ApiMetricsService.recordApiCall({
        endpoint: 'gmail/messages/list',
        method: 'GET',
        status: 200, // Mock returns "success"
        source: this.name,
        is_mock: true,
        duration: 0,
        response_data: { 
          resultSizeEstimate: params.count,
          mockReason: 'process_error'
        }
      });
      
      // Update daily summary for mock usage
      await ApiMetricsService.updateDailySummary({
        endpoint: 'gmail/messages/list',
        mock_calls: 1
      });
      
      // Fall back to mock data
      return this.getMockEmails(params);
    }
  }

  /**
   * Parse Gmail message into usable email object
   * @param {object} message - Gmail message object
   * @returns {object} Parsed email
   */
  parseEmailMessage(message) {
    const headers = message.payload.headers;
    const email = {
      id: message.id,
      threadId: message.threadId,
      labelIds: message.labelIds,
      snippet: message.snippet,
      subject: '',
      from: '',
      to: '',
      date: '',
      body: ''
    };
    
    // Extract headers
    for (const header of headers) {
      if (header.name === 'Subject') {
        email.subject = header.value;
      } else if (header.name === 'From') {
        email.from = header.value;
      } else if (header.name === 'To') {
        email.to = header.value;
      } else if (header.name === 'Date') {
        email.date = header.value;
      }
    }
    
    // Extract body (simplified - actual implementation would be more complex)
    if (message.payload.parts && message.payload.parts.length > 0) {
      // Find text part
      const textPart = message.payload.parts.find(
        part => part.mimeType === 'text/plain'
      );
      
      if (textPart && textPart.body.data) {
        // Decode from base64
        email.body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
      }
    } else if (message.payload.body && message.payload.body.data) {
      // Direct body data
      email.body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
    }
    
    return email;
  }

  /**
   * Process emails to identify potential tasks
   * @param {Array} emails - List of email objects
   * @returns {Promise<Array>} List of created tasks
   */
  async processEmailsForTasks(emails) {
    const tasks = [];
    
    for (const email of emails) {
      // Check if email seems like a task request
      // This is a simple heuristic and would be more sophisticated in production
      const isTaskRequest = this.isEmailTaskRequest(email);
      
      if (isTaskRequest) {
        try {
          // Create a task from the email
          const taskData = {
            title: `Email: ${email.subject}`,
            description: `From: ${email.from}\n\n${email.snippet}...`,
            status: 'pending',
            priority: 'medium',
            source: 'email'
          };
          
          const task = new Task(taskData);
          await task.save();
          tasks.push(task);
          
          logger.info(`Created task from email: ${email.subject}`);
        } catch (error) {
          logger.error(`Error creating task from email: ${error.message}`);
        }
      }
    }
    
    return tasks;
  }

  /**
   * Determine if an email is a potential task request
   * @param {object} email - Email object
   * @returns {boolean} Whether email is a task request
   */
  isEmailTaskRequest(email) {
    // This is a simple heuristic and would be more sophisticated in production
    const subjectLower = email.subject.toLowerCase();
    const bodyLower = email.body.toLowerCase();
    
    // Keywords that might indicate a task
    const taskKeywords = ['request', 'task', 'todo', 'to-do', 'action', 'please', 'help', 'needed', 'asap'];
    
    // Check if any keywords are in subject or snippet
    return taskKeywords.some(keyword => 
      subjectLower.includes(keyword) || bodyLower.includes(keyword)
    );
  }

  /**
   * Format email summary message
   * @param {Array} emails - List of email objects
   * @returns {string} Formatted summary
   */
  formatEmailSummary(emails) {
    if (emails.length === 0) {
      return 'You have no unread emails.';
    }
    
    let summary = `You have ${emails.length} unread email${emails.length > 1 ? 's' : ''}:\n\n`;
    
    emails.forEach((email, index) => {
      const fromName = email.from.split('<')[0].trim();
      summary += `${index + 1}. From: ${fromName}\n   Subject: ${email.subject}\n   ${email.snippet}...\n\n`;
    });
    
    return summary;
  }

  /**
   * Get unread email count
   * @returns {Promise<number>} Count of unread emails
   */
  async getUnreadCount() {
    const startTime = Date.now();
    const endpoint = 'gmail/messages.list/count';
    
    try {
      // Initialize Gmail if not already done
      if (!this.gmail && !(await this.initialize())) {
        // Return mock count if initialization fails
        logger.mockData('InboxAgent', 'Gmail API initialization failed', {
          component: 'InboxAgent.getUnreadCount'
        });
        
        // Record mock API call metric
        await ApiMetricsService.recordApiCall({
          endpoint,
          method: 'GET',
          status: 500,
          source: 'InboxAgent',
          is_mock: true,
          error_type: 'initialization_failed',
          error_message: 'Gmail API initialization failed'
        });
        
        // Update daily summary for this endpoint
        await ApiMetricsService.updateDailySummary({
          endpoint,
          total_calls: 1,
          successful_calls: 0,
          failed_calls: 1,
          mock_calls: 1,
          real_calls: 0
        });
        
        return 3; // Mock count
      }
      
      // Query Gmail for unread count
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread',
        maxResults: 1
      });
      
      const duration = Date.now() - startTime;
      const count = response.data.resultSizeEstimate || 0;
      
      // Log the successful API call
      logger.apiCall('gmail/messages.list/count', 200, duration, {
        mock: false,
        metadata: {
          count,
          component: 'InboxAgent.getUnreadCount'
        }
      });
      
      // Record successful API call metric
      await ApiMetricsService.recordApiCall({
        endpoint,
        method: 'GET',
        status: 200,
        source: 'InboxAgent',
        is_mock: false,
        duration,
        response_data: { count }
      });
      
      // Update daily summary for this endpoint
      await ApiMetricsService.updateDailySummary({
        endpoint,
        total_calls: 1,
        successful_calls: 1,
        failed_calls: 0,
        mock_calls: 0,
        real_calls: 1,
        avg_duration: duration,
        max_duration: duration,
        min_duration: duration
      });
      
      return count;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Log the API failure
      logger.apiCall('gmail/messages.list/count', error.code || 500, null, {
        error,
        mock: false,
        metadata: {
          component: 'InboxAgent.getUnreadCount',
          tags: ['gmail', 'api_error']
        }
      });
      
      // Record failed API call metric
      await ApiMetricsService.recordApiCall({
        endpoint,
        method: 'GET',
        status: error.code || 500,
        source: 'InboxAgent',
        is_mock: false,
        duration,
        error_type: error.name,
        error_message: error.message
      });
      
      // Update daily summary for this endpoint
      await ApiMetricsService.updateDailySummary({
        endpoint,
        total_calls: 1,
        successful_calls: 0,
        failed_calls: 1,
        mock_calls: 0,
        real_calls: 1
      });
      
      return 3; // Mock count on error
    }
  }

  /**
   * Get mock email data for testing/fallback
   * @param {object} params - Parameters for email check
   * @returns {object} Mock email data
   */
  getMockEmails(params = { count: 5 }) {
    const startTime = Date.now();
    const endpoint = 'gmail/messages.list';
    
    // Log this mock data retrieval
    logger.mockData('InboxAgent', 'Using mock email data', {
      component: 'InboxAgent.getMockEmails',
      count: params.count,
      tags: ['fallback', 'mock_data']
    });
    
    // Generate some mock emails
    const emails = [
      {
        id: 'mock-1',
        threadId: 'thread-1',
        labelIds: ['UNREAD', 'INBOX'],
        snippet: 'I need your help with reviewing the latest designs for the client project...',
        subject: 'Design Review Request',
        from: 'Sarah Johnson <sarah@example.com>',
        to: 'you@example.com',
        date: new Date().toISOString(),
        body: 'I need your help with reviewing the latest designs for the client project. Could you take a look today?'
      },
      {
        id: 'mock-2',
        threadId: 'thread-2',
        labelIds: ['UNREAD', 'INBOX'],
        snippet: 'Just following up on our conversation yesterday about the upcoming deadline...',
        subject: 'Follow Up - Project Timeline',
        from: 'Michael Chen <michael@example.com>',
        to: 'you@example.com',
        date: new Date().toISOString(),
        body: 'Just following up on our conversation yesterday about the upcoming deadline. Please let me know if we\'re still on track.'
      },
      {
        id: 'mock-3',
        threadId: 'thread-3',
        labelIds: ['UNREAD', 'INBOX'],
        snippet: 'Your invoice #1234 has been paid. Thank you for your business...',
        subject: 'Payment Confirmation',
        from: 'Billing <billing@example.com>',
        to: 'you@example.com',
        date: new Date().toISOString(),
        body: 'Your invoice #1234 has been paid. Thank you for your business.'
      }
    ];
    
    // Limit to requested count
    const limitedEmails = emails.slice(0, params.count);
    
    // Process emails for potential tasks
    const tasks = limitedEmails
      .filter(email => this.isEmailTaskRequest(email))
      .map(email => {
        return {
          id: `task-${email.id}`,
          title: `Email: ${email.subject}`,
          description: `From: ${email.from}\n\n${email.snippet}...`,
          status: 'pending',
          priority: 'medium',
          source: 'email'
        };
      });
    
    // Calculate duration for metrics
    const duration = Date.now() - startTime;
    
    // Record mock API call metric
    ApiMetricsService.recordApiCall({
      endpoint,
      method: 'GET',
      status: 200,
      source: 'InboxAgent',
      is_mock: true,
      duration,
      response_data: { count: limitedEmails.length }
    }).catch(err => {
      logger.error('Failed to record API metric', {
        error: err,
        component: 'InboxAgent.getMockEmails'
      });
    });
    
    // Update daily summary
    ApiMetricsService.updateDailySummary({
      endpoint,
      total_calls: 1,
      successful_calls: 1,
      failed_calls: 0,
      mock_calls: 1,
      real_calls: 0,
      avg_duration: duration,
      max_duration: duration,
      min_duration: duration
    }).catch(err => {
      logger.error('Failed to update API daily summary', {
        error: err,
        component: 'InboxAgent.getMockEmails'
      });
    });
    
    return {
      message: this.formatEmailSummary(limitedEmails),
      emails: limitedEmails,
      tasks,
      count: limitedEmails.length,
      is_mock: true
    };
  }
}

module.exports = InboxAgent; 