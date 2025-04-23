/**
 * Natural Language Generation Service
 * Generates natural language responses with support for templates, 
 * variations, summaries, and customization
 */

const logger = require('../utils/logger');

class NlgService {
  constructor() {
    // Response templates for different intents and situations
    this.templates = {
      // Task creation responses
      task_create: {
        success: [
          "I've created the task: '{title}'.",
          "Task '{title}' has been added to your list.",
          "Added a new task: '{title}'.",
          "Your task '{title}' has been created.",
          "New task added: '{title}'."
        ],
        error: [
          "I couldn't create that task. {error}",
          "There was a problem adding your task. {error}",
          "Task creation failed. {error}",
          "I wasn't able to add that task. {error}"
        ]
      },
      
      // Task query responses
      task_query: {
        success_with_tasks: [
          "Here are your tasks: {task_list}",
          "I found these tasks: {task_list}",
          "Your task list: {task_list}",
          "These are your current tasks: {task_list}"
        ],
        success_empty: [
          "You don't have any tasks matching those criteria.",
          "I couldn't find any tasks like that.",
          "No matching tasks were found.",
          "Your task list is empty for those filters."
        ],
        error: [
          "I had trouble retrieving your tasks. {error}",
          "There was a problem getting your task list. {error}",
          "Couldn't fetch your tasks. {error}"
        ]
      },
      
      // Task update responses
      task_update: {
        success: [
          "I've updated the task '{title}'.",
          "Task '{title}' has been updated.",
          "'{title}' has been modified.",
          "Changes to '{title}' have been saved."
        ],
        error: [
          "I couldn't update that task. {error}",
          "There was a problem updating your task. {error}",
          "Task update failed. {error}"
        ]
      },
      
      // Schedule query responses
      schedule_query: {
        success_with_events: [
          "Here's your schedule: {event_list}",
          "Your calendar shows: {event_list}",
          "I found these events: {event_list}",
          "Your schedule includes: {event_list}"
        ],
        success_empty: [
          "You don't have any events scheduled for that time.",
          "Your calendar is clear for that period.",
          "No events found in that timeframe.",
          "There's nothing scheduled during that time."
        ],
        error: [
          "I had trouble retrieving your schedule. {error}",
          "There was a problem getting your calendar. {error}",
          "Couldn't fetch your events. {error}"
        ]
      },
      
      // Email check responses
      email_check: {
        success_with_emails: [
          "I found {count} new emails. {email_summary}",
          "You have {count} unread emails. {email_summary}",
          "There are {count} new messages in your inbox. {email_summary}",
          "{count} unread emails: {email_summary}"
        ],
        success_empty: [
          "You don't have any new emails.",
          "Your inbox is clear - no new messages.",
          "No unread emails were found.",
          "Your email is all caught up."
        ],
        success_with_tasks: [
          "I found {count} emails and created {task_count} new tasks from them.",
          "{count} new emails detected. {task_count} task(s) were created from these.",
          "Processed {count} emails and added {task_count} new tasks."
        ],
        error: [
          "I had trouble checking your emails. {error}",
          "There was a problem accessing your inbox. {error}",
          "Couldn't fetch your emails. {error}"
        ]
      },
      
      // General clarification responses
      clarification: {
        missing_info: [
          "I need more information. {missing}",
          "Could you provide {missing}?",
          "I need to know {missing} to proceed.",
          "Please specify {missing}."
        ],
        ambiguous: [
          "I'm not sure what you mean. Could you clarify?",
          "That's a bit ambiguous. Could you be more specific?",
          "I didn't quite understand. Could you rephrase that?",
          "I'm not sure how to interpret that. Could you provide more details?"
        ],
        options: [
          "Did you mean: {options}",
          "I found a few possibilities: {options}",
          "Choose one of these: {options}",
          "Which one did you mean? {options}"
        ]
      },
      
      // Error and fallback responses
      error: {
        general: [
          "I ran into a problem. {error}",
          "Sorry, an error occurred: {error}",
          "There was an issue: {error}",
          "I encountered an error: {error}"
        ],
        not_understood: [
          "I'm not sure I understand what you're asking for.",
          "I don't know how to help with that yet.",
          "I didn't catch that. Could you try again?",
          "I'm not sure what you mean. Could you rephrase that?"
        ],
        api_failure: [
          "I couldn't connect to the required service. Please try again later.",
          "There's a service disruption. Please try again in a few minutes.",
          "The API service is currently unavailable. Please try again later.",
          "Connection error. Please check your internet connection and try again."
        ]
      }
    };
    
    // User preferences (default)
    this.defaultPreferences = {
      verbosity: 'normal', // minimal, normal, detailed
      formality: 'neutral', // casual, neutral, formal
      includeDetails: true
    };
    
    // User-specific preferences
    this.userPreferences = new Map();
    
    logger.info('NLG Service initialized');
  }

