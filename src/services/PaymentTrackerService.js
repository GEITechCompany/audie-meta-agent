/**
 * Payment Tracker Service
 * Manages tracking, recording, and analyzing payments for invoices
 */
const { getDatabase } = require('../database');
const Invoice = require('../models/Invoice');
const logger = require('../utils/logger');
const { getFormattedDate } = require('../utils/dateFormatter');
const NotificationService = require('./NotificationService');
const EmailService = require('./EmailService');
const ClientService = require('../services/ClientService');

class PaymentTrackerService {
  constructor() {
    this.db = getDatabase();
    this.paymentHistoryTable = 'invoice_payments';
    this.paymentMethodsTable = 'payment_methods';
    this.paymentSchedulesTable = 'payment_schedules';
    this.notificationService = new NotificationService();
    this.emailService = new EmailService();
    
    // Initialize payment methods table if needed
    this.ensurePaymentMethodsTable();
  }

  /**
   * Ensure the payment methods table exists
   */
  async ensurePaymentMethodsTable() {
    try {
      // Check if payment methods table exists
      const tableExists = await this.db.get(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        [this.paymentMethodsTable]
      );

      if (!tableExists) {
        // Create payment methods table
        await this.db.run(`
          CREATE TABLE ${this.paymentMethodsTable} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            is_active INTEGER DEFAULT 1,
            requires_approval INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Insert default payment methods
        const defaultMethods = [
          { name: 'Credit Card', description: 'Payment via credit card', is_active: 1, requires_approval: 0 },
          { name: 'Bank Transfer', description: 'Direct bank transfer', is_active: 1, requires_approval: 1 },
          { name: 'Cash', description: 'Cash payment', is_active: 1, requires_approval: 0 },
          { name: 'Check', description: 'Payment by check', is_active: 1, requires_approval: 1 },
          { name: 'PayPal', description: 'Payment via PayPal', is_active: 1, requires_approval: 0 }
        ];

        const stmt = await this.db.prepare(`
          INSERT INTO ${this.paymentMethodsTable} 
          (name, description, is_active, requires_approval) 
          VALUES (?, ?, ?, ?)
        `);

        for (const method of defaultMethods) {
          await stmt.run(method.name, method.description, method.is_active, method.requires_approval);
        }

        await stmt.finalize();
        logger.info('Payment methods table created with default methods');
      }
    } catch (error) {
      logger.error('Failed to ensure payment methods table:', error);
      throw { status: 500, message: 'Failed to setup payment methods' };
    }
  }

  /**
   * Record a payment for an invoice
   * @param {number} invoiceId - The invoice ID
   * @param {Object} paymentData - Payment data
   * @returns {Promise<Object>} - The recorded payment
   */
  async recordPayment(invoiceId, paymentData) {
    try {
      // Get the invoice
      const invoice = await Invoice.findById(invoiceId);
      if (!invoice) {
        throw { status: 404, message: 'Invoice not found' };
      }

      // Check if invoice is canceled
      if (invoice.status === 'canceled') {
        throw { status: 400, message: 'Cannot record payment for canceled invoice' };
      }

      // Validate payment data
      if (!paymentData.amount || isNaN(parseFloat(paymentData.amount))) {
        throw { status: 400, message: 'Valid payment amount is required' };
      }

      if (parseFloat(paymentData.amount) <= 0) {
        throw { status: 400, message: 'Payment amount must be greater than zero' };
      }

      // Check if payment would exceed the total amount
      const totalPaid = parseFloat(invoice.amount_paid || 0) + parseFloat(paymentData.amount);
      if (totalPaid > parseFloat(invoice.total_amount)) {
        throw { 
          status: 400, 
          message: `Payment of ${paymentData.amount} would exceed the invoice total of ${invoice.total_amount}`
        };
      }

      // Record the payment
      const payment = await invoice.recordPayment({
        amount: paymentData.amount,
        payment_date: paymentData.payment_date || new Date().toISOString().split('T')[0],
        payment_method: this.validatePaymentMethod(paymentData.payment_method || 'other'),
        reference: paymentData.reference || '',
        notes: paymentData.notes || ''
      });

      // Create notification for payment
      await this.notificationService.create({
        type: 'invoice_payment',
        title: `Payment received for invoice #${invoice.invoice_number}`,
        content: `A payment of ${payment.amount} was recorded for invoice #${invoice.invoice_number}`,
        entity_id: invoiceId,
        entity_type: 'invoice',
        is_read: false
      });

      // Send email confirmation if payment completes the invoice
      if (totalPaid >= parseFloat(invoice.total_amount)) {
        await this.emailService.sendPaymentConfirmation(invoice);
      }

      return payment;
    } catch (error) {
      logger.error(`Error recording payment: ${error.message}`, { error });
      throw error;
    }
  }

