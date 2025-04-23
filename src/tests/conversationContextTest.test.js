/**
 * Conversation Context Manager Tests
 * Tests the functionality of the ConversationContextManager service
 */

const conversationContext = require('../services/ConversationContextManager');

// Test user
const TEST_USER_ID = 'test-user-123';

// Clean up before tests
beforeEach(() => {
  conversationContext.clearContext(TEST_USER_ID);
});

describe('Conversation Context Manager', () => {
  describe('Basic Context Functionality', () => {
    test('should initialize a new context', () => {
      const context = conversationContext.initContext(TEST_USER_ID);
      
      expect(context).toBeDefined();
      expect(context.userId).toBe(TEST_USER_ID);
      expect(context.messages).toEqual([]);
      expect(context.entities).toEqual({});
      expect(context.lastIntent).toBeNull();
    });

    test('should add messages to context', () => {
      conversationContext.addMessage(
        TEST_USER_ID, 
        'user', 
        'Create a task to buy groceries tomorrow',
        {
          intent: 'task_create',
          entities: {
            title: 'buy groceries',
            date: '2025-04-24'
          }
        }
      );
      
      const context = conversationContext.getContext(TEST_USER_ID);
      
      expect(context.messages.length).toBe(1);
      expect(context.lastIntent).toBe('task_create');
      expect(context.entities.title).toBe('buy groceries');
      expect(context.entities.date).toBe('2025-04-24');
    });

    test('should maintain context across multiple messages', () => {
      // First message
      conversationContext.addMessage(
        TEST_USER_ID, 
        'user', 
        'Create a task to buy groceries tomorrow',
        {
          intent: 'task_create',
          entities: {
            title: 'buy groceries',
            date: '2025-04-24'
          }
        }
      );
      
      // System response
      conversationContext.addMessage(
        TEST_USER_ID,
        'system',
        'I\'ve created a task "buy groceries" scheduled for tomorrow.',
        {
          task_id: '123'
        }
      );
      
      // Second user message
      conversationContext.addMessage(
        TEST_USER_ID,
        'user',
        'Change it to Friday instead',
        {
          intent: 'task_update',
          entities: {
            date: '2025-04-25'
          },
          contextual: true
        }
      );
      
      const context = conversationContext.getContext(TEST_USER_ID);
      
      expect(context.messages.length).toBe(3);
      expect(context.entities.title).toBe('buy groceries'); // preserved from first message
      expect(context.entities.date).toBe('2025-04-25'); // updated with new date
    });
  });

  describe('Reference Resolution', () => {
    test('should resolve references to previously mentioned tasks', () => {
      // First message
      conversationContext.addMessage(
        TEST_USER_ID, 
        'user', 
        'Create a task to buy groceries tomorrow',
        {
          intent: 'task_create',
          entities: {
            title: 'buy groceries',
            date: '2025-04-24'
          }
        }
      );
      
      // System response
      conversationContext.addMessage(
        TEST_USER_ID,
        'system',
        'I\'ve created a task "buy groceries" scheduled for tomorrow.',
        {}
      );
      
      // Message with reference
      const { resolvedMessage, references } = conversationContext.resolveReferences(
        TEST_USER_ID,
        'Reschedule that task to Friday'
      );
      
      expect(references).toBeDefined();
      expect(references.task).toBe('buy groceries');
      expect(resolvedMessage).not.toContain('that task');
      expect(resolvedMessage).toContain('buy groceries');
    });

    test('should resolve "it" reference to most recent entity', () => {
      // First message
      conversationContext.addMessage(
        TEST_USER_ID, 
        'user', 
        'Create a task to buy groceries tomorrow',
        {
          intent: 'task_create',
          entities: {
            title: 'buy groceries',
            date: '2025-04-24'
          }
        }
      );
      
      // Message with reference
      const { resolvedMessage, references } = conversationContext.resolveReferences(
        TEST_USER_ID,
        'Actually, mark it as high priority'
      );
      
      expect(references).toBeDefined();
      expect(references.last_entity).toBeDefined();
    });
  });

  describe('Clarification Requests', () => {
    test('should detect low confidence intents', () => {
      const clarification = conversationContext.checkForClarification(
        TEST_USER_ID,
        'hmm maybe sometime',
        {
          type: 'general_query',
          confidence: 0.3,
          data: {}
        }
      );
      
      expect(clarification).not.toBeNull();
      expect(clarification.needed).toBe(true);
      expect(clarification.type).toBe('intent');
    });

    test('should detect missing required entities for task creation', () => {
      const clarification = conversationContext.checkForClarification(
        TEST_USER_ID,
        'create a task',
        {
          type: 'task_create',
          confidence: 0.8,
          data: {}
        }
      );
      
      expect(clarification).not.toBeNull();
      expect(clarification.needed).toBe(true);
      expect(clarification.type).toBe('missing_entities');
      expect(clarification.entities).toContain('task title');
    });

    test('should not require clarification for complete inputs', () => {
      const clarification = conversationContext.checkForClarification(
        TEST_USER_ID,
        'Create a task to buy groceries tomorrow',
        {
          type: 'task_create',
          confidence: 0.9,
          data: {
            title: 'buy groceries',
            date: '2025-04-24'
          }
        }
      );
      
      expect(clarification).toBeNull();
    });
  });

  describe('Context Serialization', () => {
    test('should serialize and load context correctly', () => {
      // Setup initial context
      conversationContext.addMessage(
        TEST_USER_ID, 
        'user', 
        'Create a task to buy groceries tomorrow',
        {
          intent: 'task_create',
          entities: {
            title: 'buy groceries',
            date: '2025-04-24'
          }
        }
      );
      
      // Serialize context
      const serialized = conversationContext.serializeContext(TEST_USER_ID);
      
      // Clear and then reload
      conversationContext.clearContext(TEST_USER_ID);
      expect(conversationContext.getContext(TEST_USER_ID)).toBeNull();
      
      // Load from serialized
      conversationContext.loadContext(serialized);
      
      // Check if context is restored
      const context = conversationContext.getContext(TEST_USER_ID);
      expect(context).not.toBeNull();
      expect(context.userId).toBe(TEST_USER_ID);
      expect(context.entities.title).toBe('buy groceries');
      expect(context.entities.date).toBe('2025-04-24');
    });
  });
}); 