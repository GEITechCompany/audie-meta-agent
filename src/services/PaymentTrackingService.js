/**
 * Payment Tracking Service
 * Handles recording payments, calculating balances, and managing overdue invoices
 */

const { getDatabase } = require('../database');
const logger = require('../utils/logger');
const NotificationService = require('./NotificationService');
const EmailService = require('./EmailService');
const { getFormattedDate } = require('../utils/dateFormatter');
const Invoice = require('../models/Invoice');

class PaymentTrackingService {
  constructor() {
    this.db = getDatabase();
    this.notificationService = new NotificationService();
    this.emailService = new EmailService();
    this.paymentsTable = 'invoice_payments';
    this.invoicesTable = 'invoices';
    this.paymentMethodsTable = 'payment_methods';
    
    this.ensureTables();
  }

  async ensureTables() {
    try {
      // Ensure payment methods table exists
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS ${this.paymentMethodsTable} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          description TEXT,
          enabled INTEGER DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      logger.info('Payment methods table check completed');
      
      // Insert default payment methods if they don't exist
      const defaultMethods = [
        { name: 'Credit Card', description: 'Visa, Mastercard, Amex, Discover' },
        { name: 'Bank Transfer', description: 'Direct bank transfer' },
        { name: 'Check', description: 'Personal or business check' },
        { name: 'Cash', description: 'Cash payment' },
        { name: 'PayPal', description: 'PayPal payment' },
        { name: 'Other', description: 'Other payment method' }
      ];
      
      for (const method of defaultMethods) {
        await this.db.run(
          `INSERT OR IGNORE INTO ${this.paymentMethodsTable} (name, description) VALUES (?, ?)`,
          [method.name, method.description]
        );
      }
      
      logger.info('Default payment methods have been verified');
    } catch (error) {
      logger.error('Error setting up payment tables:', error);
    }
  }

