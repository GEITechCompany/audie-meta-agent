const logger = require('../utils/logger');
const Task = require('../models/Task');
const SchedulerAgent = require('./SchedulerAgent');
const InboxAgent = require('./InboxAgent');

/**
 * MetaAgent (Audie) - The central intelligence and coordinator
 * This agent handles all communication flow, routes requests to appropriate
 * sub-agents, and maintains system state.
 */
class MetaAgent {
  constructor() {
    this.name = 'Audie';
    this.schedulerAgent = new SchedulerAgent();
    this.inboxAgent = new InboxAgent();
    
    logger.info(`${this.name} Meta-Agent initialized`);
  }

  /**
   * Process a user message and route to appropriate sub-agents
   * @param {string} message - The user's message to Audie
   * @returns {Promise<object>} Response object with message and actions
   */
  async processMessage(message) {
    try {
      logger.info(`Processing message: "${message.substring(0, 50)}..."`);
      
      // Analyze intent
      const intent = this.analyzeIntent(message);
      
      // Route to appropriate handler based on intent
      let response;
      switch (intent.type) {
        case 'task_create':
          response = await this.handleTaskCreation(intent.data);
          break;
        case 'task_query':
          response = await this.handleTaskQuery(intent.data);
          break;
        case 'schedule_query':
          response = await this.schedulerAgent.getSchedule(intent.data);
          break;
        case 'email_check':
          response = await this.inboxAgent.checkEmails(intent.data);
          break;
        default:
          response = {
            message: "I'm not sure how to help with that. Could you please clarify?",
            actions: []
          };
      }
      
      return response;
    } catch (error) {
      logger.error(`Error processing message: ${error.message}`);
      return {
        message: "I encountered an error while processing your request. Please try again.",
        error: error.message,
        actions: []
      };
    }
  }

  /**
   * Analyze user message to determine intent
   * @param {string} message - User message
   * @returns {object} Intent object with type and extracted data
   */
  analyzeIntent(message) {
    // Simple keyword-based intent detection - would be replaced with NLP in production
    const lowerMessage = message.toLowerCase();
    
    // Task creation intent
    if (lowerMessage.includes('create task') || lowerMessage.includes('add task') || 
        lowerMessage.includes('new task')) {
      return {
        type: 'task_create',
        data: this.extractTaskData(message)
      };
    }
    
    // Task query intent
    if (lowerMessage.includes('show tasks') || lowerMessage.includes('list tasks') || 
        lowerMessage.includes('what tasks') || lowerMessage.includes('pending tasks')) {
      return {
        type: 'task_query',
        data: {
          filters: this.extractTaskFilters(message)
        }
      };
    }
    
    // Schedule query intent
    if (lowerMessage.includes('schedule') || lowerMessage.includes('calendar') || 
        lowerMessage.includes('appointments')) {
      return {
        type: 'schedule_query',
        data: {
          timeframe: this.extractTimeframe(message)
        }
      };
    }
    
    // Email check intent
    if (lowerMessage.includes('check email') || lowerMessage.includes('new email') || 
        lowerMessage.includes('emails')) {
      return {
        type: 'email_check',
        data: {
          count: 5 // Default to checking 5 recent emails
        }
      };
    }
    
    // Default intent
    return {
      type: 'general_query',
      data: { message }
    };
  }

  /**
   * Extract task data from user message
   * @param {string} message - User message
   * @returns {object} Extracted task data
   */
  extractTaskData(message) {
    // This is a simplified extraction - would use NLP in production
    const titleMatch = message.match(/task\s+(to|about|for)?\s*(.+?)(?:due|by|before|with priority|$)/i);
    const title = titleMatch ? titleMatch[2].trim() : 'New Task';
    
    const priorityMatch = message.match(/priority\s+(high|medium|low)/i);
    const priority = priorityMatch ? priorityMatch[1].toLowerCase() : 'medium';
    
    // Simple date extraction - would use a proper date parser in production
    const dueDateMatch = message.match(/due\s+(today|tomorrow|next week|on .+?)(?:with|$)/i);
    let dueDate = null;
    
    if (dueDateMatch) {
      const dueDateText = dueDateMatch[1];
      const today = new Date();
      
      if (dueDateText === 'today') {
        dueDate = today.toISOString().split('T')[0];
      } else if (dueDateText === 'tomorrow') {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        dueDate = tomorrow.toISOString().split('T')[0];
      } else if (dueDateText === 'next week') {
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);
        dueDate = nextWeek.toISOString().split('T')[0];
      }
    }
    
