/**
 * Gmail Service
 * Provides Gmail API connection and utility functions for email management
 */

const { google } = require('googleapis');
const logger = require('../utils/logger');
const ApiMetricsService = require('./ApiMetricsService');

/**
 * Initialize and get a Gmail API client
 * @returns {Promise<object|null>} Gmail API client or null on failure
 */
async function getGmailApi() {
  try {
    // Check for required credentials
    if (!process.env.GMAIL_API_KEY || !process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET) {
      logger.warn('Gmail API credentials missing', {
        metadata: {
          source: 'GmailService',
          status: 'Missing credentials'
        }
      });
      return null;
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
      
      const gmail = google.gmail({ version: 'v1', auth });
      logger.info('Gmail API initialized successfully');
      return gmail;
    } else {
      // Log the lack of refresh token
      logger.warn('Gmail refresh token missing', {
        metadata: {
          source: 'GmailService',
          requiredCredentials: ['GMAIL_REFRESH_TOKEN']
        }
      });
      
      return null;
    }
  } catch (error) {
    logger.error(`Gmail API initialization failed: ${error.message}`, {
      metadata: {
        source: 'GmailService',
        error: error.message,
        stack: error.stack
      }
    });
    
    // Record API initialization error
    await ApiMetricsService.recordApiCall({
      endpoint: 'gmail/initialize',
      method: 'INIT',
      status: 'ERROR',
      source: 'GmailService',
      is_mock: false,
      error_type: error.name || 'InitializationError',
      error_message: error.message
    });
    
    return null;
  }
}

/**
 * Fetch emails from Gmail API
 * @param {Object} options - Options for fetching emails
 * @param {number} options.count - Number of emails to fetch (default: 10)
 * @param {string} options.query - Search query (default: 'is:unread')
 * @param {boolean} options.includeAttachments - Whether to include attachments (default: false)
 * @returns {Promise<Object>} - Result object with emails and metadata
 */
async function fetchEmails(options = {}) {
  const startTime = Date.now();
  const count = options.count || 10;
  const query = options.query || 'is:unread';
  const includeAttachments = options.includeAttachments || false;
  
  try {
    // Get Gmail API client
    const gmail = await getGmailApi();
    if (!gmail) {
      logger.warn('Gmail API not available for fetching emails', {
        metadata: {
          source: 'GmailService.fetchEmails',
          options
        }
      });
      
      return {
        success: false,
        is_mock: true,
        message: 'Gmail API not available',
        emails: [],
        error: 'GMAIL_API_UNAVAILABLE'
      };
    }
    
    // Fetch emails
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults: count,
      q: query
    });
    
    // Record API call success
    await ApiMetricsService.recordApiCall({
      endpoint: 'gmail.users.messages.list',
      method: 'GET',
      status: 200,
      source: 'GmailService.fetchEmails',
      duration: Date.now() - startTime,
      request_data: { maxResults: count, q: query },
      is_mock: false
    });
    
    // Check if we have messages
    if (!response.data.messages || response.data.messages.length === 0) {
      logger.info('No emails found matching query', {
        metadata: {
          source: 'GmailService.fetchEmails',
          query,
          count
        }
      });
      
      return {
        success: true,
        message: "No emails found matching criteria",
        emails: [],
        count: 0,
        is_mock: false
      };
    }
    
    // Get the messages details
    const emails = await Promise.all(
      response.data.messages.slice(0, count).map(async (message) => {
        const msgStartTime = Date.now();
        const msg = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full'
        });
        
        // Record API call for message retrieval
        await ApiMetricsService.recordApiCall({
          endpoint: 'gmail.users.messages.get',
          method: 'GET',
          status: 200,
          source: 'GmailService.fetchEmails',
          duration: Date.now() - msgStartTime,
          is_mock: false
        });
        
        return formatEmailFromGmail(msg.data, includeAttachments);
      })
    );
    
    logger.info(`Successfully fetched ${emails.length} emails`, {
      metadata: {
        source: 'GmailService.fetchEmails',
        count: emails.length,
        query,
        duration: Date.now() - startTime
      }
    });
    
    return {
      success: true,
      message: `Retrieved ${emails.length} emails`,
      emails,
      count: emails.length,
      is_mock: false
    };
  } catch (error) {
    logger.error(`Error fetching emails: ${error.message}`, { 
      error,
      metadata: {
        source: 'GmailService.fetchEmails',
        options
      }
    });
    
    // Record API failure
    await ApiMetricsService.recordApiCall({
      endpoint: 'gmail.users.messages.list/get',
      method: 'GET',
      status: 500,
      source: 'GmailService.fetchEmails',
      error_type: error.name,
      error_message: error.message,
      is_mock: false
    });
    
    return {
      success: false,
      message: `Error fetching emails: ${error.message}`,
      error: error.message,
      error_type: error.name,
      emails: [],
      is_mock: false
    };
  }
}