  /**
   * Get payments for an invoice
   * @param {number} invoiceId - The invoice ID
   * @returns {Promise<Array>} - Array of payments
   */
  async getPayments(invoiceId) {
    try {
      const invoice = await Invoice.findById(invoiceId);
      if (!invoice) {
        throw { status: 404, message: 'Invoice not found' };
      }

      return await invoice.getPayments();
    } catch (error) {
      logger.error(`Error getting payments: ${error.message}`, { error });
      throw error;
    }
  }

  /**
   * Get payment statistics
   * @param {Object} options - Query options
   * @returns {Promise<Object>} - Payment statistics
   */
  async getPaymentStats(options = {}) {
    try {
      const { startDate, endDate, clientId } = options;
      
      // Build query conditions
      let conditions = '';
      const params = [];
      
      if (startDate) {
        conditions += conditions ? ' AND ' : ' WHERE ';
        conditions += 'p.payment_date >= ?';
        params.push(startDate);
      }
      
      if (endDate) {
        conditions += conditions ? ' AND ' : ' WHERE ';
        conditions += 'p.payment_date <= ?';
        params.push(endDate);
      }
      
      if (clientId) {
        conditions += conditions ? ' AND ' : ' WHERE ';
        conditions += 'i.client_id = ?';
        params.push(clientId);
      }
      
      // Get total payments
      const totalQuery = `
        SELECT 
          SUM(p.amount) as total_paid,
          COUNT(DISTINCT i.id) as invoices_paid,
          COUNT(p.id) as payment_count
        FROM ${this.paymentHistoryTable} p
        JOIN invoices i ON p.invoice_id = i.id
        ${conditions}
      `;
      
      const [totalResult] = await this.db.query(totalQuery, params);
      
      // Get payments by method
      const methodQuery = `
        SELECT 
          p.payment_method,
          SUM(p.amount) as total,
          COUNT(p.id) as count
        FROM ${this.paymentHistoryTable} p
        JOIN invoices i ON p.invoice_id = i.id
        ${conditions}
        GROUP BY p.payment_method
        ORDER BY total DESC
      `;
      
      const methodResults = await this.db.query(methodQuery, params);
      
      // Get payments by month
      const monthlyQuery = `
        SELECT 
          SUBSTRING(p.payment_date, 1, 7) as month,
          SUM(p.amount) as total,
          COUNT(p.id) as count
        FROM ${this.paymentHistoryTable} p
        JOIN invoices i ON p.invoice_id = i.id
        ${conditions}
        GROUP BY SUBSTRING(p.payment_date, 1, 7)
        ORDER BY month ASC
      `;
      
      const monthlyResults = await this.db.query(monthlyQuery, params);
      
      // Calculate average payment time
      const timeQuery = `
        SELECT 
          AVG(DATEDIFF(p.payment_date, i.created_at)) as avg_days_to_pay
        FROM ${this.paymentHistoryTable} p
        JOIN invoices i ON p.invoice_id = i.id
        ${conditions} AND i.status = 'paid'
      `;
      
      const [timeResult] = await this.db.query(timeQuery, params);
      
      return {
        summary: {
          total_paid: totalResult.total_paid || 0,
          invoices_paid: totalResult.invoices_paid || 0,
          payment_count: totalResult.payment_count || 0,
          avg_days_to_pay: timeResult.avg_days_to_pay || 0
        },
        by_method: methodResults || [],
        by_month: monthlyResults || []
      };
    } catch (error) {
      logger.error(`Error getting payment stats: ${error.message}`, { error });
      throw error;
    }
  }

