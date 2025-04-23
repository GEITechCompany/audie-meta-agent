/**
 * Service for handling overdue invoices with automated reminders and late fee processing
 */
const { getDatabase } = require('../database');
const Invoice = require('../models/Invoice');
const NotificationService = require('./NotificationService');
const EmailService = require('./EmailService');
const ClientService = require('./ClientService');
const logger = require('../utils/logger');

class OverdueInvoiceService {
  constructor() {
    this.db = null;
    this.overdueConfigTable = 'overdue_invoice_config';
    this.reminderTemplateTable = 'invoice_reminder_templates';
    this.reminderLogTable = 'invoice_reminder_logs';
    this.notificationService = new NotificationService();
    this.emailService = new EmailService();
    this.clientService = new ClientService();
    this.initialized = false;
    
    // Default configuration
    this.defaultConfig = {
      grace_period_days: 3,
      reminder_intervals: [3, 7, 14, 30],
      apply_late_fees: false,
      late_fee_percentage: 5,
      late_fee_fixed_amount: 0,
      late_fee_type: 'percentage', // 'percentage' or 'fixed'
      max_reminders: 3
    };
    
    // Ensure database tables exist
    this.ensureTables().catch(err => {
      logger.error('Failed to initialize OverdueInvoiceService tables', { error: err.message });
    });
  }

  async initialize() {
    try {
      this.db = getDatabase();
      await this.ensureTables();
      await this.ensureDefaultConfig();
      await this.ensureDefaultTemplates();
      this.initialized = true;
      logger.info('OverdueInvoiceService initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize OverdueInvoiceService:', error);
      return false;
    }
  }

