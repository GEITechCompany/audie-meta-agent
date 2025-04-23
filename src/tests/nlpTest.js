/**
 * NLP Service Test Utility
 * 
 * This script tests the enhanced entity extraction capabilities of the NlpService.
 * Run with: node src/tests/nlpTest.js
 */

const NlpService = require('../services/NlpService');
const logger = require('../utils/logger');

// Initialize NLP service
const nlpService = new NlpService();

// Test messages with various entity types
const testMessages = [
  {
    message: "Create a new task to finish the project proposal by next Friday at 5pm with high priority",
    intent: "task_create",
    description: "Task with date, time, and priority"
  },
  {
    message: "Schedule a meeting with John Smith in New York on April 15th at noon",
    intent: "task_create",
    description: "Task with person, location, date and specific time"
  },
  {
    message: "Remind me to call the doctor tomorrow morning",
    intent: "task_create",
    description: "Task with date and time period"
  },
  {
    message: "Add 'Submit quarterly report' to my tasks with medium priority for next Monday in the finance category",
    intent: "task_create",
    description: "Task with quoted title, priority, date and category"
  },
  {
    message: "Mark the website redesign task as in progress",
    intent: "task_update",
    description: "Task update with status change"
  },
  {
    message: "Show me all high priority tasks due this week",
    intent: "task_query",
    description: "Task query with priority and timeframe"
  },
  {
    message: "What meetings do I have scheduled at Conference Room B?",
    intent: "schedule_query",
    description: "Schedule query with location"
  },
  {
    message: "Check for any emails from john.doe@example.com",
    intent: "email_check",
    description: "Email check with sender filter"
  },
  {
    message: "Create a P1 task for the security audit tagged as project",
    intent: "task_create",
    description: "Task with P-level priority and category tag"
  },
  {
    message: "What's on my calendar for tomorrow afternoon in Seattle?",
    intent: "schedule_query",
    description: "Schedule query with date, time period and location"
  }
];

// Run tests
function runTests() {
  console.log('=== NLP Service Entity Extraction Tests ===\n');
  
  testMessages.forEach((test, index) => {
    console.log(`Test #${index + 1}: ${test.description}`);
    console.log(`Message: "${test.message}"`);
    
    // Detect intent (or use provided one)
    const detectedIntent = test.intent || nlpService.detectIntent(test.message);
    console.log(`Intent: ${detectedIntent}`);
    
    // Extract entities
    const entities = nlpService.extractEntities(test.message, detectedIntent);
    console.log('Extracted Entities:');
    console.log(JSON.stringify(entities, null, 2));
    
    console.log('\n---\n');
  });
}

// Run the tests
runTests(); 