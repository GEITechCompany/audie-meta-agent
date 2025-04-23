const logger = require('../utils/logger');
const { google } = require('googleapis');
const Task = require('../models/Task');

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
      
      if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET || !process.env.GMAIL_REDIRECT_URI) {
        logger.warn('Missing Gmail API credentials in environment variables');
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
        logger.warn('No Gmail credentials found, using mock email data');
        this.gmail = null;
        return false;
      }
    } catch (error) {
      logger.error(`Error initializing Gmail API: ${error.message}`);
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
    try {
      // Initialize Gmail if not already done
      if (!this.gmail && !(await this.initialize())) {
        // Fall back to mock data if initialization fails
        return this.getMockEmails(params);
      }
      
      // Query Gmail for unread messages
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread',
        maxResults: params.count
      });
      
      const messageList = response.data.messages || [];
      const emails = [];
      
      // Fetch details for each message
      for (const message of messageList) {
        const messageDetails = await this.gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full'
        });
        
        const parsedEmail = this.parseEmailMessage(messageDetails.data);
        emails.push(parsedEmail);
      }
      
      // Process emails for potential tasks
      const tasks = await this.processEmailsForTasks(emails);
      
      return {
        message: this.formatEmailSummary(emails),
        emails,
        tasks,
        count: emails.length
      };
    } catch (error) {
      logger.error(`Error checking emails: ${error.message}`);
      
      // Fall back to mock data on error
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
    try {
      // Initialize Gmail if not already done
      if (!this.gmail && !(await this.initialize())) {
        // Return mock count if initialization fails
        return 3; // Mock count
      }
      
      // Query Gmail for unread count
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread',
        maxResults: 1
      });
      
      return response.data.resultSizeEstimate || 0;
    } catch (error) {
      logger.error(`Error getting unread count: ${error.message}`);
      return 3; // Mock count on error
    }
  }

  /**
   * Get mock email data for testing/fallback
   * @param {object} params - Parameters for email check
   * @returns {object} Mock email data
   */
  getMockEmails(params) {
    logger.info(`Using mock email data with count ${params.count}`);
    
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