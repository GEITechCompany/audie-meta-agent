const { getDatabase } = require('../database');
const logger = require('../utils/logger');
const NotificationService = require('./NotificationService');
const EmailService = require('./EmailService');
const Invoice = require('../models/Invoice');

class InvoicePaymentService {
  constructor() {
    this.db = getDatabase();
    this.notificationService = new NotificationService();
    this.emailService = new EmailService();
    this.paymentsTable = 'invoice_payments';
    this.paymentMethodsTable = 'payment_methods';
    this.initialize();
  }

  /**
   * Initialize the service by ensuring tables exist
   */
  async initialize() {
    try {
      await this.ensurePaymentMethodsTable();
      await this.ensureDefaultPaymentMethods();
      logger.info('InvoicePaymentService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize InvoicePaymentService', error);
      throw error;
    }
  }

  /**
   * Ensure the payment methods table exists
   */
  async ensurePaymentMethodsTable() {
    try {
      const tableExists = await this.db.get(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        [this.paymentMethodsTable]
      );

      if (!tableExists) {
        await this.db.run(`
          CREATE TABLE ${this.paymentMethodsTable} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            is_active BOOLEAN DEFAULT 1,
            requires_confirmation BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        logger.info(`Created ${this.paymentMethodsTable} table`);
      }
    } catch (error) {
      logger.error(`Failed to create ${this.paymentMethodsTable} table`, error);
      throw error;
    }
  }

  /**
   * Ensure default payment methods exist
   */
  async ensureDefaultPaymentMethods() {
    try {
      const methods = await this.db.all(`SELECT id FROM ${this.paymentMethodsTable} LIMIT 1`);
      
      if (methods.length === 0) {
        const defaultMethods = [
          {
            name: 'Credit Card',
            description: 'Payment via credit or debit card',
            is_active: true,
            requires_confirmation: false
          },
          {
            name: 'Bank Transfer',
            description: 'Direct bank transfer or wire',
            is_active: true,
            requires_confirmation: true
          },
          {
            name: 'Cash',
            description: 'Cash payment in person',
            is_active: true,
            requires_confirmation: true
          },
          {
            name: 'Check',
            description: 'Payment by check',
            is_active: true,
            requires_confirmation: true
          },
          {
            name: 'PayPal',
            description: 'Payment via PayPal',
            is_active: true,
            requires_confirmation: false
          }
        ];

        for (const method of defaultMethods) {
          await this.db.run(`
            INSERT INTO ${this.paymentMethodsTable} 
            (name, description, is_active, requires_confirmation)
            VALUES (?, ?, ?, ?)
          `, [method.name, method.description, method.is_active, method.requires_confirmation]);
        }
        
        logger.info('Created default payment methods');
      }
    } catch (error) {
      logger.error('Failed to create default payment methods', error);
      throw error;
    }
  }

  /**
   * Record a payment for an invoice
   * @param {Object} paymentData Payment data
   * @returns {Object} Recorded payment
   */
  async recordPayment(paymentData) {
    try {
      if (!paymentData.invoice_id || !paymentData.amount || !paymentData.payment_method) {
        throw new Error('Missing required payment fields');
      }

      // Check if invoice exists
      const invoice = new Invoice();
      const invoiceData = await invoice.findById(paymentData.invoice_id);
      
      if (!invoiceData) {
        throw new Error(`Invoice with ID ${paymentData.invoice_id} not found`);
      }

      if (invoiceData.status === 'canceled') {
        throw new Error('Cannot record payment for a canceled invoice');
      }

      // Check if payment method exists
      const paymentMethod = await this.db.get(`
        SELECT * FROM ${this.paymentMethodsTable} WHERE id = ? AND is_active = 1
      `, [paymentData.payment_method]);

      if (!paymentMethod) {
        throw new Error(`Invalid or inactive payment method: ${paymentData.payment_method}`);
      }

      // Validate payment amount
      const remainingAmount = invoiceData.total_amount - invoiceData.amount_paid;
      if (paymentData.amount <= 0) {
        throw new Error('Payment amount must be greater than zero');
      }
      
      if (paymentData.amount > remainingAmount) {
        throw new Error(`Payment amount (${paymentData.amount}) exceeds remaining balance (${remainingAmount})`);
      }

      // Insert payment record
      const result = await this.db.run(`
        INSERT INTO ${this.paymentsTable} 
        (invoice_id, amount, payment_date, payment_method, reference_number, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        paymentData.invoice_id,
        paymentData.amount,
        paymentData.payment_date || new Date().toISOString().split('T')[0],
        paymentData.payment_method,
        paymentData.reference_number || null,
        paymentData.notes || null
      ]);

      // Update invoice amount_paid and potentially status
      const newAmountPaid = invoiceData.amount_paid + paymentData.amount;
      let newStatus = invoiceData.status;
      
      // If fully paid, update status to paid
      if (Math.abs(newAmountPaid - invoiceData.total_amount) < 0.01) {
        newStatus = 'paid';
      } else if (newStatus === 'overdue' && newAmountPaid > 0) {
        // If partially paid but was overdue, update to partial
        newStatus = 'partial';
      }

      await this.db.run(`
        UPDATE invoices
        SET amount_paid = ?, status = ?, paid_at = CASE WHEN ? = 'paid' THEN CURRENT_TIMESTAMP ELSE paid_at END, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [newAmountPaid, newStatus, newStatus, paymentData.invoice_id]);

      // Get client info for notification
      const client = await this.db.get(`
        SELECT * FROM clients WHERE id = ?
      `, [invoiceData.client_id]);

      // Create notification
      await this.notificationService.create({
        type: 'payment_received',
        title: `Payment received for Invoice #${invoiceData.invoice_number}`,
        message: `Received ${paymentData.amount.toFixed(2)} payment for Invoice #${invoiceData.invoice_number} from ${client ? `${client.first_name} ${client.last_name}` : 'client'}`,
        entity_id: paymentData.invoice_id,
        entity_type: 'invoice'
      });

      // If payment method requires confirmation, create notification
      if (paymentMethod.requires_confirmation) {
        await this.notificationService.create({
          type: 'payment_needs_confirmation',
          title: `Payment needs confirmation for Invoice #${invoiceData.invoice_number}`,
          message: `Payment of ${paymentData.amount.toFixed(2)} via ${paymentMethod.name} needs confirmation for Invoice #${invoiceData.invoice_number}`,
          entity_id: paymentData.invoice_id,
          entity_type: 'invoice',
          is_action_required: true
        });
      }

      // Send payment receipt to client if we have email and payment is confirmed or doesn't need confirmation
      if (client && client.email && (!paymentMethod.requires_confirmation || paymentData.is_confirmed)) {
        await this._sendPaymentReceipt(invoiceData, paymentData, client, paymentMethod);
      }

      logger.info(`Recorded payment of ${paymentData.amount} for invoice ${paymentData.invoice_id}`);
      
      const paymentRecord = await this.db.get(`
        SELECT * FROM ${this.paymentsTable} WHERE id = ?
      `, [result.lastID]);
      
      return {
        ...paymentRecord,
        new_status: newStatus,
        amount_paid: newAmountPaid,
        remaining_balance: invoiceData.total_amount - newAmountPaid
      };
    } catch (error) {
      logger.error('Failed to record payment', error);
      throw error;
    }
  }