/**
 * Format an email object from Gmail API response
 * @param {object} gmailMessage - Gmail API message object
 * @param {boolean} includeAttachments - Whether to extract attachment info
 * @returns {object} Formatted email object
 */
function formatEmailFromGmail(gmailMessage, includeAttachments = false) {
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
  const to = headers.find(h => h.name === 'To')?.value || '';
  const date = headers.find(h => h.name === 'Date')?.value || new Date().toISOString();
  
  // Extract body
  let body = '';
  
  // Extract attachments if requested
  let attachments = [];
  
  // Function to recursively find text parts and attachments
  const processParts = (part) => {
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
    
    // Check for attachments
    if (includeAttachments && part.filename && part.filename.length > 0) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType,
        size: part.body.size || 0,
        attachmentId: part.body.attachmentId || null
      });
    }
    
    // Check for nested parts
    if (part.parts && Array.isArray(part.parts)) {
      part.parts.forEach(processParts);
    }
  };
  
  // Start recursion with the payload
  processParts(gmailMessage.payload);
  
  // If no plain text body was found, use the snippet
  if (!body && gmailMessage.snippet) {
    body = gmailMessage.snippet;
  }
  
  const email = {
    id: gmailMessage.id,
    threadId: gmailMessage.threadId,
    subject,
    from,
    to,
    date,
    body,
    snippet: gmailMessage.snippet || '',
    labels: gmailMessage.labelIds || []
  };
  
  // Add attachments if requested and found
  if (includeAttachments && attachments.length > 0) {
    email.attachments = attachments;
  }
  
  return email;
}

/**
 * Get unread email count from Gmail API
 * @returns {Promise<Object>} - Result object with count and metadata
 */
async function getUnreadCount() {
  const startTime = Date.now();
  
  try {
    // Get Gmail API client
    const gmail = await getGmailApi();
    if (!gmail) {
      logger.warn('Gmail API not available for getting unread count', {
        metadata: {
          source: 'GmailService.getUnreadCount'
        }
      });
      
      return {
        success: false,
        is_mock: true,
        message: 'Gmail API not available',
        count: 0,
        error: 'GMAIL_API_UNAVAILABLE'
      };
    }
    
    // Fetch email count
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread',
      maxResults: 1
    });
    
    // Record successful API call
    await ApiMetricsService.recordApiCall({
      endpoint: 'gmail.users.messages.list',
      method: 'GET',
      status: 200,
      source: 'GmailService.getUnreadCount',
      duration: Date.now() - startTime,
      is_mock: false
    });
    
    const count = response.data.resultSizeEstimate || 0;
    
    logger.info(`Unread email count: ${count}`, {
      metadata: {
        source: 'GmailService.getUnreadCount',
        count,
        duration: Date.now() - startTime
      }
    });
    
    return {
      success: true,
      count,
      is_mock: false
    };
  } catch (error) {
    logger.error(`Error getting unread count: ${error.message}`, { 
      error,
      metadata: {
        source: 'GmailService.getUnreadCount'
      }
    });
    
    // Record API failure
    await ApiMetricsService.recordApiCall({
      endpoint: 'gmail.users.messages.list',
      method: 'GET',
      status: 500,
      source: 'GmailService.getUnreadCount',
      error_type: error.name,
      error_message: error.message,
      is_mock: false
    });
    
    return {
      success: false,
      message: `Error getting unread count: ${error.message}`,
      error: error.message,
      error_type: error.name,
      count: 0,
      is_mock: false
    };
  }
}

module.exports = {
  getGmailApi,
  fetchEmails,
  getUnreadCount,
  formatEmailFromGmail
}; 