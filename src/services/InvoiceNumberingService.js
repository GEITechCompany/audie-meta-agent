/**
 * Invoice Numbering Service
 * Manages invoice number generation with configurable patterns
 */

const { getDatabase } = require('../database');
const logger = require('../utils/logger');

class InvoiceNumberingService {
  constructor() {
    this.defaultFormat = 'INV-{YEAR}{MONTH}-{SEQUENCE}';
    this.defaultSequenceLength = 4;
    this.defaultSequenceStart = 1;
    this.tableName = 'invoice_sequences';
    this.ensureSequenceTable();
  }

  /**
   * Ensure the sequence table exists
   * @private
   */
  async ensureSequenceTable() {
    const db = getDatabase();
    
    try {
      // Create sequence table if it doesn't exist
      await new Promise((resolve, reject) => {
        db.run(`
          CREATE TABLE IF NOT EXISTS ${this.tableName} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prefix TEXT NOT NULL,
            year INTEGER NOT NULL,
            month INTEGER NOT NULL,
            sequence INTEGER NOT NULL,
            last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(prefix, year, month)
          )
        `, (err) => {
          if (err) {
            logger.error(`Error creating invoice sequence table: ${err.message}`);
            reject(err);
          } else {
            logger.info('Invoice sequence table initialized');
            resolve();
          }
        });
      });
    } catch (error) {
      logger.error(`Error in ensureSequenceTable: ${error.message}`);
    }
  }

  /**
   * Generate a unique invoice number based on the specified format
   * @param {Object} options - Configuration options
   * @param {string} [options.format] - Invoice number format pattern
   * @param {string} [options.prefix] - Custom prefix for the invoice
   * @param {number} [options.sequenceLength] - Length of the sequence number
   * @returns {Promise<string>} Generated invoice number
   */
  async generateInvoiceNumber(options = {}) {
    try {
      const date = new Date();
      const year = date.getFullYear();
      const month = date.getMonth() + 1; // JavaScript months are 0-indexed
      
      const prefix = options.prefix || 'INV';
      const format = options.format || this.defaultFormat;
      const sequenceLength = options.sequenceLength || this.defaultSequenceLength;
      
      // Get the next sequence number
      const sequence = await this.getNextSequence(prefix, year, month);
      
      // Format the sequence number with leading zeros
      const formattedSequence = sequence.toString().padStart(sequenceLength, '0');
      
      // Replace placeholders in the format pattern
      let invoiceNumber = format
        .replace('{PREFIX}', prefix)
        .replace('{YEAR}', year.toString())
        .replace('{MONTH}', month.toString().padStart(2, '0'))
        .replace('{SEQUENCE}', formattedSequence);
      
      logger.info(`Generated invoice number: ${invoiceNumber}`);
      
      return invoiceNumber;
    } catch (error) {
      logger.error(`Error generating invoice number: ${error.message}`);
      // Fallback to a simpler format in case of error
      return `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }
  }

  /**
   * Get the next sequence number for a given prefix/year/month combination
   * @param {string} prefix - Invoice prefix
   * @param {number} year - Year
   * @param {number} month - Month
   * @returns {Promise<number>} Next sequence number
   * @private
   */
  async getNextSequence(prefix, year, month) {
    const db = getDatabase();
    
    try {
      // Check if sequence exists for current year/month
      const sequence = await new Promise((resolve, reject) => {
        db.get(
          `SELECT sequence FROM ${this.tableName} WHERE prefix = ? AND year = ? AND month = ?`,
          [prefix, year, month],
          (err, row) => {
            if (err) {
              reject(err);
            } else {
              resolve(row);
            }
          }
        );
      });
      
      if (sequence) {
        // Increment existing sequence
        const nextSequence = sequence.sequence + 1;
        
        await new Promise((resolve, reject) => {
          db.run(
            `UPDATE ${this.tableName} 
             SET sequence = ?, last_used = CURRENT_TIMESTAMP 
             WHERE prefix = ? AND year = ? AND month = ?`,
            [nextSequence, prefix, year, month],
            (err) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            }
          );
        });
        
        return nextSequence;
      } else {
        // Create new sequence starting from default value
        await new Promise((resolve, reject) => {
          db.run(
            `INSERT INTO ${this.tableName} (prefix, year, month, sequence)
             VALUES (?, ?, ?, ?)`,
            [prefix, year, month, this.defaultSequenceStart],
            (err) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            }
          );
        });
        
        return this.defaultSequenceStart;
      }
    } catch (error) {
      logger.error(`Error getting next sequence: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reset a sequence to a specific number
   * @param {string} prefix - Invoice prefix
   * @param {number} year - Year
   * @param {number} month - Month
   * @param {number} startAt - New sequence start value
   * @returns {Promise<boolean>} Success status
   */
  async resetSequence(prefix, year, month, startAt) {
    const db = getDatabase();
    
    try {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT OR REPLACE INTO ${this.tableName} (prefix, year, month, sequence)
           VALUES (?, ?, ?, ?)`,
          [prefix, year, month, startAt],
          (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });
      
      logger.info(`Reset sequence for ${prefix}-${year}-${month} to ${startAt}`);
      return true;
    } catch (error) {
      logger.error(`Error resetting sequence: ${error.message}`);
      return false;
    }
  }
}

module.exports = new InvoiceNumberingService(); 