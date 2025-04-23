/**
 * Recurring Invoice Service
 * Manages recurring invoices and automatically generates new invoices based on schedules
 */

const { getDatabase } = require('../database');
const logger = require('../utils/logger');
const Invoice = require('../models/Invoice');
const { getFormattedDate } = require('../utils/dateFormatter');
const NotificationService = require('./NotificationService');
const EmailService = require('./EmailService');
const ClientService = require('./ClientService');

class RecurringInvoiceService {
  constructor() {
    this.db = getDatabase();
    this.recurringInvoicesTable = 'recurring_invoices';
    this.recurringItemsTable = 'recurring_invoice_items';
    this.recurringHistoryTable = 'recurring_invoice_history';
    this.notificationService = new NotificationService();
    this.emailService = new EmailService();
    this.clientService = new ClientService();
    this.ensureTables();
  }

  async ensureTables() {
    try {
      // Check if recurring invoices table exists
      const recurringTableExists = await this.db.get(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        [this.recurringInvoicesTable]
      );

      if (!recurringTableExists) {
        // Create recurring invoices table
        await this.db.run(`
          CREATE TABLE ${this.recurringInvoicesTable} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            frequency TEXT NOT NULL,
            interval INTEGER NOT NULL DEFAULT 1,
            next_date TEXT NOT NULL,
            end_date TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            auto_send BOOLEAN DEFAULT 1,
            due_days INTEGER NOT NULL DEFAULT 14,
            total_amount REAL NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (client_id) REFERENCES clients(id)
          )
        `);

        logger.info(`Created ${this.recurringInvoicesTable} table`);
      }

      // Check if recurring invoice items table exists
      const itemsTableExists = await this.db.get(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        [this.recurringItemsTable]
      );

      if (!itemsTableExists) {
        // Create recurring invoice items table
        await this.db.run(`
          CREATE TABLE ${this.recurringItemsTable} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            recurring_invoice_id INTEGER NOT NULL,
            description TEXT NOT NULL,
            quantity REAL NOT NULL DEFAULT 1,
            unit_price REAL NOT NULL,
            amount REAL NOT NULL,
            tax_rate REAL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (recurring_invoice_id) REFERENCES ${this.recurringInvoicesTable}(id)
          )
        `);

        logger.info(`Created ${this.recurringItemsTable} table`);
      }

      // Check if history table exists
      const historyTableExists = await this.db.get(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        [this.recurringHistoryTable]
      );

      if (!historyTableExists) {
        // Create recurring invoice history table
        await this.db.run(`
          CREATE TABLE ${this.recurringHistoryTable} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            recurring_invoice_id INTEGER NOT NULL,
            invoice_id INTEGER NOT NULL,
            generated_at TEXT NOT NULL,
            FOREIGN KEY (recurring_invoice_id) REFERENCES ${this.recurringInvoicesTable}(id),
            FOREIGN KEY (invoice_id) REFERENCES invoices(id)
          )
        `);

        logger.info(`Created ${this.recurringHistoryTable} table`);
      }
    } catch (error) {
      logger.error(`Error ensuring recurring invoice tables: ${error.message}`);
      throw error;
    }
  }

  async create(data) {
    try {
      this._validateRecurringInvoiceData(data);
      
      const now = new Date().toISOString();
      const client = await this.clientService.getById(data.client_id);
      
      if (!client) {
        throw new Error(`Client with id ${data.client_id} not found`);
      }
      
      // Calculate total amount from items
      let totalAmount = 0;
      if (data.items && Array.isArray(data.items)) {
        for (const item of data.items) {
          const amount = item.quantity * item.unit_price;
          totalAmount += amount;
        }
      }
      
      // Insert recurring invoice
      const result = await this.db.run(
        `INSERT INTO ${this.recurringInvoicesTable}
         (client_id, title, description, frequency, interval, next_date, end_date, 
          status, auto_send, due_days, total_amount, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.client_id,
          data.title,
          data.description || '',
          data.frequency,
          data.interval || 1,
          data.next_date,
          data.end_date || null,
          data.status || 'active',
          data.auto_send !== undefined ? data.auto_send : 1,
          data.due_days || 14,
          totalAmount,
          now,
          now
        ]
      );
      
      const recurringInvoiceId = result.lastID;
      
      // Insert items if provided
      if (data.items && Array.isArray(data.items)) {
        for (const item of data.items) {
          const amount = item.quantity * item.unit_price;
          
          await this.db.run(
            `INSERT INTO ${this.recurringItemsTable}
             (recurring_invoice_id, description, quantity, unit_price, amount, tax_rate, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              recurringInvoiceId,
              item.description,
              item.quantity,
              item.unit_price,
              amount,
              item.tax_rate || 0,
              now,
              now
            ]
          );
        }
      }
      
