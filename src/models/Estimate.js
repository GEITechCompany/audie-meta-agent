/**
 * Estimate Model
 * Manages estimate data and operations
 */

const { getDatabase } = require('../database');
const logger = require('../utils/logger');

class Estimate {
  constructor(data = {}) {
    this.id = data.id || null;
    this.client_id = data.client_id || null;
    this.estimate_number = data.estimate_number || '';
    this.title = data.title || '';
    this.description = data.description || '';
    this.status = data.status || 'draft'; // draft, sent, approved, declined, converted
    this.total_amount = data.total_amount || 0;
    this.valid_until = data.valid_until || null;
    this.created_at = data.created_at || new Date().toISOString();
    this.updated_at = data.updated_at || new Date().toISOString();
    this.items = data.items || [];
  }

  /**
   * Save or update an estimate
   * @returns {Promise<Estimate>} The saved estimate
   */
  async save() {
    const db = getDatabase();
    
    try {
      if (this.id) {
        // Update existing estimate
        this.updated_at = new Date().toISOString();
        
        return new Promise((resolve, reject) => {
          const query = `
            UPDATE estimates 
            SET client_id = ?, estimate_number = ?, title = ?, description = ?, 
                status = ?, total_amount = ?, valid_until = ?, updated_at = ?
            WHERE id = ?
          `;
          
          db.run(
            query, 
            [
              this.client_id, this.estimate_number, this.title, this.description,
              this.status, this.total_amount, this.valid_until, this.updated_at,
              this.id
            ],
            async (err) => {
              if (err) {
                logger.error(`Error updating estimate: ${err.message}`);
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
        // Create new estimate
        return new Promise((resolve, reject) => {
          // Generate estimate number if not provided
          if (!this.estimate_number) {
            this.estimate_number = `EST-${Date.now()}`;
          }
          
          const query = `
            INSERT INTO estimates 
            (client_id, estimate_number, title, description, status, total_amount, valid_until, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;
          
          db.run(
            query,
            [
              this.client_id, this.estimate_number, this.title, this.description,
              this.status, this.total_amount, this.valid_until, this.created_at, this.updated_at
            ],
            async function(err) {
              if (err) {
                logger.error(`Error creating estimate: ${err.message}`);
                reject(err);
              } else {
                const id = this.lastID;
                const newEstimate = new Estimate({...this, id});
                
                // Save line items if any
                if (newEstimate.items && newEstimate.items.length > 0) {
                  await newEstimate.saveLineItems();
                }
                
                resolve(newEstimate);
              }
            }
          );
        });
      }
    } catch (error) {
      logger.error(`Error in estimate save: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Save estimate line items
   * @returns {Promise<boolean>} Success status
   */
  async saveLineItems() {
    const db = getDatabase();
    
    try {
      if (!this.id) {
        throw new Error('Estimate must be saved before saving line items');
      }
      
      // First delete existing line items
      await new Promise((resolve, reject) => {
        db.run(
          'DELETE FROM estimate_items WHERE estimate_id = ?',
          [this.id],
          (err) => {
            if (err) {
              logger.error(`Error deleting estimate items: ${err.message}`);
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
            INSERT INTO estimate_items 
            (estimate_id, description, quantity, unit_price, amount, tax_rate)
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
                logger.error(`Error inserting estimate item: ${err.message}`);
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
      logger.error(`Error saving estimate line items: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get an estimate by ID
   * @param {number} id - The estimate ID
   * @returns {Promise<Estimate|null>} The estimate or null
   */
  static async getById(id) {
    const db = getDatabase();
    
    try {
      // Get estimate
      const estimate = await new Promise((resolve, reject) => {
        db.get(
          'SELECT * FROM estimates WHERE id = ?',
          [id],
          (err, row) => {
            if (err) {
              logger.error(`Error getting estimate: ${err.message}`);
              reject(err);
            } else {
              resolve(row);
            }
          }
        );
      });
      
      if (!estimate) return null;
      
      // Get line items
      const items = await new Promise((resolve, reject) => {
        db.all(
          'SELECT * FROM estimate_items WHERE estimate_id = ? ORDER BY id',
          [id],
          (err, rows) => {
            if (err) {
              logger.error(`Error getting estimate items: ${err.message}`);
              reject(err);
            } else {
              resolve(rows || []);
            }
          }
        );
      });
      
      return new Estimate({...estimate, items});
    } catch (error) {
      logger.error(`Error in getById: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Find estimates by various criteria
   * @param {Object} criteria - Search criteria
   * @returns {Promise<Array<Estimate>>} Array of estimates
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
    
    // Date range filtering
    if (criteria.from_date) {
      whereClause += ' AND created_at >= ?';
      params.push(criteria.from_date);
    }
    
    if (criteria.to_date) {
      whereClause += ' AND created_at <= ?';
      params.push(criteria.to_date);
    }
    
    try {
      // Get estimates
      const estimates = await new Promise((resolve, reject) => {
        const query = `
          SELECT * FROM estimates 
          WHERE ${whereClause}
          ORDER BY created_at DESC
        `;
        
        db.all(query, params, (err, rows) => {
          if (err) {
            logger.error(`Error finding estimates: ${err.message}`);
            reject(err);
          } else {
            resolve(rows || []);
          }
        });
      });
      
      // Create Estimate objects (without line items for performance)
      return estimates.map(est => new Estimate(est));
    } catch (error) {
      logger.error(`Error in find: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Convert estimate to invoice
   * @returns {Promise<Object>} The created invoice
   */
  async convertToInvoice() {
    try {
      if (!this.id) {
        throw new Error('Estimate must be saved before converting to invoice');
      }
      
      if (this.status !== 'approved') {
        throw new Error('Only approved estimates can be converted to invoices');
      }
      
      const Invoice = require('./Invoice');
      
      // Create invoice from estimate data
      const invoice = new Invoice({
        client_id: this.client_id,
        estimate_id: this.id,
        invoice_number: `INV-${Date.now()}`,
        title: this.title,
        description: this.description,
        status: 'pending',
        total_amount: this.total_amount,
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // Default 30 days
      });
      
      // Save invoice
      const savedInvoice = await invoice.save();
      
      // Copy line items
      if (this.items && this.items.length > 0) {
        savedInvoice.items = [...this.items];
        await savedInvoice.saveLineItems();
      }
      
      // Update estimate status
      this.status = 'converted';
      await this.save();
      
      return savedInvoice;
    } catch (error) {
      logger.error(`Error converting estimate to invoice: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Delete an estimate
   * @returns {Promise<boolean>} Success status
   */
  async delete() {
    const db = getDatabase();
    
    try {
      if (!this.id) {
        throw new Error('Cannot delete unsaved estimate');
      }
      
      // Check if estimate is already converted to invoice
      if (this.status === 'converted') {
        throw new Error('Cannot delete estimate that has been converted to invoice');
      }
      
      // Delete line items first
      await new Promise((resolve, reject) => {
        db.run(
          'DELETE FROM estimate_items WHERE estimate_id = ?',
          [this.id],
          (err) => {
            if (err) {
              logger.error(`Error deleting estimate items: ${err.message}`);
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });
      
      // Delete estimate
      return new Promise((resolve, reject) => {
        db.run(
          'DELETE FROM estimates WHERE id = ?',
          [this.id],
          (err) => {
            if (err) {
              logger.error(`Error deleting estimate: ${err.message}`);
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
}

module.exports = Estimate; 