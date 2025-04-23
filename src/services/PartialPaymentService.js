const { getDatabase } = require('../database');
const logger = require('../utils/logger');
const PaymentService = require('./PaymentService');
const NotificationService = require('./NotificationService');
const EmailService = require('./EmailService');

class PartialPaymentService {
  constructor() {
    this.db = getDatabase();
    this.invoicesTable = 'invoices';
    this.paymentsTable = 'invoice_payments';
    this.paymentPlansTable = 'payment_plans';
    this.paymentPlanScheduleTable = 'payment_plan_schedule';
    this.notificationService = new NotificationService();
    this.emailService = new EmailService();
    this.paymentService = PaymentService;
    this.ensureTables();
  }

  async ensureTables() {
    try {
      // Check if payment plans table exists
      const paymentPlansTableExists = await this.db.get(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='${this.paymentPlansTable}'`
      );

      if (!paymentPlansTableExists) {
        // Create payment plans table
        await this.db.run(`
          CREATE TABLE ${this.paymentPlansTable} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            total_installments INTEGER NOT NULL,
            installments_paid INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (invoice_id) REFERENCES ${this.invoicesTable}(id)
          )
        `);

        logger.info(`Created ${this.paymentPlansTable} table`);
      }

      // Check if payment plan schedule table exists
      const scheduleTableExists = await this.db.get(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='${this.paymentPlanScheduleTable}'`
      );

      if (!scheduleTableExists) {
        // Create payment plan schedule table
        await this.db.run(`
          CREATE TABLE ${this.paymentPlanScheduleTable} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            payment_plan_id INTEGER NOT NULL,
            installment_number INTEGER NOT NULL,
            amount REAL NOT NULL,
            due_date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            payment_id INTEGER,
            reminder_sent INTEGER DEFAULT 0,
            notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (payment_plan_id) REFERENCES ${this.paymentPlansTable}(id),
            FOREIGN KEY (payment_id) REFERENCES ${this.paymentsTable}(id)
          )
        `);

        logger.info(`Created ${this.paymentPlanScheduleTable} table`);
      }
    } catch (error) {
      logger.error(`Error ensuring partial payment tables: ${error.message}`);
      throw error;
    }
  }

  async createPaymentPlan(invoiceId, planData) {
    try {
      // Get the invoice
      const invoice = await this.db.get(
        `SELECT * FROM ${this.invoicesTable} WHERE id = ?`,
        [invoiceId]
      );

      if (!invoice) {
        throw new Error(`Invoice with id ${invoiceId} not found`);
      }

      if (invoice.status === 'canceled') {
        throw new Error('Cannot create payment plan for a canceled invoice');
      }

      if (invoice.status === 'paid') {
        throw new Error('Cannot create payment plan for a fully paid invoice');
      }

      // Validate payment plan data
      if (!planData.name) {
        throw new Error('Payment plan name is required');
      }

      if (!planData.total_installments || planData.total_installments < 2) {
        throw new Error('Payment plan must have at least 2 installments');
      }

      if (!planData.installments || !Array.isArray(planData.installments) || 
          planData.installments.length !== planData.total_installments) {
        throw new Error('Installments must be provided and match total_installments count');
      }

      // Validate that installment amounts sum up to remaining invoice amount
      const remainingAmount = invoice.total_amount - invoice.amount_paid;
      const totalInstallmentAmount = planData.installments.reduce(
        (sum, installment) => sum + parseFloat(installment.amount), 0
      );

      if (Math.abs(totalInstallmentAmount - remainingAmount) > 0.01) { // Allow for small floating point differences
        throw new Error(`Total installment amount (${totalInstallmentAmount}) does not match remaining invoice amount (${remainingAmount})`);
      }

      const now = new Date().toISOString();

      // Begin transaction
      await this.db.run('BEGIN TRANSACTION');

      try {
        // Insert payment plan
        const planResult = await this.db.run(
          `INSERT INTO ${this.paymentPlansTable} 
           (invoice_id, name, description, total_installments, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            invoiceId,
            planData.name,
            planData.description || '',
            planData.total_installments,
            now,
            now
          ]
        );

        const paymentPlanId = planResult.lastID;

        // Insert installment schedule
        for (const installment of planData.installments) {
          if (!installment.amount || isNaN(installment.amount) || installment.amount <= 0) {
            throw new Error('Each installment must have a positive amount');
          }

          if (!installment.due_date) {
            throw new Error('Each installment must have a due date');
          }

          await this.db.run(
            `INSERT INTO ${this.paymentPlanScheduleTable} 
             (payment_plan_id, installment_number, amount, due_date, status, notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              paymentPlanId,
              installment.installment_number,
              installment.amount,
              installment.due_date,
              'pending',
              installment.notes || null,
              now,
              now
            ]
          );
        }

        // Update invoice status to payment_plan
        await this.db.run(
          `UPDATE ${this.invoicesTable} 
           SET status = 'payment_plan', updated_at = ? 
           WHERE id = ?`,
          [now, invoiceId]
        );

        // Create notification
        await this.notificationService.create({
          type: 'payment_plan_created',
          title: 'Payment Plan Created',
          message: `Payment plan "${planData.name}" created for Invoice #${invoice.invoice_number} with ${planData.total_installments} installments`,
          entity_id: invoiceId,
          entity_type: 'invoice'
        });

        await this.db.run('COMMIT');

        return {
          id: paymentPlanId,
          invoice_id: invoiceId,
          name: planData.name,
          description: planData.description || '',
          total_installments: planData.total_installments,
          installments_paid: 0,
          status: 'active',
          created_at: now,
          updated_at: now,
          installments: planData.installments.map(installment => ({
            ...installment,
            status: 'pending',
            payment_id: null,
            reminder_sent: 0
          }))
        };
      } catch (error) {
        await this.db.run('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error(`Error creating payment plan for invoice ${invoiceId}: ${error.message}`);
      throw error;
    }
  }

  async getPaymentPlan(paymentPlanId) {
    try {
      const plan = await this.db.get(
        `SELECT p.*, i.invoice_number 
         FROM ${this.paymentPlansTable} p
         JOIN ${this.invoicesTable} i ON p.invoice_id = i.id
         WHERE p.id = ?`,
        [paymentPlanId]
      );

      if (!plan) {
        return null;
      }

      // Get installments
      plan.installments = await this.db.all(
        `SELECT * FROM ${this.paymentPlanScheduleTable} 
         WHERE payment_plan_id = ? 
         ORDER BY installment_number`,
        [paymentPlanId]
      );

      return plan;
    } catch (error) {
      logger.error(`Error getting payment plan ${paymentPlanId}: ${error.message}`);
      throw error;
    }
  }

  async getPaymentPlanForInvoice(invoiceId) {
    try {
      const plan = await this.db.get(
        `SELECT * FROM ${this.paymentPlansTable} WHERE invoice_id = ?`,
        [invoiceId]
      );

      if (!plan) {
        return null;
      }

      return await this.getPaymentPlan(plan.id);
    } catch (error) {
      logger.error(`Error getting payment plan for invoice ${invoiceId}: ${error.message}`);
      throw error;
    }
  }

  async recordPaymentForInstallment(installmentId, paymentData) {
    try {
      // Get the installment
      const installment = await this.db.get(
        `SELECT s.*, p.invoice_id, p.id as payment_plan_id
         FROM ${this.paymentPlanScheduleTable} s
         JOIN ${this.paymentPlansTable} p ON s.payment_plan_id = p.id
         WHERE s.id = ?`,
        [installmentId]
      );

      if (!installment) {
        throw new Error(`Installment with id ${installmentId} not found`);
      }

      if (installment.status === 'paid') {
        throw new Error('This installment has already been paid');
      }

      // Make sure payment amount matches installment amount
      if (paymentData.amount !== installment.amount) {
        // If we allow partial payments of installments, this would need to be modified
        throw new Error(`Payment amount must match installment amount (${installment.amount})`);
      }

      // Begin transaction
      await this.db.run('BEGIN TRANSACTION');

      try {
        // Record payment using the PaymentService
        const payment = await this.paymentService.recordPayment(installment.invoice_id, paymentData);

        // Update installment status
        const now = new Date().toISOString();
        await this.db.run(
          `UPDATE ${this.paymentPlanScheduleTable}
           SET status = 'paid', payment_id = ?, updated_at = ?
           WHERE id = ?`,
          [payment.id, now, installmentId]
        );

        // Update payment plan installments_paid count
        await this.db.run(
          `UPDATE ${this.paymentPlansTable}
           SET installments_paid = installments_paid + 1, updated_at = ?
           WHERE id = ?`,
          [now, installment.payment_plan_id]
        );

        // Check if all installments are paid
        const paymentPlan = await this.getPaymentPlan(installment.payment_plan_id);
        
        if (paymentPlan.installments_paid === paymentPlan.total_installments) {
          // Mark payment plan as completed
          await this.db.run(
            `UPDATE ${this.paymentPlansTable}
             SET status = 'completed', updated_at = ?
             WHERE id = ?`,
            [now, installment.payment_plan_id]
          );

          // Create notification for completed payment plan
          await this.notificationService.create({
            type: 'payment_plan_completed',
            title: 'Payment Plan Completed',
            message: `Payment plan "${paymentPlan.name}" for Invoice #${paymentPlan.invoice_number} has been completed`,
            entity_id: installment.invoice_id,
            entity_type: 'invoice'
          });
        }

        await this.db.run('COMMIT');

        return {
          success: true,
          payment_id: payment.id,
          installment_id: installmentId,
          installment_status: 'paid',
          payment_plan_id: installment.payment_plan_id,
          installments_paid: paymentPlan.installments_paid,
          total_installments: paymentPlan.total_installments,
          payment_plan_status: paymentPlan.status
        };
      } catch (error) {
        await this.db.run('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error(`Error recording payment for installment ${installmentId}: ${error.message}`);
      throw error;
    }
  }

  async getDueInstallments(daysThreshold = 7) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysThreshold);
      const futureDateStr = futureDate.toISOString().split('T')[0];

      return await this.db.all(
        `SELECT s.*, p.name as plan_name, p.invoice_id, i.invoice_number, 
                c.name as client_name, c.email as client_email
         FROM ${this.paymentPlanScheduleTable} s
         JOIN ${this.paymentPlansTable} p ON s.payment_plan_id = p.id
         JOIN ${this.invoicesTable} i ON p.invoice_id = i.id
         JOIN clients c ON i.client_id = c.id
         WHERE s.status = 'pending'
         AND s.due_date BETWEEN ? AND ?
         ORDER BY s.due_date`,
        [today, futureDateStr]
      );
    } catch (error) {
      logger.error(`Error getting due installments: ${error.message}`);
      throw error;
    }
  }

  async getOverdueInstallments() {
    try {
      const today = new Date().toISOString().split('T')[0];

      return await this.db.all(
        `SELECT s.*, p.name as plan_name, p.invoice_id, i.invoice_number, 
                c.name as client_name, c.email as client_email
         FROM ${this.paymentPlanScheduleTable} s
         JOIN ${this.paymentPlansTable} p ON s.payment_plan_id = p.id
         JOIN ${this.invoicesTable} i ON p.invoice_id = i.id
         JOIN clients c ON i.client_id = c.id
         WHERE s.status = 'pending'
         AND s.due_date < ?
         ORDER BY s.due_date`,
        [today]
      );
    } catch (error) {
      logger.error(`Error getting overdue installments: ${error.message}`);
      throw error;
    }
  }

  async sendInstallmentReminders() {
    try {
      const dueInstallments = await this.getDueInstallments(7);
      let reminderCount = 0;

      for (const installment of dueInstallments) {
        // Skip if reminder already sent
        if (installment.reminder_sent) {
          continue;
        }

        if (!installment.client_email) {
          logger.warn(`Cannot send reminder for installment ${installment.id} - client email not available`);
          continue;
        }

        const dueDate = new Date(installment.due_date).toLocaleDateString();
        const emailSubject = `Payment Reminder - Installment Due for Invoice #${installment.invoice_number}`;
        const emailBody = `Dear ${installment.client_name},

This is a friendly reminder that an installment payment of $${installment.amount.toFixed(2)} for Invoice #${installment.invoice_number} is due on ${dueDate}.

This is installment #${installment.installment_number} of your payment plan "${installment.plan_name}".

Please ensure payment is made by the due date to maintain your payment schedule.

Thank you for your business.

Your Company Name`;

        await this.emailService.sendEmail({
          to: installment.client_email,
          subject: emailSubject,
          body: emailBody,
          type: 'payment_reminder'
        });

        // Mark reminder as sent
        await this.db.run(
          `UPDATE ${this.paymentPlanScheduleTable}
           SET reminder_sent = 1, updated_at = ?
           WHERE id = ?`,
          [new Date().toISOString(), installment.id]
        );

        reminderCount++;
      }

      return {
        success: true,
        reminders_sent: reminderCount,
        total_due_installments: dueInstallments.length
      };
    } catch (error) {
      logger.error(`Error sending installment reminders: ${error.message}`);
      throw error;
    }
  }

  async updatePaymentPlan(paymentPlanId, updateData) {
    try {
      const plan = await this.getPaymentPlan(paymentPlanId);
      
      if (!plan) {
        throw new Error(`Payment plan with id ${paymentPlanId} not found`);
      }
      
      if (plan.status === 'completed') {
        throw new Error('Cannot update a completed payment plan');
      }
      
      const now = new Date().toISOString();
      
      // Only allow updating name and description
      await this.db.run(
        `UPDATE ${this.paymentPlansTable}
         SET name = ?, description = ?, updated_at = ?
         WHERE id = ?`,
        [
          updateData.name || plan.name,
          updateData.description !== undefined ? updateData.description : plan.description,
          now,
          paymentPlanId
        ]
      );
      
      return await this.getPaymentPlan(paymentPlanId);
    } catch (error) {
      logger.error(`Error updating payment plan ${paymentPlanId}: ${error.message}`);
      throw error;
    }
  }

  async updateInstallment(installmentId, updateData) {
    try {
      const installment = await this.db.get(
        `SELECT s.*, p.status as plan_status
         FROM ${this.paymentPlanScheduleTable} s
         JOIN ${this.paymentPlansTable} p ON s.payment_plan_id = p.id
         WHERE s.id = ?`,
        [installmentId]
      );
      
      if (!installment) {
        throw new Error(`Installment with id ${installmentId} not found`);
      }
      
      if (installment.status === 'paid') {
        throw new Error('Cannot update a paid installment');
      }
      
      if (installment.plan_status === 'completed') {
        throw new Error('Cannot update an installment in a completed payment plan');
      }
      
      const now = new Date().toISOString();
      
      // Update installment
      await this.db.run(
        `UPDATE ${this.paymentPlanScheduleTable}
         SET amount = ?, due_date = ?, notes = ?, updated_at = ?
         WHERE id = ?`,
        [
          updateData.amount || installment.amount,
          updateData.due_date || installment.due_date,
          updateData.notes !== undefined ? updateData.notes : installment.notes,
          now,
          installmentId
        ]
      );
      
      // If we're updating amount, make sure total still matches invoice remaining amount
      if (updateData.amount && updateData.amount !== installment.amount) {
        const paymentPlan = await this.getPaymentPlan(installment.payment_plan_id);
        const invoice = await this.db.get(
          `SELECT * FROM ${this.invoicesTable} WHERE id = ?`,
          [paymentPlan.invoice_id]
        );
        
        const remainingAmount = invoice.total_amount - invoice.amount_paid;
        const totalInstallmentAmount = paymentPlan.installments.reduce(
          (sum, i) => sum + (i.id === installmentId ? updateData.amount : i.amount), 0
        );
        
        if (Math.abs(totalInstallmentAmount - remainingAmount) > 0.01) {
          throw new Error(`Updated installment amounts (${totalInstallmentAmount}) would not match remaining invoice amount (${remainingAmount})`);
        }
      }
      
      return await this.db.get(
        `SELECT * FROM ${this.paymentPlanScheduleTable} WHERE id = ?`,
        [installmentId]
      );
    } catch (error) {
      logger.error(`Error updating installment ${installmentId}: ${error.message}`);
      throw error;
    }
  }

  async cancelPaymentPlan(paymentPlanId, reason) {
    try {
      const plan = await this.getPaymentPlan(paymentPlanId);
      
      if (!plan) {
        throw new Error(`Payment plan with id ${paymentPlanId} not found`);
      }
      
      if (plan.status !== 'active') {
        throw new Error(`Cannot cancel payment plan with status ${plan.status}`);
      }
      
      const now = new Date().toISOString();
      
      // Begin transaction
      await this.db.run('BEGIN TRANSACTION');
      
      try {
        // Mark pending installments as canceled
        await this.db.run(
          `UPDATE ${this.paymentPlanScheduleTable}
           SET status = 'canceled', notes = ?, updated_at = ?
           WHERE payment_plan_id = ? AND status = 'pending'`,
          [
            `Canceled: ${reason || 'Payment plan canceled'}`,
            now,
            paymentPlanId
          ]
        );
        
        // Mark payment plan as canceled
        await this.db.run(
          `UPDATE ${this.paymentPlansTable}
           SET status = 'canceled', updated_at = ?
           WHERE id = ?`,
          [now, paymentPlanId]
        );
        
        // Update invoice status based on payments
        const invoice = await this.db.get(
          `SELECT * FROM ${this.invoicesTable} WHERE id = ?`,
          [plan.invoice_id]
        );
        
        const newStatus = invoice.amount_paid > 0 ? 
          (invoice.amount_paid >= invoice.total_amount ? 'paid' : 'partially_paid') : 
          'pending';
        
        await this.db.run(
          `UPDATE ${this.invoicesTable}
           SET status = ?, updated_at = ?
           WHERE id = ?`,
          [newStatus, now, plan.invoice_id]
        );
        
        // Create notification
        await this.notificationService.create({
          type: 'payment_plan_canceled',
          title: 'Payment Plan Canceled',
          message: `Payment plan "${plan.name}" for Invoice #${plan.invoice_number} has been canceled${reason ? `: ${reason}` : ''}`,
          entity_id: plan.invoice_id,
          entity_type: 'invoice'
        });
        
        await this.db.run('COMMIT');
        
        return {
          success: true,
          payment_plan_id: paymentPlanId,
          invoice_id: plan.invoice_id,
          invoice_status: newStatus
        };
      } catch (error) {
        await this.db.run('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error(`Error canceling payment plan ${paymentPlanId}: ${error.message}`);
      throw error;
    }
  }

  async getPaymentPlanStatistics() {
    try {
      // Get overall statistics
      const overall = await this.db.get(
        `SELECT 
           COUNT(*) as total_plans,
           SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_plans,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_plans,
           SUM(CASE WHEN status = 'canceled' THEN 1 ELSE 0 END) as canceled_plans,
           SUM(installments_paid) as total_installments_paid,
           SUM(total_installments) as total_installments
         FROM ${this.paymentPlansTable}`
      );
      
      // Get statistics on pending installments
      const pendingStats = await this.db.get(
        `SELECT 
           COUNT(*) as total_pending,
           SUM(amount) as total_pending_amount,
           COUNT(CASE WHEN due_date < date('now') THEN 1 END) as overdue_count
         FROM ${this.paymentPlanScheduleTable}
         WHERE status = 'pending'`
      );
      
      // Get upcoming installments for the next 30 days
      const upcoming = await this.db.all(
        `SELECT due_date, COUNT(*) as count, SUM(amount) as total_amount
         FROM ${this.paymentPlanScheduleTable}
         WHERE status = 'pending'
         AND due_date BETWEEN date('now') AND date('now', '+30 days')
         GROUP BY due_date
         ORDER BY due_date`
      );
      
      return {
        total_plans: overall.total_plans,
        active_plans: overall.active_plans,
        completed_plans: overall.completed_plans,
        canceled_plans: overall.canceled_plans,
        completion_rate: overall.total_plans > 0 ? 
          (overall.completed_plans / overall.total_plans * 100).toFixed(2) + '%' : '0%',
        installments_paid: overall.total_installments_paid,
        total_installments: overall.total_installments,
        pending_installments: pendingStats.total_pending,
        pending_amount: pendingStats.total_pending_amount,
        overdue_installments: pendingStats.overdue_count,
        upcoming_installments: upcoming
      };
    } catch (error) {
      logger.error(`Error getting payment plan statistics: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new PartialPaymentService(); 