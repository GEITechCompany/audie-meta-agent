/**
 * Tests for the Natural Language Generation Service
 * Tests the enhanced capabilities including response generation, personalization,
 * and verbosity settings
 */

const nlgService = require('../services/NlgService');

describe('Natural Language Generation Service', () => {
  describe('Response Generation', () => {
    test('should generate a basic response', () => {
      const response = nlgService.generateResponse('task_create', { title: 'Buy groceries' });
      expect(response).toBeDefined();
      expect(response).toContain('Buy groceries');
    });

    test('should handle error responses', () => {
      const response = nlgService.generateResponse('task_create', 
        { title: 'Buy groceries', error: 'Database connection failed' }, 
        { category: 'error' }
      );
      expect(response).toContain('error');
      expect(response).toContain('Database connection failed');
    });

    test('should generate responses for all defined intents', () => {
      // Task create
      let response = nlgService.generateResponse('task_create', { title: 'Buy groceries' });
      expect(response).toContain('Buy groceries');
      
      // Task query
      response = nlgService.generateResponse('task_query', { 
        task_list: [{ title: 'Buy groceries', priority: 'high' }]
      });
      expect(response).toContain('task');
      
      // Schedule query
      response = nlgService.generateResponse('schedule_query', { 
        event_list: [{ title: 'Team meeting', start_time: '14:00' }]
      });
      expect(response).toContain('Team meeting');
      
      // Email check
      response = nlgService.generateResponse('email_check', { 
        count: 3,
        email_summary: [{ sender: 'John', subject: 'Hello' }]
      });
      expect(response).toContain('email');
    });
  });

  describe('Verbosity Settings', () => {
    test('should adjust response verbosity to minimal', () => {
      // Set user preferences
      nlgService.setUserPreferences('test-user', { verbosity: 'minimal' });
      
      // Generate response with minimal verbosity
      const response = nlgService.generateResponse('task_create', 
        { title: 'Buy groceries' }, 
        { userId: 'test-user' }
      );
      
      // Should be shorter and more direct
      expect(response.length).toBeLessThan(50);
      expect(response).not.toContain("I've ");
      expect(response).toContain('Buy groceries');
    });

    test('should adjust response verbosity to detailed', () => {
      // Set user preferences
      nlgService.setUserPreferences('test-user', { verbosity: 'detailed' });
      
      // Generate task summary with detailed verbosity
      const tasks = [
        { title: 'Buy groceries', status: 'pending', priority: 'high', due_date: '2025-04-25' },
        { title: 'Clean house', status: 'completed', priority: 'medium' },
        { title: 'Pay bills', status: 'pending', priority: 'high' }
      ];
      
      const summary = nlgService.generateTaskSummary(tasks, { userId: 'test-user' });
      
      // Should contain detailed information
      expect(summary).toContain('Task Summary');
      expect(summary).toContain('High Priority');
      expect(summary).toContain('Medium Priority');
      expect(summary).toContain('Completed');
    });
  });

  describe('Formality Settings', () => {
    test('should adjust formality to casual', () => {
      // Set user preferences
      nlgService.setUserPreferences('test-user', { formality: 'casual' });
      
      // Generate response with casual formality
      const response = nlgService.generateResponse('task_create', 
        { title: 'Buy groceries' }, 
        { userId: 'test-user', templateIndex: 0 }  // Use specific template for consistent testing
      );
      
      // Should use contractions and be less formal
      expect(response).toContain("I've");
    });

    test('should adjust formality to formal', () => {
      // Set user preferences
      nlgService.setUserPreferences('test-user', { formality: 'formal' });
      
      // Force a template with contractions to test formal replacement
      const response = nlgService.adjustForFormality("I've created the task: 'Buy groceries'.", 'formal');
      
      // Should avoid contractions and be more formal
      expect(response).toContain("I have created");
      expect(response).not.toContain("I've");
    });
  });

  describe('Response Style Settings', () => {
    test('should apply concise style', () => {
      // Set user preferences
      nlgService.setUserPreferences('test-user', { responseStyle: 'concise' });
      
      // Generate response with concise style
      const response = nlgService.adjustForStyle("Well, I'm happy to report that your task has been created.", 'concise');
      
      // Should remove unnecessary phrases
      expect(response).not.toContain("Well,");
      expect(response).not.toContain("I'm happy to report that");
    });

    test('should apply conversational style', () => {
      // Set user preferences
      nlgService.setUserPreferences('test-user', { responseStyle: 'conversational' });
      
      // Generate response with conversational style
      const response = nlgService.adjustForStyle("Your task has been created.", 'conversational');
      
      // Should add conversational elements
      expect(response.startsWith("Great!") || 
             response.startsWith("Alright,") || 
             response.startsWith("Perfect.") || 
             response.startsWith("Sure,") || 
             response.startsWith("OK,")).toBeTruthy();
    });
  });

  describe('Summary Generation', () => {
    test('should generate schedule summary', () => {
      const now = new Date();
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const events = [
        { 
          title: 'Team Meeting', 
          start_time: new Date(today.setHours(14, 0)).toISOString(), 
          end_time: new Date(today.setHours(15, 0)).toISOString(),
          location: 'Conference Room'
        },
        { 
          title: 'Client Call', 
          start_time: new Date(today.setHours(16, 0)).toISOString(), 
          end_time: new Date(today.setHours(16, 30)).toISOString() 
        },
        { 
          title: 'Dentist Appointment', 
          start_time: new Date(tomorrow.setHours(10, 0)).toISOString(), 
          end_time: new Date(tomorrow.setHours(11, 0)).toISOString() 
        }
      ];
      
      // Test with different verbosity settings
      nlgService.setUserPreferences('test-user', { verbosity: 'minimal' });
      let summary = nlgService.generateScheduleSummary(events, { userId: 'test-user' });
      expect(summary).toContain('2 events today');
      
      nlgService.setUserPreferences('test-user', { verbosity: 'detailed' });
      summary = nlgService.generateScheduleSummary(events, { userId: 'test-user' });
      expect(summary).toContain('Today\'s Events');
      expect(summary).toContain('Conference Room');
      expect(summary).toContain('Upcoming Events');
    });

    test('should generate email summary', () => {
      const emails = [
        { sender: 'boss@company.com', subject: 'Urgent: Project Status', isImportant: true },
        { sender: 'colleague@company.com', subject: 'Meeting Notes' },
        { sender: 'colleague@company.com', subject: 'Lunch Plans' },
        { sender: 'newsletter@tech.com', subject: 'Weekly Tech Digest' }
      ];
      
      // Test with different verbosity settings
      nlgService.setUserPreferences('test-user', { verbosity: 'minimal' });
      let summary = nlgService.generateEmailSummary(emails, { userId: 'test-user' });
      expect(summary).toContain('4 new emails');
      expect(summary).toContain('1 marked important');
      
      nlgService.setUserPreferences('test-user', { verbosity: 'detailed' });
      summary = nlgService.generateEmailSummary(emails, { userId: 'test-user' });
      expect(summary).toContain('Important Emails');
      expect(summary).toContain('Multiple Emails From');
      expect(summary).toContain('colleague@company.com: 2 emails');
    });
  });

  describe('User Preferences', () => {
    test('should set and retrieve user preferences', () => {
      // Set preferences
      nlgService.setUserPreferences('test-user', {
        verbosity: 'detailed',
        formality: 'casual',
        includeDetails: true,
        responseStyle: 'conversational'
      });
      
      // Get preferences
      const prefs = nlgService.getUserPreferences('test-user');
      
      // Verify they were set correctly
      expect(prefs.verbosity).toBe('detailed');
      expect(prefs.formality).toBe('casual');
      expect(prefs.includeDetails).toBe(true);
      expect(prefs.responseStyle).toBe('conversational');
    });

    test('should validate preferences and use defaults for invalid values', () => {
      // Set invalid preferences
      nlgService.setUserPreferences('test-user', {
        verbosity: 'maximum', // Invalid
        formality: 'super-casual', // Invalid
        responseStyle: 'fancy' // Invalid
      });
      
      // Get preferences
      const prefs = nlgService.getUserPreferences('test-user');
      
      // Should fall back to defaults
      expect(prefs.verbosity).toBe('normal');
      expect(prefs.formality).toBe('neutral');
      expect(prefs.responseStyle).toBe('balanced');
    });
  });
}); 