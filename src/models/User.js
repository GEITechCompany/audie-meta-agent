const { getDatabase } = require('../database');
const logger = require('../utils/logger');
const bcrypt = require('bcrypt');

class User {
  constructor(data = {}) {
    this.id = data.id || null;
    this.username = data.username || '';
    this.email = data.email || '';
    this.password = data.password || ''; // Hashed password will be stored here
    this.first_name = data.first_name || '';
    this.last_name = data.last_name || '';
    this.role = data.role || 'user'; // Default role is 'user', can be 'admin'
    this.last_login = data.last_login || null;
    this.login_attempts = data.login_attempts || 0;
    this.locked_until = data.locked_until || null;
    this.created_at = data.created_at || new Date().toISOString();
    this.updated_at = data.updated_at || new Date().toISOString();
  }

  // Hash password before saving
  async hashPassword() {
    try {
      // Only hash the password if it's not already hashed
      if (this.password && !this.password.startsWith('$2b$')) {
        // bcrypt with cost factor 12
        const saltRounds = 12;
        this.password = await bcrypt.hash(this.password, saltRounds);
      }
    } catch (error) {
      logger.error(`Error hashing password: ${error.message}`);
      throw error;
    }
  }

  // Verify password
  async verifyPassword(plainPassword) {
    try {
      return await bcrypt.compare(plainPassword, this.password);
    } catch (error) {
      logger.error(`Error verifying password: ${error.message}`);
      throw error;
    }
  }

  // Save user to database
  async save() {
    try {
      // Hash password before saving
      await this.hashPassword();
      
      const db = getDatabase();
      
      if (this.id) {
        // Update existing user
        return new Promise((resolve, reject) => {
          const query = `
            UPDATE users 
            SET username = ?, email = ?, password = ?, first_name = ?, 
                last_name = ?, role = ?, last_login = ?, login_attempts = ?,
                locked_until = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `;
          
          db.run(
            query, 
            [
              this.username, 
              this.email, 
              this.password, 
              this.first_name,
              this.last_name, 
              this.role, 
              this.last_login, 
              this.login_attempts,
              this.locked_until,
              this.id
            ],
            function(err) {
              if (err) {
                logger.error(`Error updating user: ${err.message}`);
                reject(err);
              } else {
                logger.info(`User ${this.lastID} updated successfully`);
                resolve(new User({ ...this, id: this.lastID }));
              }
            }
          );
        });
      } else {
        // Insert new user
        return new Promise((resolve, reject) => {
          const query = `
            INSERT INTO users 
            (username, email, password, first_name, last_name, role)
            VALUES (?, ?, ?, ?, ?, ?)
          `;
          
          db.run(
            query,
            [
              this.username, 
              this.email, 
              this.password, 
              this.first_name,
              this.last_name, 
              this.role
            ],
            function(err) {
              if (err) {
                logger.error(`Error creating user: ${err.message}`);
                reject(err);
              } else {
                const userId = this.lastID;
                logger.info(`User created with ID: ${userId}`);
                resolve(new User({ ...this, id: userId }));
              }
            }
          );
        });
      }
    } catch (error) {
      logger.error(`Error saving user: ${error.message}`);
      throw error;
    }
  }

  // Find user by ID
  static async findById(id) {
    const db = getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM users WHERE id = ?';
      
      db.get(query, [id], (err, row) => {
        if (err) {
          logger.error(`Error finding user by ID: ${err.message}`);
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          resolve(new User(row));
        }
      });
    });
  }

  // Find user by username
  static async findByUsername(username) {
    const db = getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM users WHERE username = ?';
      
      db.get(query, [username], (err, row) => {
        if (err) {
          logger.error(`Error finding user by username: ${err.message}`);
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          resolve(new User(row));
        }
      });
    });
  }

  // Find user by email
  static async findByEmail(email) {
    const db = getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM users WHERE email = ?';
      
      db.get(query, [email], (err, row) => {
        if (err) {
          logger.error(`Error finding user by email: ${err.message}`);
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          resolve(new User(row));
        }
      });
    });
  }

  // Find all users with optional filters
  static async findAll(filters = {}) {
    const db = getDatabase();
    let query = 'SELECT * FROM users';
    const params = [];
    const conditions = [];
    
    // Apply filters
    if (filters.role) {
      conditions.push('role = ?');
      params.push(filters.role);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    // Apply order
    query += ' ORDER BY created_at DESC';
    
    return new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) {
          logger.error(`Error finding users: ${err.message}`);
          reject(err);
        } else {
          const users = rows.map(row => {
            // Don't include password in the response
            const userData = { ...row };
            delete userData.password;
            return new User(userData);
          });
          resolve(users);
        }
      });
    });
  }

  // Record login attempt
  async recordLoginAttempt(success) {
    const db = getDatabase();
    
    if (success) {
      // Reset login attempts on successful login
      this.login_attempts = 0;
      this.last_login = new Date().toISOString();
      this.locked_until = null;
    } else {
      // Increment login attempts on failed login
      this.login_attempts += 1;
      
      // Lock account after 5 failed attempts for 30 minutes
      if (this.login_attempts >= 5) {
        const lockTime = new Date();
        lockTime.setMinutes(lockTime.getMinutes() + 30);
        this.locked_until = lockTime.toISOString();
      }
    }
    
    return this.save();
  }

  // Check if account is locked
  isLocked() {
    if (this.locked_until) {
      const now = new Date();
      const lockUntil = new Date(this.locked_until);
      return now < lockUntil;
    }
    return false;
  }

  // Delete user
  static async delete(id) {
    const db = getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = 'DELETE FROM users WHERE id = ?';
      
      db.run(query, [id], function(err) {
        if (err) {
          logger.error(`Error deleting user: ${err.message}`);
          reject(err);
        } else {
          logger.info(`User ${id} deleted successfully`);
          resolve({ deleted: this.changes > 0 });
        }
      });
    });
  }

  // Get user data for JWT token (exclude sensitive info)
  getPublicProfile() {
    return {
      id: this.id,
      username: this.username,
      email: this.email,
      first_name: this.first_name,
      last_name: this.last_name,
      role: this.role
    };
  }
}

module.exports = User; 