  /**
   * Get available payment methods
   * @returns {Array} - Available payment methods
   */
  async getPaymentMethods() {
    try {
      const methods = await this.db.all(
        `SELECT * FROM ${this.paymentMethodsTable} WHERE is_active = 1 ORDER BY name ASC`
      );
      
      return methods;
    } catch (error) {
      logger.error('Failed to get payment methods:', error);
      throw { status: 500, message: 'Failed to retrieve payment methods' };
    }
  }

  /**
   * Validate payment method
   * @param {string} method - Payment method
   * @returns {string} - Validated payment method
   */
  validatePaymentMethod(method) {
    return this.paymentMethodsTable.includes(method) ? method : 'other';
  }

  /**
   * Get partial payment history for an invoice
   * @param {number} invoiceId - The invoice ID
   * @returns {Promise<Object>} - Payment history and status
   */
  async getPartialPaymentHistory(invoiceId) {
    try {
      // Validate invoice exists
      const invoice = await this.db.get(
        `SELECT id FROM invoices WHERE id = ?`,
        [invoiceId]
      );

      if (!invoice) {
        throw { status: 404, message: 'Invoice not found' };
      }

      // Get all payments for this invoice
      const payments = await this.db.all(
        `SELECT 
          id, 
          invoice_id, 
          amount, 
          payment_date, 
          payment_method, 
          notes, 
          reference_number, 
          created_at
        FROM ${this.paymentHistoryTable}
        WHERE invoice_id = ?
        ORDER BY payment_date DESC`,
        [invoiceId]
      );

      // Get invoice total and calculate running balance
      const invoiceData = await this.db.get(
        `SELECT total_amount FROM invoices WHERE id = ?`,
        [invoiceId]
      );

      let runningTotal = invoiceData.total_amount;
      const paymentHistory = payments.map(payment => {
        runningTotal -= payment.amount;
        return {
          ...payment,
          balance_after_payment: parseFloat(runningTotal).toFixed(2)
        };
      }).reverse(); // Reverse to show oldest first

      return paymentHistory;
    } catch (error) {
      logger.error('Failed to get payment history:', error);
      throw error.status ? error : { status: 500, message: 'Failed to retrieve payment history' };
    }
  }

