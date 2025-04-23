/**
 * Client Controller
 * Handles client data operations and API endpoints
 */

const Client = require('../models/Client');
const Task = require('../models/Task');
const Invoice = require('../models/Invoice');
const Estimate = require('../models/Estimate');
const logger = require('../utils/logger');

class ClientController {
  /**
   * Get all clients with optional filtering and pagination
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async getAll(req, res) {
    try {
      const { search, page = 1, limit = 10 } = req.query;
      
      // Fetch all clients matching search
      const allClients = await Client.findAll(search || '');
      
      // Apply pagination
      const startIndex = (page - 1) * limit;
      const endIndex = page * limit;
      const paginatedClients = allClients.slice(startIndex, endIndex);
      
      // Build pagination metadata
      const totalClients = allClients.length;
      const totalPages = Math.ceil(totalClients / limit);
      
      const pagination = {
        total: totalClients,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: totalPages,
        hasNext: endIndex < totalClients,
        hasPrev: startIndex > 0
      };
      
      res.json({
        success: true,
        pagination,
        data: paginatedClients
      });
    } catch (error) {
      logger.error(`Error fetching clients: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: error.message
      });
    }
  }

  /**
   * Get a single client by ID with associated data
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      
      // Find client
      const client = await Client.getById(id);
      
      if (!client) {
        return res.status(404).json({
          success: false,
          error: 'not_found',
          message: 'Client not found'
        });
      }
      
      // Get summary counts of related data
      const tasks = await client.getTasks();
      const estimates = await client.getEstimates();
      const invoices = await client.getInvoices();
      
      // Get task statistics
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
      
      // Get invoice statistics
      const invoiceStats = {
        total: invoices.length,
        pending: invoices.filter(inv => inv.status === 'pending').length,
        paid: invoices.filter(inv => inv.status === 'paid').length,
        overdue: invoices.filter(inv => inv.status === 'overdue').length
      };
      
      res.json({
        success: true,
        data: {
          ...client,
          taskStats,
          invoiceStats,
          estimateCount: estimates.length
        }
      });
    } catch (error) {
      logger.error(`Error fetching client: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: error.message
      });
    }
  }

  /**
   * Create a new client
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async create(req, res) {
    try {
      const { name, email, phone, address, notes } = req.body;
      
      // Validate required fields
      if (!name) {
        return res.status(400).json({
          success: false,
          error: 'missing_fields',
          message: 'Name is required'
        });
      }
      
      // Check if email is already in use
      if (email) {
        const existingClient = await Client.findByEmail(email);
        
        if (existingClient) {
          return res.status(409).json({
            success: false,
            error: 'email_in_use',
            message: 'A client with this email already exists'
          });
        }
      }
      
      // Create client object
      const client = new Client({
        name,
        email: email || '',
        phone: phone || '',
        address: address || '',
        notes: notes || ''
      });
      
      // Save to database
      const savedClient = await client.save();
      
      logger.info(`Created new client: ${name} (ID: ${savedClient.id})`);
      
      res.status(201).json({
        success: true,
        message: 'Client created successfully',
        data: savedClient
      });
    } catch (error) {
      logger.error(`Error creating client: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: error.message
      });
    }
  }

  /**
   * Update an existing client
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const { name, email, phone, address, notes } = req.body;
      
      // Find client
      const client = await Client.getById(id);
      
      if (!client) {
        return res.status(404).json({
          success: false,
          error: 'not_found',
          message: 'Client not found'
        });
      }
      
      // Check email uniqueness if changed
      if (email && email !== client.email) {
        const existingClient = await Client.findByEmail(email);
        
        if (existingClient && existingClient.id !== client.id) {
          return res.status(409).json({
            success: false,
            error: 'email_in_use',
            message: 'A client with this email already exists'
          });
        }
      }
      
      // Update fields
      if (name) client.name = name;
      if (email !== undefined) client.email = email;
      if (phone !== undefined) client.phone = phone;
      if (address !== undefined) client.address = address;
      if (notes !== undefined) client.notes = notes;
      
      // Save changes
      const updatedClient = await client.save();
      
      logger.info(`Updated client ID ${updatedClient.id}`);
      
      res.json({
        success: true,
        message: 'Client updated successfully',
        data: updatedClient
      });
    } catch (error) {
      logger.error(`Error updating client: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: error.message
      });
    }
  }

  /**
   * Delete/archive a client
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      
      // Check if client exists
      const client = await Client.getById(id);
      
      if (!client) {
        return res.status(404).json({
          success: false,
          error: 'not_found',
          message: 'Client not found'
        });
      }
      
      // Delete client
      const result = await Client.delete(id);
      
      if (!result.deleted) {
        return res.status(400).json({
          success: false,
          error: 'delete_failed',
          message: 'Failed to delete client'
        });
      }
      
      logger.info(`Deleted client ID ${id}`);
      
      res.json({
        success: true,
        message: 'Client deleted successfully'
      });
    } catch (error) {
      logger.error(`Error deleting client: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: error.message
      });
    }
  }

  /**
   * Get tasks associated with a client
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async getTasks(req, res) {
    try {
      const { id } = req.params;
      const { status, priority, from_date, to_date } = req.query;
      
      // Check if client exists
      const client = await Client.getById(id);
      
      if (!client) {
        return res.status(404).json({
          success: false,
          error: 'not_found',
          message: 'Client not found'
        });
      }
      
      // Get all tasks for client
      let tasks = await client.getTasks();
      
      // Apply filters
      if (status) {
        tasks = tasks.filter(task => task.status === status);
      }
      
      if (priority) {
        tasks = tasks.filter(task => task.priority === priority);
      }
      
      if (from_date) {
        const fromDate = new Date(from_date);
        tasks = tasks.filter(task => new Date(task.created_at) >= fromDate);
      }
      
      if (to_date) {
        const toDate = new Date(to_date);
        tasks = tasks.filter(task => new Date(task.created_at) <= toDate);
      }
      
      res.json({
        success: true,
        count: tasks.length,
        data: tasks
      });
    } catch (error) {
      logger.error(`Error fetching client tasks: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: error.message
      });
    }
  }

  /**
   * Get invoices associated with a client
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async getInvoices(req, res) {
    try {
      const { id } = req.params;
      const { status, from_date, to_date } = req.query;
      
      // Check if client exists
      const client = await Client.getById(id);
      
      if (!client) {
        return res.status(404).json({
          success: false,
          error: 'not_found',
          message: 'Client not found'
        });
      }
      
      // Get all invoices for client
      let invoices = await client.getInvoices();
      
      // Convert to Invoice model instances for proper handling
      invoices = invoices.map(inv => new Invoice(inv));
      
      // Apply filters
      if (status) {
        invoices = invoices.filter(invoice => invoice.status === status);
      }
      
      if (from_date) {
        const fromDate = new Date(from_date);
        invoices = invoices.filter(invoice => new Date(invoice.created_at) >= fromDate);
      }
      
      if (to_date) {
        const toDate = new Date(to_date);
        invoices = invoices.filter(invoice => new Date(invoice.created_at) <= toDate);
      }
      
      res.json({
        success: true,
        count: invoices.length,
        data: invoices
      });
    } catch (error) {
      logger.error(`Error fetching client invoices: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: error.message
      });
    }
  }
}

module.exports = new ClientController(); 