  /**
   * Get payments for an invoice
   * @param {number} invoiceId Invoice ID
   * @returns {Array} Payments
   */
  async getPaymentsByInvoiceId(invoiceId) {
    try {
      return await this.db.all(`
        SELECT p.*, pm.name as payment_method_name
        FROM ${this.paymentsTable} p
        LEFT JOIN ${this.paymentMethodsTable} pm ON p.payment_method = pm.id
        WHERE p.invoice_id = ?
        ORDER BY p.payment_date DESC, p.created_at DESC
      `, [invoiceId]);
    } catch (error) {
      logger.error(`Failed to get payments for invoice ${invoiceId}`, error);
      throw error;
    }
  }

  /**
   * Get payment by ID
   * @param {number} paymentId Payment ID
   * @returns {Object} Payment
   */
  async getPaymentById(paymentId) {
    try {
      return await this.db.get(`
        SELECT p.*, pm.name as payment_method_name, i.invoice_number
        FROM ${this.paymentsTable} p
        LEFT JOIN ${this.paymentMethodsTable} pm ON p.payment_method = pm.id
        LEFT JOIN invoices i ON p.invoice_id = i.id
        WHERE p.id = ?
      `, [paymentId]);
    } catch (error) {
      logger.error(`Failed to get payment ${paymentId}`, error);
      throw error;
    }
  }