  /**
   * Generate a response based on intent and data
   * @param {string} intentType - Type of intent being responded to
   * @param {object} data - Data to include in response
   * @param {object} options - Options for response generation
   * @returns {string} Generated response text
   */
  generateResponse(intentType, data, options = {}) {
    try {
      const userId = options.userId || 'default';
      const preferences = this.getUserPreferences(userId);
      const responseCategory = options.category || 'success';
      const templateKey = `${intentType}.${responseCategory}`;
      
      // Find the appropriate template
      let templates = this.getNestedProperty(this.templates, templateKey);
      
      // Fall back to error.general if template not found
      if (!templates) {
        templates = this.templates.error.general;
        data.error = 'No response template found';
      }
      
      // Select a random template from the array
      const template = this.selectTemplate(templates, options.templateIndex);
      
      // Fill template with data
      let response = this.fillTemplate(template, data, preferences);
      
      // Apply verbosity adjustments
      response = this.adjustForVerbosity(response, preferences.verbosity);
      
      return response;
    } catch (error) {
      logger.error(`Error generating response: ${error.message}`, { error });
      return "I encountered an error while generating a response.";
    }
  }

  /**
   * Get a nested property from an object using a dot-notation path
   * @param {object} obj - Object to extract property from
   * @param {string} path - Path to property using dot notation
   * @returns {*} Property value or undefined if not found
   */
  getNestedProperty(obj, path) {
    return path.split('.').reduce((prev, curr) => {
      return prev && prev[curr] !== undefined ? prev[curr] : undefined;
    }, obj);
  }

  /**
   * Select a template from the available options
   * @param {Array} templates - Available templates
   * @param {number} index - Specific index to use (optional)
   * @returns {string} Selected template
   */
  selectTemplate(templates, index) {
    if (!templates || templates.length === 0) {
      return "No response template available.";
    }
    
    // Use provided index or select randomly
    if (index !== undefined && index >= 0 && index < templates.length) {
      return templates[index];
    } else {
      const randomIndex = Math.floor(Math.random() * templates.length);
      return templates[randomIndex];
    }
  }

  /**
   * Fill a template with data values
   * @param {string} template - Template string with placeholders
   * @param {object} data - Data to fill placeholders
   * @param {object} preferences - User preferences
   * @returns {string} Filled template
   */
  fillTemplate(template, data, preferences) {
    // Return the template directly if no data
    if (!data) return template;
    
    // Replace all placeholders with their values
    return template.replace(/{([^{}]*)}/g, (match, key) => {
      // Check if this is a special formatter
      if (key.includes(':')) {
        const [baseKey, formatter] = key.split(':');
        return this.formatValue(data[baseKey], formatter, preferences);
      }
      
      // Handle normal replacements
      const value = data[key];
      if (value === undefined) {
        return `{${key}}`;
      }
      
      // Format collections like task_list and event_list
      if (key === 'task_list' && Array.isArray(value)) {
        return this.formatTaskList(value, preferences);
      }
      
      if (key === 'event_list' && Array.isArray(value)) {
        return this.formatEventList(value, preferences);
      }
      
      if (key === 'email_summary' && Array.isArray(value)) {
        return this.formatEmailSummary(value, preferences);
      }
      
      if (key === 'options' && Array.isArray(value)) {
        return this.formatOptions(value);
      }
      
      return value;
    });
  }

