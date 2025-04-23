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
   * Check for new emails and process them
   * @param {object} options - Options for email checking
   * @param {string} userId - User ID
   * @returns {Promise<object>} Result of email check
   */
  async checkEmails(options = {}, userId = 'default') {
    try {
      const startTime = Date.now();
      logger.info(`Checking emails with options: ${JSON.stringify(options)}`);
      
      // Get Gmail API client
      const gmail = await this.getGmailApi();
      if (!gmail) {
        throw new Error('Gmail API not available');
      }
      
      // Set default count of emails to retrieve
      const count = options.count || 5;
      
      // Fetch emails
      const response = await gmail.users.messages.list({
        userId: 'me',
        maxResults: count,
        q: 'is:unread'
      });
      
      // Record API call metric
      ApiMetricsService.recordApiCall({
        endpoint: 'gmail.users.messages.list',
        method: 'GET',
        status: 200,
        source: 'InboxAgent.checkEmails',
        duration: Date.now() - startTime,
        request_data: { maxResults: count, q: 'is:unread' }
      });
      
      // Check if we have messages
      if (!response.data.messages || response.data.messages.length === 0) {
        return {
          message: "You don't have any unread emails.",
          actions: [],
          count: 0
        };
      }
      
      // Get the messages details
      const emails = await Promise.all(
        response.data.messages.slice(0, count).map(async (message) => {
          const getStart = Date.now();
          const msg = await gmail.users.messages.get({
            userId: 'me',
            id: message.id,
            format: 'full'
          });
          
          // Record API call metric for each message get
          ApiMetricsService.recordApiCall({
            endpoint: 'gmail.users.messages.get',
            method: 'GET',
            status: 200,
            source: 'InboxAgent.checkEmails',
            duration: Date.now() - getStart
          });
          
          return this.formatEmailFromGmail(msg.data);
        })
      );
      
      // Process emails for potential tasks
      const tasksCreated = [];
      
      for (const email of emails) {
        // Check if email appears to be a task request using improved heuristics
        if (this.isEmailTaskRequest(email)) {
          // Extract tasks from email content
          const extractedTasks = this.extractTasksFromEmail(email);
          
          if (extractedTasks.length > 0) {
            // Create tasks from extracted data
            for (const taskData of extractedTasks) {
              // Add user ID if available
              if (userId !== 'default') {
                taskData.user_id = userId;
              }
              
              // Create task in database
              try {
                const task = await Task.create(taskData);
                tasksCreated.push(task);
              } catch (error) {
                logger.error(`Error creating task from email: ${error.message}`, { error });
              }
            }
          } else {
            // Fallback - create a generic task if no specific tasks were extracted
            try {
              const taskData = {
                title: `Follow up: ${email.subject}`,
                priority: email.from.includes('ceo') || email.from.includes('director') ? 'high' : 'medium',
                due_date: null, // No specific due date
                status: 'pending',
                source: 'email',
                source_data: {
                  email_id: email.id,
                  sender: email.from,
                  received_at: email.date
                }
              };
              
              // Add user ID if available
              if (userId !== 'default') {
                taskData.user_id = userId;
              }
              
              const task = await Task.create(taskData);
              tasksCreated.push(task);
            } catch (error) {
              logger.error(`Error creating generic task from email: ${error.message}`, { error });
            }
          }
        }
      }
      
      // Generate response based on results
      const nlgService = require('../services/NlgService');
      
      if (tasksCreated.length > 0) {
        return {
          message: nlgService.generateResponse('email_check', { 
            count: emails.length,
            task_count: tasksCreated.length 
          }, {
            category: 'success_with_tasks',
            userId
          }),
          actions: [
            {
              type: 'emails_processed',
              count: emails.length
            },
            {
              type: 'tasks_created',
              tasks: tasksCreated
            }
          ],
          emails: emails,
          tasksCreated: tasksCreated
        };
      }
      
      return {
        message: nlgService.generateResponse('email_check', { 
          count: emails.length,
          email_summary: emails 
        }, {
          category: 'success_with_emails',
          userId
        }),
        actions: [
          {
            type: 'emails_processed',
            count: emails.length
          }
        ],
        emails: emails
      };
    } catch (error) {
      logger.error(`Error checking emails: ${error.message}`, { error });
      
      // Record API failure
      ApiMetricsService.recordApiCall({
        endpoint: 'gmail.users.messages.list/get',
        method: 'GET',
        status: 500,
        source: 'InboxAgent.checkEmails',
        error_type: error.name,
        error_message: error.message
      });
      
      const nlgService = require('../services/NlgService');
      return {
        message: nlgService.generateResponse('email_check', { error: error.message }, {
          category: 'error',
          userId
        }),
        error: error.message,
        actions: []
      };
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
    // Check subject for task indicators
    const subjectScore = this.analyzeTextForTaskIntent(email.subject, 1.5); // Subject has higher weight
    
    // Check body for task indicators
    const bodyScore = this.analyzeTextForTaskIntent(email.body, 1.0);
    
    // Check sender importance (if available)
    const senderScore = this.analyzeSenderImportance(email.from) * 1.2; // Sender importance has higher weight
    
    // Calculate overall score
    const totalScore = subjectScore + bodyScore + senderScore;
    
    // Set threshold for task detection (can be adjusted based on testing)
    const threshold = 2.0;
    
    return totalScore >= threshold;
  }
  
  /**
   * Analyze text for indicators of task intent
   * @param {string} text - Text to analyze
   * @param {number} weight - Weight to apply to score
   * @returns {number} Score indicating likelihood of task intent
   */
  analyzeTextForTaskIntent(text, weight = 1.0) {
    if (!text) return 0;
    
    const lowerText = text.toLowerCase();
    let score = 0;
    
    // Task action keywords
    const actionKeywords = [
      'todo', 'to-do', 'task', 'action', 'complete', 'finish',
      'update', 'create', 'make', 'prepare', 'review', 'check',
      'follow up', 'follow-up', 'implement', 'fix', 'resolve', 'address'
    ];
    
    // Request keywords
    const requestKeywords = [
      'please', 'request', 'need', 'would you', 'could you', 'can you',
      'asap', 'urgent', 'important', 'priority', 'required', 'must',
      'should', 'have to', 'necessary', 'needed'
    ];
    
    // Deadline indicators
    const deadlineKeywords = [
      'by', 'due', 'deadline', 'eod', 'cob', 'end of day', 'end of week',
      'before', 'no later than', 'tomorrow', 'next week', 'on monday',
      'tuesday', 'wednesday', 'thursday', 'friday', 
      'this week', 'this month'
    ];
    
    // Check for action keywords (strong indicators)
    for (const keyword of actionKeywords) {
      if (lowerText.includes(keyword)) {
        score += 0.5;
      }
    }
    
    // Check for request keywords (strong indicators)
    for (const keyword of requestKeywords) {
      if (lowerText.includes(keyword)) {
        score += 0.4;
      }
    }
    
    // Check for deadline keywords (very strong indicators)
    for (const keyword of deadlineKeywords) {
      if (lowerText.includes(keyword)) {
        score += 0.7;
      }
    }
    
    // Check for imperative sentences (starting with verbs)
    const sentences = lowerText.split(/[.!?]+/).filter(s => s.trim().length > 0);
    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      const firstWord = trimmedSentence.split(/\s+/)[0];
      
      // Common imperative verbs that often start task requests
      const imperativeVerbs = [
        'make', 'create', 'update', 'review', 'check', 'ensure', 'find', 
        'complete', 'finish', 'prepare', 'send', 'share', 'schedule'
      ];
      
      if (imperativeVerbs.includes(firstWord)) {
        score += 0.6;
      }
    }
    
    // Check for task numbering patterns (1. 2. or • or - or * list items)
    const listItemRegex = /(\d+\.\s|\*\s|•\s|-\s|\[\s?\]\s)/g;
    const listItemMatches = lowerText.match(listItemRegex);
    if (listItemMatches && listItemMatches.length > 0) {
      score += Math.min(listItemMatches.length * 0.2, 1.0); // Cap at 1.0
    }
    
    // Check for question marks (negative indicator, questions are usually not tasks)
    const questionMarks = (lowerText.match(/\?/g) || []).length;
    if (questionMarks > 0) {
      score -= questionMarks * 0.2;
    }
    
    // Apply weight factor
    return score * weight;
  }
  
  /**
   * Analyze sender importance for prioritizing task requests
   * @param {string} sender - Email sender address or name
   * @returns {number} Score indicating sender importance
   */
  analyzeSenderImportance(sender) {
    if (!sender) return 0;
    
    const lowerSender = sender.toLowerCase();
    let score = 0;
    
    // VIP list - Executives, managers, important clients (would be customized)
    const vipSenders = [
      'ceo', 'chief', 'director', 'head', 'manager', 'lead', 'president',
      'founder', 'owner', 'boss', 'supervisor', 'client'
    ];
    
    // Check if sender contains VIP indicators
    for (const vip of vipSenders) {
      if (lowerSender.includes(vip)) {
        score += 0.8;
        break; // One VIP match is enough
      }
    }
    
    // Domain importance (company domains are important)
    if (lowerSender.includes('@company.com') || // Replace with actual company domain
        lowerSender.includes('@clientcompany.com')) { // Add important client domains
      score += 0.5;
    }
    
    return score;
  }
  
  /**
   * Extract potential tasks from email content
   * @param {object} email - Email object
   * @returns {Array} Extracted task objects
   */
  extractTasksFromEmail(email) {
    if (!email || !email.body) {
      return [];
    }
    
    const tasks = [];
    const subject = email.subject || '';
    const body = email.body || '';
    
    // Extract tasks from bullet points or numbered lists
    const listItemRegex = /(?:^|\n)(?:\d+\.\s|\*\s|•\s|-\s|\[\s?\]\s)(.+?)(?:\n|$)/g;
    let match;
    
    while ((match = listItemRegex.exec(body)) !== null) {
      const taskText = match[1].trim();
      if (taskText.length > 3) { // Avoid very short items
        const taskData = this.parseTaskData(taskText, email);
        if (taskData) {
          tasks.push(taskData);
        }
      }
    }
    
    // Extract tasks from imperative sentences if no list items found
    if (tasks.length === 0) {
      const sentences = body.split(/[.!?]+/).filter(s => s.trim().length > 0);
      
      for (const sentence of sentences) {
        const trimmedSentence = sentence.trim();
        if (trimmedSentence.length < 100 && trimmedSentence.length > 10) { // Reasonable task length
          const firstWord = trimmedSentence.split(/\s+/)[0].toLowerCase();
          
          // Common imperative verbs that often start task requests
          const imperativeVerbs = [
            'make', 'create', 'update', 'review', 'check', 'ensure', 'find', 
            'complete', 'finish', 'prepare', 'send', 'share', 'schedule'
          ];
          
          if (imperativeVerbs.includes(firstWord)) {
            const taskData = this.parseTaskData(trimmedSentence, email);
            if (taskData) {
              tasks.push(taskData);
            }
          }
        }
      }
    }
    
    // If still no tasks found and subject indicates a task, use subject as task title
    if (tasks.length === 0 && this.analyzeTextForTaskIntent(subject, 1.0) > 1.0) {
      const taskData = this.parseTaskData(subject, email);
      if (taskData) {
        tasks.push(taskData);
      }
    }
    
    return tasks;
  }
  
  /**
   * Parse task data from text
   * @param {string} text - Text to parse for task data
   * @param {object} email - Original email for context
   * @returns {object|null} Task data object or null if parsing failed
   */
  parseTaskData(text, email) {
    // Skip if text is too short
    if (!text || text.length < 5) return null;
    
    // Extract due date using regex patterns
    let dueDate = null;
    const dueDatePatterns = [
      /by\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
      /due\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
      /before\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
      /due\s+(today|tomorrow|this week|next week|this month)/i,
      /by\s+(today|tomorrow|this week|next week|this month)/i,
      /by\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i
    ];
    
    let dueDateText = null;
    for (const pattern of dueDatePatterns) {
      const match = text.match(pattern);
      if (match) {
        dueDateText = match[1];
        break;
      }
    }
    
    // Convert due date text to actual date
    if (dueDateText) {
      const today = new Date();
      
      if (dueDateText.toLowerCase() === 'today') {
        dueDate = today.toISOString().split('T')[0];
      } else if (dueDateText.toLowerCase() === 'tomorrow') {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        dueDate = tomorrow.toISOString().split('T')[0];
      } else if (dueDateText.toLowerCase() === 'this week') {
        const endOfWeek = new Date(today);
        endOfWeek.setDate(today.getDate() + (5 - today.getDay())); // Friday this week
        dueDate = endOfWeek.toISOString().split('T')[0];
      } else if (dueDateText.toLowerCase() === 'next week') {
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);
        dueDate = nextWeek.toISOString().split('T')[0];
      } else if (dueDateText.toLowerCase() === 'this month') {
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        dueDate = endOfMonth.toISOString().split('T')[0];
      } else if (/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.test(dueDateText)) {
        // Handle day of week
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const targetDay = dayNames.indexOf(dueDateText.toLowerCase());
        const currentDay = today.getDay();
        
        const daysUntilTarget = (targetDay + 7 - currentDay) % 7 || 7; // Next occurrence of day
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + daysUntilTarget);
        dueDate = targetDate.toISOString().split('T')[0];
      } else {
        // Try to parse MM/DD/YYYY format
        try {
          const dateObj = new Date(dueDateText);
          if (!isNaN(dateObj.getTime())) {
            dueDate = dateObj.toISOString().split('T')[0];
          }
        } catch (error) {
          logger.debug(`Failed to parse date: ${dueDateText}`, { error: error.message });
        }
      }
    }
    
    // Extract priority from text
    let priority = 'medium'; // Default
    if (/urgent|asap|immediately|critical|highest/i.test(text)) {
      priority = 'high';
    } else if (/low\s+priority|whenever|not\s+urgent|not\s+important/i.test(text)) {
      priority = 'low';
    }
    
    // Clean up task title
    let title = text.replace(/by\s+(\d{1,2}\/\d{1,2}\/\d{2,4}|today|tomorrow|this week|next week|this month)/i, '')
                    .replace(/due\s+(\d{1,2}\/\d{1,2}\/\d{2,4}|today|tomorrow|this week|next week|this month)/i, '')
                    .replace(/before\s+(\d{1,2}\/\d{1,2}\/\d{2,4}|today|tomorrow|this week|next week|this month)/i, '')
                    .replace(/by\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i, '')
                    .replace(/(high|medium|low)\s+priority/i, '')
                    .replace(/priority:\s*(high|medium|low)/i, '')
                    .replace(/urgent|asap|immediately|critical/i, '')
                    .trim();
    
    // Ensure title doesn't exceed reasonable length
    if (title.length > 100) {
      title = title.substring(0, 97) + '...';
    }
    
    return {
      title,
      priority,
      due_date: dueDate,
      status: 'pending',
      source: 'email',
      source_data: {
        email_id: email.id,
        sender: email.from,
        received_at: email.date
      }
    };
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

  /**
   * Format an email object from Gmail API response
   * @param {object} gmailMessage - Gmail API message object
   * @returns {object} Formatted email object
   */
  formatEmailFromGmail(gmailMessage) {
    if (!gmailMessage || !gmailMessage.payload) {
      logger.warn('Invalid Gmail message format', { 
        messageId: gmailMessage?.id || 'unknown' 
      });
      return {
        id: gmailMessage?.id || 'unknown',
        subject: 'Unknown Subject',
        from: 'unknown@example.com',
        date: new Date().toISOString(),
        body: '',
        snippet: gmailMessage?.snippet || ''
      };
    }
    
    // Get headers
    const headers = gmailMessage.payload.headers || [];
    
    // Extract key headers
    const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
    const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';
    const date = headers.find(h => h.name === 'Date')?.value || new Date().toISOString();
    
    // Extract body
    let body = '';
    
    // Function to recursively find text parts
    const findTextParts = (part) => {
      if (!part) return;
      
      // Check if this part has a body
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        try {
          // Decode base64 data
          const buff = Buffer.from(part.body.data, 'base64');
          body += buff.toString('utf-8') + '\n';
        } catch (error) {
          logger.error(`Error decoding email part: ${error.message}`, { error });
        }
      }
      
      // Check for nested parts
      if (part.parts && Array.isArray(part.parts)) {
        part.parts.forEach(findTextParts);
      }
    };
    
    // Start recursion with the payload
    findTextParts(gmailMessage.payload);
    
    // If no plain text body was found, use the snippet
    if (!body && gmailMessage.snippet) {
      body = gmailMessage.snippet;
    }
    
    return {
      id: gmailMessage.id,
      subject,
      from,
      date,
      body,
      snippet: gmailMessage.snippet || '',
      labels: gmailMessage.labelIds || []
    };
  }

  /**
   * Get or initialize the Gmail API client
   * @returns {Promise<object|null>} Gmail API client or null on failure
   */
  async getGmailApi() {
    try {
      if (this.gmail) return this.gmail;
      
      // Try to initialize
      const success = await this.initialize();
      return success ? this.gmail : null;
    } catch (error) {
      logger.error(`Error getting Gmail API client: ${error.message}`, { error });
      
      // Record API initialization failure
      ApiMetricsService.recordApiCall({
        endpoint: 'gmail.initialize',
        method: 'INIT',
        status: 500,
        source: 'InboxAgent.getGmailApi',
        error_type: error.name,
        error_message: error.message
      });
      
      return null;
    }
  }
}

module.exports = InboxAgent; 