  /**
   * Update a payment
   * @param {number} paymentId Payment ID
   * @param {Object} paymentData Updated payment data
   * @returns {Object} Updated payment
   */
  async updatePayment(paymentId, paymentData) {
    try {
      // Check if payment exists
      const payment = await this.getPaymentById(paymentId);
      if (!payment) {
        throw new Error(`Payment with ID ${paymentId} not found`);
      }

      // Get invoice data
      const invoice = new Invoice();
      const invoiceData = await invoice.findById(payment.invoice_id);
      if (!invoiceData) {
        throw new Error(`Invoice with ID ${payment.invoice_id} not found`);
      }

      // Calculate amount difference
      const amountDifference = paymentData.amount - payment.amount;
      
      // Check if new amount is valid
      if (paymentData.amount <= 0) {
        throw new Error('Payment amount must be greater than zero');
      }
      
      const remainingAmount = invoiceData.total_amount - invoiceData.amount_paid + payment.amount;
      if (paymentData.amount > remainingAmount) {
        throw new Error(`New payment amount (${paymentData.amount}) exceeds remaining balance (${remainingAmount})`);
      }

      // Update payment
      await this.db.run(`
        UPDATE ${this.paymentsTable}
        SET 
          amount = ?,
          payment_date = ?,
          payment_method = ?,
          reference_number = ?,
          notes = ?,
          is_confirmed = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [
        paymentData.amount,
        paymentData.payment_date || payment.payment_date,
        paymentData.payment_method || payment.payment_method,
        paymentData.reference_number || payment.reference_number,
        paymentData.notes || payment.notes,
        paymentData.is_confirmed ?? payment.is_confirmed,
        paymentId
      ]);

      // Update invoice amount_paid and status
      const newAmountPaid = invoiceData.amount_paid + amountDifference;
      let newStatus = invoiceData.status;
      
      // Determine new status
      if (Math.abs(newAmountPaid - invoiceData.total_amount) < 0.01) {
        newStatus = 'paid';
      } else if (newAmountPaid <= 0) {
        newStatus = invoiceData.status === 'overdue' ? 'overdue' : 'pending';
      } else if (newAmountPaid < invoiceData.total_amount) {
        newStatus = invoiceData.status === 'overdue' ? 'overdue' : 'partial';
      }

      await this.db.run(`
        UPDATE invoices
        SET amount_paid = ?, status = ?, paid_at = CASE WHEN ? = 'paid' THEN CURRENT_TIMESTAMP ELSE paid_at END, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [newAmountPaid, newStatus, newStatus, payment.invoice_id]);

      // Create notification
      await this.notificationService.create({
        type: 'payment_updated',
        title: `Payment updated for Invoice #${invoiceData.invoice_number}`,
        message: `Payment of ${paymentData.amount.toFixed(2)} for Invoice #${invoiceData.invoice_number} has been updated`,
        entity_id: payment.invoice_id,
        entity_type: 'invoice'
      });

      logger.info(`Updated payment ${paymentId} for invoice ${payment.invoice_id}`);
      
      const updatedPayment = await this.getPaymentById(paymentId);
      
      return {
        ...updatedPayment,
        new_status: newStatus,
        amount_paid: newAmountPaid,
        remaining_balance: invoiceData.total_amount - newAmountPaid
      };
    } catch (error) {
      logger.error(`Failed to update payment ${paymentId}`, error);
      throw error;
    }
  }

