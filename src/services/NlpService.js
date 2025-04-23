/**
 * NLP Service
 * Provides advanced natural language processing capabilities for intent detection,
 * entity extraction, fuzzy matching, and conversation context management
 */

const logger = require('../utils/logger');
const fuzzysort = require('fuzzysort');

class NlpService {
  constructor() {
    // Intent patterns with keywords and synonyms
    this.intentPatterns = {
      task_create: {
        keywords: ['create task', 'add task', 'new task', 'make task', 'schedule task'],
        threshold: 0.7
      },
      task_query: {
        keywords: ['show tasks', 'list tasks', 'what tasks', 'pending tasks', 'my tasks', 'find task', 'search task'],
        threshold: 0.7
      },
      task_update: {
        keywords: ['update task', 'change task', 'modify task', 'edit task', 'reschedule task'],
        threshold: 0.7
      },
      task_delete: {
        keywords: ['delete task', 'remove task', 'cancel task', 'drop task'],
        threshold: 0.7
      },
      schedule_query: {
        keywords: ['schedule', 'calendar', 'appointments', 'meetings', 'events', 'upcoming'],
        threshold: 0.6
      },
      email_check: {
        keywords: ['check email', 'new email', 'emails', 'inbox', 'messages'],
        threshold: 0.6
      }
    };

    // Entity extraction patterns
    this.entityPatterns = {
      // Date patterns for various date formats
      date: [
        /today/i,
        /tomorrow/i,
        /yesterday/i,
        /next (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
        /this (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
        /next week/i,
        /this week/i,
        /next month/i,
        /this month/i,
        /(0?[1-9]|[12][0-9]|3[01])[\/\-](0?[1-9]|1[012])[\/\-]\d{4}/i, // DD/MM/YYYY
        /\d{4}[\/\-](0?[1-9]|1[012])[\/\-](0?[1-9]|[12][0-9]|3[01])/i, // YYYY/MM/DD
        /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* (0?[1-9]|[12][0-9]|3[01])(st|nd|rd|th)?,? \d{4}/i, // Month DD, YYYY
        /(0?[1-9]|[12][0-9]|3[01]) (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{4}/i // DD Month YYYY
      ],
      
      // Time patterns
      time: [
        /at (0?[1-9]|1[0-2]):?([0-5][0-9])? ?(am|pm)/i,
        /at ([01]?[0-9]|2[0-3]):([0-5][0-9])/i, // 24-hour format
        /(0?[1-9]|1[0-2]):?([0-5][0-9])? ?(am|pm)/i,
        /(0?[1-9]|1[0-2]) ?(am|pm)/i, // Simple hour format
        /([01]?[0-9]|2[0-3]):([0-5][0-9])/i, // Simple 24-hour format
        /noon/i,
        /midnight/i,
        /morning/i,
        /afternoon/i,
        /evening/i
      ],
      
      // Priority patterns
      priority: [
        /priority:? (high|medium|low)/i,
        /(high|medium|low) priority/i,
        /priority level:? (high|medium|low)/i,
        /p[0-3]/i, // P0, P1, P2, P3 format
        /urgent/i,
        /critical/i,
        /important/i,
        /normal priority/i,
        /low importance/i
      ],
      
      // Status patterns
      status: [
        /status:? (pending|in progress|completed|done|to do|blocked|waiting|on hold)/i,
        /(pending|in progress|completed|done|to do|blocked|waiting|on hold) status/i,
        /mark as (pending|in progress|completed|done|to do|blocked|waiting|on hold)/i,
        /set to (pending|in progress|completed|done|to do|blocked|waiting|on hold)/i
      ],
      
      // Person name pattern (improved)
      person: [
        /for ([A-Z][a-z]+ [A-Z][a-z]+)/i,
        /with ([A-Z][a-z]+ [A-Z][a-z]+)/i,
        /assign to ([A-Z][a-z]+ [A-Z][a-z]+)/i,
        /assign ([A-Z][a-z]+ [A-Z][a-z]+)/i,
        /to ([A-Z][a-z]+)/i, // Single name
        /give to ([A-Z][a-z]+)/i // Single name with context
      ],
      
      // Location patterns (new)
      location: [
        /at ([A-Z][a-z]+ ?[A-Za-z]*)/i,
        /in ([A-Z][a-z]+ ?[A-Za-z]*)/i,
        /location:? ([A-Z][a-z]+ ?[A-Za-z]*)/i,
        /place:? ([A-Z][a-z]+ ?[A-Za-z]*)/i
      ],
      
      // Category patterns (new)
      category: [
        /category:? ([a-z]+)/i,
        /type:? ([a-z]+)/i,
        /tag:? ([a-z]+)/i,
        /tagged as ([a-z]+)/i,
        /in category ([a-z]+)/i
      ]
    };
    
    // Conversation context storage
    this.conversationContext = new Map();
    
    logger.info('NLP Service initialized');
  }

  /**
   * Detect intent from user message with fuzzy matching and context awareness
   * @param {string} message - User message
   * @param {string} userId - User ID for context tracking
   * @returns {object} Detected intent with confidence score and extracted data
   */
  detectIntent(message, userId = 'default') {
    // Get conversation context if available
    const context = this.getConversationContext(userId);
    const lowerMessage = message.toLowerCase();
    
    // Initialize results array for all matching intents
    const results = [];
    
    // Check for intents using fuzzy matching
    for (const [intentType, pattern] of Object.entries(this.intentPatterns)) {
      // Check each keyword for the intent
      for (const keyword of pattern.keywords) {
        const match = fuzzysort.single(keyword, lowerMessage);
        
        if (match && (match.score > pattern.threshold)) {
          results.push({
            type: intentType,
            confidence: match.score,
            keyword: keyword
          });
        }
      }
    }
    
    // Sort results by confidence score (descending)
    results.sort((a, b) => b.confidence - a.confidence);
    
    // If we have matches
    if (results.length > 0) {
      // Get highest confidence intent
      const primaryIntent = results[0];
      
      // Check for compound intents (multiple actions in one request)
      const compoundIntents = this.detectCompoundIntents(results);
      
      // Extract data based on intent type
      const extractedData = this.extractEntities(message, primaryIntent.type);
      
      // Update conversation context
      this.updateConversationContext(userId, {
        lastIntent: primaryIntent.type,
        lastEntities: extractedData,
        timestamp: Date.now()
      });
      
      return {
        type: primaryIntent.type,
        confidence: primaryIntent.confidence,
        compound: compoundIntents.length > 1 ? compoundIntents : null,
        data: extractedData,
        contextual: this.isContextualIntent(message, context)
      };
    }
    
    // Check if this could be a follow-up to previous context
    if (context && context.lastIntent) {
      // If message is very short and references previous context
      if (message.length < 20 && this.containsReferenceWords(lowerMessage)) {
        return {
          type: context.lastIntent,
          confidence: 0.5,
          data: { ...context.lastEntities, ...this.extractEntities(message, context.lastIntent) },
          contextual: true
        };
      }
    }
    
    // Default general query
    return {
      type: 'general_query',
      confidence: 0.3,
      data: { message },
      contextual: false
    };
  }

  /**
   * Check if message contains words that typically reference previous context
   * @param {string} message - Lowercase message
   * @returns {boolean} True if message has reference words
   */
  containsReferenceWords(message) {
    const referenceWords = ['it', 'that', 'this', 'them', 'these', 'those', 'the', 'yes', 'no', 'ok'];
    return referenceWords.some(word => message.includes(word));
  }

  /**
   * Detect compound intents from a list of matched intents
   * @param {Array} matchedIntents - List of matched intents
   * @returns {Array} List of compound intents if any
   */
  detectCompoundIntents(matchedIntents) {
    // If only one intent or confidence gap is large, not compound
    if (matchedIntents.length < 2 || 
        (matchedIntents[0].confidence - matchedIntents[1].confidence > 0.2)) {
      return [matchedIntents[0]];
    }
    
    // Return top matched intents that are within reasonable confidence range
    return matchedIntents
      .filter(intent => intent.confidence > 0.6 && 
              (matchedIntents[0].confidence - intent.confidence < 0.2))
      .slice(0, 3); // Maximum 3 compound intents
  }

  /**
   * Extract entities from message based on intent type
   * @param {string} message - User message
   * @param {string} intentType - Detected intent type
   * @returns {object} Extracted entities
   */
  extractEntities(message, intentType) {
    // Base entity container
    const entities = {};
    
    // Extract common entities for all intents
    const dateEntity = this.extractDate(message);
    if (dateEntity) entities.date = dateEntity;
    
    const timeEntity = this.extractTime(message);
    if (timeEntity) entities.time = timeEntity;
    
    // Extract intent-specific entities
    switch (intentType) {
      case 'task_create':
      case 'task_update':
        // Extract task title - improved to handle more complex patterns
        entities.title = this.extractTaskTitle(message);
        
        // Extract priority
        const priorityEntity = this.extractPriority(message);
        if (priorityEntity) entities.priority = priorityEntity;
        
        // Extract status for task update
        if (intentType === 'task_update') {
          const statusEntity = this.extractStatus(message);
          if (statusEntity) entities.status = statusEntity;
        }
        
        // Extract person assignee
        const personEntity = this.extractPerson(message);
        if (personEntity) entities.assignee = personEntity;
        
        // Extract location (new)
        const locationEntity = this.extractLocation(message);
        if (locationEntity) entities.location = locationEntity;
        
        // Extract category (new)
        const categoryEntity = this.extractCategory(message);
        if (categoryEntity) entities.category = categoryEntity;
        
        break;
      
      case 'task_query':
        // Extract filters
        entities.filters = {};
        
        const statusEntity = this.extractStatus(message);
        if (statusEntity) entities.filters.status = statusEntity;
        
        // Remove duplicate declaration and just use the existing priorityEntity variable
        if (priorityEntity) entities.filters.priority = priorityEntity;
        
        // Remove duplicate declaration and just use the existing personEntity variable
        if (personEntity) entities.filters.assignee = personEntity;
        
        // Add location filter (new)
        if (locationEntity) entities.filters.location = locationEntity;
        
        // Add category filter (new) - use categoryEntity that was already declared
        categoryEntity = this.extractCategory(message);
        if (categoryEntity) entities.filters.category = categoryEntity;
        
        break;
      
      case 'schedule_query':
        // Extract timeframe
        entities.timeframe = this.extractTimeframe(message);
        
        // Add location for schedule queries (new)
        const scheduleLocation = this.extractLocation(message);
        if (scheduleLocation) entities.location = scheduleLocation;
        
        break;
      
      case 'email_check':
        // Extract count or filters for emails
        const countMatch = message.match(/(\d+)\s+emails/i);
        if (countMatch) {
          entities.count = parseInt(countMatch[1], 10);
        } else {
          entities.count = 5; // Default
        }
        
        // Extract email sender if specified (new)
        const fromMatch = message.match(/from ([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i);
        if (fromMatch) {
          entities.from = fromMatch[1];
        }
        
        break;
    }
    
    return entities;
  }

  /**
   * Extract date entity from message
   * @param {string} message - User message
   * @returns {string|null} Extracted date in ISO format or null
   */
  extractDate(message) {
    const today = new Date();
    
    // Try each date pattern
    for (const pattern of this.entityPatterns.date) {
      const match = message.match(pattern);
      
      if (match) {
        if (match[0].toLowerCase().includes('today')) {
          return today.toISOString().split('T')[0];
        } else if (match[0].toLowerCase().includes('tomorrow')) {
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          return tomorrow.toISOString().split('T')[0];
        } else if (match[0].toLowerCase().includes('yesterday')) {
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          return yesterday.toISOString().split('T')[0];
        } else if (match[0].toLowerCase().includes('next week')) {
          const nextWeek = new Date(today);
          nextWeek.setDate(nextWeek.getDate() + 7);
          return nextWeek.toISOString().split('T')[0];
        } else if (match[0].toLowerCase().includes('next month')) {
          const nextMonth = new Date(today);
          nextMonth.setMonth(nextMonth.getMonth() + 1);
          return nextMonth.toISOString().split('T')[0];
        } else if (match[0].toLowerCase().match(/next (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i)) {
          const dayMatch = match[0].toLowerCase().match(/next (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
          const targetDay = dayMatch[1];
          const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
          const targetDayNum = daysOfWeek.indexOf(targetDay);
          const currentDayNum = today.getDay();
          const daysUntilTarget = (targetDayNum + 7 - currentDayNum) % 7 || 7; // Ensures we're always looking at "next" not "this"
          
          const nextTargetDay = new Date(today);
          nextTargetDay.setDate(today.getDate() + daysUntilTarget);
          return nextTargetDay.toISOString().split('T')[0];
        } else {
          // Attempt to parse other date formats
          try {
            const dateStr = match[0];
            const parsedDate = new Date(dateStr);
            if (!isNaN(parsedDate.getTime())) {
              return parsedDate.toISOString().split('T')[0];
            }
          } catch (error) {
            logger.debug(`Failed to parse date: ${match[0]}`, { error: error.message });
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Extract time entity from message
   * @param {string} message - User message
   * @returns {string|null} Extracted time in HH:MM format or null
   */
  extractTime(message) {
    const lowerMessage = message.toLowerCase();
    
    // Check for specific time keywords first
    if (lowerMessage.includes('noon')) {
      return '12:00';
    } else if (lowerMessage.includes('midnight')) {
      return '00:00';
    } else if (lowerMessage.includes('morning')) {
      return '09:00'; // Assume 9 AM for morning
    } else if (lowerMessage.includes('afternoon')) {
      return '14:00'; // Assume 2 PM for afternoon
    } else if (lowerMessage.includes('evening')) {
      return '18:00'; // Assume 6 PM for evening
    }
    
    // Try each time pattern
    for (const pattern of this.entityPatterns.time) {
      const match = message.match(pattern);
      
      if (match) {
        try {
          let hour = parseInt(match[1], 10);
          let minute = match[2] ? parseInt(match[2], 10) : 0;
          
          // Handle AM/PM conversion
          if (match[3] && match[3].toLowerCase() === 'pm' && hour < 12) {
            hour += 12;
          } else if (match[3] && match[3].toLowerCase() === 'am' && hour === 12) {
            hour = 0;
          }
          
          // Format as HH:MM
          return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        } catch (error) {
          logger.debug(`Failed to parse time: ${match[0]}`, { error: error.message });
        }
      }
    }
    
    return null;
  }

  /**
   * Extract task title from message using more sophisticated patterns
   * @param {string} message - User message
   * @returns {string} Extracted task title
   */
  extractTaskTitle(message) {
    // Try multiple patterns to extract title with highest confidence
    
    // Pattern 1: After explicit task indicator
    const explicitPattern = /task\s+(to|about|for)?\s*(.+?)(?:due|by|before|with priority|at|in|for|with|assign|status|priority|$)/i;
    const explicitMatch = message.match(explicitPattern);
    
    if (explicitMatch && explicitMatch[2].trim().length > 3) {
      return explicitMatch[2].trim();
    }
    
    // Pattern 2: First sentence ending with period if relatively short
    const firstSentencePattern = /^(?:please |can you |could you |I need to |I want to |)(.+?)(?:\.|$)/i;
    const firstSentenceMatch = message.match(firstSentencePattern);
    
    if (firstSentenceMatch && firstSentenceMatch[1].trim().length > 3 && firstSentenceMatch[1].trim().length < 60) {
      // Clean up common command words at the beginning
      return firstSentenceMatch[1].trim()
        .replace(/^(create|add|make|set up|schedule) (a |an |the |)/i, '')
        .replace(/^(new|another) (task|item|reminder|event) (to |about |for |)/i, '')
        .replace(/^task (to |about |for |)/i, '');
    }
    
    // Pattern 3: Content between quotes if present
    const quotesPattern = /"([^"]+)"|'([^']+)'/;
    const quotesMatch = message.match(quotesPattern);
    
    if (quotesMatch) {
      return (quotesMatch[1] || quotesMatch[2]).trim();
    }
    
    // Fallback: Extract content after common task creation phrases
    const fallbackPattern = /(create|add|make|set up|schedule) (a |an |the |)(.+?)(?:due|by|before|with priority|at|in|for|with|assign|status|priority|$)/i;
    const fallbackMatch = message.match(fallbackPattern);
    
    if (fallbackMatch && fallbackMatch[3].trim().length > 3) {
      return fallbackMatch[3].trim();
    }
    
    // Last resort: just take first part of the message
    return message.split(/due|by|before|with priority|at|in|for|with|assign|status|priority/i)[0].trim();
  }

  /**
   * Extract priority entity from message with improved matching
   * @param {string} message - User message
   * @returns {string|null} Extracted priority or null
   */
  extractPriority(message) {
    const lowerMessage = message.toLowerCase();
    
    // Check for additional keywords first
    if (lowerMessage.includes('urgent') || lowerMessage.includes('critical')) {
      return 'high';
    } else if (lowerMessage.includes('important')) {
      return 'medium';
    } else if (lowerMessage.includes('low importance')) {
      return 'low';
    }
    
    // Try each priority pattern
    for (const pattern of this.entityPatterns.priority) {
      const match = message.match(pattern);
      
      if (match) {
        if (!match[1] && pattern.toString().includes('p[0-3]')) {
          // Handle P0-P3 format
          const fullMatch = match[0].toLowerCase();
          const level = parseInt(fullMatch.substring(1), 10);
          if (level === 0 || level === 1) return 'high';
          if (level === 2) return 'medium';
          if (level === 3) return 'low';
        } else if (match[1]) {
          const priorityText = match[1].toLowerCase();
          
          // Handle P0-P3 format
          if (priorityText.startsWith('p')) {
            const level = parseInt(priorityText.substring(1), 10);
            if (level === 0 || level === 1) return 'high';
            if (level === 2) return 'medium';
            if (level === 3) return 'low';
          }
          
          return priorityText;
        }
      }
    }
    
    return null;
  }

  /**
   * Extract status entity from message
   * @param {string} message - User message
   * @returns {string|null} Extracted status or null
   */
  extractStatus(message) {
    // Try each status pattern
    for (const pattern of this.entityPatterns.status) {
      const match = message.match(pattern);
      
      if (match) {
        const statusText = match[1].toLowerCase();
        
        // Map status text to system values
        if (statusText === 'to do' || statusText === 'todo') return 'pending';
        if (statusText === 'done') return 'completed';
        
        // Transform spaces to underscore for db compatibility
        return statusText.replace(' ', '_');
      }
    }
    
    return null;
  }

  /**
   * Extract person entity from message
   * @param {string} message - User message
   * @returns {string|null} Extracted person name or null
   */
  extractPerson(message) {
    // Try each person pattern
    for (const pattern of this.entityPatterns.person) {
      const match = message.match(pattern);
      
      if (match) {
        return match[1];
      }
    }
    
    return null;
  }

  /**
   * Extract timeframe information from message
   * @param {string} message - User message
   * @returns {object} Timeframe object with type and value
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
    } else if (lowerMessage.includes('this month')) {
      return { type: 'month', value: 'current' };
    } else if (lowerMessage.includes('next month')) {
      return { type: 'month', value: 'next' };
    } else {
      // Default to today
      return { type: 'day', value: 'today' };
    }
  }

  /**
   * Get conversation context for a user
   * @param {string} userId - User ID
   * @returns {object|null} Context object or null if not found
   */
  getConversationContext(userId) {
    const context = this.conversationContext.get(userId);
    
    // Check if context exists and is still valid (within 30 minutes)
    if (context && (Date.now() - context.timestamp < 30 * 60 * 1000)) {
      return context;
    }
    
    return null;
  }

  /**
   * Update conversation context for a user
   * @param {string} userId - User ID
   * @param {object} context - Context data to store
   */
  updateConversationContext(userId, context) {
    this.conversationContext.set(userId, {
      ...this.conversationContext.get(userId),
      ...context
    });
    
    // Schedule context cleanup after 30 minutes
    setTimeout(() => {
      const currentContext = this.conversationContext.get(userId);
      if (currentContext && currentContext.timestamp === context.timestamp) {
        this.conversationContext.delete(userId);
      }
    }, 30 * 60 * 1000);
  }

  /**
   * Clear conversation context for a user
   * @param {string} userId - User ID
   */
  clearConversationContext(userId) {
    this.conversationContext.delete(userId);
  }

  /**
   * Check if the intent is contextual (depends on previous conversation)
   * @param {string} message - User message
   * @param {object} context - Conversation context
   * @returns {boolean} Whether the intent is contextual
   */
  isContextualIntent(message, context) {
    if (!context) return false;
    
    // Check for short messages that could be follow-ups
    if (message.length < 20) {
      const lowerMessage = message.toLowerCase();
      
      // Pronouns and other references indicating a follow-up
      const referenceWords = ['it', 'that', 'this', 'them', 'these', 'those'];
      if (referenceWords.some(word => lowerMessage.includes(word))) {
        return true;
      }
      
      // Yes/no answers
      if (['yes', 'no', 'yeah', 'nope', 'sure', 'ok'].includes(lowerMessage)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Extract location entity from message
   * @param {string} message - User message
   * @returns {string|null} Extracted location or null
   */
  extractLocation(message) {
    // Try each location pattern
    for (const pattern of this.entityPatterns.location) {
      const match = message.match(pattern);
      
      if (match) {
        return match[1];
      }
    }
    
    return null;
  }

  /**
   * Extract category entity from message
   * @param {string} message - User message
   * @returns {string|null} Extracted category or null
   */
  extractCategory(message) {
    // Try each category pattern
    for (const pattern of this.entityPatterns.category) {
      const match = message.match(pattern);
      
      if (match) {
        return match[1].toLowerCase();
      }
    }
    
    // Try to extract common categories from the message
    const commonCategories = [
      'work', 'personal', 'home', 'finance', 'health', 'shopping', 
      'family', 'meeting', 'call', 'travel', 'project', 'education'
    ];
    
    const lowerMessage = message.toLowerCase();
    for (const category of commonCategories) {
      if (lowerMessage.includes(` ${category} `) || 
          lowerMessage.includes(`#${category}`) || 
          lowerMessage.includes(`${category}:`)) {
        return category;
      }
    }
    
    return null;
  }
}

module.exports = new NlpService(); 