      // Create notification
      await this.notificationService.create({
        type: 'recurring_invoice_created',
        title: 'Recurring Invoice Created',
        message: `Created recurring ${data.frequency} invoice for ${client.name}`,
        entity_id: recurringInvoiceId,
        entity_type: 'recurring_invoice'
      });
      
      return await this.getById(recurringInvoiceId);
    } catch (error) {
      logger.error(`Error creating recurring invoice: ${error.message}`);
      throw error;
    }
  }

  _validateRecurringInvoiceData(data) {
    // Check required fields
    if (!data.client_id) throw new Error('Client ID is required');
    if (!data.title) throw new Error('Title is required');
    if (!data.frequency) throw new Error('Frequency is required');
    if (!data.next_date) throw new Error('Next date is required');
    
    // Validate frequency
    const validFrequencies = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];
    if (!validFrequencies.includes(data.frequency)) {
      throw new Error(`Invalid frequency. Must be one of: ${validFrequencies.join(', ')}`);
    }
    
    // Validate items if provided
    if (data.items && Array.isArray(data.items)) {
      for (const item of data.items) {
        if (!item.description) throw new Error('Item description is required');
        if (typeof item.quantity !== 'number' || item.quantity <= 0) {
          throw new Error('Item quantity must be a positive number');
        }
        if (typeof item.unit_price !== 'number' || item.unit_price < 0) {
          throw new Error('Item unit price must be a non-negative number');
        }
      }
    }
    
    // Validate dates
    const nextDate = new Date(data.next_date);
    if (isNaN(nextDate.getTime())) throw new Error('Invalid next date format');
    
    if (data.end_date) {
      const endDate = new Date(data.end_date);
      if (isNaN(endDate.getTime())) throw new Error('Invalid end date format');
      if (endDate < nextDate) throw new Error('End date must be after next date');
    }
  }

  async getAll(filters = {}) {
    try {
      let query = `
        SELECT r.*, c.name as client_name
        FROM ${this.recurringInvoicesTable} r
        JOIN clients c ON r.client_id = c.id
      `;
      
      const queryParams = [];
      const conditions = [];
      
      if (filters.client_id) {
        conditions.push('r.client_id = ?');
        queryParams.push(filters.client_id);
      }
      
      if (filters.status) {
        conditions.push('r.status = ?');
        queryParams.push(filters.status);
      }
      
      if (filters.frequency) {
        conditions.push('r.frequency = ?');
        queryParams.push(filters.frequency);
      }
      
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }
      
      query += ' ORDER BY r.next_date ASC';
      
      const recurringInvoices = await this.db.all(query, queryParams);
      
      // For each recurring invoice, get the items and history
      for (const invoice of recurringInvoices) {
        invoice.items = await this.getRecurringItems(invoice.id);
        invoice.history = await this.getHistory(invoice.id);
      }
      
      return recurringInvoices;
    } catch (error) {
      logger.error(`Error getting recurring invoices: ${error.message}`);
      throw error;
    }
  }

  async getById(id) {
    try {
      const recurringInvoice = await this.db.get(
        `SELECT r.*, c.name as client_name
         FROM ${this.recurringInvoicesTable} r
         JOIN clients c ON r.client_id = c.id
         WHERE r.id = ?`,
        [id]
      );
      
      if (!recurringInvoice) {
        return null;
      }
      
      // Get items
      recurringInvoice.items = await this.getRecurringItems(id);
      
      // Get history
      recurringInvoice.history = await this.getHistory(id);
      
      return recurringInvoice;
    } catch (error) {
      logger.error(`Error getting recurring invoice ${id}: ${error.message}`);
      throw error;
    }
  }

  async getRecurringItems(recurringInvoiceId) {
    try {
      return await this.db.all(
        `SELECT * FROM ${this.recurringItemsTable} WHERE recurring_invoice_id = ?`,
        [recurringInvoiceId]
      );
    } catch (error) {
      logger.error(`Error getting recurring invoice items for ${recurringInvoiceId}: ${error.message}`);
      throw error;
    }
  }

  async getHistory(recurringInvoiceId) {
    try {
      return await this.db.all(
        `SELECT h.*, i.invoice_number, i.total_amount, i.status
         FROM ${this.recurringHistoryTable} h
         JOIN invoices i ON h.invoice_id = i.id
         WHERE h.recurring_invoice_id = ?
         ORDER BY h.generated_at DESC`,
        [recurringInvoiceId]
      );
    } catch (error) {
      logger.error(`Error getting recurring invoice history for ${recurringInvoiceId}: ${error.message}`);
      throw error;
    }
  }

  async update(id, data) {
    try {
      const existing = await this.getById(id);
      
      if (!existing) {
        throw new Error(`Recurring invoice with id ${id} not found`);
      }
      
      // Validate the data
      this._validateRecurringInvoiceData({
        ...existing,
        ...data
      });
      
      const now = new Date().toISOString();
      
      // Calculate total amount from items if items are provided
      let totalAmount = existing.total_amount;
      if (data.items && Array.isArray(data.items)) {
        totalAmount = 0;
        for (const item of data.items) {
          const amount = item.quantity * item.unit_price;
          totalAmount += amount;
        }
      }
      
      // Update recurring invoice
      await this.db.run(
        `UPDATE ${this.recurringInvoicesTable}
         SET client_id = ?,
             title = ?,
             description = ?,
             frequency = ?,
             interval = ?,
             next_date = ?,
             end_date = ?,
             status = ?,
             auto_send = ?,
             due_days = ?,
             total_amount = ?,
             updated_at = ?
         WHERE id = ?`,
        [
          data.client_id || existing.client_id,
          data.title || existing.title,
          data.description !== undefined ? data.description : existing.description,
          data.frequency || existing.frequency,
          data.interval || existing.interval,
          data.next_date || existing.next_date,
          data.end_date !== undefined ? data.end_date : existing.end_date,
          data.status || existing.status,
          data.auto_send !== undefined ? data.auto_send : existing.auto_send,
          data.due_days || existing.due_days,
          totalAmount,
          now,
          id
        ]
      );
      
      // Update items if provided
      if (data.items && Array.isArray(data.items)) {
        // Delete existing items
        await this.db.run(
          `DELETE FROM ${this.recurringItemsTable} WHERE recurring_invoice_id = ?`,
          [id]
        );
        
        // Insert new items
        for (const item of data.items) {
          const amount = item.quantity * item.unit_price;
          
          await this.db.run(
            `INSERT INTO ${this.recurringItemsTable}
             (recurring_invoice_id, description, quantity, unit_price, amount, tax_rate, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              item.description,
              item.quantity,
              item.unit_price,
              amount,
              item.tax_rate || 0,
              now,
              now
            ]
          );
        }
      }
      
      // Create notification
      await this.notificationService.create({
        type: 'recurring_invoice_updated',
        title: 'Recurring Invoice Updated',
        message: `Updated recurring invoice #${id}`,
        entity_id: id,
        entity_type: 'recurring_invoice'
      });
      
      return await this.getById(id);
    } catch (error) {
      logger.error(`Error updating recurring invoice ${id}: ${error.message}`);
      throw error;
    }
  }

  async generateInvoice(recurringInvoiceId, options = {}) {
    try {
      const recurringInvoice = await this.getById(recurringInvoiceId);
      
      if (!recurringInvoice) {
        throw new Error(`Recurring invoice with id ${recurringInvoiceId} not found`);
      }
      
      if (recurringInvoice.status !== 'active') {
        throw new Error(`Cannot generate invoice from inactive recurring invoice`);
      }
      
      // Get client
      const client = await this.clientService.getById(recurringInvoice.client_id);
      
      // Calculate due date
      const today = new Date();
      const dueDate = new Date();
      dueDate.setDate(today.getDate() + recurringInvoice.due_days);
      
      // Create invoice
      const invoiceData = {
        client_id: recurringInvoice.client_id,
        title: recurringInvoice.title,
        description: recurringInvoice.description,
        due_date: dueDate.toISOString().split('T')[0],
        items: recurringInvoice.items.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          tax_rate: item.tax_rate
        }))
      };
      
      const invoice = new Invoice(invoiceData);
      await invoice.save();
      
      // Record in history
      const now = new Date().toISOString();
      await this.db.run(
        `INSERT INTO ${this.recurringHistoryTable}
         (recurring_invoice_id, invoice_id, generated_at)
         VALUES (?, ?, ?)`,
        [recurringInvoiceId, invoice.id, now]
      );
      
      // Update next date
      const nextDate = this._calculateNextDate(
        recurringInvoice.frequency,
        recurringInvoice.interval,
        recurringInvoice.next_date
      );
      
      // Check if we've reached the end date
      let newStatus = recurringInvoice.status;
      if (recurringInvoice.end_date && new Date(nextDate) > new Date(recurringInvoice.end_date)) {
        newStatus = 'completed';
      }
      
      await this.db.run(
        `UPDATE ${this.recurringInvoicesTable}
         SET next_date = ?, status = ?, updated_at = ?
         WHERE id = ?`,
        [nextDate, newStatus, now, recurringInvoiceId]
      );
      
      // Send invoice email if auto_send is enabled
      if (recurringInvoice.auto_send && !options.skipEmail && client.email) {
        await this.emailService.sendEmail({
          to: client.email,
          subject: `New Invoice: ${invoice.invoice_number}`,
          body: `Dear ${client.name},

A new invoice (#${invoice.invoice_number}) has been generated for your recurring service: ${recurringInvoice.title}.

Amount due: $${invoice.total_amount.toFixed(2)}
Due date: ${invoice.due_date}

Please contact us if you have any questions regarding this invoice.

Thank you for your business!`,
          type: 'invoice'
        });
      }
      
      // Create notification
      await this.notificationService.create({
        type: 'recurring_invoice_generated',
        title: 'Recurring Invoice Generated',
        message: `Generated invoice #${invoice.invoice_number} from recurring invoice #${recurringInvoiceId}`,
        entity_id: recurringInvoiceId,
        entity_type: 'recurring_invoice'
      });
      
      return {
        recurring_invoice_id: recurringInvoiceId,
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        next_date: nextDate,
        status: newStatus
      };
    } catch (error) {
      logger.error(`Error generating invoice from recurring invoice ${recurringInvoiceId}: ${error.message}`);
      throw error;
    }
  }

  _calculateNextDate(frequency, interval, currentDate) {
    const date = new Date(currentDate);
    
    switch (frequency) {
      case 'daily':
        date.setDate(date.getDate() + interval);
        break;
      case 'weekly':
        date.setDate(date.getDate() + (7 * interval));
        break;
      case 'monthly':
        date.setMonth(date.getMonth() + interval);
        break;
      case 'quarterly':
        date.setMonth(date.getMonth() + (3 * interval));
        break;
      case 'yearly':
        date.setFullYear(date.getFullYear() + interval);
        break;
      default:
        throw new Error(`Invalid frequency: ${frequency}`);
    }
    
    return date.toISOString().split('T')[0];
  }

  async processDueRecurringInvoices() {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Get active recurring invoices due today or earlier
      const dueInvoices = await this.db.all(
        `SELECT * FROM ${this.recurringInvoicesTable}
         WHERE status = 'active'
         AND next_date <= ?`,
        [today]
      );
      
      const results = [];
      
      for (const recurringInvoice of dueInvoices) {
        try {
          const result = await this.generateInvoice(recurringInvoice.id);
          results.push(result);
        } catch (error) {
          logger.error(`Error processing recurring invoice ${recurringInvoice.id}: ${error.message}`);
          // Continue with next invoice
        }
      }
      
      return {
        processed: dueInvoices.length,
        succeeded: results.length,
        results
      };
    } catch (error) {
      logger.error(`Error processing due recurring invoices: ${error.message}`);
      throw error;
    }
  }

  async cancel(id) {
    try {
      const existing = await this.getById(id);
      
      if (!existing) {
        throw new Error(`Recurring invoice with id ${id} not found`);
      }
      
      if (existing.status === 'canceled') {
        throw new Error(`Recurring invoice already canceled`);
      }
      
      const now = new Date().toISOString();
      
      await this.db.run(
        `UPDATE ${this.recurringInvoicesTable}
         SET status = 'canceled', updated_at = ?
         WHERE id = ?`,
        [now, id]
      );
      
      // Create notification
      await this.notificationService.create({
        type: 'recurring_invoice_canceled',
        title: 'Recurring Invoice Canceled',
        message: `Canceled recurring invoice for ${existing.client_name}`,
        entity_id: id,
        entity_type: 'recurring_invoice'
      });
      
      return await this.getById(id);
    } catch (error) {
      logger.error(`Error canceling recurring invoice ${id}: ${error.message}`);
      throw error;
    }
  }

  async reactivate(id) {
    try {
      const existing = await this.getById(id);
      
      if (!existing) {
        throw new Error(`Recurring invoice with id ${id} not found`);
      }
      
      if (existing.status === 'active') {
        throw new Error(`Recurring invoice already active`);
      }
      
      // Check if end date is in the past
      if (existing.end_date && new Date(existing.end_date) < new Date()) {
        throw new Error(`Cannot reactivate: end date is in the past`);
      }
      
      const now = new Date().toISOString();
      
      // Update next date to today if current next_date is in the past
      let nextDate = existing.next_date;
      if (new Date(nextDate) < new Date()) {
        nextDate = now.split('T')[0];
      }
      
      await this.db.run(
        `UPDATE ${this.recurringInvoicesTable}
         SET status = 'active', next_date = ?, updated_at = ?
         WHERE id = ?`,
        [nextDate, now, id]
      );
      
      // Create notification
      await this.notificationService.create({
        type: 'recurring_invoice_reactivated',
        title: 'Recurring Invoice Reactivated',
        message: `Reactivated recurring invoice for ${existing.client_name}`,
        entity_id: id,
        entity_type: 'recurring_invoice'
      });
      
      return await this.getById(id);
    } catch (error) {
      logger.error(`Error reactivating recurring invoice ${id}: ${error.message}`);
      throw error;
    }
  }

  async delete(id) {
    try {
      const existing = await this.getById(id);
      
      if (!existing) {
        throw new Error(`Recurring invoice with id ${id} not found`);
      }
      
      // Check if there's history
      if (existing.history && existing.history.length > 0) {
        throw new Error(`Cannot delete recurring invoice with generated invoices`);
      }
      
      // Delete items
      await this.db.run(
        `DELETE FROM ${this.recurringItemsTable} WHERE recurring_invoice_id = ?`,
        [id]
      );
      
      // Delete recurring invoice
      await this.db.run(
        `DELETE FROM ${this.recurringInvoicesTable} WHERE id = ?`,
        [id]
      );
      
      // Create notification
      await this.notificationService.create({
        type: 'recurring_invoice_deleted',
        title: 'Recurring Invoice Deleted',
        message: `Deleted recurring invoice for ${existing.client_name}`,
        entity_id: id,
        entity_type: 'recurring_invoice'
      });
      
      return { success: true, id };
    } catch (error) {
      logger.error(`Error deleting recurring invoice ${id}: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new RecurringInvoiceService(); 