  async recordPartialPayment(invoiceId, paymentData) {
    try {
      // Validate parameters
      if (!invoiceId || !paymentData || !paymentData.amount) {
        throw new Error('Invalid payment data: invoiceId and payment amount are required');
      }

      await this.ensurePaymentMethodsTable();

      // Fetch the invoice to verify it exists and check its status
      const invoice = await Invoice.findById(invoiceId);
      if (!invoice) {
        throw new Error(`Invoice with ID ${invoiceId} not found`);
      }

      if (invoice.status === 'cancelled') {
        throw new Error('Cannot record payment for a cancelled invoice');
      }

      if (invoice.status === 'paid') {
        throw new Error('Invoice is already marked as fully paid');
      }

      // Validate payment amount
      const paymentAmount = parseFloat(paymentData.amount);
      if (isNaN(paymentAmount) || paymentAmount <= 0) {
        throw new Error('Payment amount must be a positive number');
      }

      // Calculate remaining balance
      const remainingBalance = parseFloat(invoice.total_amount) - parseFloat(invoice.amount_paid);
      if (paymentAmount > remainingBalance) {
        throw new Error(`Payment amount (${paymentAmount}) exceeds remaining balance (${remainingBalance})`);
      }

      // Prepare payment data
      const payment = {
        invoice_id: invoiceId,
        amount: paymentAmount,
        payment_date: paymentData.payment_date || new Date().toISOString().split('T')[0],
        payment_method: paymentData.payment_method || 'Other',
        reference_number: paymentData.reference_number || null,
        notes: paymentData.notes || null,
        recorded_by: paymentData.recorded_by || null
      };

      // Record the payment
      const result = await this.db.run(
        `INSERT INTO ${this.paymentHistoryTable} 
        (invoice_id, amount, payment_date, payment_method, reference_number, notes, recorded_by) 
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          payment.invoice_id,
          payment.amount,
          payment.payment_date,
          payment.payment_method,
          payment.reference_number,
          payment.notes,
          payment.recorded_by
        ]
      );

      const paymentId = result.lastID;

      // Update the invoice's amount_paid and status
      const newAmountPaid = parseFloat(invoice.amount_paid) + paymentAmount;
      const newStatus = Math.abs(parseFloat(invoice.total_amount) - newAmountPaid) < 0.01 ? 'paid' : 'partial';
      const paidAt = newStatus === 'paid' ? new Date().toISOString() : null;

      await this.db.run(
        `UPDATE invoices 
        SET amount_paid = ?, status = ?, paid_at = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?`,
        [newAmountPaid, newStatus, paidAt, invoiceId]
      );

      // Get client information for notification
      const client = await ClientService.getById(invoice.client_id);

      // If this was the final payment, notify that the invoice is fully paid
      if (newStatus === 'paid') {
        // Create paid notification
        await NotificationService.create({
          type: 'invoice_paid',
          title: 'Invoice Paid',
          message: `Invoice #${invoice.invoice_number} has been fully paid`,
          entity_type: 'invoice',
          entity_id: invoiceId
        });

        // Send email to client
        if (client && client.email) {
          await this.emailService.sendEmail({
            to: client.email,
            subject: `Invoice #${invoice.invoice_number} - Payment Received`,
            body: `Dear ${client.name},\n\nThank you for your payment. Your invoice #${invoice.invoice_number} has been fully paid.\n\nAmount: $${invoice.total_amount}\n\nWe appreciate your business!\n\nRegards,\nYour Company`
          });
        }
      } else {
        // Create partial payment notification
        await NotificationService.create({
          type: 'partial_payment',
          title: 'Partial Payment Received',
          message: `Partial payment of $${paymentAmount.toFixed(2)} received for invoice #${invoice.invoice_number}. Remaining: $${(parseFloat(invoice.total_amount) - newAmountPaid).toFixed(2)}`,
          entity_type: 'invoice',
          entity_id: invoiceId
        });

        // Send email to client confirming partial payment
        if (client && client.email) {
          await this.emailService.sendEmail({
            to: client.email,
            subject: `Invoice #${invoice.invoice_number} - Partial Payment Received`,
            body: `Dear ${client.name},\n\nThank you for your payment of $${paymentAmount.toFixed(2)} toward invoice #${invoice.invoice_number}.\n\nRemaining balance: $${(parseFloat(invoice.total_amount) - newAmountPaid).toFixed(2)}\n\nWe appreciate your business!\n\nRegards,\nYour Company`
          });
        }
      }

      // Return payment details with invoice information
      const recordedPayment = {
        id: paymentId,
        ...payment,
        invoice_number: invoice.invoice_number,
        invoice_total: invoice.total_amount,
        remaining_balance: (parseFloat(invoice.total_amount) - newAmountPaid).toFixed(2),
        status: newStatus
      };

