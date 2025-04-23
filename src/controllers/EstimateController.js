/**
 * Estimate Controller
 * Handles estimate creation, management, and operations
 */

const Estimate = require('../models/Estimate');
const Client = require('../models/Client');
const logger = require('../utils/logger');
const EstimateTemplateService = require('../services/EstimateTemplateService');
const EstimateGenerationService = require('../services/EstimateGenerationService');

class EstimateController {
  /**
   * Create a new estimate
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async create(req, res) {
    try {
      const { 
        client_id, title, description, status, 
        total_amount, valid_until, items 
      } = req.body;
      
      // Validate required fields
      if (!client_id || !title) {
        return res.status(400).json({ 
          success: false, 
          error: 'missing_fields',
          message: 'Client ID and title are required' 
        });
      }
      
      // Verify client exists
      const client = await Client.getById(client_id);
      if (!client) {
        return res.status(404).json({ 
          success: false, 
          error: 'client_not_found',
          message: 'Client not found' 
        });
      }
      
      // Create new estimate
      const estimate = new Estimate({
        client_id,
        estimate_number: `EST-${Date.now()}`,
        title,
        description: description || '',
        status: status || 'draft',
        total_amount: total_amount || 0,
        valid_until: valid_until || null,
        items: items || []
      });
      
      // Save estimate
      const savedEstimate = await estimate.save();
      
      logger.info(`Created estimate ${savedEstimate.estimate_number} for client ${client_id}`);
      
      res.status(201).json({
        success: true,
        message: 'Estimate created successfully',
        data: savedEstimate
      });
    } catch (error) {
      logger.error(`Error creating estimate: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: error.message
      });
    }
  }
  
  /**
   * Get all estimates with optional filtering
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async getAll(req, res) {
    try {
      const { client_id, status, from_date, to_date } = req.query;
      
      // Build criteria object for filtering
      const criteria = {};
      if (client_id) criteria.client_id = client_id;
      if (status) criteria.status = status;
      if (from_date) criteria.from_date = from_date;
      if (to_date) criteria.to_date = to_date;
      
      // Get estimates
      const estimates = await Estimate.find(criteria);
      
      res.json({
        success: true,
        count: estimates.length,
        data: estimates
      });
    } catch (error) {
      logger.error(`Error getting estimates: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: error.message
      });
    }
  }
  
  /**
   * Get a single estimate by ID
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      
      // Get estimate with its line items
      const estimate = await Estimate.getById(id);
      
      if (!estimate) {
        return res.status(404).json({
          success: false,
          error: 'not_found',
          message: 'Estimate not found'
        });
      }
      
      res.json({
        success: true,
        data: estimate
      });
    } catch (error) {
      logger.error(`Error getting estimate: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: error.message
      });
    }
  }
  
  /**
   * Update an existing estimate
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const { 
        title, description, status, 
        total_amount, valid_until, items 
      } = req.body;
      
      // Get existing estimate
      const estimate = await Estimate.getById(id);
      
      if (!estimate) {
        return res.status(404).json({
          success: false,
          error: 'not_found',
          message: 'Estimate not found'
        });
      }
      
      // Update fields
      if (title !== undefined) estimate.title = title;
      if (description !== undefined) estimate.description = description;
      if (status !== undefined) estimate.status = status;
      if (total_amount !== undefined) estimate.total_amount = total_amount;
      if (valid_until !== undefined) estimate.valid_until = valid_until;
      if (items !== undefined) estimate.items = items;
      
      // Save updated estimate
      const updatedEstimate = await estimate.save();
      
      logger.info(`Updated estimate ${updatedEstimate.estimate_number}`);
      
      res.json({
        success: true,
        message: 'Estimate updated successfully',
        data: updatedEstimate
      });
    } catch (error) {
      logger.error(`Error updating estimate: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: error.message
      });
    }
  }
  
  /**
   * Delete an estimate
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      
      // Get estimate
      const estimate = await Estimate.getById(id);
      
      if (!estimate) {
        return res.status(404).json({
          success: false,
          error: 'not_found',
          message: 'Estimate not found'
        });
      }
      
      // Check if estimate can be deleted
      if (estimate.status === 'converted') {
        return res.status(400).json({
          success: false,
          error: 'invalid_operation',
          message: 'Cannot delete an estimate that has been converted to an invoice'
        });
      }
      
      // Delete estimate
      await estimate.delete();
      
      logger.info(`Deleted estimate ${estimate.estimate_number}`);
      
      res.json({
        success: true,
        message: 'Estimate deleted successfully'
      });
    } catch (error) {
      logger.error(`Error deleting estimate: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: error.message
      });
    }
  }
  
  /**
   * Convert estimate to invoice
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async convertToInvoice(req, res) {
    try {
      const { id } = req.params;
      const { due_date } = req.body;
      
      // Get estimate
      const estimate = await Estimate.getById(id);
      
      if (!estimate) {
        return res.status(404).json({
          success: false,
          error: 'not_found',
          message: 'Estimate not found'
        });
      }
      
      // Check if estimate can be converted
      if (estimate.status !== 'approved') {
        return res.status(400).json({
          success: false,
          error: 'invalid_operation',
          message: 'Only approved estimates can be converted to invoices'
        });
      }
      
      // Set due date if provided
      if (due_date) {
        estimate.due_date = due_date;
      }
      
      // Convert to invoice
      const invoice = await estimate.convertToInvoice();
      
      logger.info(`Converted estimate ${estimate.estimate_number} to invoice ${invoice.invoice_number}`);
      
      res.json({
        success: true,
        message: 'Estimate converted to invoice successfully',
        data: {
          estimate: estimate,
          invoice: invoice
        }
      });
    } catch (error) {
      logger.error(`Error converting estimate to invoice: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: error.message
      });
    }
  }
  
  /**
   * Update estimate status
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      // Validate status
      if (!status || !['draft', 'sent', 'approved', 'declined'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'invalid_status',
          message: 'Invalid status value'
        });
      }
      
      // Get estimate
      const estimate = await Estimate.getById(id);
      
      if (!estimate) {
        return res.status(404).json({
          success: false,
          error: 'not_found',
          message: 'Estimate not found'
        });
      }
      
      // Cannot change status of converted estimates
      if (estimate.status === 'converted') {
        return res.status(400).json({
          success: false,
          error: 'invalid_operation',
          message: 'Cannot change the status of a converted estimate'
        });
      }
      
      // Update status
      estimate.status = status;
      const updatedEstimate = await estimate.save();
      
      logger.info(`Updated estimate ${estimate.estimate_number} status to ${status}`);
      
      res.json({
        success: true,
        message: 'Estimate status updated successfully',
        data: updatedEstimate
      });
    } catch (error) {
      logger.error(`Error updating estimate status: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: error.message
      });
    }
  }

  /**
   * Get available estimate templates
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async getTemplates(req, res) {
    try {
      const templates = EstimateTemplateService.getTemplateTypes();
      
      res.json({
        success: true,
        count: templates.length,
        data: templates
      });
    } catch (error) {
      logger.error(`Error getting estimate templates: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: error.message
      });
    }
  }
  
  /**
   * Generate estimate from template
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async generateFromTemplate(req, res) {
    try {
      const { 
        template_id, client_id, title, description, 
        valid_until, hourly_rate 
      } = req.body;
      
      // Validate required fields
      if (!template_id || !client_id) {
        return res.status(400).json({
          success: false,
          error: 'missing_fields',
          message: 'Template ID and client ID are required'
        });
      }
      
      // Generate estimate from template
      const estimate = await EstimateTemplateService.generateEstimateFromTemplate(template_id, {
        client_id: client_id,
        title: title,
        description: description,
        valid_until: valid_until,
        hourlyRate: hourly_rate
      });
      
      logger.info(`Generated estimate ${estimate.estimate_number} from template ${template_id}`);
      
      res.status(201).json({
        success: true,
        message: 'Estimate generated successfully from template',
        data: estimate
      });
    } catch (error) {
      logger.error(`Error generating estimate from template: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: error.message
      });
    }
  }
  
  /**
   * Generate estimate from tasks
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async generateFromTasks(req, res) {
    try {
      const { 
        task_ids, client_id, title, description, 
        valid_until, hourly_rate 
      } = req.body;
      
      // Validate required fields
      if (!task_ids || !Array.isArray(task_ids) || task_ids.length === 0 || !client_id) {
        return res.status(400).json({
          success: false,
          error: 'missing_fields',
          message: 'Task IDs array and client ID are required'
        });
      }
      
      // Generate estimate from tasks
      const estimate = await EstimateGenerationService.generateFromTasks({
        taskIds: task_ids,
        clientId: client_id,
        title: title,
        description: description,
        validUntil: valid_until,
        hourlyRate: hourly_rate
      });
      
      logger.info(`Generated estimate ${estimate.estimate_number} from ${task_ids.length} tasks`);
      
      res.status(201).json({
        success: true,
        message: 'Estimate generated successfully from tasks',
        data: estimate
      });
    } catch (error) {
      logger.error(`Error generating estimate from tasks: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: error.message
      });
    }
  }
}

module.exports = new EstimateController(); 