    return {
      title,
      priority,
      due_date: dueDate,
      status: 'pending',
      source: 'chat'
    };
  }

  /**
   * Extract task filters from user message
   * @param {string} message - User message
   * @returns {object} Extracted task filters
   */
  extractTaskFilters(message) {
    const lowerMessage = message.toLowerCase();
    const filters = {};
    
    // Status filters
    if (lowerMessage.includes('pending')) filters.status = 'pending';
    if (lowerMessage.includes('in progress')) filters.status = 'in_progress';
    if (lowerMessage.includes('completed')) filters.status = 'completed';
    
    // Priority filters
    if (lowerMessage.includes('high priority')) filters.priority = 'high';
    if (lowerMessage.includes('medium priority')) filters.priority = 'medium';
    if (lowerMessage.includes('low priority')) filters.priority = 'low';
    
    return filters;
  }

  /**
   * Extract timeframe from user message
   * @param {string} message - User message
   * @returns {object} Extracted timeframe
   */
  extractTimeframe(message) {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('today')) {
      return { type: 'day', value: 'today' };
    } else if (lowerMessage.includes('tomorrow')) {
      return { type: 'day', value: 'tomorrow' };
    } else if (lowerMessage.includes('this week')) {
      return { type: 'week', value: 'current' };
    } else if (lowerMessage.includes('next week')) {
      return { type: 'week', value: 'next' };
    } else {
      return { type: 'day', value: 'today' };
    }
  }

  /**
   * Handle task creation
   * @param {object} taskData - Task data extracted from message
   * @returns {Promise<object>} Response object
   */
  async handleTaskCreation(taskData) {
    try {
      const task = new Task(taskData);
      await task.save();
      
      return {
        message: `I've created a new task: "${task.title}"${task.due_date ? ` due on ${task.due_date}` : ''} with ${task.priority} priority.`,
        taskId: task.id,
        actions: [{
          type: 'task_created',
          data: task
        }]
      };
    } catch (error) {
      logger.error(`Error creating task: ${error.message}`);
      return {
        message: `I couldn't create that task: ${error.message}`,
        error: error.message,
        actions: []
      };
    }
  }

  /**
   * Handle task query
   * @param {object} queryData - Query data with filters
   * @returns {Promise<object>} Response object with matching tasks
   */
  async handleTaskQuery(queryData) {
    try {
      const tasks = await Task.findAll(queryData.filters);
      
      if (tasks.length === 0) {
        return {
          message: "I didn't find any tasks matching your criteria.",
          actions: []
        };
      }
      
      // Format tasks for display
      const taskList = tasks.map(task => 
        `• ${task.title} (${task.priority} priority${task.due_date ? `, due: ${task.due_date}` : ''})`
      ).join('\n');
      
      return {
        message: `Here are the tasks I found:\n\n${taskList}`,
        data: { tasks },
        actions: [{
          type: 'tasks_listed',
          count: tasks.length
        }]
      };
    } catch (error) {
      logger.error(`Error querying tasks: ${error.message}`);
      return {
        message: `I couldn't retrieve the tasks: ${error.message}`,
        error: error.message,
        actions: []
      };
    }
  }

  /**
   * Get morning brief with day summary
   * @returns {Promise<object>} Morning brief data
   */
  async getMorningBrief() {
    try {
      // Get today's tasks
      const today = new Date().toISOString().split('T')[0];
      const todayTasks = await Task.findAll({
        due_date: today
      });
      
      // Get pending tasks
      const pendingTasks = await Task.findAll({
        status: 'pending'
      });
      
      // Get today's schedule from scheduler agent
      const schedule = await this.schedulerAgent.getSchedule({
        type: 'day',
        value: 'today'
      });
      
      // Check for new emails
      const newEmails = await this.inboxAgent.getUnreadCount();
      
      return {
        message: this.formatMorningBrief(todayTasks, pendingTasks, schedule, newEmails),
        data: {
          todayTasks,
          pendingTasks,
          schedule,
          newEmails
        },
        actions: [{
          type: 'morning_brief_delivered'
        }]
      };
    } catch (error) {
      logger.error(`Error generating morning brief: ${error.message}`);
      return {
        message: `I couldn't generate your morning brief: ${error.message}`,
        error: error.message,
        actions: []
      };
    }
  }

  /**
   * Format morning brief message
   * @param {Array} todayTasks - Today's tasks
   * @param {Array} pendingTasks - Pending tasks
   * @param {object} schedule - Schedule data
   * @param {number} newEmails - Count of new emails
   * @returns {string} Formatted morning brief message
   */
  formatMorningBrief(todayTasks, pendingTasks, schedule, newEmails) {
    const date = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    let brief = `Good morning! Here's your brief for ${date}:\n\n`;
    
    // Today's schedule
    brief += `📅 TODAY'S SCHEDULE:\n`;
    if (schedule.events && schedule.events.length > 0) {
      schedule.events.forEach(event => {
        brief += `• ${event.start_time} - ${event.title}\n`;
      });
    } else {
      brief += `• No scheduled events for today\n`;
    }
    
    // Today's tasks
    brief += `\n✅ TODAY'S TASKS (${todayTasks.length}):\n`;
    if (todayTasks.length > 0) {
      todayTasks.forEach(task => {
        brief += `• ${task.title} (${task.priority} priority)\n`;
      });
    } else {
      brief += `• No tasks due today\n`;
    }
    
    // Pending tasks
    brief += `\n⏳ PENDING TASKS (${pendingTasks.length}):\n`;
    if (pendingTasks.length > 0) {
      // Show only first 5 pending tasks
      const tasksToShow = pendingTasks.slice(0, 5);
      tasksToShow.forEach(task => {
        brief += `• ${task.title}${task.due_date ? ` (due: ${task.due_date})` : ''}\n`;
      });
      
      if (pendingTasks.length > 5) {
        brief += `• ...and ${pendingTasks.length - 5} more\n`;
      }
    } else {
      brief += `• No pending tasks\n`;
    }
    
    // New emails
    brief += `\n📬 INBOX: `;
    if (newEmails > 0) {
      brief += `You have ${newEmails} new emails\n`;
    } else {
      brief += `No new emails\n`;
    }
    
    brief += `\nHow can I help you today?`;
    
    return brief;
  }
}

module.exports = MetaAgent; 