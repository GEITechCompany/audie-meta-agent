const { getDatabase } = require('../database');
const logger = require('../utils/logger');
const NotificationService = require('./NotificationService');
const EmailService = require('./EmailService');

class PaymentService {
  constructor() {
    this.db = getDatabase();
    this.paymentsTable = 'invoice_payments';
    this.invoicesTable = 'invoices';
    this.notificationService = new NotificationService();
    this.emailService = new EmailService();
    this.ensurePaymentTables();
  }

  async ensurePaymentTables() {
    try {
      // Check if payments metadata table exists
      const paymentMetadataTableExists = await this.db.get(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='payment_metadata'`
      );

      if (!paymentMetadataTableExists) {
        // Create payment metadata table for storing additional payment information
        await this.db.run(`
          CREATE TABLE payment_metadata (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            payment_id INTEGER NOT NULL,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (payment_id) REFERENCES ${this.paymentsTable}(id)
          )
        `);

        logger.info('Created payment_metadata table');
      }

      // Check if payment methods table exists
      const paymentMethodsTableExists = await this.db.get(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='payment_methods'`
      );

      if (!paymentMethodsTableExists) {
        // Create payment methods table
        await this.db.run(`
          CREATE TABLE payment_methods (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT 1,
            requires_processing BOOLEAN NOT NULL DEFAULT 0,
            processing_fee_percentage REAL DEFAULT 0,
            processing_fee_fixed REAL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        `);

        // Insert default payment methods
        const now = new Date().toISOString();
        await this.db.run(`
          INSERT INTO payment_methods 
          (name, is_active, requires_processing, processing_fee_percentage, processing_fee_fixed, created_at, updated_at)
          VALUES
          ('Credit Card', 1, 1, 2.9, 0.30, ?, ?),
          ('Bank Transfer', 1, 0, 0, 0, ?, ?),
          ('Check', 1, 0, 0, 0, ?, ?),
          ('Cash', 1, 0, 0, 0, ?, ?),
          ('PayPal', 1, 1, 2.9, 0.30, ?, ?)
        `, [now, now, now, now, now, now, now, now, now, now]);

        logger.info('Created payment_methods table with default methods');
      }
    } catch (error) {
      logger.error(`Error ensuring payment tables: ${error.message}`);
      throw error;
    }
  }