  /**
   * Format a value using a specific formatter
   * @param {*} value - Value to format
   * @param {string} formatter - Formatter to apply
   * @param {object} preferences - User preferences
   * @returns {string} Formatted value
   */
  formatValue(value, formatter, preferences) {
    if (value === undefined) return '';
    
    switch (formatter) {
      case 'date':
        return this.formatDate(value);
      case 'time':
        return this.formatTime(value);
      case 'count':
        return this.formatCount(value);
      case 'list':
        return this.formatList(value, preferences);
      case 'capitalize':
        return this.capitalize(value);
      case 'uppercase':
        return String(value).toUpperCase();
      case 'lowercase':
        return String(value).toLowerCase();
      default:
        return value;
    }
  }

  /**
   * Format a date value
   * @param {string|Date} date - Date to format
   * @returns {string} Formatted date
   */
  formatDate(date) {
    if (!date) return '';
    
    try {
      const dateObj = date instanceof Date ? date : new Date(date);
      return dateObj.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      return String(date);
    }
  }

  /**
   * Format a time value
   * @param {string} time - Time to format
   * @returns {string} Formatted time
   */
  formatTime(time) {
    if (!time) return '';
    
    // Handle ISO format or time string
    if (time.includes('T')) {
      // ISO datetime
      try {
        const date = new Date(time);
        return date.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
      } catch (error) {
        return time;
      }
    } else if (time.includes(':')) {
      // Handle HH:MM format
      const [hours, minutes] = time.split(':').map(num => parseInt(num, 10));
      const period = hours >= 12 ? 'PM' : 'AM';
      const hour12 = hours % 12 || 12;
      return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
    }
    
    return time;
  }

  /**
   * Format a count value with appropriate wording
   * @param {number} count - Count to format
   * @returns {string} Formatted count
   */
  formatCount(count) {
    if (count === 0) return 'no';
    if (count === 1) return 'one';
    return count.toString();
  }

  /**
   * Format a list of items
   * @param {Array} items - List items
   * @param {object} preferences - User preferences
   * @returns {string} Formatted list
   */
  formatList(items, preferences) {
    if (!items || !Array.isArray(items) || items.length === 0) {
      return 'nothing';
    }
    
    if (items.length === 1) {
      return String(items[0]);
    }
    
    // Apply verbosity filter
    const filteredItems = this.filterByVerbosity(items, preferences.verbosity);
    
    if (filteredItems.length <= 2) {
      return filteredItems.join(' and ');
    }
    
    const lastItem = filteredItems.pop();
    return `${filteredItems.join(', ')}, and ${lastItem}`;
  }

  /**
   * Format a list of tasks based on verbosity
   * @param {Array} tasks - Task objects
   * @param {object} preferences - User preferences
   * @returns {string} Formatted task list
   */
  formatTaskList(tasks, preferences) {
    if (!tasks || tasks.length === 0) {
      return 'no tasks';
    }
    
    switch (preferences.verbosity) {
      case 'minimal':
        return `${tasks.length} task(s)`;
        
      case 'normal':
        // Just titles with priority indicators
        return tasks.map(task => {
          const priorityIndicator = task.priority === 'high' ? '⚠️ ' : '';
          return `${priorityIndicator}${task.title}`;
        }).join(', ');
        
      case 'detailed':
        // Full descriptions with all details
        return tasks.map(task => {
          let taskInfo = `"${task.title}"`;
          if (task.due_date) taskInfo += ` due ${this.formatDate(task.due_date)}`;
          if (task.priority) taskInfo += ` (${task.priority} priority)`;
          if (task.status) taskInfo += ` [${task.status.replace('_', ' ')}]`;
          return taskInfo;
        }).join('\n• ');
        
      default:
        return tasks.map(task => task.title).join(', ');
    }
  }

