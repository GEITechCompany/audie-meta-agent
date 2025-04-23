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

module.exports = {
  getGmailApi
}; 