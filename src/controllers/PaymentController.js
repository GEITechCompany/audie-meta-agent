/**
 * Payment Controller
 * Handles payment operations and payment-related functionality
 */

const { getDatabase } = require('../database');
const logger = require('../utils/logger');
const PaymentTrackingService = require('../services/PaymentTrackingService');
const Invoice = require('../models/Invoice');

class PaymentController {
  /**
   * Get all payments with optional filtering
   * @param {Object} criteria - Filter criteria
   * @returns {Promise<Array>} Payments array
   */
  async getAllPayments(criteria = {}) {
    const db = getDatabase();
    const params = [];
    let whereClause = '1=1';
    
    // Build where clause based on criteria
    if (criteria.invoice_id) {
      whereClause += ' AND p.invoice_id = ?';
      params.push(criteria.invoice_id);
    }
    
    if (criteria.client_id) {
      whereClause += ' AND i.client_id = ?';
      params.push(criteria.client_id);
    }
    
    if (criteria.payment_method) {
      whereClause += ' AND p.payment_method = ?';
      params.push(criteria.payment_method);
    }
    
    if (criteria.start_date) {
      whereClause += ' AND p.payment_date >= ?';
      params.push(criteria.start_date);
    }
    
    if (criteria.end_date) {
      whereClause += ' AND p.payment_date <= ?';
      params.push(criteria.end_date);
    }
    
    if (criteria.min_amount) {
      whereClause += ' AND p.amount >= ?';
      params.push(criteria.min_amount);
    }
    
    if (criteria.max_amount) {
      whereClause += ' AND p.amount <= ?';
      params.push(criteria.max_amount);
    }
    
    // Add sorting
    const sortField = criteria.sort_by || 'payment_date';
    const sortOrder = criteria.sort_order === 'asc' ? 'ASC' : 'DESC';
    
    try {
      const payments = await new Promise((resolve, reject) => {
        const query = `
          SELECT 
            p.*, 
            i.invoice_number,
            c.id as client_id,
            c.name as client_name
          FROM invoice_payments p
          JOIN invoices i ON p.invoice_id = i.id
          JOIN clients c ON i.client_id = c.id
          WHERE ${whereClause}
          ORDER BY p.${sortField} ${sortOrder}
          LIMIT ? OFFSET ?
        `;
        
        // Add pagination params
        const limit = parseInt(criteria.limit) || 20;
        const offset = parseInt(criteria.offset) || 0;
        params.push(limit, offset);
        
        db.all(query, params, (err, rows) => {
          if (err) {
            logger.error(`Error fetching payments: ${err.message}`);
            reject(err);
          } else {
            resolve(rows || []);
          }
        });
      });
      
      return payments;
    } catch (error) {
      logger.error(`Error in getAllPayments: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get payment by ID
   * @param {number} id - Payment ID
   * @returns {Promise<Object|null>} Payment object or null if not found
   */
  async getPaymentById(id) {
    try {
      const payment = await PaymentTrackingService.getPaymentById(id);
      
      if (!payment) return null;
      
      // Get additional details
      const db = getDatabase();
      const enhancedPayment = await new Promise((resolve, reject) => {
        const query = `
          SELECT 
            p.*, 
            i.invoice_number,
            i.client_id,
            c.name as client_name
          FROM invoice_payments p
          JOIN invoices i ON p.invoice_id = i.id
          JOIN clients c ON i.client_id = c.id
          WHERE p.id = ?
        `;
        
        db.get(query, [id], (err, row) => {
          if (err) {
            logger.error(`Error fetching payment details: ${err.message}`);
            reject(err);
          } else {
            resolve(row);
          }
        });
      });
      
      return enhancedPayment;
    } catch (error) {
      logger.error(`Error in getPaymentById: ${error.message}`);
      throw error;
    }
  }

  /**
   * Record a new payment
   * @param {Object} paymentData - Payment data
   * @returns {Promise<Object>} Recorded payment
   */
  async recordPayment(paymentData) {
    try {
      // Validate required fields
      if (!paymentData.invoice_id || !paymentData.amount) {
        throw new Error('Invoice ID and amount are required');
      }
      
      // Convert amount to number if it's a string
      if (typeof paymentData.amount === 'string') {
        paymentData.amount = parseFloat(paymentData.amount);
      }
      
      // Validate amount is positive
      if (paymentData.amount <= 0) {
        throw new Error('Payment amount must be greater than zero');
      }
      
      // Record payment using the PaymentTrackingService
      const payment = await PaymentTrackingService.recordPayment(
        paymentData.invoice_id,
        {
          amount: paymentData.amount,
          payment_method: paymentData.payment_method || 'other',
          payment_date: paymentData.payment_date || new Date().toISOString(),
          transaction_id: paymentData.transaction_id || null,
          notes: paymentData.notes || ''
        }
      );
      
      logger.info(`Recorded payment of ${payment.amount} for invoice ${paymentData.invoice_id}`);
      
      return payment;
    } catch (error) {
      logger.error(`Error in recordPayment: ${error.message}`);
      throw error;
    }
  }

  /**
   * Void/delete a payment
   * @param {number} id - Payment ID
   * @returns {Promise<boolean>} Success status
   */
  async voidPayment(id) {
    const db = getDatabase();
    
    try {
      // First get the payment to make sure it exists
      const payment = await this.getPaymentById(id);
      
      if (!payment) {
        return null;
      }
      
      // Start a transaction to handle payment deletion and invoice update
      await new Promise((resolve, reject) => {
        db.run('BEGIN TRANSACTION', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      try {
        // Get the invoice
        const invoice = await new Promise((resolve, reject) => {
          db.get('SELECT * FROM invoices WHERE id = ?', [payment.invoice_id], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });
        
        if (!invoice) {
          throw new Error(`Invoice with ID ${payment.invoice_id} not found`);
        }
        
        // Calculate new amount paid
        const newAmountPaid = Math.max(0, invoice.amount_paid - payment.amount);
        
        // Determine new status based on the payment amount
        const newStatus = newAmountPaid >= invoice.total_amount ? 'paid' : 
                         newAmountPaid > 0 ? 'partially_paid' : 'sent';
        
        // Update invoice
        await new Promise((resolve, reject) => {
          db.run(
            `UPDATE invoices SET amount_paid = ?, status = ?, updated_at = CURRENT_TIMESTAMP, paid_at = ? WHERE id = ?`,
            [
              newAmountPaid, 
              newStatus, 
              newStatus === 'paid' ? new Date().toISOString() : null, 
              payment.invoice_id
            ],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
        
        // Delete the payment record
        await new Promise((resolve, reject) => {
          db.run('DELETE FROM invoice_payments WHERE id = ?', [id], function (err) {
            if (err) reject(err);
            else resolve(this.changes);
          });
        });
        
        // Commit the transaction
        await new Promise((resolve, reject) => {
          db.run('COMMIT', (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        
        logger.info(`Voided payment ${id} for invoice ${payment.invoice_id}`);
        return true;
      } catch (error) {
        // Rollback on error
        await new Promise((resolve) => {
          db.run('ROLLBACK', (err) => {
            if (err) logger.error(`Error in rollback: ${err.message}`);
            resolve();
          });
        });
        throw error;
      }
    } catch (error) {
      logger.error(`Error in voidPayment: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get payment statistics
   * @param {Object} criteria - Filter criteria
   * @returns {Promise<Object>} Payment statistics
   */
  async getPaymentStatistics(criteria = {}) {
    try {
      const statistics = await PaymentTrackingService.getPaymentStatistics(criteria);
      return statistics;
    } catch (error) {
      logger.error(`Error in getPaymentStatistics: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new PaymentController(); 