  /**
   * Format a list of calendar events based on verbosity
   * @param {Array} events - Calendar event objects
   * @param {object} preferences - User preferences
   * @returns {string} Formatted event list
   */
  formatEventList(events, preferences) {
    if (!events || events.length === 0) {
      return 'no events';
    }
    
    switch (preferences.verbosity) {
      case 'minimal':
        return `${events.length} event(s)`;
        
      case 'normal':
        // Basic info - title and time
        return events.map(event => {
          return `${event.title} at ${this.formatTime(event.start_time)}`;
        }).join(', ');
        
      case 'detailed':
        // Full descriptions
        return events.map(event => {
          let eventInfo = `"${event.title}"`;
          if (event.start_time) {
            eventInfo += ` at ${this.formatTime(event.start_time)}`;
            if (event.end_time) {
              eventInfo += ` until ${this.formatTime(event.end_time)}`;
            }
          }
          if (event.location) eventInfo += ` at ${event.location}`;
          return eventInfo;
        }).join('\n• ');
        
      default:
        return events.map(event => event.title).join(', ');
    }
  }

  /**
   * Format a summary of emails based on verbosity
   * @param {Array} emails - Email objects
   * @param {object} preferences - User preferences
   * @returns {string} Formatted email summary
   */
  formatEmailSummary(emails, preferences) {
    if (!emails || emails.length === 0) {
      return 'no emails';
    }
    
    switch (preferences.verbosity) {
      case 'minimal':
        return `${emails.length} email(s)`;
        
      case 'normal':
        // Just senders and subjects
        return emails.slice(0, 3).map(email => {
          return `${email.sender}: "${email.subject}"`;
        }).join(', ') + (emails.length > 3 ? ` and ${emails.length - 3} more` : '');
        
      case 'detailed':
        // Full descriptions
        const shownEmails = emails.slice(0, 5);
        let summary = shownEmails.map(email => {
          let emailInfo = `From ${email.sender}: "${email.subject}"`;
          if (email.snippet) emailInfo += ` - ${email.snippet.substring(0, 50)}...`;
          return emailInfo;
        }).join('\n• ');
        
        if (emails.length > 5) {
          summary += `\n• ...and ${emails.length - 5} more`;
        }
        
        return summary;
        
      default:
        return emails.map(email => `${email.sender}: ${email.subject}`).join(', ');
    }
  }

  /**
   * Format a list of options for clarification
   * @param {Array} options - Option objects or strings
   * @returns {string} Formatted options
   */
  formatOptions(options) {
    if (!options || !Array.isArray(options) || options.length === 0) {
      return 'no options available';
    }
    
    return options.map((option, index) => {
      const value = typeof option === 'object' ? (option.name || option.value || option.title) : option;
      return `${index + 1}) ${value}`;
    }).join(', ');
  }

  /**
   * Capitalize the first letter of a string
   * @param {string} str - String to capitalize
   * @returns {string} Capitalized string
   */
  capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Filter a list of items based on verbosity level
   * @param {Array} items - Items to filter
   * @param {string} verbosity - Verbosity level
   * @returns {Array} Filtered items
   */
  filterByVerbosity(items, verbosity) {
    if (!items || !Array.isArray(items)) {
      return [];
    }
    
    switch (verbosity) {
      case 'minimal':
        return items.slice(0, 3);
      case 'normal':
        return items.slice(0, 5);
      case 'detailed':
        return items;
      default:
        return items;
    }
  }

