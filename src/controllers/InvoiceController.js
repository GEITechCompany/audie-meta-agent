/**
 * Invoice Controller
 * Handles invoice creation, management, and operations
 */

const Invoice = require('../models/Invoice');
const Client = require('../models/Client');
const logger = require('../utils/logger');
const ClientService = require('../services/ClientService');
const PaymentService = require('../services/PaymentService');
const InvoiceNumberingService = require('../services/InvoiceNumberingService');
const RecurringInvoiceService = require('../services/RecurringInvoiceService');
const OverdueInvoiceService = require('../services/OverdueInvoiceService');
const paymentTrackerService = require('../services/PaymentTrackerService');
const { validateRequiredFields } = require('../utils/validation');
const PaymentTrackingService = require('../services/PaymentTrackingService');
const EmailService = require('../services/EmailService');
const NotificationService = require('../services/NotificationService');
const InvoicePaymentService = require('../services/InvoicePaymentService');

class InvoiceController {
  /**
   * Create a new invoice
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async create(req, res) {
    try {
      // Validate required fields
      const requiredFields = ['client_id', 'title', 'due_date', 'items'];
      const missingFields = requiredFields.filter(field => !req.body[field]);
      
      if (missingFields.length > 0) {
        return res.status(400).json({ 
          success: false, 
          message: `Missing required fields: ${missingFields.join(', ')}` 
        });
      }

      // Check if client exists
      const client = await Client.findById(req.body.client_id);
      if (!client) {
        return res.status(404).json({ 
          success: false, 
          message: 'Client not found' 
        });
      }

      // Generate invoice number if not provided
      let invoiceData = { ...req.body };
      if (!invoiceData.invoice_number) {
        const invoiceNumberResult = await InvoiceNumberingService.generateInvoiceNumber();
        if (invoiceNumberResult.success) {
          invoiceData.invoice_number = invoiceNumberResult.invoice_number;
        } else {
          logger.warn('InvoiceController: Failed to generate invoice number, using fallback');
          // Fallback to simple auto-incrementing number
          invoiceData.invoice_number = null; // Let the Invoice model handle it
        }
      }

      // Create new invoice
      const invoice = new Invoice(invoiceData);
      await invoice.save();

      // Return the created invoice
      return res.status(201).json({ 
        success: true, 
        message: 'Invoice created successfully', 
        data: invoice 
      });
    } catch (error) {
      logger.error('InvoiceController: Error creating invoice', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to create invoice', 
        error: error.message 
      });
    }
  }
  
  /**
   * Get all invoices with optional filtering
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async getAll(req, res) {
    try {
      const { 
        client_id, status, estimate_id, 
        from_date, to_date, due_before, due_after 
      } = req.query;
      
      // Build criteria object for filtering
      const criteria = {};
      if (client_id) criteria.client_id = client_id;
      if (status) criteria.status = status;
      if (estimate_id) criteria.estimate_id = estimate_id;
      if (from_date) criteria.from_date = from_date;
      if (to_date) criteria.to_date = to_date;
      if (due_before) criteria.due_before = due_before;
      if (due_after) criteria.due_after = due_after;
      
      // Get invoices
      const invoices = await Invoice.find(criteria);
      
      res.json({
        success: true,
        count: invoices.length,
        data: invoices
      });
    } catch (error) {
      logger.error(`Error getting invoices: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: error.message
      });
    }
  }
  
  /**
   * Get a single invoice by ID
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      
      // Get invoice with its line items and payments
      const invoice = await Invoice.getById(id);
      
      if (!invoice) {
        return res.status(404).json({
          success: false,
          error: 'not_found',
          message: 'Invoice not found'
        });
      }
      
      res.json({
        success: true,
        data: invoice
      });
    } catch (error) {
      logger.error(`Error getting invoice: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: error.message
      });
    }
  }
  
  /**
   * Update an existing invoice
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const { 
        title, description, status, 
        total_amount, due_date, items 
      } = req.body;
      
      // Get existing invoice
      const invoice = await Invoice.getById(id);
      
      if (!invoice) {
        return res.status(404).json({
          success: false,
          error: 'not_found',
          message: 'Invoice not found'
        });
      }
      
      // Don't allow updating paid invoices
      if (invoice.status === 'paid') {
        return res.status(400).json({
          success: false,
          error: 'invalid_operation',
          message: 'Cannot update a paid invoice'
        });
      }
      
      // Update fields
      if (title !== undefined) invoice.title = title;
      if (description !== undefined) invoice.description = description;
      if (status !== undefined) invoice.status = status;
      if (total_amount !== undefined) invoice.total_amount = total_amount;
      if (due_date !== undefined) invoice.due_date = due_date;
      if (items !== undefined) invoice.items = items;
      
      // Save updated invoice
      const updatedInvoice = await invoice.save();
      
      logger.info(`Updated invoice ${updatedInvoice.invoice_number}`);
      
      res.json({
        success: true,
        message: 'Invoice updated successfully',
        data: updatedInvoice
      });
    } catch (error) {
      logger.error(`Error updating invoice: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: error.message
      });
    }
  }
  
  /**
   * Delete an invoice (only allowed for pending invoices)
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      
      // Get invoice
      const invoice = await Invoice.getById(id);
      
      if (!invoice) {
        return res.status(404).json({
          success: false,
          error: 'not_found',
          message: 'Invoice not found'
        });
      }
      
      // Only allow deleting pending invoices
      if (invoice.status !== 'pending') {
        return res.status(400).json({
          success: false,
          error: 'invalid_operation',
          message: 'Only pending invoices can be deleted'
        });
      }
      
      // Delete invoice
      await invoice.delete();
      
      logger.info(`Deleted invoice ${invoice.invoice_number}`);
      
      res.json({
        success: true,
        message: 'Invoice deleted successfully'
      });
    } catch (error) {
      logger.error(`Error deleting invoice: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: error.message
      });
    }
  }
  
  /**
   * Record a payment for an invoice
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async recordPayment(req, res) {
    try {
      const { invoice_id } = req.params;
      const { amount, payment_method, reference_number, notes, payment_date } = req.body;

      // Validate required fields
      if (!amount || amount <= 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Payment amount must be greater than zero' 
        });
      }

      // Add the authenticated user's ID as created_by if available
      const created_by = req.user ? req.user.id : null;

      // Use the payment service to record the payment
      const result = await InvoicePaymentService.recordPayment({
        invoice_id,
        amount,
        payment_method,
        reference_number,
        notes,
        payment_date,
        created_by
      });

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.status(200).json(result);
    } catch (error) {
      logger.error('InvoiceController: Error recording payment', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to record payment', 
        error: error.message 
      });
    }
  }
  
  /**
   * Get all payments for an invoice
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async getPayments(req, res) {
    try {
      const { id } = req.params;
      
      const payments = await PaymentTrackingService.getPayments(id);
      
      return res.status(200).json(payments);
    } catch (error) {
      logger.error(`Error getting payments: ${error.message}`);
      return res.status(500).json({ error: error.message });
    }
  }
  
  /**
   * Send invoice to client
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async sendToClient(req, res) {
    try {
      const { id } = req.params;
      
      // Get invoice
      const invoice = await Invoice.getById(id);
      
      if (!invoice) {
        return res.status(404).json({
          success: false,
          error: 'not_found',
          message: 'Invoice not found'
        });
      }
      
      // Send invoice
      await invoice.sendToClient();
      
      logger.info(`Sent invoice ${invoice.invoice_number} to client`);
      
      res.json({
        success: true,
        message: 'Invoice sent successfully',
        data: invoice
      });
    } catch (error) {
      logger.error(`Error sending invoice: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: error.message
      });
    }
  }
  
  /**
   * Mark invoice as paid
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async markAsPaid(req, res) {
    try {
      const { id } = req.params;
      const { payment_method, notes, transaction_id } = req.body;
      
      // Get invoice
      const invoice = await Invoice.getById(id);
      
      if (!invoice) {
        return res.status(404).json({
          success: false,
          error: 'not_found',
          message: 'Invoice not found'
        });
      }
      
      // Mark as paid with optional payment details
      const updatedInvoice = await invoice.markAsPaid({
        amount: invoice.total_amount - invoice.amount_paid,
        payment_method: payment_method || 'other',
        notes: notes || 'Marked as paid',
        transaction_id: transaction_id || null
      });
      
      logger.info(`Marked invoice ${invoice.invoice_number} as paid`);
      
      res.json({
        success: true,
        message: 'Invoice marked as paid',
        data: updatedInvoice
      });
    } catch (error) {
      logger.error(`Error marking invoice as paid: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: error.message
      });
    }
  }
  
  /**
   * Get invoice summary
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async getSummary(req, res) {
    try {
      const summary = await Invoice.generateSummary();
      
      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      logger.error(`Error getting invoice summary: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: error.message
      });
    }
  }
  
  /**
   * Get overdue invoices
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async getOverdue(req, res) {
    try {
      const overdueInvoices = await OverdueInvoiceService.getOverdueInvoices();
      
      return res.status(200).json({ data: overdueInvoices });
    } catch (error) {
      logger.error('Error getting overdue invoices:', error);
      return res.status(500).json({ error: 'Failed to retrieve overdue invoices' });
    }
  }

  // New methods for enhanced invoice management

  async getInvoiceWithPayments(req, res) {
    try {
      const { id } = req.params;
      
      const invoice = await Invoice.findById(id);
      
      if (!invoice) {
        return res.status(404).json({
          success: false,
          message: 'Invoice not found',
        });
      }
      
      const payments = await PaymentService.getPaymentsForInvoice(id);
      const reminders = await OverdueInvoiceService.getRemindersForInvoice(id);
      
      return res.status(200).json({
        success: true,
        data: {
          invoice,
          payments,
          reminders
        },
      });
    } catch (error) {
      logger.error(`Error getting invoice with payments: ${error.message}`);
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  async deletePayment(req, res) {
    try {
      const { payment_id } = req.params;

      const result = await InvoicePaymentService.deletePayment(payment_id);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.status(200).json(result);
    } catch (error) {
      logger.error('InvoiceController: Error deleting payment', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to delete payment', 
        error: error.message 
      });
    }
  }

  async getPaymentMethods(req, res) {
    try {
      const methods = await InvoicePaymentService.getPaymentMethods();
      
      return res.status(200).json({ 
        success: true, 
        data: methods 
      });
    } catch (error) {
      logger.error('InvoiceController: Error getting payment methods', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to get payment methods', 
        error: error.message 
      });
    }
  }

  async addPaymentMethod(req, res) {
    try {
      const methodData = req.body;
      
      const result = await InvoicePaymentService.addPaymentMethod(methodData);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.status(201).json(result);
    } catch (error) {
      logger.error('InvoiceController: Error adding payment method', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to add payment method', 
        error: error.message 
      });
    }
  }

  async updatePayment(req, res) {
    try {
      const { payment_id } = req.params;
      const updateData = req.body;

      const result = await InvoicePaymentService.updatePayment(payment_id, updateData);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.status(200).json(result);
    } catch (error) {
      logger.error('InvoiceController: Error updating payment', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to update payment', 
        error: error.message 
      });
    }
  }

  async getPaymentsByInvoiceId(req, res) {
    try {
      const { invoice_id } = req.params;
      
      // Verify invoice exists
      const invoice = await Invoice.findById(invoice_id);
      if (!invoice) {
        return res.status(404).json({ 
          success: false, 
          message: 'Invoice not found' 
        });
      }

      const payments = await InvoicePaymentService.getPaymentsByInvoiceId(invoice_id);
      
      return res.status(200).json({ 
        success: true, 
        data: payments 
      });
    } catch (error) {
      logger.error('InvoiceController: Error getting invoice payments', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to get invoice payments', 
        error: error.message 
      });
    }
  }

  async getPaymentStatistics(req, res) {
    try {
      const filters = req.query;
      
      const statistics = await InvoicePaymentService.getPaymentStatistics(filters);
      
      return res.status(200).json({ 
        success: true, 
        data: statistics 
      });
    } catch (error) {
      logger.error('InvoiceController: Error getting payment statistics', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to get payment statistics', 
        error: error.message 
      });
    }
  }

  // Recurring invoice methods
  async createRecurringInvoice(req, res) {
    try {
      const result = await RecurringInvoiceService.create(req.body);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.status(201).json(result);
    } catch (error) {
      logger.error('InvoiceController: Error creating recurring invoice', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to create recurring invoice', 
        error: error.message 
      });
    }
  }

  async getRecurringInvoices(req, res) {
    try {
      const filters = req.query;
      
      const invoices = await RecurringInvoiceService.getAll(filters);
      
      return res.status(200).json({ 
        success: true, 
        data: invoices 
      });
    } catch (error) {
      logger.error('InvoiceController: Error getting recurring invoices', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to get recurring invoices', 
        error: error.message 
      });
    }
  }

  async getRecurringInvoiceById(req, res) {
    try {
      const { id } = req.params;
      
      const invoice = await RecurringInvoiceService.getById(id);
      
      if (!invoice) {
        return res.status(404).json({ 
          success: false, 
          message: 'Recurring invoice not found' 
        });
      }

      return res.status(200).json({ 
        success: true, 
        data: invoice 
      });
    } catch (error) {
      logger.error('InvoiceController: Error getting recurring invoice', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to get recurring invoice', 
        error: error.message 
      });
    }
  }

  async updateRecurringInvoice(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      const result = await RecurringInvoiceService.update(id, updateData);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.status(200).json(result);
    } catch (error) {
      logger.error('InvoiceController: Error updating recurring invoice', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to update recurring invoice', 
        error: error.message 
      });
    }
  }

  async cancelRecurringInvoice(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      
      const result = await RecurringInvoiceService.cancel(id, reason);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.status(200).json(result);
    } catch (error) {
      logger.error('InvoiceController: Error canceling recurring invoice', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to cancel recurring invoice', 
        error: error.message 
      });
    }
  }

  async reactivateRecurringInvoice(req, res) {
    try {
      const { id } = req.params;
      
      const result = await RecurringInvoiceService.reactivate(id);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.status(200).json(result);
    } catch (error) {
      logger.error('InvoiceController: Error reactivating recurring invoice', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to reactivate recurring invoice', 
        error: error.message 
      });
    }
  }

  async deleteRecurringInvoice(req, res) {
    try {
      const { id } = req.params;
      
      const result = await RecurringInvoiceService.delete(id);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.status(200).json(result);
    } catch (error) {
      logger.error('InvoiceController: Error deleting recurring invoice', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to delete recurring invoice', 
        error: error.message 
      });
    }
  }

  async generateFromRecurring(req, res) {
    try {
      const { id } = req.params;
      
      const result = await RecurringInvoiceService.generateInvoice(id);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.status(201).json(result);
    } catch (error) {
      logger.error('InvoiceController: Error generating invoice from recurring', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to generate invoice from recurring template', 
        error: error.message 
      });
    }
  }

  async processDueRecurringInvoices(req, res) {
    try {
      const result = await RecurringInvoiceService.processDueRecurringInvoices();
      
      return res.status(200).json(result);
    } catch (error) {
      logger.error('InvoiceController: Error processing due recurring invoices', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to process due recurring invoices', 
        error: error.message 
      });
    }
  }

  // Overdue invoice methods
  async getOverdueInvoices(req, res) {
    try {
      const filters = req.query;
      
      const invoices = await OverdueInvoiceService.getOverdueInvoices(filters);
      
      return res.status(200).json({ 
        success: true, 
        data: invoices 
      });
    } catch (error) {
      logger.error('InvoiceController: Error getting overdue invoices', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to get overdue invoices', 
        error: error.message 
      });
    }
  }

  async processOverdueInvoices(req, res) {
    try {
      const result = await OverdueInvoiceService.processOverdueInvoices();
      
      return res.status(200).json(result);
    } catch (error) {
      logger.error('InvoiceController: Error processing overdue invoices', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to process overdue invoices', 
        error: error.message 
      });
    }
  }

  async applyLateFee(req, res) {
    try {
      const { invoice_id } = req.params;
      const { amount, description } = req.body;
      
      if (!amount || amount <= 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Late fee amount must be greater than zero' 
        });
      }

      const result = await OverdueInvoiceService.applyLateFee(invoice_id, amount, description);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.status(200).json(result);
    } catch (error) {
      logger.error('InvoiceController: Error applying late fee', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to apply late fee', 
        error: error.message 
      });
    }
  }

  async sendReminder(req, res) {
    try {
      const { invoice_id } = req.params;
      const { reminder_type, custom_message } = req.body;
      
      const result = await OverdueInvoiceService.sendReminder(invoice_id, reminder_type, custom_message);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.status(200).json(result);
    } catch (error) {
      logger.error('InvoiceController: Error sending reminder', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to send reminder', 
        error: error.message 
      });
    }
  }

  async getOverdueStatistics(req, res) {
    try {
      const filters = req.query;
      
      const statistics = await OverdueInvoiceService.getOverdueStatistics(filters);
      
      return res.status(200).json({ 
        success: true, 
        data: statistics 
      });
    } catch (error) {
      logger.error('InvoiceController: Error getting overdue statistics', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to get overdue statistics', 
        error: error.message 
      });
    }
  }

  async getOverdueConfig(req, res) {
    try {
      const config = await OverdueInvoiceService.getConfig();
      
      return res.status(200).json({ 
        success: true, 
        data: config 
      });
    } catch (error) {
      logger.error('InvoiceController: Error getting overdue config', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to get overdue configuration', 
        error: error.message 
      });
    }
  }

  async updateOverdueConfig(req, res) {
    try {
      const configData = req.body;
      
      const result = await OverdueInvoiceService.updateConfig(configData);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.status(200).json(result);
    } catch (error) {
      logger.error('InvoiceController: Error updating overdue config', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to update overdue configuration', 
        error: error.message 
      });
    }
  }

  // Invoice numbering configuration
  async configureInvoiceNumbering(req, res) {
    try {
      const { format, prefix, sequence_length, sequence_start, reset_frequency } = req.body;
      
      // Reset a specific sequence if requested
      if (req.body.reset_sequence) {
        const { prefix, year, month, start_at } = req.body.reset_sequence;
        const result = await InvoiceNumberingService.resetSequence(prefix, year, month, start_at);
        
        if (!result.success) {
          return res.status(400).json(result);
        }
        
        return res.status(200).json(result);
      }
      
      // Otherwise update configuration
      // Validate inputs
      if (format && typeof format !== 'string') {
        return res.status(400).json({ 
          success: false, 
          message: 'Format must be a string' 
        });
      }
      
      if (sequence_length && (isNaN(sequence_length) || sequence_length < 1 || sequence_length > 10)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Sequence length must be a number between 1 and 10' 
        });
      }
      
      // Update settings
      if (format) InvoiceNumberingService.format = format;
      if (prefix) InvoiceNumberingService.defaultPrefix = prefix;
      if (sequence_length) InvoiceNumberingService.sequenceLength = parseInt(sequence_length);
      if (sequence_start) InvoiceNumberingService.sequenceStart = parseInt(sequence_start);
      if (reset_frequency) InvoiceNumberingService.resetFrequency = reset_frequency;
      
      return res.status(200).json({ 
        success: true, 
        message: 'Invoice numbering configuration updated',
        data: {
          format: InvoiceNumberingService.format,
          defaultPrefix: InvoiceNumberingService.defaultPrefix,
          sequenceLength: InvoiceNumberingService.sequenceLength,
          sequenceStart: InvoiceNumberingService.sequenceStart,
          resetFrequency: InvoiceNumberingService.resetFrequency
        }
      });
    } catch (error) {
      logger.error('InvoiceController: Error configuring invoice numbering', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to configure invoice numbering', 
        error: error.message 
      });
    }
  }

  async getInvoiceNumberingConfig(req, res) {
    try {
      return res.status(200).json({ 
        success: true, 
        data: {
          format: InvoiceNumberingService.format,
          defaultPrefix: InvoiceNumberingService.defaultPrefix,
          sequenceLength: InvoiceNumberingService.sequenceLength,
          sequenceStart: InvoiceNumberingService.sequenceStart,
          resetFrequency: InvoiceNumberingService.resetFrequency
        }
      });
    } catch (error) {
      logger.error('InvoiceController: Error getting invoice numbering config', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to get invoice numbering configuration', 
        error: error.message 
      });
    }
  }

  async initialize() {
    try {
      // Initialize all required services
      await InvoiceNumberingService.ensureSequenceTable();
      await RecurringInvoiceService.ensureTables();
      await OverdueInvoiceService.ensureTables();
      await InvoicePaymentService.ensureTables();
      logger.info('InvoiceController: All services initialized successfully');
    } catch (error) {
      logger.error('InvoiceController: Error initializing services', error);
      throw error;
    }
  }
}

module.exports = new InvoiceController(); 