  async ensureTables() {
    try {
      // Create overdue invoice config table if not exists
      await this.db.run(`CREATE TABLE IF NOT EXISTS ${this.overdueConfigTable} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        grace_period_days INTEGER NOT NULL DEFAULT 3,
        late_fee_type TEXT CHECK(late_fee_type IN ('percentage', 'fixed')) NOT NULL DEFAULT 'percentage',
        late_fee_amount REAL NOT NULL DEFAULT 5.0,
        reminder_frequency_days INTEGER NOT NULL DEFAULT 7,
        max_reminders INTEGER NOT NULL DEFAULT 3,
        auto_late_fee BOOLEAN NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Create reminder templates table if not exists
      await this.db.run(`CREATE TABLE IF NOT EXISTS ${this.reminderTemplateTable} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        reminder_level TEXT CHECK(reminder_level IN ('gentle', 'firm', 'urgent')) NOT NULL,
        is_default BOOLEAN NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Create reminder logs table if not exists
      await this.db.run(`CREATE TABLE IF NOT EXISTS ${this.reminderLogTable} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL,
        template_id INTEGER NOT NULL,
        reminder_level TEXT NOT NULL,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        success BOOLEAN NOT NULL,
        error_message TEXT,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
        FOREIGN KEY (template_id) REFERENCES ${this.reminderTemplateTable}(id)
      )`);

      logger.info('Overdue invoice tables created or already exist');
      return true;
    } catch (error) {
      logger.error('Error creating overdue invoice tables:', error);
      throw error;
    }
  }

  async ensureDefaultConfig() {
    try {
      const config = await this.db.get(`SELECT * FROM ${this.overdueConfigTable} LIMIT 1`);
      
      if (!config) {
        await this.db.run(`INSERT INTO ${this.overdueConfigTable} 
          (grace_period_days, late_fee_type, late_fee_amount, reminder_frequency_days, max_reminders, auto_late_fee) 
          VALUES (3, 'percentage', 5.0, 7, 3, 0)`);
        logger.info('Default overdue invoice configuration created');
      }
      
      return true;
    } catch (error) {
      logger.error('Error ensuring default overdue config:', error);
      throw error;
    }
  }

  async ensureDefaultTemplates() {
    try {
      const templates = await this.db.all(`SELECT * FROM ${this.reminderTemplateTable} WHERE is_default = 1`);
      
      if (templates.length < 3) {
        // Clear existing default templates if any
        await this.db.run(`DELETE FROM ${this.reminderTemplateTable} WHERE is_default = 1`);
        
        // Create gentle reminder template
        await this.db.run(`INSERT INTO ${this.reminderTemplateTable} 
          (name, subject, body, reminder_level, is_default) 
          VALUES (?, ?, ?, ?, ?)`, 
          [
            'Gentle Reminder', 
            'Friendly Reminder: Invoice #{invoice_number} is Past Due',
            'Dear {client_name},\n\nWe hope this email finds you well. This is a gentle reminder that invoice #{invoice_number} for {total_amount} was due on {due_date}. If you have already made the payment, please disregard this message.\n\nIf you have any questions or concerns, please don\'t hesitate to contact us.\n\nThank you for your business.\n\nRegards,\n{company_name}',
            'gentle',
            1
          ]
        );

        // Create firm reminder template
        await this.db.run(`INSERT INTO ${this.reminderTemplateTable} 
          (name, subject, body, reminder_level, is_default) 
          VALUES (?, ?, ?, ?, ?)`, 
          [
            'Firm Reminder', 
            'Second Notice: Invoice #{invoice_number} is Overdue',
            'Dear {client_name},\n\nThis is our second notice regarding invoice #{invoice_number} for {total_amount} which was due on {due_date}. Your account is now {days_overdue} days past due.\n\nPlease arrange for payment as soon as possible. If you have already made the payment, please provide us with the payment details.\n\nIf you are experiencing difficulties with payment, please contact us to discuss possible arrangements.\n\nThank you for your prompt attention to this matter.\n\nRegards,\n{company_name}',
            'firm',
            1
          ]
        );

        // Create urgent reminder template
        await this.db.run(`INSERT INTO ${this.reminderTemplateTable} 
          (name, subject, body, reminder_level, is_default) 
          VALUES (?, ?, ?, ?, ?)`, 
          [
            'Urgent Reminder', 
            'URGENT: Final Notice for Invoice #{invoice_number}',
            'Dear {client_name},\n\nThis is an urgent notice regarding invoice #{invoice_number} for {total_amount} which was due on {due_date}. Your account is now {days_overdue} days past due.\n\nA late fee of {late_fee_amount} has been applied to your account. Please make payment immediately to avoid further action.\n\nIf you have questions or need to discuss payment arrangements, please contact us immediately.\n\nThank you for your immediate attention to this matter.\n\nRegards,\n{company_name}',
            'urgent',
            1
          ]
        );
        
        logger.info('Default reminder templates created');
      }
      
      return true;
    } catch (error) {
      logger.error('Error ensuring default reminder templates:', error);
      throw error;
    }
  }

  async getOverdueInvoices(options = {}) {
    try {
      if (!this.initialized) await this.initialize();
      
      const { limit = 100, offset = 0, sortBy = 'due_date', sortOrder = 'ASC', clientId = null } = options;
      
      let query = `
        SELECT i.*, c.name as client_name, c.email as client_email 
        FROM invoices i
        JOIN clients c ON i.client_id = c.id
        WHERE i.status = 'sent'
        AND i.due_date < date('now')
        AND i.total_amount > i.amount_paid
      `;
      
      const params = [];
      
      if (clientId) {
        query += ` AND i.client_id = ?`;
        params.push(clientId);
      }
      
      query += ` ORDER BY i.${sortBy} ${sortOrder} LIMIT ? OFFSET ?`;
      params.push(limit, offset);
      
      const invoices = await this.db.all(query, params);
      
      // Enrich with days overdue and remaining balance
      return invoices.map(invoice => {
        const dueDate = new Date(invoice.due_date);
        const today = new Date();
        const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
        const remainingBalance = invoice.total_amount - invoice.amount_paid;
        
        return {
          ...invoice,
          days_overdue: daysOverdue,
          remaining_balance: remainingBalance
        };
      });
    } catch (error) {
      logger.error('Error getting overdue invoices:', error);
      throw error;
    }
  }

  async applyLateFee(invoiceId, options = {}) {
    try {
      if (!this.initialized) await this.initialize();

      // Get the invoice
      const invoice = await this.db.get('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
      if (!invoice) throw new Error(`Invoice with ID ${invoiceId} not found`);
      
      // Get the config
      const config = await this.getConfig();
      
      // Determine fee amount
      let feeAmount = 0;
      const { amount = null, type = null } = options;
      
      if (amount !== null && type !== null) {
        // Use provided amount and type
        if (type === 'percentage') {
          feeAmount = (invoice.total_amount * amount) / 100;
        } else {
          feeAmount = amount;
        }
      } else {
        // Use config
        if (config.late_fee_type === 'percentage') {
          feeAmount = (invoice.total_amount * config.late_fee_amount) / 100;
        } else {
          feeAmount = config.late_fee_amount;
        }
      }
      
      // Round to 2 decimal places
      feeAmount = Math.round(feeAmount * 100) / 100;
      
      // Add late fee as a line item
      await this.db.run(`
        INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount, tax_rate)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        invoiceId,
        'Late Payment Fee',
        1,
        feeAmount,
        feeAmount,
        0
      ]);
      
      // Update invoice total
      const newTotal = invoice.total_amount + feeAmount;
      await this.db.run(`
        UPDATE invoices 
        SET total_amount = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [newTotal, invoiceId]);
      
      // Log the late fee application
      logger.info(`Applied late fee of ${feeAmount} to invoice ${invoiceId}`);
      
      // Create notification
      await this.notificationService.create({
        type: 'invoice_late_fee',
        title: 'Late Fee Applied',
        message: `A late fee of ${feeAmount} has been applied to invoice #${invoice.invoice_number}`,
        entity_id: invoiceId,
        entity_type: 'invoice'
      });
      
      return {
        success: true,
        invoice_id: invoiceId,
        fee_amount: feeAmount,
        new_total: newTotal
      };
    } catch (error) {
      logger.error(`Error applying late fee to invoice ${invoiceId}:`, error);
      throw error;
    }
  }

  async sendReminder(invoiceId, level = 'gentle', templateId = null) {
    try {
      if (!this.initialized) await this.initialize();
      
      // Get the invoice with client info
      const invoice = await this.db.get(`
        SELECT i.*, c.name as client_name, c.email as client_email, c.id as client_id 
        FROM invoices i
        JOIN clients c ON i.client_id = c.id
        WHERE i.id = ?
      `, [invoiceId]);
      
      if (!invoice) throw new Error(`Invoice with ID ${invoiceId} not found`);
      
      // Get the template
      let template;
      if (templateId) {
        template = await this.db.get(`SELECT * FROM ${this.reminderTemplateTable} WHERE id = ?`, [templateId]);
      } else {
        template = await this.db.get(`SELECT * FROM ${this.reminderTemplateTable} WHERE reminder_level = ? AND is_default = 1`, [level]);
      }
      
      if (!template) throw new Error(`Reminder template not found for level: ${level}`);
      
      // Calculate days overdue
      const dueDate = new Date(invoice.due_date);
      const today = new Date();
      const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
      
      // Prepare email content with placeholders replaced
      const subject = template.subject
        .replace('{invoice_number}', invoice.invoice_number)
        .replace('{days_overdue}', daysOverdue.toString());
      
      let body = template.body
        .replace('{client_name}', invoice.client_name)
        .replace('{invoice_number}', invoice.invoice_number)
        .replace('{due_date}', new Date(invoice.due_date).toLocaleDateString())
        .replace('{total_amount}', invoice.total_amount.toFixed(2))
        .replace('{days_overdue}', daysOverdue.toString())
        .replace('{company_name}', process.env.COMPANY_NAME || 'Your Company');
      
      // Add balance due
      const balanceDue = invoice.total_amount - invoice.amount_paid;
      body = body.replace('{balance_due}', balanceDue.toFixed(2));
      
      // Get late fee if relevant
      const config = await this.getConfig();
      let lateFeeAmount = 0;
      
      if (level === 'urgent') {
        if (config.late_fee_type === 'percentage') {
          lateFeeAmount = (invoice.total_amount * config.late_fee_amount) / 100;
        } else {
          lateFeeAmount = config.late_fee_amount;
        }
        body = body.replace('{late_fee_amount}', lateFeeAmount.toFixed(2));
      }
      
      // Send the email
      const emailResult = await this.emailService.sendEmail({
        to: invoice.client_email,
        subject: subject,
        body: body,
        type: 'invoice_reminder'
      });
      
      // Log the reminder
      await this.db.run(`
        INSERT INTO ${this.reminderLogTable} (invoice_id, template_id, reminder_level, success, error_message)
        VALUES (?, ?, ?, ?, ?)
      `, [
        invoiceId,
        template.id,
        level,
        emailResult.success ? 1 : 0,
        emailResult.success ? null : emailResult.error
      ]);
      
      // Create notification
      await this.notificationService.create({
        type: 'invoice_reminder_sent',
        title: 'Invoice Reminder Sent',
        message: `A ${level} reminder was sent to ${invoice.client_name} for invoice #${invoice.invoice_number}`,
        entity_id: invoiceId,
        entity_type: 'invoice'
      });
      
      return {
        success: true,
        invoice_id: invoiceId,
        reminder_level: level,
        template_id: template.id,
        email_result: emailResult
      };
    } catch (error) {
      logger.error(`Error sending reminder for invoice ${invoiceId}:`, error);
      return {
        success: false,
        invoice_id: invoiceId,
        error: error.message
      };
    }
  }

  async processOverdueInvoices() {
    try {
      if (!this.initialized) await this.initialize();
      
      const config = await this.getConfig();
      const overdueInvoices = await this.getOverdueInvoices();
      
      let processed = {
        total: overdueInvoices.length,
        reminders_sent: 0,
        fees_applied: 0,
        errors: 0
      };
      
      for (const invoice of overdueInvoices) {
        try {
          // Get reminder history for this invoice
          const reminderLogs = await this.db.all(`
            SELECT * FROM ${this.reminderLogTable}
            WHERE invoice_id = ?
            ORDER BY sent_at DESC
          `, [invoice.id]);
          
          // Determine if we should send a reminder
          const shouldSendReminder = this.shouldSendReminder(invoice, reminderLogs, config);
          
          if (shouldSendReminder.send) {
            await this.sendReminder(invoice.id, shouldSendReminder.level);
            processed.reminders_sent++;
          }
          
          // Determine if we should apply a late fee
          if (config.auto_late_fee && invoice.days_overdue > config.grace_period_days) {
            // Check if a late fee was already applied recently
            const lateFeeItem = await this.db.get(`
              SELECT * FROM invoice_items
              WHERE invoice_id = ? AND description = 'Late Payment Fee'
              ORDER BY id DESC LIMIT 1
            `, [invoice.id]);
            
            // If no late fee yet or it's been more than 30 days since the last one
            if (!lateFeeItem || this.daysSince(lateFeeItem.created_at) > 30) {
              await this.applyLateFee(invoice.id);
              processed.fees_applied++;
            }
          }
        } catch (error) {
          logger.error(`Error processing overdue invoice ${invoice.id}:`, error);
          processed.errors++;
        }
      }
      
      logger.info(`Processed ${processed.total} overdue invoices: ${processed.reminders_sent} reminders sent, ${processed.fees_applied} fees applied, ${processed.errors} errors`);
      
      return processed;
    } catch (error) {
      logger.error('Error processing overdue invoices:', error);
      throw error;
    }
  }

  daysSince(dateString) {
    const date = new Date(dateString);
    const today = new Date();
    return Math.floor((today - date) / (1000 * 60 * 60 * 24));
  }

  shouldSendReminder(invoice, reminderLogs, config) {
    // If no reminders sent yet and past grace period
    if (reminderLogs.length === 0 && invoice.days_overdue > config.grace_period_days) {
      return { send: true, level: 'gentle' };
    }
    
    // If we already sent the max number of reminders
    if (reminderLogs.length >= config.max_reminders) {
      return { send: false };
    }
    
    // If the last reminder was sent recently
    if (reminderLogs.length > 0) {
      const lastReminder = reminderLogs[0];
      const daysSinceLastReminder = this.daysSince(lastReminder.sent_at);
      
      if (daysSinceLastReminder < config.reminder_frequency_days) {
        return { send: false };
      }
      
      // Determine the next level based on last reminder
      let nextLevel = 'gentle';
      if (lastReminder.reminder_level === 'gentle') {
        nextLevel = 'firm';
      } else if (lastReminder.reminder_level === 'firm') {
        nextLevel = 'urgent';
      }
      
      return { send: true, level: nextLevel };
    }
    
    return { send: false };
  }

  async getConfig() {
    try {
      if (!this.initialized) await this.initialize();
      
      const config = await this.db.get(`SELECT * FROM ${this.overdueConfigTable} LIMIT 1`);
      return config;
    } catch (error) {
      logger.error('Error getting overdue invoice config:', error);
      throw error;
    }
  }

  async updateConfig(configData) {
    try {
      if (!this.initialized) await this.initialize();
      
      const { 
        grace_period_days, 
        late_fee_type, 
        late_fee_amount, 
        reminder_frequency_days, 
        max_reminders, 
        auto_late_fee 
      } = configData;
      
      await this.db.run(`
        UPDATE ${this.overdueConfigTable}
        SET grace_period_days = ?,
            late_fee_type = ?,
            late_fee_amount = ?,
            reminder_frequency_days = ?,
            max_reminders = ?,
            auto_late_fee = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
      `, [
        grace_period_days,
        late_fee_type,
        late_fee_amount,
        reminder_frequency_days,
        max_reminders,
        auto_late_fee ? 1 : 0
      ]);
      
      return await this.getConfig();
    } catch (error) {
      logger.error('Error updating overdue invoice config:', error);
      throw error;
    }
  }

  async getReminderTemplates() {
    try {
      if (!this.initialized) await this.initialize();
      
      return await this.db.all(`SELECT * FROM ${this.reminderTemplateTable}`);
    } catch (error) {
      logger.error('Error getting reminder templates:', error);
      throw error;
    }
  }

  async getReminderTemplate(id) {
    try {
      if (!this.initialized) await this.initialize();
      
      return await this.db.get(`SELECT * FROM ${this.reminderTemplateTable} WHERE id = ?`, [id]);
    } catch (error) {
      logger.error(`Error getting reminder template ${id}:`, error);
      throw error;
    }
  }

  async createReminderTemplate(templateData) {
    try {
      if (!this.initialized) await this.initialize();
      
      const { name, subject, body, reminder_level, is_default = 0 } = templateData;
      
      // If setting as default, clear other defaults for this level
      if (is_default) {
        await this.db.run(`
          UPDATE ${this.reminderTemplateTable}
          SET is_default = 0
          WHERE reminder_level = ?
        `, [reminder_level]);
      }
      
      const result = await this.db.run(`
        INSERT INTO ${this.reminderTemplateTable} 
        (name, subject, body, reminder_level, is_default)
        VALUES (?, ?, ?, ?, ?)
      `, [name, subject, body, reminder_level, is_default ? 1 : 0]);
      
      return {
        id: result.lastID,
        ...templateData
      };
    } catch (error) {
      logger.error('Error creating reminder template:', error);
      throw error;
    }
  }

  async updateReminderTemplate(id, templateData) {
    try {
      if (!this.initialized) await this.initialize();
      
      const { name, subject, body, reminder_level, is_default = 0 } = templateData;
      
      // If setting as default, clear other defaults for this level
      if (is_default) {
        await this.db.run(`
          UPDATE ${this.reminderTemplateTable}
          SET is_default = 0
          WHERE reminder_level = ? AND id != ?
        `, [reminder_level, id]);
      }
      
      await this.db.run(`
        UPDATE ${this.reminderTemplateTable}
        SET name = ?,
            subject = ?,
            body = ?,
            reminder_level = ?,
            is_default = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [name, subject, body, reminder_level, is_default ? 1 : 0, id]);
      
      return await this.getReminderTemplate(id);
    } catch (error) {
      logger.error(`Error updating reminder template ${id}:`, error);
      throw error;
    }
  }

  async deleteReminderTemplate(id) {
    try {
      if (!this.initialized) await this.initialize();
      
      // Check if it's a default template
      const template = await this.getReminderTemplate(id);
      if (!template) throw new Error(`Template with ID ${id} not found`);
      
      if (template.is_default) {
        throw new Error('Cannot delete a default template');
      }
      
      await this.db.run(`DELETE FROM ${this.reminderTemplateTable} WHERE id = ?`, [id]);
      
      return { success: true, id };
    } catch (error) {
      logger.error(`Error deleting reminder template ${id}:`, error);
      throw error;
    }
  }

  async getReminderLogs(invoiceId) {
    try {
      if (!this.initialized) await this.initialize();
      
      return await this.db.all(`
        SELECT l.*, t.name as template_name, t.reminder_level
        FROM ${this.reminderLogTable} l
        JOIN ${this.reminderTemplateTable} t ON l.template_id = t.id
        WHERE l.invoice_id = ?
        ORDER BY l.sent_at DESC
      `, [invoiceId]);
    } catch (error) {
      logger.error(`Error getting reminder logs for invoice ${invoiceId}:`, error);
      throw error;
    }
  }

  async getOverdueStatistics() {
    try {
      if (!this.initialized) await this.initialize();
      
      const stats = {
        total_overdue: 0,
        total_overdue_amount: 0,
        avg_days_overdue: 0,
        by_aging: {
          '1-30': { count: 0, amount: 0 },
          '31-60': { count: 0, amount: 0 },
          '61-90': { count: 0, amount: 0 },
          '90+': { count: 0, amount: 0 }
        }
      };
      
      const overdueInvoices = await this.getOverdueInvoices({ limit: 1000 });
      
      if (overdueInvoices.length === 0) {
        return stats;
      }
      
      stats.total_overdue = overdueInvoices.length;
      
      let totalDaysOverdue = 0;
      for (const invoice of overdueInvoices) {
        const remainingBalance = invoice.total_amount - invoice.amount_paid;
        stats.total_overdue_amount += remainingBalance;
        totalDaysOverdue += invoice.days_overdue;
        
        // Categorize by aging
        if (invoice.days_overdue <= 30) {
          stats.by_aging['1-30'].count++;
          stats.by_aging['1-30'].amount += remainingBalance;
        } else if (invoice.days_overdue <= 60) {
          stats.by_aging['31-60'].count++;
          stats.by_aging['31-60'].amount += remainingBalance;
        } else if (invoice.days_overdue <= 90) {
          stats.by_aging['61-90'].count++;
          stats.by_aging['61-90'].amount += remainingBalance;
        } else {
          stats.by_aging['90+'].count++;
          stats.by_aging['90+'].amount += remainingBalance;
        }
      }
      
      stats.avg_days_overdue = Math.round(totalDaysOverdue / overdueInvoices.length);
      
      return stats;
    } catch (error) {
      logger.error('Error getting overdue statistics:', error);
      throw error;
    }
  }
}

module.exports = new OverdueInvoiceService(); 