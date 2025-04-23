/**
 * Estimate Generation Service
 * Generates estimates from tasks and other sources
 */

const { getDatabase } = require('../database');
const logger = require('../utils/logger');
const Estimate = require('../models/Estimate');
const Task = require('../models/Task');
const Client = require('../models/Client');
const EstimateTemplateService = require('./EstimateTemplateService');

class EstimateGenerationService {
  /**
   * Generate an estimate from selected tasks
   * @param {Object} data - Estimate generation data
   * @param {Array<number>} data.taskIds - IDs of tasks to include
   * @param {number} data.clientId - Client ID
   * @param {string} data.title - Estimate title
   * @param {string} data.description - Estimate description
   * @param {string} data.validUntil - Valid until date (ISO string)
   * @param {number} data.hourlyRate - Hourly rate for time-based tasks
   * @returns {Promise<Estimate>} The generated estimate
   */
  async generateFromTasks(data) {
    try {
      if (!data.taskIds || !Array.isArray(data.taskIds) || data.taskIds.length === 0) {
        throw new Error('No tasks selected for estimate generation');
      }
      
      if (!data.clientId) {
        throw new Error('Client ID is required');
      }
      
      // Verify client exists
      const client = await Client.getById(data.clientId);
      if (!client) {
        throw new Error(`Client with ID ${data.clientId} not found`);
      }
      
      // Get all selected tasks
      const tasks = await this.getTasksById(data.taskIds);
      
      if (tasks.length === 0) {
        throw new Error('No valid tasks found with the provided IDs');
      }
      
      // Generate line items from tasks
      const items = this.generateLineItemsFromTasks(tasks, data.hourlyRate || 100);
      
      // Calculate total
      const total = items.reduce((sum, item) => sum + item.amount, 0);
      
      // Create estimate
      const estimate = new Estimate({
        client_id: data.clientId,
        title: data.title || `Estimate for ${client.name}`,
        description: data.description || `Estimate generated from ${tasks.length} tasks`,
        status: 'draft',
        total_amount: total,
        valid_until: data.validUntil || this.getDefaultValidUntil(),
        items: items
      });
      
      // Save estimate
      return await estimate.save();
    } catch (error) {
      logger.error(`Error generating estimate from tasks: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get tasks by array of IDs
   * @param {Array<number>} taskIds - Task IDs
   * @returns {Promise<Array<Task>>} Array of tasks
   */
  async getTasksById(taskIds) {
    try {
      const tasks = [];
      
      for (const id of taskIds) {
        const task = await Task.findById(id);
        if (task) {
          tasks.push(task);
        }
      }
      
      return tasks;
    } catch (error) {
      logger.error(`Error getting tasks by IDs: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Generate line items from tasks
   * @param {Array<Task>} tasks - Tasks to convert to line items
   * @param {number} hourlyRate - Hourly rate for time-based tasks
   * @returns {Array<Object>} Line items
   */
  generateLineItemsFromTasks(tasks, hourlyRate) {
    const items = [];
    
    // Group tasks by priority to organize line items
    const tasksByPriority = {
      high: [],
      medium: [],
      low: []
    };
    
    // Group tasks
    tasks.forEach(task => {
      const priority = task.priority || 'medium';
      if (tasksByPriority[priority]) {
        tasksByPriority[priority].push(task);
      } else {
        tasksByPriority.medium.push(task);
      }
    });
    
    // Generate line items for each priority group
    Object.keys(tasksByPriority).forEach(priority => {
      const priorityTasks = tasksByPriority[priority];
      
      if (priorityTasks.length === 0) return;
      
      // Add header for the priority group if more than one priority is present
      if (Object.values(tasksByPriority).filter(group => group.length > 0).length > 1) {
        items.push({
          description: `${this.capitalizeFirstLetter(priority)} Priority Tasks`,
          quantity: 1,
          unit_price: 0,
          amount: 0,
          tax_rate: 0
        });
      }
      
      // Add individual tasks as line items
      priorityTasks.forEach(task => {
        const estimatedHours = this.estimateTaskHours(task);
        const amount = estimatedHours * hourlyRate;
        
        items.push({
          description: task.title,
          quantity: estimatedHours,
          unit_price: hourlyRate,
          amount: amount,
          tax_rate: 0
        });
      });
    });
    
    return items;
  }
  
  /**
   * Estimate hours required for a task based on its properties
   * @param {Task} task - Task to estimate
   * @returns {number} Estimated hours
   */
  estimateTaskHours(task) {
    let baseHours = 1; // Default base hours
    
    // Adjust based on priority
    switch (task.priority) {
      case 'high':
        baseHours *= 1.5;
        break;
      case 'low':
        baseHours *= 0.75;
        break;
      // medium is default
    }
    
    // Adjust based on description length (complexity indicator)
    if (task.description) {
      const wordCount = task.description.split(/\s+/).length;
      if (wordCount > 100) {
        baseHours *= 1.5;
      } else if (wordCount > 50) {
        baseHours *= 1.25;
      }
    }
    
    // Round to nearest 0.25
    return Math.round(baseHours * 4) / 4;
  }
  
  /**
   * Generate default valid until date (30 days from now)
   * @returns {string} ISO date string
   */
  getDefaultValidUntil() {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString();
  }
  
  /**
   * Capitalize first letter of a string
   * @param {string} string - String to capitalize
   * @returns {string} Capitalized string
   */
  capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  }
}

module.exports = new EstimateGenerationService(); 