  /**
   * Adjust response text based on verbosity setting
   * @param {string} text - Response text
   * @param {string} verbosity - Verbosity level
   * @returns {string} Adjusted text
   */
  adjustForVerbosity(text, verbosity) {
    switch (verbosity) {
      case 'minimal':
        // Shorten text by removing explanatory phrases
        return text
          .replace(/I've |I have |I found |There are |These are /g, '')
          .replace(/ for you\.?/g, '.')
          .replace(/Your |You have /g, '');
        
      case 'detailed':
        // Keep full text
        return text;
        
      case 'normal':
      default:
        // Default format
        return text;
    }
  }

  /**
   * Generate a summary of a list of tasks
   * @param {Array} tasks - Task objects
   * @param {object} options - Summary options
   * @returns {string} Summary text
   */
  generateTaskSummary(tasks, options = {}) {
    const userId = options.userId || 'default';
    const preferences = this.getUserPreferences(userId);
    
    if (!tasks || tasks.length === 0) {
      return "You don't have any tasks.";
    }
    
    // Task statistics
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(task => task.status === 'completed').length;
    const highPriorityTasks = tasks.filter(task => task.priority === 'high').length;
    const overdueTasks = tasks.filter(task => {
      if (!task.due_date) return false;
      const dueDate = new Date(task.due_date);
      const today = new Date();
      return dueDate < today && task.status !== 'completed';
    }).length;
    
    let summary = '';
    
    switch (preferences.verbosity) {
      case 'minimal':
        summary = `${totalTasks} tasks, ${completedTasks} completed.`;
        break;
        
      case 'normal':
        summary = `You have ${totalTasks} tasks in total, with ${completedTasks} completed`;
        if (highPriorityTasks > 0) {
          summary += `, ${highPriorityTasks} high priority`;
        }
        if (overdueTasks > 0) {
          summary += `, and ${overdueTasks} overdue`;
        }
        summary += '.';
        break;
        
      case 'detailed':
        summary = `Task Summary:
• Total: ${totalTasks}
• Completed: ${completedTasks} (${Math.round(completedTasks/totalTasks*100) || 0}%)
• High Priority: ${highPriorityTasks}
• Medium Priority: ${tasks.filter(task => task.priority === 'medium').length}
• Low Priority: ${tasks.filter(task => task.priority === 'low').length}
• Overdue: ${overdueTasks}`;
        break;
    }
    
    return summary;
  }

  /**
   * Generate personalized greeting based on user and time
   * @param {string} userId - User ID or name
   * @param {object} options - Additional options
   * @returns {string} Personalized greeting
   */
  generateGreeting(userId, options = {}) {
    const user = options.userName || userId;
    const now = new Date();
    const hour = now.getHours();
    
    let timeGreeting;
    if (hour < 12) timeGreeting = 'Good morning';
    else if (hour < 18) timeGreeting = 'Good afternoon';
    else timeGreeting = 'Good evening';
    
    // Add personalization if we have a name
    if (user && user !== 'default') {
      return `${timeGreeting}, ${user}!`;
    }
    
    return timeGreeting;
  }

  /**
   * Get user preferences, falling back to defaults if not set
   * @param {string} userId - User ID
   * @returns {object} User preferences
   */
  getUserPreferences(userId) {
    const userPrefs = this.userPreferences.get(userId);
    return userPrefs || this.defaultPreferences;
  }

  /**
   * Set user preferences
   * @param {string} userId - User ID
   * @param {object} preferences - Preference settings
   */
  setUserPreferences(userId, preferences) {
    // Validate preferences
    const validatedPreferences = {
      verbosity: ['minimal', 'normal', 'detailed'].includes(preferences.verbosity) 
        ? preferences.verbosity 
        : this.defaultPreferences.verbosity,
      
      formality: ['casual', 'neutral', 'formal'].includes(preferences.formality)
        ? preferences.formality
        : this.defaultPreferences.formality,
      
      includeDetails: preferences.includeDetails !== undefined
        ? Boolean(preferences.includeDetails)
        : this.defaultPreferences.includeDetails
    };
    
    // Set user-specific preferences
    this.userPreferences.set(userId, {
      ...this.defaultPreferences,
      ...validatedPreferences
    });
  }
}

module.exports = new NlgService(); 