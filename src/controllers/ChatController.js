const MetaAgent = require('../agents/MetaAgent');
const logger = require('../utils/logger');

class ChatController {
  constructor() {
    this.metaAgent = new MetaAgent();
  }

  /**
   * Process a chat message from the user
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async processMessage(req, res) {
    try {
      const { message } = req.body;
      
      if (!message || typeof message !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Message is required and must be a string'
        });
      }
      
      logger.info(`Received chat message: ${message.substring(0, 50)}...`);
      
      // Process message through meta-agent
      const response = await this.metaAgent.processMessage(message);
      
      res.json({
        success: true,
        message: response.message,
        actions: response.actions || []
      });
    } catch (error) {
      logger.error(`Error processing chat message: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Failed to process message',
        message: error.message
      });
    }
  }

  /**
   * Get morning brief summary
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async getMorningBrief(req, res) {
    try {
      logger.info('Morning brief requested');
      
      // Get morning brief from meta-agent
      const briefData = await this.metaAgent.getMorningBrief();
      
      res.json({
        success: true,
        message: briefData.message,
        data: briefData.data,
        actions: briefData.actions || []
      });
    } catch (error) {
      logger.error(`Error generating morning brief: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Failed to generate morning brief',
        message: error.message
      });
    }
  }

  /**
   * Check emails
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async checkEmails(req, res) {
    try {
      logger.info('Email check requested');
      
      // Request email check from meta-agent's inbox agent
      const count = req.query.count || 5;
      const emailData = await this.metaAgent.inboxAgent.checkEmails({ count: parseInt(count) });
      
      res.json({
        success: true,
        message: emailData.message,
        emails: emailData.emails,
        tasks: emailData.tasks,
        count: emailData.count,
        actions: [{
          type: 'emails_checked',
          data: emailData.emails
        }]
      });
    } catch (error) {
      logger.error(`Error checking emails: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Failed to check emails',
        message: error.message
      });
    }
  }

  /**
   * Get calendar schedule
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async getSchedule(req, res) {
    try {
      logger.info('Schedule requested');
      
      // Get schedule parameters from query
      const timeframe = {
        type: req.query.type || 'day',
        value: req.query.value || 'today'
      };
      
      // Request schedule from meta-agent's scheduler agent
      const scheduleData = await this.metaAgent.schedulerAgent.getSchedule(timeframe);
      
      res.json({
        success: true,
        message: scheduleData.message,
        events: scheduleData.events,
        timeframe: scheduleData.timeframe,
        actions: [{
          type: 'schedule_retrieved',
          data: scheduleData.events
        }]
      });
    } catch (error) {
      logger.error(`Error getting schedule: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'Failed to get schedule',
        message: error.message
      });
    }
  }
}

// Singleton pattern
const chatController = new ChatController();

module.exports = chatController; 