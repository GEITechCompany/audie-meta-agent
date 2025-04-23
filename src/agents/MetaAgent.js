const logger = require('../utils/logger');
const Task = require('../models/Task');
const SchedulerAgent = require('./SchedulerAgent');
const InboxAgent = require('./InboxAgent');
const nlpService = require('../services/NlpService');
const conversationContext = require('../services/ConversationContextManager');
const nlgService = require('../services/NlgService');

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
   * @param {object} userInfo - User information including ID
   * @returns {Promise<object>} Response object with message and actions
   */
  async processMessage(message, userInfo = {}) {
    try {
      const userId = userInfo.userId || 'default';
      logger.info(`Processing message for user ${userId}: "${message.substring(0, 50)}..."`);
      
      // Check for conversation context and resolve references
      const { resolvedMessage, references } = conversationContext.resolveReferences(userId, message);
      
      // Analyze intent with NLP service
      const intent = nlpService.detectIntent(resolvedMessage, userId);
      logger.info(`Detected intent: ${intent.type} with confidence ${intent.confidence}`);
      
      // Check if clarification is needed
      const clarification = conversationContext.checkForClarification(userId, resolvedMessage, intent);
      if (clarification && clarification.needed) {
        // Add clarification request to conversation context
        conversationContext.addMessage(userId, 'system', clarification.message, {
          clarification: true,
          intent: intent
        });
        
        return {
          message: clarification.message,
          actions: [],
          needsMoreInfo: true
        };
      }
      
      // Store conversation context
      conversationContext.addMessage(userId, 'user', message, {
        intent: intent.type,
        entities: intent.data,
        resolvedReferences: references
      });
      
      // Route to appropriate handler based on intent
      let response;
      switch (intent.type) {
        case 'task_create':
          response = await this.handleTaskCreation(intent.data, userId);
          break;
        case 'task_query':
          response = await this.handleTaskQuery(intent.data, userId);
          break;
        case 'task_update':
          response = await this.handleTaskUpdate(intent.data, userId);
          break;
        case 'task_delete':
          response = await this.handleTaskDeletion(intent.data, userId);
          break;
        case 'schedule_query':
          response = await this.schedulerAgent.getSchedule(intent.data, userId);
          break;
        case 'email_check':
          response = await this.inboxAgent.checkEmails(intent.data, userId);
          break;
        case 'client_create':
          response = await this.handleClientCreation(intent.data, userId);
          break;
        case 'client_query':
          response = await this.handleClientQuery(intent.data, userId);
          break;
        case 'client_update':
          response = await this.handleClientUpdate(intent.data, userId);
          break;
        case 'client_delete':
          response = await this.handleClientDeletion(intent.data, userId);
          break;
        default:
          response = {
            message: nlgService.generateResponse('error', { error: 'not_understood' }, {
              category: 'not_understood',
              userId
            }),
            actions: []
          };
      }
      
      // Store agent response in conversation context
      conversationContext.addMessage(userId, 'system', response.message, {
        intent: intent.type,
        result: response,
        options: response.options
      });
      
      return response;
    } catch (error) {
      logger.error(`Error processing message: ${error.message}`, { error });
      return {
        message: nlgService.generateResponse('error', { error: error.message }, {
          category: 'general'
        }),
        error: error.message,
        actions: []
      };
    }
  }

  /**
   * Handle task creation requests
   * @param {object} data - Extracted task data
   * @param {string} userId - User ID
   * @returns {Promise<object>} Response object
   */
  async handleTaskCreation(data, userId) {
    try {
      // Validate required fields
      if (!data.title) {
        return {
          message: nlgService.generateResponse('clarification', { missing: 'a title for the task' }, {
            category: 'missing_info',
            userId
          }),
          actions: []
        };
      }
      
      const taskData = {
        title: data.title,
        priority: data.priority || 'medium',
        due_date: data.date || null,
        status: 'pending',
        source: 'chat',
        user_id: userId !== 'default' ? userId : null
      };
      
      // Add client information if provided
      if (data.client) {
        // Try to find the client by name
        const Client = require('../models/Client');
        const clients = await Client.findAll(data.client);
        
        if (clients && clients.length > 0) {
          // Use the first matching client
          taskData.client_id = clients[0].id;
        }
      }
      
      // Create task in database
      const task = new Task(taskData);
      const savedTask = await task.save();
      
      return {
        message: nlgService.generateResponse('task_create', { title: task.title }, {
          category: 'success',
          userId
        }),
        actions: [
          {
            type: 'task_created',
            task
          }
        ]
      };
    } catch (error) {
      logger.error(`Error creating task: ${error.message}`, { error });
      return {
        message: nlgService.generateResponse('task_create', { error: error.message }, {
          category: 'error',
          userId
        }),
        error: error.message,
        actions: []
      };
    }
  }

  /**
   * Handle task query requests
   * @param {object} data - Query filters
   * @param {string} userId - User ID
   * @returns {Promise<object>} Response with matching tasks
   */
  async handleTaskQuery(data, userId) {
    try {
      // Apply filters from NLP extraction
      const filters = data.filters || {};
      
      // Add user filter for multi-user systems
      if (userId !== 'default') {
        filters.user_id = userId;
      }
      
      // Handle client-based filtering if specified
      if (data.filters && data.filters.client) {
        try {
          // Try to find the client by name
          const Client = require('../models/Client');
          const clients = await Client.findAll(data.filters.client);
          
          if (clients && clients.length > 0) {
            // Use the first matching client
            filters.client_id = clients[0].id;
          }
        } catch (error) {
          logger.warn(`Error finding client for task filtering: ${error.message}`);
          // Continue without client filtering if there's an error
        }
      }
      
      // Query tasks from database
      const tasks = await Task.findAll(filters);
      
      if (tasks.length === 0) {
        return {
          message: nlgService.generateResponse('task_query', {}, {
            category: 'success_empty',
            userId
          }),
          actions: []
        };
      }
      
      return {
        message: nlgService.generateResponse('task_query', { task_list: tasks }, {
          category: 'success_with_tasks',
          userId
        }),
        actions: [
          {
            type: 'tasks_fetched',
            tasks
          }
        ]
      };
    } catch (error) {
      logger.error(`Error querying tasks: ${error.message}`, { error });
      return {
        message: nlgService.generateResponse('task_query', { error: error.message }, {
          category: 'error',
          userId
        }),
        error: error.message,
        actions: []
      };
    }
  }

  /**
   * Handle task update requests
   * @param {object} data - Update data
   * @param {string} userId - User ID
   * @returns {Promise<object>} Response object
   */
  async handleTaskUpdate(data, userId) {
    try {
      // Get task title from data or context
      const title = data.title;
      
      if (!title) {
        return {
          message: nlgService.generateResponse('clarification', { missing: 'which task to update' }, {
            category: 'missing_info',
            userId
          }),
          actions: []
        };
      }
      
      // Find the task
      const filters = { title: { $like: `%${title}%` } };
      if (userId !== 'default') {
        filters.user_id = userId;
      }
      
      const tasks = await Task.findAll(filters);
      
      if (tasks.length === 0) {
        return {
          message: nlgService.generateResponse('task_update', { error: `No task found matching "${title}"` }, {
            category: 'error',
            userId
          }),
          actions: []
        };
      }
      
      if (tasks.length > 1) {
        // Multiple tasks found, ask for clarification
        return {
          message: nlgService.generateResponse('clarification', { 
            options: tasks.map(t => t.title)
          }, {
            category: 'options',
            userId
          }),
          actions: [],
          options: tasks
        };
      }
      
      // Update the task
      const task = tasks[0];
      const updateData = {};
      
      if (data.priority) updateData.priority = data.priority;
      if (data.status) updateData.status = data.status;
      if (data.date) updateData.due_date = data.date;
      
      if (Object.keys(updateData).length === 0) {
        return {
          message: nlgService.generateResponse('clarification', { missing: 'what to update about the task' }, {
            category: 'missing_info',
            userId
          }),
          actions: []
        };
      }
      
      await task.update(updateData);
      
      return {
        message: nlgService.generateResponse('task_update', { title: task.title }, {
          category: 'success',
          userId
        }),
        actions: [
          {
            type: 'task_updated',
            task
          }
        ]
      };
    } catch (error) {
      logger.error(`Error updating task: ${error.message}`, { error });
      return {
        message: nlgService.generateResponse('task_update', { error: error.message }, {
          category: 'error',
          userId
        }),
        error: error.message,
        actions: []
      };
    }
  }

  /**
   * Handle task deletion requests
   * @param {object} data - Task data
   * @param {string} userId - User ID
   * @returns {Promise<object>} Response object
   */
  async handleTaskDeletion(data, userId) {
    try {
      // Get task title from data or context
      const title = data.title;
      
      if (!title) {
        return {
          message: nlgService.generateResponse('clarification', { missing: 'which task to delete' }, {
            category: 'missing_info',
            userId
          }),
          actions: []
        };
      }
      
      // Find the task
      const filters = { title: { $like: `%${title}%` } };
      if (userId !== 'default') {
        filters.user_id = userId;
      }
      
      const tasks = await Task.findAll(filters);
      
      if (tasks.length === 0) {
        return {
          message: nlgService.generateResponse('task_delete', { error: `No task found matching "${title}"` }, {
            category: 'error',
            userId
          }),
          actions: []
        };
      }
      
      if (tasks.length > 1) {
        // Multiple tasks found, ask for clarification
        return {
          message: nlgService.generateResponse('clarification', { 
            options: tasks.map(t => t.title)
          }, {
            category: 'options',
            userId
          }),
          actions: [],
          options: tasks
        };
      }
      
      // Delete the task
      const task = tasks[0];
      const taskTitle = task.title;
      await task.delete();
      
      return {
        message: nlgService.generateResponse('task_delete', { title: taskTitle }, {
          category: 'success',
          userId
        }),
        actions: [
          {
            type: 'task_deleted',
            taskId: task.id
          }
        ]
      };
    } catch (error) {
      logger.error(`Error deleting task: ${error.message}`, { error });
      return {
        message: nlgService.generateResponse('task_delete', { error: error.message }, {
          category: 'error',
          userId
        }),
        error: error.message,
        actions: []
      };
    }
  }

  /**
   * Handle client creation requests
   * @param {object} data - Extracted client data
   * @param {string} userId - User ID
   * @returns {Promise<object>} Response object
   */
  async handleClientCreation(data, userId) {
    try {
      // Validate required fields
      if (!data.name) {
        return {
          message: nlgService.generateResponse('client_create', {}, {
            category: 'missing_info',
            userId
          }),
          actions: []
        };
      }
      
      // Create client object
      const Client = require('../models/Client');
      const client = new Client({
        name: data.name,
        // Other fields can be added in follow-up conversations
        user_id: userId !== 'default' ? userId : null
      });
      
      // Save to database
      const savedClient = await client.save();
      
      return {
        message: nlgService.generateResponse('client_create', { name: client.name }, {
          category: 'success',
          userId
        }),
        actions: [
          {
            type: 'client_created',
            client: savedClient
          }
        ]
      };
    } catch (error) {
      logger.error(`Error creating client: ${error.message}`, { error });
      return {
        message: nlgService.generateResponse('client_create', { error: error.message, name: data.name }, {
          category: 'error',
          userId
        }),
        error: error.message,
        actions: []
      };
    }
  }

  /**
   * Handle client query requests
   * @param {object} data - Query parameters
   * @param {string} userId - User ID
   * @returns {Promise<object>} Response with matching clients
   */
  async handleClientQuery(data, userId) {
    try {
      const Client = require('../models/Client');
      
      // If a specific client name is provided, get that client
      if (data.name) {
        // Try to find client by name
        const clients = await Client.findAll(data.name);
        
        if (!clients || clients.length === 0) {
          return {
            message: nlgService.generateResponse('client_query', { name: data.name }, {
              category: 'not_found',
              userId
            }),
            actions: []
          };
        }
        
        // Get first matching client
        const client = clients[0];
        
        // Get client stats
        const tasks = await client.getTasks();
        const invoices = await client.getInvoices();
        
        // Calculate task statistics
        const taskStats = {
          total: tasks.length,
          pending: tasks.filter(task => task.status === 'pending').length,
          completed: tasks.filter(task => task.status === 'completed').length,
          overdue: tasks.filter(task => {
            return task.status !== 'completed' && 
                   task.due_date && 
                   new Date(task.due_date) < new Date();
          }).length
        };
        
        // Calculate invoice statistics
        const invoiceStats = {
          total: invoices.length,
          pending: invoices.filter(inv => inv.status === 'pending').length,
          paid: invoices.filter(inv => inv.status === 'paid').length,
          overdue: invoices.filter(inv => inv.status === 'overdue').length
        };
        
        // Format client details with stats
        const clientDetails = {
          ...client,
          taskStats,
          invoiceStats
        };
        
        return {
          message: nlgService.generateResponse('client_query', { name: client.name }, {
            category: 'success_single',
            userId
          }) + `\n\nName: ${client.name}\nEmail: ${client.email || 'Not provided'}\nPhone: ${client.phone || 'Not provided'}\nAddress: ${client.address || 'Not provided'}\n\nTasks: ${taskStats.total} (${taskStats.pending} pending, ${taskStats.completed} completed)\nInvoices: ${invoiceStats.total} (${invoiceStats.pending} pending, ${invoiceStats.paid} paid)`,
          actions: [
            {
              type: 'client_fetched',
              client: clientDetails
            }
          ]
        };
      } else {
        // Get all clients
        const clients = await Client.findAll();
        
        if (clients.length === 0) {
          return {
            message: nlgService.generateResponse('client_query', {}, {
              category: 'success_empty',
              userId
            }),
            actions: []
          };
        }
        
        // Format client list
        const clientList = clients.map(client => client.name).join(', ');
        
        return {
          message: nlgService.generateResponse('client_query', { client_list: clientList }, {
            category: 'success_with_clients',
            userId
          }),
          actions: [
            {
              type: 'clients_fetched',
              clients
            }
          ]
        };
      }
    } catch (error) {
      logger.error(`Error querying clients: ${error.message}`, { error });
      return {
        message: nlgService.generateResponse('client_query', { error: error.message }, {
          category: 'error',
          userId
        }),
        error: error.message,
        actions: []
      };
    }
  }

  /**
   * Handle client update requests
   * @param {object} data - Client update data
   * @param {string} userId - User ID
   * @returns {Promise<object>} Response object
   */
  async handleClientUpdate(data, userId) {
    try {
      // Validate required fields
      if (!data.name) {
        return {
          message: nlgService.generateResponse('clarification', { missing: 'which client to update' }, {
            category: 'missing_info',
            userId
          }),
          actions: []
        };
      }
      
      // Find the client
      const Client = require('../models/Client');
      const clients = await Client.findAll(data.name);
      
      if (!clients || clients.length === 0) {
        return {
          message: nlgService.generateResponse('client_update', { name: data.name }, {
            category: 'not_found',
            userId
          }),
          actions: []
        };
      }
      
      if (clients.length > 1) {
        // Multiple clients found, ask for clarification
        const clientNames = clients.map(c => c.name);
        return {
          message: nlgService.generateResponse('clarification', { 
            options: clientNames
          }, {
            category: 'options',
            userId
          }),
          actions: [],
          options: clients
        };
      }
      
      // Update the client
      const client = clients[0];
      
      // Store information for updates in follow-up conversations
      return {
        message: nlgService.generateResponse('client_update', { name: client.name }, {
          category: 'success',
          userId
        }),
        actions: [
          {
            type: 'client_updated',
            client
          }
        ]
      };
    } catch (error) {
      logger.error(`Error updating client: ${error.message}`, { error });
      return {
        message: nlgService.generateResponse('client_update', { error: error.message }, {
          category: 'error',
          userId
        }),
        error: error.message,
        actions: []
      };
    }
  }

  /**
   * Handle client deletion requests
   * @param {object} data - Client data
   * @param {string} userId - User ID
   * @returns {Promise<object>} Response object
   */
  async handleClientDeletion(data, userId) {
    try {
      // Validate required fields
      if (!data.name) {
        return {
          message: nlgService.generateResponse('clarification', { missing: 'which client to delete' }, {
            category: 'missing_info',
            userId
          }),
          actions: []
        };
      }
      
      // Find the client
      const Client = require('../models/Client');
      const clients = await Client.findAll(data.name);
      
      if (!clients || clients.length === 0) {
        return {
          message: nlgService.generateResponse('client_delete', { name: data.name }, {
            category: 'not_found',
            userId
          }),
          actions: []
        };
      }
      
      if (clients.length > 1) {
        // Multiple clients found, ask for clarification
        const clientNames = clients.map(c => c.name);
        return {
          message: nlgService.generateResponse('clarification', { 
            options: clientNames
          }, {
            category: 'options',
            userId
          }),
          actions: [],
          options: clients
        };
      }
      
      // Delete the client
      const client = clients[0];
      const result = await Client.delete(client.id);
      
      if (!result.deleted) {
        return {
          message: nlgService.generateResponse('client_delete', { 
            error: 'The client could not be deleted',
            name: client.name 
          }, {
            category: 'error',
            userId
          }),
          actions: []
        };
      }
      
      return {
        message: nlgService.generateResponse('client_delete', { name: client.name }, {
          category: 'success',
          userId
        }),
        actions: [
          {
            type: 'client_deleted',
            client
          }
        ]
      };
    } catch (error) {
      logger.error(`Error deleting client: ${error.message}`, { error });
      return {
        message: nlgService.generateResponse('client_delete', { error: error.message }, {
          category: 'error',
          userId
        }),
        error: error.message,
        actions: []
      };
    }
  }
}

module.exports = MetaAgent; 