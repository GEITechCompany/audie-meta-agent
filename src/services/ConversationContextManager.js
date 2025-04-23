/**
 * Conversation Context Manager
 * Handles multi-turn conversations, reference resolution, and contextual understanding
 */

const logger = require('../utils/logger');

class ConversationContextManager {
  constructor() {
    // Storage for conversation contexts by user ID
    this.contexts = new Map();
    
    // Default context expiration time in milliseconds (30 minutes)
    this.expirationTime = 30 * 60 * 1000;
    
    logger.info('Conversation Context Manager initialized');
  }

  /**
   * Get conversation context for a user
   * @param {string} userId - User ID
   * @returns {object|null} Context object or null if not found or expired
   */
  getContext(userId) {
    const context = this.contexts.get(userId);
    
    // Check if context exists and is still valid
    if (context && (Date.now() - context.updatedAt < this.expirationTime)) {
      return context;
    }
    
    return null;
  }

  /**
   * Initialize or reset conversation context for a user
   * @param {string} userId - User ID
   * @returns {object} New context object
   */
  initContext(userId) {
    const newContext = {
      userId,
      conversationId: this.generateConversationId(),
      messages: [],
      entities: {},
      references: {},
      lastIntent: null,
      lastEntities: {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    this.contexts.set(userId, newContext);
    return newContext;
  }

  /**
   * Add a message to the conversation context
   * @param {string} userId - User ID
   * @param {string} role - Message role ('user' or 'system')
   * @param {string} content - Message content
   * @param {object} metadata - Additional message metadata (intent, entities, etc.)
   * @returns {object} Updated context
   */
  addMessage(userId, role, content, metadata = {}) {
    let context = this.getContext(userId);
    
    // Create new context if none exists or expired
    if (!context) {
      context = this.initContext(userId);
    }
    
    // Add message to history
    const message = {
      id: this.generateMessageId(),
      role,
      content,
      metadata,
      timestamp: Date.now()
    };
    
    context.messages.push(message);
    
    // Limit message history to last 20 messages to prevent excessive memory usage
    if (context.messages.length > 20) {
      context.messages = context.messages.slice(-20);
    }
    
    // Update context timestamps
    context.updatedAt = Date.now();
    
    // Update context with intent and entities if provided in metadata
    if (metadata.intent) {
      context.lastIntent = metadata.intent;
    }
    
    if (metadata.entities) {
      context.lastEntities = metadata.entities;
      
      // Merge new entities into the entities collection
      Object.entries(metadata.entities).forEach(([key, value]) => {
        // Don't overwrite with null or undefined values
        if (value !== null && value !== undefined) {
          context.entities[key] = value;
        }
      });
    }
    
    // Update references if we have reference resolution information
    if (metadata.resolvedReferences) {
      Object.assign(context.references, metadata.resolvedReferences);
    }
    
    this.contexts.set(userId, context);
    return context;
  }

  /**
   * Resolve references in a message based on conversation context
   * @param {string} userId - User ID
   * @param {string} message - User message that may contain references
   * @returns {object} Object with resolved message and reference map
   */
  resolveReferences(userId, message) {
    const context = this.getContext(userId);
    if (!context || context.messages.length === 0) {
      return { resolvedMessage: message, references: {} };
    }
    
    const lowerMessage = message.toLowerCase();
    const references = {};
    let resolvedMessage = message;
    
    // Common reference words to look for
    const referencePatterns = [
      // Task references
      { pattern: /that task/i, type: 'task' },
      { pattern: /this task/i, type: 'task' },
      { pattern: /the task/i, type: 'task' },
      { pattern: /it/i, type: 'last_entity' },
      
      // Timeframe references
      { pattern: /that date/i, type: 'date' },
      { pattern: /that time/i, type: 'time' },
      
      // People references
      { pattern: /that person/i, type: 'person' },
      { pattern: /them/i, type: 'person' },
      
      // Location references
      { pattern: /that place/i, type: 'location' },
      { pattern: /there/i, type: 'location' }
    ];
    
    // Check for reference patterns
    for (const { pattern, type } of referencePatterns) {
      if (pattern.test(lowerMessage)) {
        // Resolve reference based on type
        const resolved = this.resolveReferenceByType(context, type);
        
        if (resolved) {
          references[type] = resolved;
          
          // Replace reference in message if appropriate
          if (type !== 'last_entity') { // Special case handling
            resolvedMessage = resolvedMessage.replace(pattern, resolved.name || resolved.value || resolved);
          }
        }
      }
    }
    
    // Check for positional references (first one, second one, etc.)
    const positionalMatch = lowerMessage.match(/(first|second|third|last) one/i);
    if (positionalMatch) {
      const position = positionalMatch[1].toLowerCase();
      const lastUserMessages = context.messages
        .filter(msg => msg.role === 'system' && msg.metadata && msg.metadata.options)
        .slice(-3);
      
      if (lastUserMessages.length > 0) {
        const lastMessage = lastUserMessages[0];
        const options = lastMessage.metadata.options;
        
        if (options && Array.isArray(options)) {
          let index = -1;
          
          if (position === 'first') index = 0;
          else if (position === 'second') index = 1;
          else if (position === 'third') index = 2;
          else if (position === 'last') index = options.length - 1;
          
          if (index >= 0 && index < options.length) {
            const selected = options[index];
            references.option = selected;
            resolvedMessage = resolvedMessage.replace(
              positionalMatch[0], 
              selected.name || selected.value || selected
            );
          }
        }
      }
    }
    
    return { resolvedMessage, references };
  }

  /**
   * Resolve a specific type of reference based on conversation context
   * @param {object} context - Conversation context
   * @param {string} type - Reference type to resolve
   * @returns {*} Resolved reference value or null
   */
  resolveReferenceByType(context, type) {
    if (type === 'last_entity') {
      // Find the most recently mentioned entity
      const lastMessageWithEntities = [...context.messages]
        .reverse()
        .find(msg => msg.metadata && msg.metadata.entities && Object.keys(msg.metadata.entities).length > 0);
      
      if (lastMessageWithEntities) {
        const entities = lastMessageWithEntities.metadata.entities;
        // Return the most specific entity (prefer title over generic entities)
        return entities.title || entities.date || entities.person || entities.location || null;
      }
    } else if (type === 'task') {
      // Try to find the most recently mentioned task
      const tasksInContext = context.messages
        .filter(msg => msg.metadata && msg.metadata.entities && msg.metadata.entities.title)
        .map(msg => msg.metadata.entities.title);
      
      return tasksInContext.length > 0 ? tasksInContext[tasksInContext.length - 1] : null;
    } else {
      // For other types (date, time, person, location), check recent entities
      const entitiesOfType = context.messages
        .filter(msg => msg.metadata && msg.metadata.entities && msg.metadata.entities[type])
        .map(msg => msg.metadata.entities[type]);
      
      return entitiesOfType.length > 0 ? entitiesOfType[entitiesOfType.length - 1] : null;
    }
    
    return null;
  }

  /**
   * Check if the message needs clarification (is ambiguous)
   * @param {string} userId - User ID
   * @param {string} message - User message
   * @param {object} detectedIntent - NLP detected intent info
   * @returns {object|null} Clarification object if needed, null otherwise
   */
  checkForClarification(userId, message, detectedIntent) {
    // If the confidence is too low, may need clarification
    if (detectedIntent.confidence < 0.5) {
      return {
        needed: true,
        type: 'intent',
        message: "I'm not sure what you want to do. Could you be more specific?"
      };
    }
    
    // If missing required entities for the intent
    const missingEntities = this.checkMissingEntities(detectedIntent);
    if (missingEntities.length > 0) {
      return {
        needed: true,
        type: 'missing_entities',
        entities: missingEntities,
        message: `Could you provide ${missingEntities.join(', ')} for this request?`
      };
    }
    
    // No clarification needed
    return null;
  }

  /**
   * Check if required entities are missing for an intent
   * @param {object} detectedIntent - NLP detected intent info
   * @returns {Array} List of missing required entities
   */
  checkMissingEntities(detectedIntent) {
    const missingEntities = [];
    
    switch (detectedIntent.type) {
      case 'task_create':
        if (!detectedIntent.data.title) {
          missingEntities.push('task title');
        }
        break;
        
      case 'task_update':
        if (!detectedIntent.data.title && !detectedIntent.contextual) {
          missingEntities.push('which task to update');
        }
        break;
        
      case 'task_delete':
        if (!detectedIntent.data.title && !detectedIntent.contextual) {
          missingEntities.push('which task to delete');
        }
        break;
    }
    
    return missingEntities;
  }

  /**
   * Generate a unique conversation ID
   * @returns {string} Unique conversation ID
   */
  generateConversationId() {
    return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Generate a unique message ID
   * @returns {string} Unique message ID
   */
  generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Clear conversation context for a user
   * @param {string} userId - User ID
   */
  clearContext(userId) {
    this.contexts.delete(userId);
  }

  /**
   * Serialize context for storing in external database
   * @param {string} userId - User ID
   * @returns {object|null} Serialized context object
   */
  serializeContext(userId) {
    const context = this.getContext(userId);
    if (!context) return null;
    
    return {
      userId: context.userId,
      conversationId: context.conversationId,
      messages: context.messages,
      entities: context.entities,
      references: context.references,
      lastIntent: context.lastIntent,
      lastEntities: context.lastEntities,
      createdAt: context.createdAt,
      updatedAt: context.updatedAt
    };
  }

  /**
   * Load context from serialized data
   * @param {object} data - Serialized context data
   * @returns {object} Loaded context
   */
  loadContext(data) {
    if (!data || !data.userId) {
      logger.error('Invalid context data provided for loading');
      return null;
    }
    
    this.contexts.set(data.userId, {
      ...data,
      // Ensure timestamps are numbers
      createdAt: Number(data.createdAt),
      updatedAt: Number(data.updatedAt)
    });
    
    return this.getContext(data.userId);
  }
}

module.exports = new ConversationContextManager(); 