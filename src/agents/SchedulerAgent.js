const logger = require('../utils/logger');
const { google } = require('googleapis');
const { getDatabase } = require('../database');

/**
 * SchedulerAgent - Handles calendar management and scheduling
 * Interfaces with Google Calendar API and manages task scheduling
 */
class SchedulerAgent {
  constructor() {
    this.name = 'SchedulerAgent';
    this.calendar = null;
    logger.info(`${this.name} initialized`);
  }

  /**
   * Initialize Google Calendar API connection
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    try {
      // This is a placeholder for the actual Google Calendar API setup
      // In a production app, this would use proper OAuth2 authentication
      
      if (!process.env.GCAL_CLIENT_ID || !process.env.GCAL_CLIENT_SECRET || !process.env.GCAL_REDIRECT_URI) {
        logger.warn('Missing Google Calendar API credentials in environment variables');
        return false;
      }
      
      const auth = new google.auth.OAuth2(
        process.env.GCAL_CLIENT_ID,
        process.env.GCAL_CLIENT_SECRET,
        process.env.GCAL_REDIRECT_URI
      );
      
      // Set credentials from environment if available
      if (process.env.GCAL_REFRESH_TOKEN) {
        auth.setCredentials({
          refresh_token: process.env.GCAL_REFRESH_TOKEN
        });
        
        this.calendar = google.calendar({ version: 'v3', auth });
        logger.info('Google Calendar API initialized');
        return true;
      } else {
        // Fall back to mock mode if no credentials
        logger.warn('No Google Calendar credentials found, using mock calendar data');
        this.calendar = null;
        return false;
      }
    } catch (error) {
      logger.error(`Error initializing Google Calendar API: ${error.message}`);
      this.calendar = null;
      return false;
    }
  }

  /**
   * Get schedule for a specific timeframe
   * @param {object} params - Timeframe parameters
   * @returns {Promise<object>} Schedule data
   */
  async getSchedule(params = { type: 'day', value: 'today' }) {
    try {
      // Initialize calendar if not already done
      if (!this.calendar && !(await this.initialize())) {
        // Fall back to mock data if initialization fails
        return this.getMockSchedule(params);
      }
      
      // Calculate time range
      const { timeMin, timeMax } = this.calculateTimeRange(params);
      
      // Get events from Google Calendar
      const response = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
      });
      
