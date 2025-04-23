/**
 * Invoice Model
 * Manages invoice data and operations
 */

const { getDatabase } = require('../database');
const logger = require('../utils/logger');

class Invoice {
  constructor(data = {}) {
    this.id = data.id || null;
    this.client_id = data.client_id || null;
    this.estimate_id = data.estimate_id || null;
    this.invoice_number = data.invoice_number || '';
    this.title = data.title || '';
    this.description = data.description || '';
    this.status = data.status || 'pending'; // pending, sent, paid, overdue, canceled
    this.total_amount = data.total_amount || 0;
    this.amount_paid = data.amount_paid || 0;
    this.due_date = data.due_date || null;
    this.created_at = data.created_at || new Date().toISOString();
    this.updated_at = data.updated_at || new Date().toISOString();
    this.paid_at = data.paid_at || null;
    this.items = data.items || [];
    this.payments = data.payments || [];
  }

  /**
   * Save or update an invoice
   * @returns {Promise<Invoice>} The saved invoice
   */
  async save() {
    const db = getDatabase();
    
    try {
      if (this.id) {
        // Update existing invoice
        this.updated_at = new Date().toISOString();
        
        return new Promise((resolve, reject) => {
          const query = `
            UPDATE invoices 
            SET client_id = ?, estimate_id = ?, invoice_number = ?, title = ?, description = ?, 
                status = ?, total_amount = ?, amount_paid = ?, due_date = ?, updated_at = ?, paid_at = ?
            WHERE id = ?
          `;
          
          db.run(
            query, 
            [
              this.client_id, this.estimate_id, this.invoice_number, this.title, this.description,
              this.status, this.total_amount, this.amount_paid, this.due_date, this.updated_at, this.paid_at,
              this.id
            ],
            async (err) => {
              if (err) {
                logger.error(`Error updating invoice: ${err.message}`);
                reject(err);
              } else {
                // Update line items
                if (this.items && this.items.length > 0) {
                  await this.saveLineItems();
                }
                resolve(this);
              }
            }
          );
        });
      } else {
        // Create new invoice
        return new Promise((resolve, reject) => {
          // Generate invoice number if not provided
          if (!this.invoice_number) {
            this.invoice_number = `INV-${Date.now()}`;
          }
          
          const query = `
            INSERT INTO invoices 
            (client_id, estimate_id, invoice_number, title, description, status, 
             total_amount, amount_paid, due_date, created_at, updated_at, paid_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;
          
          db.run(
            query,
            [
              this.client_id, this.estimate_id, this.invoice_number, this.title, this.description,
              this.status, this.total_amount, this.amount_paid, this.due_date, this.created_at, this.updated_at, this.paid_at
            ],
            async function(err) {
              if (err) {
                logger.error(`Error creating invoice: ${err.message}`);
                reject(err);
              } else {
                const id = this.lastID;
                const newInvoice = new Invoice({...this, id});
                
                // Save line items if any
                if (newInvoice.items && newInvoice.items.length > 0) {
                  await newInvoice.saveLineItems();
                }
                
                resolve(newInvoice);
              }
            }
          );
        });
      }
    } catch (error) {
      logger.error(`Error in invoice save: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Save invoice line items
   * @returns {Promise<boolean>} Success status
   */
  async saveLineItems() {
    const db = getDatabase();
    
    try {
      if (!this.id) {
        throw new Error('Invoice must be saved before saving line items');
      }
      
      // First delete existing line items
      await new Promise((resolve, reject) => {
        db.run(
          'DELETE FROM invoice_items WHERE invoice_id = ?',
          [this.id],
          (err) => {
            if (err) {
              logger.error(`Error deleting invoice items: ${err.message}`);
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });
      
      // Then insert new line items
      for (const item of this.items) {
        await new Promise((resolve, reject) => {
          const query = `
            INSERT INTO invoice_items 
            (invoice_id, description, quantity, unit_price, amount, tax_rate)
            VALUES (?, ?, ?, ?, ?, ?)
          `;
          
          db.run(
            query,
            [
              this.id, 
              item.description, 
              item.quantity || 1, 
              item.unit_price || 0, 
              item.amount || 0,
              item.tax_rate || 0
            ],
            (err) => {
              if (err) {
                logger.error(`Error inserting invoice item: ${err.message}`);
                reject(err);
              } else {
                resolve();
              }
            }
          );
        });
      }
      
      return true;
    } catch (error) {
      logger.error(`Error saving invoice line items: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Record a payment for this invoice
   * @param {Object} paymentData - Payment details
   * @returns {Promise<Object>} The recorded payment
   */
  async recordPayment(paymentData) {
    const db = getDatabase();
    
    try {
      if (!this.id) {
        throw new Error('Invoice must be saved before recording payments');
      }
      
      const payment = {
        invoice_id: this.id,
        amount: paymentData.amount || 0,
        payment_date: paymentData.payment_date || new Date().toISOString(),
        payment_method: paymentData.payment_method || 'other',
        notes: paymentData.notes || '',
        transaction_id: paymentData.transaction_id || null,
        created_at: new Date().toISOString()
      };
      
      // Insert payment record
      const paymentId = await new Promise((resolve, reject) => {
        const query = `
          INSERT INTO invoice_payments
          (invoice_id, amount, payment_date, payment_method, notes, transaction_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        
        db.run(
          query,
          [
            payment.invoice_id, payment.amount, payment.payment_date,
            payment.payment_method, payment.notes, payment.transaction_id,
            payment.created_at
          ],
          function(err) {
            if (err) {
              logger.error(`Error recording payment: ${err.message}`);
              reject(err);
            } else {
              resolve(this.lastID);
            }
          }
        );
      });
      
      // Update invoice amount_paid and status
      this.amount_paid = (parseFloat(this.amount_paid) || 0) + parseFloat(payment.amount);
      
      // Check if fully paid
      if (this.amount_paid >= this.total_amount) {
        this.status = 'paid';
        this.paid_at = new Date().toISOString();
      }
      
      // Save the updated invoice
      await this.save();
      
      // Add payment to payments array and return
      payment.id = paymentId;
      this.payments.push(payment);
      
      return payment;
    } catch (error) {
      logger.error(`Error recording payment: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get all payments for this invoice
   * @returns {Promise<Array>} Array of payment records
   */
  async getPayments() {
    const db = getDatabase();
    
    try {
      if (!this.id) {
        throw new Error('Invoice must be saved before getting payments');
      }
      
      return new Promise((resolve, reject) => {
        const query = `
          SELECT * FROM invoice_payments
          WHERE invoice_id = ?
          ORDER BY payment_date DESC
        `;
        
        db.all(query, [this.id], (err, rows) => {
          if (err) {
            logger.error(`Error getting invoice payments: ${err.message}`);
            reject(err);
          } else {
            this.payments = rows || [];
            resolve(this.payments);
          }
        });
      });
    } catch (error) {
      logger.error(`Error getting payments: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get an invoice by ID
   * @param {number} id - The invoice ID
   * @returns {Promise<Invoice|null>} The invoice or null
   */
  static async getById(id) {
    const db = getDatabase();
    
    try {
      // Get invoice
      const invoice = await new Promise((resolve, reject) => {
        db.get(
          'SELECT * FROM invoices WHERE id = ?',
          [id],
          (err, row) => {
            if (err) {
              logger.error(`Error getting invoice: ${err.message}`);
              reject(err);
            } else {
              resolve(row);
            }
          }
        );
      });
      
      if (!invoice) return null;
      
      // Get line items
      const items = await new Promise((resolve, reject) => {
        db.all(
          'SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id',
          [id],
          (err, rows) => {
            if (err) {
              logger.error(`Error getting invoice items: ${err.message}`);
              reject(err);
            } else {
              resolve(rows || []);
            }
          }
        );
      });
      
      // Get payments
      const payments = await new Promise((resolve, reject) => {
        db.all(
          'SELECT * FROM invoice_payments WHERE invoice_id = ? ORDER BY payment_date DESC',
          [id],
          (err, rows) => {
            if (err) {
              logger.error(`Error getting invoice payments: ${err.message}`);
              reject(err);
            } else {
              resolve(rows || []);
            }
          }
        );
      });
      
      return new Invoice({...invoice, items, payments});
    } catch (error) {
      logger.error(`Error in getById: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Find invoices by various criteria
   * @param {Object} criteria - Search criteria
   * @returns {Promise<Array<Invoice>>} Array of invoices
   */
  static async find(criteria = {}) {
    const db = getDatabase();
    const params = [];
    let whereClause = '1=1';
    
    // Build where clause from criteria
    if (criteria.client_id) {
      whereClause += ' AND client_id = ?';
      params.push(criteria.client_id);
    }
    
    if (criteria.status) {
      whereClause += ' AND status = ?';
      params.push(criteria.status);
    }
    
    if (criteria.estimate_id) {
      whereClause += ' AND estimate_id = ?';
      params.push(criteria.estimate_id);
    }
    
    // Date range filtering
    if (criteria.from_date) {
      whereClause += ' AND created_at >= ?';
      params.push(criteria.from_date);
    }
    
    if (criteria.to_date) {
      whereClause += ' AND created_at <= ?';
      params.push(criteria.to_date);
    }
    
    // Due date filtering
    if (criteria.due_before) {
      whereClause += ' AND due_date <= ?';
      params.push(criteria.due_before);
    }
    
    if (criteria.due_after) {
      whereClause += ' AND due_date >= ?';
      params.push(criteria.due_after);
    }
    
    try {
      // Get invoices
      const invoices = await new Promise((resolve, reject) => {
        const query = `
          SELECT * FROM invoices 
          WHERE ${whereClause}
          ORDER BY created_at DESC
        `;
        
        db.all(query, params, (err, rows) => {
          if (err) {
            logger.error(`Error finding invoices: ${err.message}`);
            reject(err);
          } else {
            resolve(rows || []);
          }
        });
      });
      
      // Create Invoice objects (without line items for performance)
      return invoices.map(inv => new Invoice(inv));
    } catch (error) {
      logger.error(`Error in find: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Find overdue invoices
   * @returns {Promise<Array<Invoice>>} Array of overdue invoices
   */
  static async findOverdue() {
    const db = getDatabase();
    const now = new Date().toISOString();
    
    try {
      // Get overdue invoices (due_date passed and not paid/canceled)
      const invoices = await new Promise((resolve, reject) => {
        const query = `
          SELECT * FROM invoices 
          WHERE due_date < ? 
          AND status NOT IN ('paid', 'canceled')
          ORDER BY due_date ASC
        `;
        
        db.all(query, [now], (err, rows) => {
          if (err) {
            logger.error(`Error finding overdue invoices: ${err.message}`);
            reject(err);
          } else {
            resolve(rows || []);
          }
        });
      });
      
      // Update status to overdue if needed
      const result = [];
      for (const inv of invoices) {
        const invoice = new Invoice(inv);
        
        // Only update if not already marked as overdue
        if (invoice.status !== 'overdue') {
          invoice.status = 'overdue';
          await invoice.save();
        }
        
        result.push(invoice);
      }
      
      return result;
    } catch (error) {
      logger.error(`Error finding overdue invoices: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Generate a summary of all invoices by status
   * @returns {Promise<Object>} Summary statistics
   */
  static async generateSummary() {
    const db = getDatabase();
    
    try {
      return new Promise((resolve, reject) => {
        const query = `
          SELECT 
            status,
            COUNT(*) as count,
            SUM(total_amount) as total_amount,
            SUM(amount_paid) as amount_paid
          FROM invoices
          GROUP BY status
        `;
        
        db.all(query, [], (err, rows) => {
          if (err) {
            logger.error(`Error generating invoice summary: ${err.message}`);
            reject(err);
          } else {
            // Convert to object with status as keys
            const summary = {
              total: {
                count: 0,
                total_amount: 0,
                amount_paid: 0
              }
            };
            
            rows.forEach(row => {
              summary[row.status] = {
                count: row.count,
                total_amount: row.total_amount,
                amount_paid: row.amount_paid
              };
              
              // Update totals
              summary.total.count += row.count;
              summary.total.total_amount += row.total_amount;
              summary.total.amount_paid += row.amount_paid;
            });
            
            resolve(summary);
          }
        });
      });
    } catch (error) {
      logger.error(`Error in generateSummary: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Send invoice to client (placeholder for email integration)
   * @returns {Promise<boolean>} Success status
   */
  async sendToClient() {
    try {
      if (!this.id) {
        throw new Error('Invoice must be saved before sending');
      }
      
      // Set status to sent if it's pending
      if (this.status === 'pending') {
        this.status = 'sent';
        await this.save();
      }
      
      // TODO: Implement actual email sending logic
      logger.info(`Invoice ${this.invoice_number} would be sent to client ${this.client_id}`);
      
      return true;
    } catch (error) {
      logger.error(`Error sending invoice: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Mark invoice as paid
   * @param {Object} paymentDetails - Optional payment details
   * @returns {Promise<Invoice>} Updated invoice
   */
  async markAsPaid(paymentDetails = {}) {
    try {
      if (!this.id) {
        throw new Error('Invoice must be saved before marking as paid');
      }
      
      // Record payment if details provided
      if (paymentDetails.amount) {
        await this.recordPayment(paymentDetails);
      } else {
        // Otherwise just mark as fully paid
        this.status = 'paid';
        this.amount_paid = this.total_amount;
        this.paid_at = new Date().toISOString();
        await this.save();
      }
      
      return this;
    } catch (error) {
      logger.error(`Error marking invoice as paid: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete an invoice
   * @returns {Promise<boolean>} Success status
   */
  async delete() {
    const db = getDatabase();
    
    try {
      if (!this.id) {
        throw new Error('Cannot delete unsaved invoice');
      }
      
      // Check if invoice can be deleted
      if (this.status !== 'pending') {
        throw new Error('Only pending invoices can be deleted');
      }
      
      // Delete payments first
      await new Promise((resolve, reject) => {
        db.run(
          'DELETE FROM invoice_payments WHERE invoice_id = ?',
          [this.id],
          (err) => {
            if (err) {
              logger.error(`Error deleting invoice payments: ${err.message}`);
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });
      
      // Delete line items
      await new Promise((resolve, reject) => {
        db.run(
          'DELETE FROM invoice_items WHERE invoice_id = ?',
          [this.id],
          (err) => {
            if (err) {
              logger.error(`Error deleting invoice items: ${err.message}`);
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });
      
      // Delete invoice
      return new Promise((resolve, reject) => {
        db.run(
          'DELETE FROM invoices WHERE id = ?',
          [this.id],
          (err) => {
            if (err) {
              logger.error(`Error deleting invoice: ${err.message}`);
              reject(err);
            } else {
              resolve(true);
            }
          }
        );
      });
    } catch (error) {
      logger.error(`Error in delete: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate invoice data
   * @param {Object} data - Invoice data to validate
   * @returns {Object} Validated and sanitized invoice data
   * @throws {Error} If validation fails
   */
  static validate(data) {
    const errors = [];
    const sanitized = { ...data };
    
    // Required fields
    const requiredFields = ['client_id', 'due_date', 'items'];
    
    for (const field of requiredFields) {
      if (!data[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }
    
    // Client ID must be number
    if (data.client_id && typeof data.client_id !== 'number') {
      try {
        sanitized.client_id = parseInt(data.client_id, 10);
        if (isNaN(sanitized.client_id)) {
          errors.push('client_id must be a valid number');
        }
      } catch (e) {
        errors.push('client_id must be a valid number');
      }
    }
    
    // Validate dates
    const dateFields = ['issue_date', 'due_date'];
    for (const field of dateFields) {
      if (data[field]) {
        if (!(data[field] instanceof Date) && !/^\d{4}-\d{2}-\d{2}/.test(data[field])) {
          errors.push(`${field} must be a valid date (YYYY-MM-DD)`);
        } else {
          try {
            // Standardize date format
            const date = new Date(data[field]);
            if (isNaN(date.getTime())) {
              errors.push(`${field} must be a valid date`);
            } else {
              sanitized[field] = date.toISOString();
            }
          } catch (e) {
            errors.push(`${field} must be a valid date`);
          }
        }
      }
    }
    
    // Set issue_date to today if not provided
    if (!sanitized.issue_date) {
      sanitized.issue_date = new Date().toISOString();
    }
    
    // Validate line items
    if (data.items && Array.isArray(data.items)) {
      if (data.items.length === 0) {
        errors.push('At least one item is required');
      }
      
      sanitized.items = data.items.map((item, index) => {
        const itemErrors = [];
        const sanitizedItem = { ...item };
        
        // Validate required item fields
        const requiredItemFields = ['description', 'quantity', 'unit_price'];
        for (const field of requiredItemFields) {
          if (!item[field]) {
            itemErrors.push(`Item #${index + 1}: Missing required field: ${field}`);
          }
        }
        
        // Validate numeric fields
        const numericFields = ['quantity', 'unit_price', 'tax_rate'];
        for (const field of numericFields) {
          if (item[field] !== undefined) {
            if (typeof item[field] !== 'number') {
              try {
                sanitizedItem[field] = parseFloat(item[field]);
                if (isNaN(sanitizedItem[field])) {
                  itemErrors.push(`Item #${index + 1}: ${field} must be a valid number`);
                }
              } catch (e) {
                itemErrors.push(`Item #${index + 1}: ${field} must be a valid number`);
              }
            }
            
            // Ensure positive values
            if (sanitizedItem[field] < 0) {
              itemErrors.push(`Item #${index + 1}: ${field} cannot be negative`);
            }
          }
        }
        
        // Set defaults
        if (!item.tax_rate && item.tax_rate !== 0) {
          sanitizedItem.tax_rate = 0;
        }
        
        errors.push(...itemErrors);
        return sanitizedItem;
      });
    }
    
    // Calculate totals if items are valid
    if (sanitized.items && Array.isArray(sanitized.items) && sanitized.items.length > 0) {
      let subtotal = 0;
      let tax_total = 0;
      
      for (const item of sanitized.items) {
        const itemSubtotal = item.quantity * item.unit_price;
        const itemTax = itemSubtotal * (item.tax_rate / 100);
        
        subtotal += itemSubtotal;
        tax_total += itemTax;
      }
      
      sanitized.subtotal = parseFloat(subtotal.toFixed(2));
      sanitized.tax_total = parseFloat(tax_total.toFixed(2));
      sanitized.total_amount = parseFloat((subtotal + tax_total).toFixed(2));
    }
    
    // Set default values
    if (!sanitized.status) {
      sanitized.status = 'draft';
    }
    
    if (!sanitized.currency) {
      sanitized.currency = 'USD';
    }
    
    if (!sanitized.notes) {
      sanitized.notes = '';
    }
    
    // Initialize payment tracking
    if (sanitized.amount_paid === undefined) {
      sanitized.amount_paid = 0;
    }
    
    // Ensure amount_paid is a number
    if (typeof sanitized.amount_paid !== 'number') {
      try {
        sanitized.amount_paid = parseFloat(sanitized.amount_paid);
        if (isNaN(sanitized.amount_paid)) {
          sanitized.amount_paid = 0;
        }
      } catch (e) {
        sanitized.amount_paid = 0;
      }
    }
    
    // If there are validation errors, throw them
    if (errors.length > 0) {
      throw new Error(`Invoice validation failed: ${errors.join(', ')}`);
    }
    
    return sanitized;
  }
  
  /**
   * Format a database invoice row into a full invoice object with items
   * @param {Object} invoiceRow - Database row for the invoice
   * @param {Array<Object>} items - Invoice items
   * @returns {Object} Formatted invoice object
   */
  static format(invoiceRow, items = []) {
    if (!invoiceRow) return null;
    
    return {
      id: invoiceRow.id,
      invoice_number: invoiceRow.invoice_number,
      client_id: invoiceRow.client_id,
      client_name: invoiceRow.client_name,
      issue_date: invoiceRow.issue_date,
      due_date: invoiceRow.due_date,
      status: invoiceRow.status,
      currency: invoiceRow.currency,
      subtotal: invoiceRow.subtotal,
      tax_total: invoiceRow.tax_total,
      total_amount: invoiceRow.total_amount,
      amount_paid: invoiceRow.amount_paid,
      notes: invoiceRow.notes,
      payment_terms: invoiceRow.payment_terms,
      created_at: invoiceRow.created_at,
      updated_at: invoiceRow.updated_at,
      paid_at: invoiceRow.paid_at,
      items: items
    };
  }
  
  /**
   * Get the next invoice number
   * @param {Object} db - Database connection
   * @param {string} prefix - Invoice number prefix
   * @returns {Promise<string>} Next invoice number
   */
  static async getNextInvoiceNumber(db, prefix = 'INV-') {
    try {
      const result = await new Promise((resolve, reject) => {
        db.get(
          'SELECT MAX(invoice_number) as last_number FROM invoices WHERE invoice_number LIKE ?',
          [`${prefix}%`],
          (err, row) => {
            if (err) {
              reject(err);
            } else {
              resolve(row);
            }
          }
        );
      });
      
      let nextNumber = 1;
      
      if (result && result.last_number) {
        // Extract the numeric part
        const match = result.last_number.match(new RegExp(`${prefix}(\\d+)`));
        if (match && match[1]) {
          nextNumber = parseInt(match[1], 10) + 1;
        }
      }
      
      // Format with leading zeros (at least 5 digits)
      return `${prefix}${nextNumber.toString().padStart(5, '0')}`;
    } catch (error) {
      console.error('Error getting next invoice number:', error);
      // Fallback to timestamp-based number
      const timestamp = new Date().getTime().toString().slice(-5);
      return `${prefix}${timestamp}`;
    }
  }
}

module.exports = Invoice; 