  /**
   * Record a payment for an invoice
   * @param {number} invoiceId 
   * @param {object} paymentData 
   * @returns {Promise<object>}
   */
  async recordPayment(invoiceId, paymentData) {
    try {
      // Validate payment data
      this._validatePaymentData(paymentData);
      
      // Get the invoice to verify payment amount
      const invoice = await this._getInvoice(invoiceId);
      
      if (!invoice) {
        throw new Error(`Invoice #${invoiceId} not found`);
      }
      
      if (invoice.status === 'canceled') {
        throw new Error('Cannot record payment for a canceled invoice');
      }
      
      if (invoice.status === 'paid') {
        throw new Error('Invoice is already fully paid');
      }
      
      const amountDue = parseFloat(invoice.total_amount) - parseFloat(invoice.amount_paid);
      const paymentAmount = parseFloat(paymentData.amount);
      
      if (paymentAmount <= 0) {
        throw new Error('Payment amount must be greater than zero');
      }
      
      if (paymentAmount > amountDue) {
        throw new Error(`Payment amount (${paymentAmount}) exceeds amount due (${amountDue})`);
      }
      
      // Begin transaction
      await this.db.run('BEGIN TRANSACTION');
      
      // Insert payment record
      const paymentResult = await this.db.run(
        `INSERT INTO ${this.paymentsTable} 
        (invoice_id, amount, payment_date, payment_method, notes, metadata) 
        VALUES (?, ?, ?, ?, ?, ?)`,
        [
          invoiceId,
          paymentAmount,
          paymentData.payment_date || new Date().toISOString(),
          paymentData.payment_method || 'other',
          paymentData.notes || '',
          JSON.stringify(paymentData.metadata || {})
        ]
      );
      
      // Update invoice amount_paid and status
      const newPaidAmount = parseFloat(invoice.amount_paid) + paymentAmount;
      const isFullyPaid = newPaidAmount >= parseFloat(invoice.total_amount);
      const newStatus = isFullyPaid ? 'paid' : 'partial';
      
      await this.db.run(
        `UPDATE ${this.invoicesTable} 
        SET amount_paid = ?, status = ?, paid_at = ? 
        WHERE id = ?`,
        [
          newPaidAmount,
          newStatus,
          isFullyPaid ? new Date().toISOString() : null,
          invoiceId
        ]
      );
      
      // Commit transaction
      await this.db.run('COMMIT');
      
      // Send notification
      this._sendPaymentNotification(invoice, paymentAmount, isFullyPaid);
      
      // Return updated invoice data
      return {
        invoice_id: invoiceId,
        payment_id: paymentResult.lastID,
        amount: paymentAmount,
        status: newStatus,
        amount_paid: newPaidAmount,
        is_fully_paid: isFullyPaid
      };
    } catch (error) {
      // Rollback transaction if error
      await this.db.run('ROLLBACK');
      logger.error(`Error recording payment for invoice #${invoiceId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all payments for an invoice
   * @param {number} invoiceId 
   * @returns {Promise<Array>}
   */
  async getPayments(invoiceId) {
    try {
      const payments = await this.db.all(
        `SELECT * FROM ${this.paymentsTable} WHERE invoice_id = ? ORDER BY payment_date DESC`,
        [invoiceId]
      );
      
      return payments.map(payment => ({
        ...payment,
        metadata: JSON.parse(payment.metadata || '{}')
      }));
    } catch (error) {
      logger.error(`Error retrieving payments for invoice #${invoiceId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get payment summary for an invoice
   * @param {number} invoiceId 
   * @returns {Promise<object>}
   */
  async getPaymentSummary(invoiceId) {
    try {
      const invoice = await this._getInvoice(invoiceId);
      
      if (!invoice) {
        throw new Error(`Invoice #${invoiceId} not found`);
      }
      
      const payments = await this.getPayments(invoiceId);
      
      return {
        invoice_id: invoiceId,
        invoice_number: invoice.invoice_number,
        total_amount: parseFloat(invoice.total_amount),
        amount_paid: parseFloat(invoice.amount_paid),
        amount_due: parseFloat(invoice.total_amount) - parseFloat(invoice.amount_paid),
        payment_count: payments.length,
        payment_history: payments,
        is_fully_paid: invoice.status === 'paid',
        status: invoice.status,
        due_date: invoice.due_date,
        is_overdue: new Date(invoice.due_date) < new Date() && invoice.status !== 'paid'
      };
    } catch (error) {
      logger.error(`Error retrieving payment summary for invoice #${invoiceId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all overdue invoices
   * @param {object} options 
   * @returns {Promise<Array>}
   */
  async getOverdueInvoices(options = {}) {
    try {
      const { clientId, daysOverdue = 0, limit, offset } = options;
      
      let query = `
        SELECT i.*, c.name as client_name 
        FROM ${this.invoicesTable} i
        LEFT JOIN clients c ON i.client_id = c.id
        WHERE i.status != 'paid' 
        AND i.status != 'canceled' 
        AND i.due_date < date('now', '-${daysOverdue} days')
      `;
      
      const params = [];
      
      if (clientId) {
        query += ` AND i.client_id = ?`;
        params.push(clientId);
      }
      
      query += ` ORDER BY i.due_date ASC`;
      
      if (limit) {
        query += ` LIMIT ?`;
        params.push(limit);
        
        if (offset) {
          query += ` OFFSET ?`;
          params.push(offset);
        }
      }
      
      const overdueInvoices = await this.db.all(query, params);
      
      return overdueInvoices;
    } catch (error) {
      logger.error(`Error retrieving overdue invoices: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send reminder for overdue invoice
   * @param {number} invoiceId 
   * @param {object} options 
   * @returns {Promise<object>}
   */
  async sendOverdueReminder(invoiceId, options = {}) {
    try {
      const invoice = await this._getInvoice(invoiceId);
      
      if (!invoice) {
        throw new Error(`Invoice #${invoiceId} not found`);
      }
      
      if (invoice.status === 'paid') {
        throw new Error('Cannot send reminder for paid invoice');
      }
      
      if (invoice.status === 'canceled') {
        throw new Error('Cannot send reminder for canceled invoice');
      }
      
      // Get client information
      const client = await this.db.get('SELECT * FROM clients WHERE id = ?', [invoice.client_id]);
      
      if (!client) {
        throw new Error(`Client #${invoice.client_id} not found`);
      }
      
      const daysSinceOverdue = Math.ceil(
        (new Date() - new Date(invoice.due_date)) / (1000 * 60 * 60 * 24)
      );
      
      // Send email reminder
      const reminderResult = await this.emailService.sendOverdueInvoiceReminder(
        client.email,
        {
          invoice,
          client,
          daysSinceOverdue,
          templateName: options.templateName || 'default_overdue_reminder'
        }
      );
      
      // Log the reminder
      await this.db.run(
        `INSERT INTO notification_log 
        (type, recipient_id, reference_id, reference_type, message, status, metadata) 
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          'overdue_reminder',
          client.id,
          invoice.id,
          'invoice',
          `Overdue reminder sent for Invoice #${invoice.invoice_number}`,
          reminderResult.success ? 'sent' : 'failed',
          JSON.stringify({
            daysSinceOverdue,
            emailResult: reminderResult,
            customOptions: options
          })
        ]
      );
      
      return {
        success: reminderResult.success,
        message: `Overdue reminder ${reminderResult.success ? 'sent' : 'failed to send'} for Invoice #${invoice.invoice_number}`,
        invoice_id: invoiceId,
        days_overdue: daysSinceOverdue
      };
    } catch (error) {
      logger.error(`Error sending overdue reminder for invoice #${invoiceId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process all overdue invoices and send reminders based on configuration
   * @param {object} options 
   * @returns {Promise<object>}
   */
  async processOverdueInvoices(options = {}) {
    try {
      const reminderSchedule = options.reminderSchedule || [
        { days: 1, templateName: 'gentle_reminder' },
        { days: 7, templateName: 'follow_up_reminder' },
        { days: 14, templateName: 'final_reminder' },
        { days: 30, templateName: 'collection_notice' }
      ];
      
      let totalProcessed = 0;
      let totalReminders = 0;
      const results = [];
      
      for (const schedule of reminderSchedule) {
        // Get invoices overdue by exactly the days in the schedule
        const overdueInvoices = await this.getOverdueInvoices({
          daysOverdue: schedule.days,
          ...options
        });
        
        totalProcessed += overdueInvoices.length;
        
        // Send reminders for each invoice
        for (const invoice of overdueInvoices) {
          try {
            const reminderResult = await this.sendOverdueReminder(invoice.id, {
              templateName: schedule.templateName
            });
            
            if (reminderResult.success) {
              totalReminders++;
            }
            
            results.push(reminderResult);
          } catch (error) {
            logger.error(`Error processing overdue invoice #${invoice.id}: ${error.message}`);
            results.push({
              success: false,
              invoice_id: invoice.id,
              error: error.message
            });
          }
        }
      }
      
      return {
        total_processed: totalProcessed,
        total_reminders_sent: totalReminders,
        results
      };
    } catch (error) {
      logger.error(`Error processing overdue invoices: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate payment data
   * @param {object} paymentData 
   * @private
   */
  _validatePaymentData(paymentData) {
    if (!paymentData) {
      throw new Error('Payment data is required');
    }
    
    if (!paymentData.amount) {
      throw new Error('Payment amount is required');
    }
    
    const amount = parseFloat(paymentData.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Payment amount must be a positive number');
    }
  }

  /**
   * Get invoice by ID
   * @param {number} invoiceId 
   * @returns {Promise<object>}
   * @private
   */
  async _getInvoice(invoiceId) {
    return await this.db.get(
      `SELECT * FROM ${this.invoicesTable} WHERE id = ?`,
      [invoiceId]
    );
  }

  /**
   * Send payment notification
   * @param {object} invoice 
   * @param {number} paymentAmount 
   * @param {boolean} isFullyPaid 
   * @private
   */
  async _sendPaymentNotification(invoice, paymentAmount, isFullyPaid) {
    try {
      // Notify admin
      await this.notificationService.create({
        type: 'payment_received',
        title: `Payment received for Invoice #${invoice.invoice_number}`,
        message: `$${paymentAmount.toFixed(2)} payment received. Invoice is ${isFullyPaid ? 'fully paid' : 'partially paid'}.`,
        reference_id: invoice.id,
        reference_type: 'invoice',
        importance: 'medium'
      });
      
      // Get client information
      const client = await this.db.get('SELECT * FROM clients WHERE id = ?', [invoice.client_id]);
      
      if (!client) {
        logger.warn(`Could not find client #${invoice.client_id} for payment notification`);
        return;
      }
      
      // Send email receipt to client
      await this.emailService.sendPaymentReceipt(
        client.email,
        {
          invoice,
          client,
          payment_amount: paymentAmount,
          is_fully_paid: isFullyPaid,
          remaining_balance: parseFloat(invoice.total_amount) - (parseFloat(invoice.amount_paid) + paymentAmount)
        }
      );
    } catch (error) {
      logger.error(`Error sending payment notification: ${error.message}`);
      // Don't throw - this is a non-critical operation
    }
  }

  async getPaymentMethods(onlyEnabled = true) {
    try {
      let query = `SELECT * FROM ${this.paymentMethodsTable}`;
      
      if (onlyEnabled) {
        query += ' WHERE enabled = 1';
      }
      
      query += ' ORDER BY name';
      
      const methods = await this.db.all(query);
      return methods;
    } catch (error) {
      logger.error('Error retrieving payment methods:', error);
      throw error;
    }
  }

  async addPaymentMethod(name, description) {
    try {
      if (!name || name.trim() === '') {
        throw new Error('Payment method name is required');
      }
      
      const result = await this.db.run(
        `INSERT INTO ${this.paymentMethodsTable} (name, description) VALUES (?, ?)`,
        [name, description || '']
      );
      
      return {
        success: true,
        id: result.lastID,
        name,
        description
      };
    } catch (error) {
      logger.error('Error adding payment method:', error);
      throw error;
    }
  }

  async deletePayment(paymentId) {
    try {
      // Get payment details first
      const payment = await this.db.get(
        `SELECT * FROM ${this.paymentsTable} WHERE id = ?`,
        [paymentId]
      );
      
      if (!payment) {
        throw new Error(`Payment with ID ${paymentId} not found`);
      }
      
      // Get the invoice
      const invoice = await this.db.get(
        'SELECT id, total_amount, amount_paid, status FROM invoices WHERE id = ?',
        [payment.invoice_id]
      );
      
      if (!invoice) {
        throw new Error(`Invoice with ID ${payment.invoice_id} not found`);
      }
      
      // Delete the payment
      await this.db.run(
        `DELETE FROM ${this.paymentsTable} WHERE id = ?`,
        [paymentId]
      );
      
      // Update invoice amount_paid and status
      const newAmountPaid = Math.max(0, parseFloat(invoice.amount_paid) - parseFloat(payment.amount));
      let newStatus = 'pending';
      
      if (newAmountPaid >= parseFloat(invoice.total_amount)) {
        newStatus = 'paid';
      } else if (newAmountPaid > 0) {
        newStatus = 'partial';
      }
      
      await this.db.run(
        'UPDATE invoices SET amount_paid = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newAmountPaid, newStatus, payment.invoice_id]
      );
      
      return {
        success: true,
        invoice_id: payment.invoice_id,
        new_status: newStatus,
        amount_paid: newAmountPaid
      };
    } catch (error) {
      logger.error('Error deleting payment:', error);
      throw error;
    }
  }

  async getPaymentStats(startDate, endDate) {
    try {
      const query = `
        SELECT 
          payment_method,
          COUNT(*) as payment_count,
          SUM(amount) as total_amount
        FROM ${this.paymentsTable}
        WHERE payment_date BETWEEN ? AND ?
        GROUP BY payment_method
        ORDER BY total_amount DESC
      `;
      
      const stats = await this.db.all(query, [startDate, endDate]);
      
      return stats;
    } catch (error) {
      logger.error('Error retrieving payment statistics:', error);
      throw error;
    }
  }
}

module.exports = new PaymentTrackingService(); 