  /**
   * Confirm a payment
   * @param {number} paymentId Payment ID
   * @returns {Object} Result of operation
   */
  async confirmPayment(paymentId) {
    try {
      // Check if payment exists
      const payment = await this.getPaymentById(paymentId);
      if (!payment) {
        throw new Error(`Payment with ID ${paymentId} not found`);
      }

      if (payment.is_confirmed) {
        return { success: true, message: 'Payment already confirmed', payment };
      }

      // Update payment
      await this.db.run(`
        UPDATE ${this.paymentsTable}
        SET 
          is_confirmed = 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [paymentId]);

      // Get invoice and client info
      const invoice = new Invoice();
      const invoiceData = await invoice.findById(payment.invoice_id);
      
      const client = await this.db.get(`
        SELECT * FROM clients WHERE id = ?
      `, [invoiceData.client_id]);

      // Create notification
      await this.notificationService.create({
        type: 'payment_confirmed',
        title: `Payment confirmed for Invoice #${invoiceData.invoice_number}`,
        message: `Payment of ${payment.amount.toFixed(2)} for Invoice #${invoiceData.invoice_number} has been confirmed`,
        entity_id: payment.invoice_id,
        entity_type: 'invoice'
      });

      // Get payment method
      const paymentMethod = await this.db.get(`
        SELECT * FROM ${this.paymentMethodsTable} WHERE id = ?
      `, [payment.payment_method]);

      // Send payment receipt to client if we have email
      if (client && client.email) {
        await this._sendPaymentReceipt(invoiceData, payment, client, paymentMethod);
      }

      logger.info(`Confirmed payment ${paymentId} for invoice ${payment.invoice_id}`);
      
      const updatedPayment = await this.getPaymentById(paymentId);
      
      return {
        success: true,
        message: 'Payment confirmed successfully',
        payment: updatedPayment
      };
    } catch (error) {
      logger.error(`Failed to confirm payment ${paymentId}`, error);
      throw error;
    }
  }

  /**
   * Delete a payment
   * @param {number} paymentId Payment ID
   * @returns {Object} Result of operation
   */
  async deletePayment(paymentId) {
    try {
      // Check if payment exists
      const payment = await this.getPaymentById(paymentId);
      if (!payment) {
        throw new Error(`Payment with ID ${paymentId} not found`);
      }

      // Get invoice data
      const invoice = new Invoice();
      const invoiceData = await invoice.findById(payment.invoice_id);
      if (!invoiceData) {
        throw new Error(`Invoice with ID ${payment.invoice_id} not found`);
      }

      // Calculate new amount paid
      const newAmountPaid = invoiceData.amount_paid - payment.amount;
      
      // Determine new status
      let newStatus = invoiceData.status;
      if (newAmountPaid <= 0) {
        // No payments remaining
        const dueDate = new Date(invoiceData.due_date);
        const now = new Date();
        newStatus = dueDate < now ? 'overdue' : 'pending';
      } else if (newAmountPaid < invoiceData.total_amount) {
        // Partial payment
        newStatus = 'partial';
      }

      // Delete payment
      await this.db.run(`DELETE FROM ${this.paymentsTable} WHERE id = ?`, [paymentId]);

      // Update invoice
      await this.db.run(`
        UPDATE invoices
        SET amount_paid = ?, status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [newAmountPaid, newStatus, payment.invoice_id]);

      // Create notification
      await this.notificationService.create({
        type: 'payment_deleted',
        title: `Payment deleted for Invoice #${invoiceData.invoice_number}`,
        message: `Payment of ${payment.amount.toFixed(2)} for Invoice #${invoiceData.invoice_number} has been deleted`,
        entity_id: payment.invoice_id,
        entity_type: 'invoice'
      });

      logger.info(`Deleted payment ${paymentId} for invoice ${payment.invoice_id}`);
      
      return {
        success: true,
        message: 'Payment deleted successfully',
        invoice_id: payment.invoice_id,
        new_status: newStatus,
        amount_paid: newAmountPaid,
        remaining_balance: invoiceData.total_amount - newAmountPaid
      };
    } catch (error) {
      logger.error(`Failed to delete payment ${paymentId}`, error);
      throw error;
    }
  }

  /**
   * Get all payment methods
   * @param {boolean} activeOnly Only return active methods
   * @returns {Array} Payment methods
   */
  async getPaymentMethods(activeOnly = true) {
    try {
      let query = `SELECT * FROM ${this.paymentMethodsTable}`;
      
      if (activeOnly) {
        query += ` WHERE is_active = 1`;
      }
      
      query += ` ORDER BY name`;
      
      return await this.db.all(query);
    } catch (error) {
      logger.error('Failed to get payment methods', error);
      throw error;
    }
  }

  /**
   * Get payment method by ID
   * @param {number} methodId Method ID
   * @returns {Object} Payment method
   */
  async getPaymentMethodById(methodId) {
    try {
      return await this.db.get(`
        SELECT * FROM ${this.paymentMethodsTable} WHERE id = ?
      `, [methodId]);
    } catch (error) {
      logger.error(`Failed to get payment method ${methodId}`, error);
      throw error;
    }
  }

  /**
   * Add a new payment method
   * @param {Object} methodData Method data
   * @returns {Object} Created method
   */
  async addPaymentMethod(methodData) {
    try {
      if (!methodData.name) {
        throw new Error('Payment method name is required');
      }

      // Check if method with same name already exists
      const existing = await this.db.get(`
        SELECT * FROM ${this.paymentMethodsTable} WHERE name = ?
      `, [methodData.name]);

      if (existing) {
        throw new Error(`Payment method "${methodData.name}" already exists`);
      }

      const result = await this.db.run(`
        INSERT INTO ${this.paymentMethodsTable} 
        (name, description, is_active, requires_confirmation)
        VALUES (?, ?, ?, ?)
      `, [
        methodData.name,
        methodData.description || '',
        methodData.is_active ?? true,
        methodData.requires_confirmation ?? false
      ]);

      logger.info(`Added payment method: ${methodData.name}`);
      
      const newMethod = await this.db.get(`
        SELECT * FROM ${this.paymentMethodsTable} WHERE id = ?
      `, [result.lastID]);
      
      return newMethod;
    } catch (error) {
      logger.error('Failed to add payment method', error);
      throw error;
    }
  }

  /**
   * Update a payment method
   * @param {number} methodId Method ID
   * @param {Object} methodData Method data to update
   * @returns {Object} Updated method
   */
  async updatePaymentMethod(methodId, methodData) {
    try {
      const method = await this.getPaymentMethodById(methodId);
      
      if (!method) {
        throw new Error(`Payment method with ID ${methodId} not found`);
      }

      // If changing name, check if new name already exists
      if (methodData.name && methodData.name !== method.name) {
        const existing = await this.db.get(`
          SELECT * FROM ${this.paymentMethodsTable} WHERE name = ? AND id != ?
        `, [methodData.name, methodId]);

        if (existing) {
          throw new Error(`Payment method "${methodData.name}" already exists`);
        }
      }

      await this.db.run(`
        UPDATE ${this.paymentMethodsTable}
        SET 
          name = ?,
          description = ?,
          is_active = ?,
          requires_confirmation = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [
        methodData.name ?? method.name,
        methodData.description ?? method.description,
        methodData.is_active ?? method.is_active,
        methodData.requires_confirmation ?? method.requires_confirmation,
        methodId
      ]);

      logger.info(`Updated payment method: ${methodId}`);
      
      return await this.getPaymentMethodById(methodId);
    } catch (error) {
      logger.error(`Failed to update payment method ${methodId}`, error);
      throw error;
    }
  }

  /**
   * Delete a payment method
   * @param {number} methodId Method ID
   * @returns {Object} Result of operation
   */
  async deletePaymentMethod(methodId) {
    try {
      const method = await this.getPaymentMethodById(methodId);
      
      if (!method) {
        throw new Error(`Payment method with ID ${methodId} not found`);
      }

      // Check if method is in use
      const paymentsUsingMethod = await this.db.get(`
        SELECT COUNT(*) as count FROM ${this.paymentsTable} WHERE payment_method = ?
      `, [methodId]);

      if (paymentsUsingMethod.count > 0) {
        // Instead of deleting, just mark as inactive
        await this.db.run(`
          UPDATE ${this.paymentMethodsTable}
          SET is_active = 0, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [methodId]);
        
        logger.info(`Deactivated payment method ${methodId} as it has ${paymentsUsingMethod.count} payments`);
        
        return {
          success: true,
          message: `Payment method "${method.name}" has been deactivated as it has ${paymentsUsingMethod.count} payments`,
          deactivated: true
        };
      }

      // No payments using this method, safe to delete
      await this.db.run(`DELETE FROM ${this.paymentMethodsTable} WHERE id = ?`, [methodId]);

      logger.info(`Deleted payment method: ${methodId}`);
      
      return {
        success: true,
        message: `Deleted payment method: ${method.name}`,
        deleted: true
      };
    } catch (error) {
      logger.error(`Failed to delete payment method ${methodId}`, error);
      throw error;
    }
  }

  /**
   * Get payment statistics
   * @param {Object} filters Optional filters like date range
   * @returns {Object} Payment statistics
   */
  async getPaymentStatistics(filters = {}) {
    try {
      let whereClause = '';
      const params = [];
      
      if (filters.startDate) {
        whereClause += whereClause ? ' AND ' : ' WHERE ';
        whereClause += 'p.payment_date >= ?';
        params.push(filters.startDate);
      }
      
      if (filters.endDate) {
        whereClause += whereClause ? ' AND ' : ' WHERE ';
        whereClause += 'p.payment_date <= ?';
        params.push(filters.endDate);
      }

      // Get total payments
      const totalPayments = await this.db.get(`
        SELECT 
          COUNT(*) as count,
          SUM(amount) as total_amount
        FROM ${this.paymentsTable} p
        ${whereClause}
      `, params);

      // Get payments by method
      const paymentsByMethod = await this.db.all(`
        SELECT 
          pm.id,
          pm.name,
          COUNT(p.id) as count,
          SUM(p.amount) as total_amount
        FROM ${this.paymentsTable} p
        JOIN ${this.paymentMethodsTable} pm ON p.payment_method = pm.id
        ${whereClause}
        GROUP BY pm.id
        ORDER BY total_amount DESC
      `, params);

      // Get payments by month
      const paymentsByMonth = await this.db.all(`
        SELECT 
          strftime('%Y-%m', p.payment_date) as month,
          COUNT(*) as count,
          SUM(p.amount) as total_amount
        FROM ${this.paymentsTable} p
        ${whereClause}
        GROUP BY month
        ORDER BY month
      `, params);

      return {
        total_payments: totalPayments.count || 0,
        total_amount: totalPayments.total_amount || 0,
        by_method: paymentsByMethod,
        by_month: paymentsByMonth
      };
    } catch (error) {
      logger.error('Failed to get payment statistics', error);
      throw error;
    }
  }

  /**
   * Send payment receipt to client
   * @param {Object} invoice Invoice data
   * @param {Object} payment Payment data
   * @param {Object} client Client data
   * @param {Object} paymentMethod Payment method data
   * @returns {Object} Email send result
   * @private
   */
  async _sendPaymentReceipt(invoice, payment, client, paymentMethod) {
    try {
      // Get company info
      const companyInfo = await this.db.get(`
        SELECT * FROM system_settings WHERE category = 'company'
      `);

      const companyName = companyInfo ? JSON.parse(companyInfo.value).name : 'Your Company';
      
      // Prepare email data
      const subject = `Payment Receipt - Invoice #${invoice.invoice_number}`;
      
      const body = `
Dear ${client.first_name} ${client.last_name},

We have received your payment of ${payment.amount.toFixed(2)} for Invoice #${invoice.invoice_number}.

Payment Details:
- Invoice: #${invoice.invoice_number}
- Amount Paid: ${payment.amount.toFixed(2)}
- Payment Date: ${new Date(payment.payment_date).toLocaleDateString()}
- Payment Method: ${paymentMethod.name}
${payment.reference_number ? `- Reference Number: ${payment.reference_number}` : ''}

${invoice.status === 'paid' 
  ? 'Your invoice has been fully paid. Thank you for your business!'
  : `Your remaining balance is ${(invoice.total_amount - invoice.amount_paid).toFixed(2)}.`}

If you have any questions about this payment or your invoice, please don't hesitate to contact us.

Thank you for your business.

Regards,
${companyName}
      `;

      // Send email
      return await this.emailService.sendEmail({
        to: client.email,
        subject: subject,
        body: body,
        attachments: [] // Could attach invoice receipt PDF here
      });
    } catch (error) {
      logger.error('Failed to send payment receipt', error);
      // Don't throw error, just log it - this shouldn't block the payment process
      return { success: false, error: error.message };
    }
  }
}

module.exports = new InvoicePaymentService(); 