      logger.info(`Recorded ${newStatus === 'paid' ? 'final' : 'partial'} payment of $${paymentAmount} for invoice #${invoice.invoice_number}`);
      return recordedPayment;
    } catch (error) {
      logger.error('Error recording partial payment:', error);
      throw error;
    }
  }

  async addPaymentMethod(methodData) {
    try {
      const { name, description, is_active, requires_approval } = methodData;
      
      if (!name) {
        throw { status: 400, message: 'Method name is required' };
      }

      const result = await this.db.run(
        `INSERT INTO ${this.paymentMethodsTable} 
        (name, description, is_active, requires_approval) 
        VALUES (?, ?, ?, ?)`,
        [name, description || '', is_active !== undefined ? is_active : 1, requires_approval !== undefined ? requires_approval : 0]
      );

      return {
        id: result.lastID,
        name,
        description,
        is_active,
        requires_approval
      };
    } catch (error) {
      logger.error('Failed to add payment method:', error);
      throw error.status ? error : { status: 500, message: 'Failed to add payment method' };
    }
  }

  async updatePaymentMethod(id, methodData) {
    try {
      const { name, description, is_active, requires_approval } = methodData;
      
      if (!name) {
        throw { status: 400, message: 'Method name is required' };
      }

      await this.db.run(
        `UPDATE ${this.paymentMethodsTable} SET
        name = ?,
        description = ?,
        is_active = ?,
        requires_approval = ?,
        updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [
          name, 
          description || '', 
          is_active !== undefined ? is_active : 1,
          requires_approval !== undefined ? requires_approval : 0,
          id
        ]
      );

      return {
        id,
        name,
        description,
        is_active,
        requires_approval
      };
    } catch (error) {
      logger.error('Failed to update payment method:', error);
      throw error.status ? error : { status: 500, message: 'Failed to update payment method' };
    }
  }

  async ensureTables() {
    try {
      // Check if payment methods table exists
      const paymentMethodsExists = await this.db.get(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        [this.paymentMethodsTable]
      );

      if (!paymentMethodsExists) {
        await this.db.run(`
          CREATE TABLE ${this.paymentMethodsTable} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            is_active INTEGER DEFAULT 1,
            requires_approval INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Insert default payment methods
        const defaultMethods = [
          { name: 'Cash', description: 'Cash payment', is_active: 1, requires_approval: 0 },
          { name: 'Check', description: 'Check payment', is_active: 1, requires_approval: 1 },
          { name: 'Bank Transfer', description: 'Direct bank transfer', is_active: 1, requires_approval: 1 },
          { name: 'Credit Card', description: 'Credit card payment', is_active: 1, requires_approval: 0 },
          { name: 'PayPal', description: 'PayPal payment', is_active: 1, requires_approval: 0 }
        ];

        const insertStmt = await this.db.prepare(
          `INSERT INTO ${this.paymentMethodsTable} (name, description, is_active, requires_approval) VALUES (?, ?, ?, ?)`
        );

        for (const method of defaultMethods) {
          await insertStmt.run(method.name, method.description, method.is_active, method.requires_approval);
        }

        await insertStmt.finalize();
        logger.info('Payment methods table created and populated with defaults');
      }

      // Check if payment schedules table exists
      const paymentSchedulesExists = await this.db.get(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        [this.paymentSchedulesTable]
      );

      if (!paymentSchedulesExists) {
        await this.db.run(`
          CREATE TABLE ${this.paymentSchedulesTable} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id INTEGER NOT NULL,
            installment_number INTEGER NOT NULL,
            amount REAL NOT NULL,
            due_date TEXT NOT NULL,
            is_paid BOOLEAN DEFAULT 0,
            payment_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE CASCADE,
            FOREIGN KEY (payment_id) REFERENCES ${this.paymentHistoryTable} (id)
          )
        `);
        logger.info('Payment schedules table created');
      }

      return true;
    } catch (error) {
      logger.error('Error ensuring payment tables exist:', error);
      throw error;
    }
  }

  async createPaymentSchedule(invoiceId, scheduleData) {
    try {
      if (!invoiceId || !scheduleData || !scheduleData.installments || !scheduleData.installments.length) {
        throw new Error('Invoice ID and installment data are required');
      }

      await this.ensureTables();

      // Fetch the invoice to verify it exists
      const invoice = await Invoice.findById(invoiceId);
      if (!invoice) {
        throw new Error(`Invoice with ID ${invoiceId} not found`);
      }

      // Validate total amount of installments
      const totalInstallmentAmount = scheduleData.installments.reduce((sum, item) => sum + parseFloat(item.amount), 0);
      
      if (Math.abs(totalInstallmentAmount - parseFloat(invoice.total_amount)) > 0.01) {
        throw new Error(`Total of installments ($${totalInstallmentAmount}) does not match invoice amount ($${invoice.total_amount})`);
      }

      // Begin transaction
      await this.db.run('BEGIN TRANSACTION');

      try {
        // Clear any existing schedule
        await this.db.run(
          `DELETE FROM ${this.paymentSchedulesTable} WHERE invoice_id = ?`,
          [invoiceId]
        );

        // Insert new schedule
        const insertStmt = await this.db.prepare(
          `INSERT INTO ${this.paymentSchedulesTable} (invoice_id, installment_number, amount, due_date) VALUES (?, ?, ?, ?)`
        );

        let installmentNumber = 1;
        for (const installment of scheduleData.installments) {
          await insertStmt.run(
            invoiceId,
            installmentNumber++,
            parseFloat(installment.amount),
            installment.due_date
          );
        }

        await insertStmt.finalize();

        // Update invoice status to indicate payment plan
        await this.db.run(
          `UPDATE invoices SET status = 'payment_plan', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [invoiceId]
        );

        // Commit transaction
        await this.db.run('COMMIT');

        logger.info(`Created payment schedule with ${scheduleData.installments.length} installments for invoice #${invoice.invoice_number}`);
        
        // Get the new schedule
        const schedule = await this.getPaymentSchedule(invoiceId);
        return schedule;
      } catch (error) {
        await this.db.run('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('Error creating payment schedule:', error);
      throw error;
    }
  }

  async getPaymentSchedule(invoiceId) {
    try {
      if (!invoiceId) {
        throw new Error('Invoice ID is required');
      }

      await this.ensureTables();

      const schedule = await this.db.all(
        `SELECT * FROM ${this.paymentSchedulesTable} WHERE invoice_id = ? ORDER BY installment_number`,
        [invoiceId]
      );

      return schedule;
    } catch (error) {
      logger.error('Error retrieving payment schedule:', error);
      throw error;
    }
  }

  async processPaymentSchedules() {
    try {
      await this.ensureTables();

      // Get current date
      const currentDate = new Date().toISOString().split('T')[0];

      // Get due installments that haven't been paid
      const dueInstallments = await this.db.all(
        `SELECT ps.*, i.client_id, i.invoice_number, c.email, c.name AS client_name
         FROM ${this.paymentSchedulesTable} ps
         JOIN invoices i ON ps.invoice_id = i.id
         LEFT JOIN clients c ON i.client_id = c.id
         WHERE ps.is_paid = 0 AND ps.due_date <= ? AND i.status != 'cancelled'`,
        [currentDate]
      );

      logger.info(`Found ${dueInstallments.length} due installments for processing`);

      const results = {
        processed: dueInstallments.length,
        notified: 0,
        errors: 0
      };

      // Process each due installment
      for (const installment of dueInstallments) {
        try {
          // Create notification
          await NotificationService.create({
            type: 'installment_due',
            title: 'Payment Installment Due',
            message: `Installment #${installment.installment_number} of $${installment.amount} is due for invoice #${installment.invoice_number}`,
            entity_type: 'invoice',
            entity_id: installment.invoice_id
          });

          // Send email to client if available
          if (installment.email) {
            await this.emailService.sendEmail({
              to: installment.email,
              subject: `Payment Reminder: Invoice #${installment.invoice_number}`,
              body: `Dear ${installment.client_name},\n\nThis is a reminder that installment #${installment.installment_number} of $${installment.amount} for invoice #${installment.invoice_number} is due today.\n\nPlease make your payment at your earliest convenience.\n\nRegards,\nYour Company`
            });
          }

          results.notified++;
        } catch (error) {
          logger.error(`Error processing installment #${installment.id}:`, error);
          results.errors++;
        }
      }

      return results;
    } catch (error) {
      logger.error('Error processing payment schedules:', error);
      throw error;
    }
  }
}

module.exports = new PaymentTrackerService(); 