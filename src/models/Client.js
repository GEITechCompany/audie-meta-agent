const { getDatabase } = require('../database');
const logger = require('../utils/logger');

class Client {
  constructor(data = {}) {
    this.id = data.id || null;
    this.name = data.name || '';
    this.email = data.email || '';
    this.phone = data.phone || '';
    this.address = data.address || '';
    this.notes = data.notes || '';
    this.created_at = data.created_at || new Date().toISOString();
    this.updated_at = data.updated_at || new Date().toISOString();
  }

  // Save client to database
  async save() {
    const db = getDatabase();
    
    if (this.id) {
      // Update existing client
      return new Promise((resolve, reject) => {
        const query = `
          UPDATE clients 
          SET name = ?, email = ?, phone = ?, address = ?, notes = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `;
        
        db.run(
          query, 
          [
            this.name, 
            this.email, 
            this.phone, 
            this.address,
            this.notes,
            this.id
          ],
          function(err) {
            if (err) {
              logger.error(`Error updating client: ${err.message}`);
              reject(err);
            } else {
              logger.info(`Client ${this.id} updated successfully`);
              resolve(this);
            }
          }
        );
      });
    } else {
      // Insert new client
      return new Promise((resolve, reject) => {
        const query = `
          INSERT INTO clients 
          (name, email, phone, address, notes)
          VALUES (?, ?, ?, ?, ?)
        `;
        
        db.run(
          query,
          [
            this.name, 
            this.email, 
            this.phone, 
            this.address,
            this.notes
          ],
          function(err) {
            if (err) {
              logger.error(`Error creating client: ${err.message}`);
              reject(err);
            } else {
              const clientId = this.lastID;
              logger.info(`Client created with ID: ${clientId}`);
              resolve(new Client({ ...this, id: clientId }));
            }
          }
        );
      });
    }
  }

  // Find client by ID
  static async findById(id) {
    const db = getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM clients WHERE id = ?';
      
      db.get(query, [id], (err, row) => {
        if (err) {
          logger.error(`Error finding client by ID: ${err.message}`);
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          resolve(new Client(row));
        }
      });
    });
  }

  // Alias for findById to match naming convention in other models
  static async getById(id) {
    return this.findById(id);
  }

  // Find client by email
  static async findByEmail(email) {
    const db = getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM clients WHERE email = ?';
      
      db.get(query, [email], (err, row) => {
        if (err) {
          logger.error(`Error finding client by email: ${err.message}`);
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          resolve(new Client(row));
        }
      });
    });
  }

  // Find all clients with optional search
  static async findAll(search = '') {
    const db = getDatabase();
    let query = 'SELECT * FROM clients';
    const params = [];
    
    if (search) {
      query += ' WHERE name LIKE ? OR email LIKE ?';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }
    
    query += ' ORDER BY name ASC';
    
    return new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) {
          logger.error(`Error finding clients: ${err.message}`);
          reject(err);
        } else {
          const clients = rows.map(row => new Client(row));
          resolve(clients);
        }
      });
    });
  }

  // Delete client
  static async delete(id) {
    const db = getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = 'DELETE FROM clients WHERE id = ?';
      
      db.run(query, [id], function(err) {
        if (err) {
          logger.error(`Error deleting client: ${err.message}`);
          reject(err);
        } else {
          logger.info(`Client ${id} deleted successfully`);
          resolve({ deleted: this.changes > 0 });
        }
      });
    });
  }

  // Get client's tasks
  async getTasks() {
    if (!this.id) {
      throw new Error('Client must be saved before getting tasks');
    }
    
    const db = getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM tasks WHERE client_id = ? ORDER BY due_date ASC, priority DESC';
      
      db.all(query, [this.id], (err, rows) => {
        if (err) {
          logger.error(`Error getting client tasks: ${err.message}`);
          reject(err);
        } else {
          // We need to import Task here to avoid circular dependencies
          const Task = require('./Task');
          const tasks = rows.map(row => new Task(row));
          resolve(tasks);
        }
      });
    });
  }

  // Get client's estimates
  async getEstimates() {
    if (!this.id) {
      throw new Error('Client must be saved before getting estimates');
    }
    
    const db = getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM estimates WHERE client_id = ? ORDER BY created_at DESC';
      
      db.all(query, [this.id], (err, rows) => {
        if (err) {
          logger.error(`Error getting client estimates: ${err.message}`);
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Get client's invoices
  async getInvoices() {
    if (!this.id) {
      throw new Error('Client must be saved before getting invoices');
    }
    
    const db = getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM invoices WHERE client_id = ? ORDER BY created_at DESC';
      
      db.all(query, [this.id], (err, rows) => {
        if (err) {
          logger.error(`Error getting client invoices: ${err.message}`);
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }
}

module.exports = Client; 