      // Format events
      const events = response.data.items.map(event => {
        const start = event.start.dateTime || event.start.date;
        const end = event.end.dateTime || event.end.date;
        
        return {
          id: event.id,
          title: event.summary,
          description: event.description || '',
          start_time: new Date(start).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
          }),
          end_time: new Date(end).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
          }),
          location: event.location || '',
          is_all_day: !event.start.dateTime,
          calendar_id: 'primary'
        };
      });
      
      return {
        message: this.formatScheduleMessage(events, params),
        events,
        timeframe: params
      };
    } catch (error) {
      logger.error(`Error fetching schedule: ${error.message}`);
      
      // Fall back to mock data on error
      return this.getMockSchedule(params);
    }
  }

  /**
   * Calculate time range for calendar query
   * @param {object} params - Timeframe parameters
   * @returns {object} Time range with min and max dates
   */
  calculateTimeRange(params) {
    const now = new Date();
    let timeMin = new Date(now);
    let timeMax = new Date(now);
    
    if (params.type === 'day') {
      // Reset to start of day
      timeMin.setHours(0, 0, 0, 0);
      
      if (params.value === 'today') {
        // Use today
        timeMax.setHours(23, 59, 59, 999);
      } else if (params.value === 'tomorrow') {
        // Use tomorrow
        timeMin.setDate(timeMin.getDate() + 1);
        timeMax.setDate(timeMax.getDate() + 1);
        timeMax.setHours(23, 59, 59, 999);
      }
    } else if (params.type === 'week') {
      // Reset to start of day
      timeMin.setHours(0, 0, 0, 0);
      
      // Get current day of week (0 = Sunday, 6 = Saturday)
      const dayOfWeek = now.getDay();
      
      if (params.value === 'current') {
        // Set to start of current week (Sunday)
        timeMin.setDate(timeMin.getDate() - dayOfWeek);
        timeMax = new Date(timeMin);
        timeMax.setDate(timeMax.getDate() + 6);
        timeMax.setHours(23, 59, 59, 999);
      } else if (params.value === 'next') {
        // Set to start of next week
        timeMin.setDate(timeMin.getDate() - dayOfWeek + 7);
        timeMax = new Date(timeMin);
        timeMax.setDate(timeMax.getDate() + 6);
        timeMax.setHours(23, 59, 59, 999);
      }
    }
    
    return { timeMin, timeMax };
  }

  /**
   * Format schedule message for display
   * @param {Array} events - List of events
   * @param {object} params - Timeframe parameters
   * @returns {string} Formatted message
   */
  formatScheduleMessage(events, params) {
    let timeframeText = 'today';
    
    if (params.type === 'day' && params.value === 'tomorrow') {
      timeframeText = 'tomorrow';
    } else if (params.type === 'week' && params.value === 'current') {
      timeframeText = 'this week';
    } else if (params.type === 'week' && params.value === 'next') {
      timeframeText = 'next week';
    }
    
    let message = `Here's your schedule for ${timeframeText}:\n\n`;
    
    if (events.length === 0) {
      message += 'You have no scheduled events.';
    } else {
      events.forEach(event => {
        if (event.is_all_day) {
          message += `• All day: ${event.title}\n`;
        } else {
          message += `• ${event.start_time} - ${event.end_time}: ${event.title}\n`;
        }
        
        if (event.location) {
          message += `  Location: ${event.location}\n`;
        }
      });
    }
    
    return message;
  }

  /**
   * Get mock schedule data for testing/fallback
   * @param {object} params - Timeframe parameters
   * @returns {object} Mock schedule data
   */
  getMockSchedule(params) {
    logger.info(`Using mock schedule data for ${params.type} ${params.value}`);
    
    // Generate some mock events
    const events = [];
    
    // If today or tomorrow
    if (params.type === 'day') {
      // Add some sample events
      events.push({
        id: 'mock-1',
        title: 'Team Standup',
        description: 'Daily team meeting',
        start_time: '09:00 AM',
        end_time: '09:30 AM',
        location: 'Zoom',
        is_all_day: false,
        calendar_id: 'primary'
      });
      
      events.push({
        id: 'mock-2',
        title: 'Client Call - Project Review',
        description: 'Review project progress with client',
        start_time: '02:00 PM',
        end_time: '03:00 PM',
        location: 'Google Meet',
        is_all_day: false,
        calendar_id: 'primary'
      });
    }
    
    // For weekly view, add more events
    if (params.type === 'week') {
      events.push({
        id: 'mock-3',
        title: 'Quarterly Planning',
        description: 'Strategic planning session',
        start_time: '10:00 AM',
        end_time: '12:00 PM',
        location: 'Conference Room A',
        is_all_day: false,
        calendar_id: 'primary'
      });
      
      events.push({
        id: 'mock-4',
        title: 'Product Launch',
        description: 'New product release',
        start_time: 'All Day',
        end_time: 'All Day',
        location: '',
        is_all_day: true,
        calendar_id: 'primary'
      });
    }
    
    return {
      message: this.formatScheduleMessage(events, params),
      events,
      timeframe: params,
      is_mock: true
    };
  }

  /**
   * Schedule a new event
   * @param {object} eventData - Event data
   * @returns {Promise<object>} Created event result
   */
  async scheduleEvent(eventData) {
    try {
      // Initialize calendar if not already done
      if (!this.calendar && !(await this.initialize())) {
        logger.error('Failed to initialize calendar for scheduling event');
        throw new Error('Calendar service not available');
      }
      
      // Format the event for Google Calendar
      const event = {
        summary: eventData.title,
        description: eventData.description || '',
        start: {},
        end: {},
        location: eventData.location || ''
      };
      
      // Handle all-day events vs timed events
      if (eventData.is_all_day) {
        event.start.date = eventData.start_date;
        event.end.date = eventData.end_date || eventData.start_date;
      } else {
        event.start.dateTime = new Date(
          `${eventData.start_date}T${eventData.start_time}`
        ).toISOString();
        
        event.end.dateTime = new Date(
          `${eventData.end_date || eventData.start_date}T${eventData.end_time || '23:59:59'}`
        ).toISOString();
      }
      
      // Create the event
      const response = await this.calendar.events.insert({
        calendarId: 'primary',
        resource: event
      });
      
      logger.info(`Event created: ${response.data.htmlLink}`);
      
      return {
        message: `I've scheduled "${eventData.title}" on your calendar.`,
        event: response.data,
        success: true
      };
    } catch (error) {
      logger.error(`Error scheduling event: ${error.message}`);
      return {
        message: `I couldn't schedule that event: ${error.message}`,
        error: error.message,
        success: false
      };
    }
  }
}

module.exports = SchedulerAgent; 