  async recordPayment(invoiceId, paymentData) {
    try {
      // Get the invoice
      const invoice = await this.db.get(
        `SELECT i.*, c.name as client_name, c.email as client_email 
         FROM ${this.invoicesTable} i
         JOIN clients c ON i.client_id = c.id
         WHERE i.id = ?`,
        [invoiceId]
      );

      if (!invoice) {
        throw new Error(`Invoice with id ${invoiceId} not found`);
      }

      if (invoice.status === 'canceled') {
        throw new Error('Cannot record payment for a canceled invoice');
      }

      if (invoice.status === 'paid') {
        throw new Error('Invoice is already marked as paid');
      }

      // Validate payment amount
      if (!paymentData.amount || isNaN(paymentData.amount) || paymentData.amount <= 0) {
        throw new Error('Payment amount must be a positive number');
      }

      const outstandingAmount = invoice.total_amount - invoice.amount_paid;
      
      if (paymentData.amount > outstandingAmount) {
        throw new Error(`Payment amount (${paymentData.amount}) exceeds outstanding amount (${outstandingAmount})`);
      }

      const now = new Date().toISOString();
      const paymentDate = paymentData.payment_date || now;
      
      // Calculate processing fee if applicable
      let processingFee = 0;
      
      if (paymentData.payment_method_id) {
        const paymentMethod = await this.db.get(
          'SELECT * FROM payment_methods WHERE id = ?',
          [paymentData.payment_method_id]
        );
        
        if (paymentMethod && paymentMethod.requires_processing) {
          processingFee = (paymentMethod.processing_fee_percentage / 100 * paymentData.amount) + 
                          (paymentMethod.processing_fee_fixed || 0);
        }
      }

      // Insert payment record
      const result = await this.db.run(
        `INSERT INTO ${this.paymentsTable} 
         (invoice_id, amount, payment_date, payment_method, reference_number, notes, processing_fee, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceId,
          paymentData.amount,
          paymentDate,
          paymentData.payment_method || 'Other',
          paymentData.reference_number || null,
          paymentData.notes || null,
          processingFee,
          now
        ]
      );

      const paymentId = result.lastID;

      // Store additional payment metadata if provided
      if (paymentData.metadata && typeof paymentData.metadata === 'object') {
        for (const [key, value] of Object.entries(paymentData.metadata)) {
          await this.db.run(
            `INSERT INTO payment_metadata (payment_id, key, value, created_at)
             VALUES (?, ?, ?, ?)`,
            [paymentId, key, value.toString(), now]
          );
        }
      }

      // Update invoice amount_paid and status
      const newAmountPaid = invoice.amount_paid + paymentData.amount;
      const newStatus = newAmountPaid >= invoice.total_amount ? 'paid' : 
                       (newAmountPaid > 0 ? 'partially_paid' : 'pending');
      
      const paidAt = newStatus === 'paid' ? now : null;
      
      await this.db.run(
        `UPDATE ${this.invoicesTable}
         SET amount_paid = ?, status = ?, paid_at = ?, updated_at = ?
         WHERE id = ?`,
        [newAmountPaid, newStatus, paidAt, now, invoiceId]
      );

      // Create notification
      const notificationMessage = newStatus === 'paid' 
        ? `Full payment of ${paymentData.amount.toFixed(2)} received for Invoice #${invoice.invoice_number}`
        : `Partial payment of ${paymentData.amount.toFixed(2)} received for Invoice #${invoice.invoice_number}`;
      
      await this.notificationService.create({
        type: newStatus === 'paid' ? 'invoice_paid' : 'payment_received',
        title: newStatus === 'paid' ? 'Invoice Paid' : 'Payment Received',
        message: notificationMessage,
        entity_id: invoiceId,
        entity_type: 'invoice'
      });

      // Send payment confirmation email to client if email is available
      if (invoice.client_email) {
        const remainingAmount = invoice.total_amount - newAmountPaid;
        
        const emailSubject = newStatus === 'paid' 
          ? `Payment Confirmation - Invoice #${invoice.invoice_number} Fully Paid`
          : `Payment Confirmation - Invoice #${invoice.invoice_number}`;
        
        const emailBody = `Dear ${invoice.client_name},

Thank you for your payment of $${paymentData.amount.toFixed(2)} for Invoice #${invoice.invoice_number}.

${newStatus === 'paid' 
  ? 'Your invoice has been fully paid. Thank you for your business.' 
  : `Outstanding balance: $${remainingAmount.toFixed(2)}`}

${paymentData.notes ? `\nNotes: ${paymentData.notes}` : ''}

Payment details:
- Payment method: ${paymentData.payment_method || 'Other'}
- Payment date: ${new Date(paymentDate).toLocaleDateString()}
${paymentData.reference_number ? `- Reference number: ${paymentData.reference_number}` : ''}

Please contact us if you have any questions regarding this payment.

Thank you,
Your Company Name`;

        await this.emailService.sendEmail({
          to: invoice.client_email,
          subject: emailSubject,
          body: emailBody,
          type: 'payment_confirmation'
        });
      }

      // Return payment details
      return {
        id: paymentId,
        invoice_id: invoiceId,
        amount: paymentData.amount,
        payment_date: paymentDate,
        payment_method: paymentData.payment_method || 'Other',
        reference_number: paymentData.reference_number,
        notes: paymentData.notes,
        processing_fee: processingFee,
        invoice_status: newStatus,
        invoice_amount_paid: newAmountPaid,
        invoice_total_amount: invoice.total_amount,
        invoice_remaining: invoice.total_amount - newAmountPaid
      };
    } catch (error) {
      logger.error(`Error recording payment for invoice ${invoiceId}: ${error.message}`);
      throw error;
    }
  }

  async getPaymentMethods() {
    try {
      return await this.db.all('SELECT * FROM payment_methods ORDER BY name');
    } catch (error) {
      logger.error(`Error getting payment methods: ${error.message}`);
      throw error;
    }
  }

  async updatePaymentMethod(id, data) {
    try {
      const paymentMethod = await this.db.get(
        'SELECT * FROM payment_methods WHERE id = ?',
        [id]
      );

      if (!paymentMethod) {
        throw new Error(`Payment method with id ${id} not found`);
      }

      const now = new Date().toISOString();

      await this.db.run(
        `UPDATE payment_methods
         SET name = ?,
             is_active = ?,
             requires_processing = ?,
             processing_fee_percentage = ?,
             processing_fee_fixed = ?,
             updated_at = ?
         WHERE id = ?`,
        [
          data.name || paymentMethod.name,
          data.is_active !== undefined ? data.is_active : paymentMethod.is_active,
          data.requires_processing !== undefined ? data.requires_processing : paymentMethod.requires_processing,
          data.processing_fee_percentage !== undefined ? data.processing_fee_percentage : paymentMethod.processing_fee_percentage,
          data.processing_fee_fixed !== undefined ? data.processing_fee_fixed : paymentMethod.processing_fee_fixed,
          now,
          id
        ]
      );

      return await this.db.get('SELECT * FROM payment_methods WHERE id = ?', [id]);
    } catch (error) {
      logger.error(`Error updating payment method ${id}: ${error.message}`);
      throw error;
    }
  }

  async createPaymentMethod(data) {
    try {
      if (!data.name) {
        throw new Error('Payment method name is required');
      }

      const now = new Date().toISOString();

      const result = await this.db.run(
        `INSERT INTO payment_methods
         (name, is_active, requires_processing, processing_fee_percentage, processing_fee_fixed, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          data.name,
          data.is_active !== undefined ? data.is_active : 1,
          data.requires_processing !== undefined ? data.requires_processing : 0,
          data.processing_fee_percentage || 0,
          data.processing_fee_fixed || 0,
          now,
          now
        ]
      );

      return await this.db.get('SELECT * FROM payment_methods WHERE id = ?', [result.lastID]);
    } catch (error) {
      logger.error(`Error creating payment method: ${error.message}`);
      throw error;
    }
  }

  async getPaymentById(paymentId) {
    try {
      const payment = await this.db.get(
        `SELECT p.*, i.invoice_number 
         FROM ${this.paymentsTable} p
         JOIN ${this.invoicesTable} i ON p.invoice_id = i.id
         WHERE p.id = ?`,
        [paymentId]
      );

      if (!payment) {
        return null;
      }

      // Get payment metadata
      payment.metadata = await this.db.all(
        'SELECT key, value FROM payment_metadata WHERE payment_id = ?',
        [paymentId]
      );

      return payment;
    } catch (error) {
      logger.error(`Error getting payment ${paymentId}: ${error.message}`);
      throw error;
    }
  }

  async getPaymentsForInvoice(invoiceId) {
    try {
      return await this.db.all(
        `SELECT * FROM ${this.paymentsTable} WHERE invoice_id = ? ORDER BY payment_date DESC`,
        [invoiceId]
      );
    } catch (error) {
      logger.error(`Error getting payments for invoice ${invoiceId}: ${error.message}`);
      throw error;
    }
  }

  async deletePayment(paymentId) {
    try {
      const payment = await this.getPaymentById(paymentId);
      
      if (!payment) {
        throw new Error(`Payment with id ${paymentId} not found`);
      }
      
      // Get the invoice
      const invoice = await this.db.get(
        `SELECT * FROM ${this.invoicesTable} WHERE id = ?`,
        [payment.invoice_id]
      );
      
      if (!invoice) {
        throw new Error(`Invoice with id ${payment.invoice_id} not found`);
      }
      
      // Start a transaction
      await this.db.run('BEGIN TRANSACTION');
      
      try {
        // Delete payment metadata
        await this.db.run(
          'DELETE FROM payment_metadata WHERE payment_id = ?',
          [paymentId]
        );
        
        // Delete payment
        await this.db.run(
          `DELETE FROM ${this.paymentsTable} WHERE id = ?`,
          [paymentId]
        );
        
        // Update invoice amount_paid and status
        const newAmountPaid = invoice.amount_paid - payment.amount;
        const newStatus = newAmountPaid <= 0 ? 'pending' : 
                        (newAmountPaid < invoice.total_amount ? 'partially_paid' : 'paid');
        
        // If it was fully paid and now isn't, clear the paid_at date
        const paidAt = newStatus === 'paid' ? invoice.paid_at : null;
        
        await this.db.run(
          `UPDATE ${this.invoicesTable}
           SET amount_paid = ?, status = ?, paid_at = ?, updated_at = ?
           WHERE id = ?`,
          [newAmountPaid, newStatus, paidAt, new Date().toISOString(), payment.invoice_id]
        );
        
        // Create notification
        await this.notificationService.create({
          type: 'payment_deleted',
          title: 'Payment Removed',
          message: `Payment of ${payment.amount.toFixed(2)} removed from Invoice #${payment.invoice_number}`,
          entity_id: payment.invoice_id,
          entity_type: 'invoice'
        });
        
        // Commit the transaction
        await this.db.run('COMMIT');
        
        return { 
          success: true, 
          invoice_id: payment.invoice_id,
          invoice_new_status: newStatus,
          invoice_new_amount_paid: newAmountPaid
        };
      } catch (error) {
        // Rollback on error
        await this.db.run('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error(`Error deleting payment ${paymentId}: ${error.message}`);
      throw error;
    }
  }

  async getPaymentStatistics(startDate = null, endDate = null) {
    try {
      const params = [];
      let dateFilter = '';
      
      if (startDate) {
        dateFilter += ' AND p.payment_date >= ?';
        params.push(startDate);
      }
      
      if (endDate) {
        dateFilter += ' AND p.payment_date <= ?';
        params.push(endDate);
      }
      
      // Get total payments and amount
      const totalPayments = await this.db.get(
        `SELECT COUNT(*) as count, SUM(amount) as total_amount, SUM(processing_fee) as total_fees
         FROM ${this.paymentsTable} p
         WHERE 1=1${dateFilter}`,
        params
      );
      
      // Get payments by method
      const paymentsByMethod = await this.db.all(
        `SELECT payment_method, COUNT(*) as count, SUM(amount) as total_amount
         FROM ${this.paymentsTable} p
         WHERE 1=1${dateFilter}
         GROUP BY payment_method
         ORDER BY total_amount DESC`,
        params
      );
      
      // Get payments by month (for the last 12 months if no date filter)
      const paymentsByMonth = await this.db.all(
        `SELECT 
           strftime('%Y-%m', p.payment_date) as month,
           COUNT(*) as count,
           SUM(amount) as total_amount
         FROM ${this.paymentsTable} p
         WHERE 1=1${dateFilter}
         GROUP BY month
         ORDER BY month DESC
         LIMIT 12`,
        params
      );
      
      return {
        total_count: totalPayments.count,
        total_amount: totalPayments.total_amount,
        total_processing_fees: totalPayments.total_fees,
        by_payment_method: paymentsByMethod,
        by_month: paymentsByMonth
      };
    } catch (error) {
      logger.error(`Error getting payment statistics: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new PaymentService(); 