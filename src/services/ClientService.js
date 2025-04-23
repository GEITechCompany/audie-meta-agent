const { getDatabase } = require('../database');
const logger = require('../utils/logger');

class ClientService {
  constructor() {
    this.db = getDatabase();
    this.tableName = 'clients';
  }

  async initialize() {
    try {
      // Ensure the client table exists
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT,
          phone TEXT,
          address TEXT,
          city TEXT,
          state TEXT,
          zip TEXT,
          country TEXT DEFAULT 'USA',
          notes TEXT,
          status TEXT DEFAULT 'active',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      logger.info('Client service initialized successfully');
      return true;
    } catch (error) {
      logger.error('Error initializing client service', { error: error.message });
      throw error;
    }
  }

  async getAll(options = {}) {
    try {
      const { search, status, limit = 100, offset = 0, sortBy = 'name', sortOrder = 'ASC' } = options;
      
      let query = `SELECT * FROM ${this.tableName} WHERE 1=1`;
      const params = [];
      
      if (search) {
        query += ` AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)`;
        const searchParam = `%${search}%`;
        params.push(searchParam, searchParam, searchParam);
      }
      
      if (status) {
        query += ` AND status = ?`;
        params.push(status);
      }
      
      query += ` ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`;
      params.push(limit, offset);
      
      const clients = await this.db.all(query, params);
      return clients;
    } catch (error) {
      logger.error('Error fetching clients', { error: error.message });
      throw error;
    }
  }

  async getById(id) {
    try {
      const client = await this.db.get(`SELECT * FROM ${this.tableName} WHERE id = ?`, [id]);
      return client;
    } catch (error) {
      logger.error('Error fetching client by ID', { id, error: error.message });
      throw error;
    }
  }

  async getByEmail(email) {
    try {
      const client = await this.db.get(`SELECT * FROM ${this.tableName} WHERE email = ?`, [email]);
      return client;
    } catch (error) {
      logger.error('Error fetching client by email', { email, error: error.message });
      throw error;
    }
  }

  async create(clientData) {
    try {
      // Check required fields
      if (!clientData.name) {
        throw new Error('Client name is required');
      }
      
      const fields = [];
      const placeholders = [];
      const values = [];
      
      // Process all fields in clientData
      for (const [key, value] of Object.entries(clientData)) {
        if (key !== 'id' && key !== 'created_at' && key !== 'updated_at') {
          fields.push(key);
          placeholders.push('?');
          values.push(value);
        }
      }
      
      // Add created_at and updated_at
      fields.push('created_at', 'updated_at');
      placeholders.push('CURRENT_TIMESTAMP', 'CURRENT_TIMESTAMP');
      
      const query = `
        INSERT INTO ${this.tableName} (${fields.join(', ')})
        VALUES (${placeholders.join(', ')})
      `;
      
      const result = await this.db.run(query, values);
      
      if (result.lastID) {
        // Fetch and return the newly created client
        return await this.getById(result.lastID);
      }
      
      throw new Error('Failed to create client record');
    } catch (error) {
      logger.error('Error creating client', { error: error.message });
      throw error;
    }
  }

  async update(id, clientData) {
    try {
      // Validate ID
      if (!id) {
        throw new Error('Client ID is required for update');
      }
      
      // Check if the client exists
      const existingClient = await this.getById(id);
      if (!existingClient) {
        throw new Error(`Client with ID ${id} not found`);
      }
      
      const setFields = [];
      const values = [];
      
      // Process all fields in clientData
      for (const [key, value] of Object.entries(clientData)) {
        if (key !== 'id' && key !== 'created_at' && key !== 'updated_at') {
          setFields.push(`${key} = ?`);
          values.push(value);
        }
      }
      
      // Add updated_at
      setFields.push('updated_at = CURRENT_TIMESTAMP');
      
      // Add the ID parameter for the WHERE clause
      values.push(id);
      
      const query = `
        UPDATE ${this.tableName}
        SET ${setFields.join(', ')}
        WHERE id = ?
      `;
      
      const result = await this.db.run(query, values);
      
      if (result.changes > 0) {
        // Fetch and return the updated client
        return await this.getById(id);
      }
      
      return existingClient; // Return the original client if no changes were made
    } catch (error) {
      logger.error('Error updating client', { id, error: error.message });
      throw error;
    }
  }

  async delete(id) {
    try {
      // Check if the client exists
      const existingClient = await this.getById(id);
      if (!existingClient) {
        throw new Error(`Client with ID ${id} not found`);
      }
      
      // Check if client has related records
      // This should be extended to check for invoices, estimates, etc.
      
      const result = await this.db.run(`DELETE FROM ${this.tableName} WHERE id = ?`, [id]);
      
      return {
        success: result.changes > 0,
        deletedClient: existingClient
      };
    } catch (error) {
      logger.error('Error deleting client', { id, error: error.message });
      throw error;
    }
  }

  async getCount(options = {}) {
    try {
      const { search, status } = options;
      
      let query = `SELECT COUNT(*) as count FROM ${this.tableName} WHERE 1=1`;
      const params = [];
      
      if (search) {
        query += ` AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)`;
        const searchParam = `%${search}%`;
        params.push(searchParam, searchParam, searchParam);
      }
      
      if (status) {
        query += ` AND status = ?`;
        params.push(status);
      }
      
      const result = await this.db.get(query, params);
      return result.count;
    } catch (error) {
      logger.error('Error counting clients', { error: error.message });
      throw error;
    }
  }

  async search(searchTerm) {
    try {
      if (!searchTerm) {
        return [];
      }
      
      const searchParam = `%${searchTerm}%`;
      const query = `
        SELECT * FROM ${this.tableName}
        WHERE name LIKE ? OR email LIKE ? OR phone LIKE ?
        ORDER BY name ASC
        LIMIT 20
      `;
      
      const clients = await this.db.all(query, [searchParam, searchParam, searchParam]);
      return clients;
    } catch (error) {
      logger.error('Error searching clients', { searchTerm, error: error.message });
      throw error;
    }
  }
}

module.exports = new ClientService(); 