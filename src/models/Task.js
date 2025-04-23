const { getDatabase } = require('../database');
const logger = require('../utils/logger');

class Task {
  constructor(data = {}) {
    this.id = data.id || null;
    this.title = data.title || '';
    this.description = data.description || '';
    this.status = data.status || 'pending'; // pending, in_progress, completed, cancelled
    this.priority = data.priority || 'medium'; // low, medium, high, urgent
    this.due_date = data.due_date || null;
    this.assigned_to = data.assigned_to || null;
    this.client_id = data.client_id || null;
    this.user_id = data.user_id || null; // Owner of the task
    this.source = data.source || 'manual'; // manual, email, calendar, etc.
    this.created_at = data.created_at || new Date().toISOString();
    this.updated_at = data.updated_at || new Date().toISOString();
  }

  // Save task to database
  async save() {
    const db = getDatabase();
    
    if (this.id) {
      // Update existing task
      return new Promise((resolve, reject) => {
        const query = `
          UPDATE tasks 
          SET title = ?, description = ?, status = ?, priority = ?, 
              due_date = ?, assigned_to = ?, client_id = ?, user_id = ?, source = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `;
        
        db.run(
          query, 
          [
            this.title, 
            this.description, 
            this.status, 
            this.priority,
            this.due_date, 
            this.assigned_to, 
            this.client_id, 
            this.user_id,
            this.source,
            this.id
          ],
          function(err) {
            if (err) {
              logger.error(`Error updating task: ${err.message}`);
              reject(err);
            } else {
              logger.info(`Task ${this.id} updated successfully`);
              resolve(this);
            }
          }
        );
      });
    } else {
      // Insert new task
      return new Promise((resolve, reject) => {
        const query = `
          INSERT INTO tasks 
          (title, description, status, priority, due_date, assigned_to, client_id, user_id, source)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        db.run(
          query,
          [
            this.title, 
            this.description, 
            this.status, 
            this.priority,
            this.due_date, 
            this.assigned_to, 
            this.client_id, 
            this.user_id,
            this.source
          ],
          function(err) {
            if (err) {
              logger.error(`Error creating task: ${err.message}`);
              reject(err);
            } else {
              const taskId = this.lastID;
              logger.info(`Task created with ID: ${taskId}`);
              resolve(new Task({ ...this, id: taskId }));
            }
          }
        );
      });
    }
  }

  // Find task by ID
  static async findById(id) {
    const db = getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM tasks WHERE id = ?';
      
      db.get(query, [id], (err, row) => {
        if (err) {
          logger.error(`Error finding task by ID: ${err.message}`);
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          resolve(new Task(row));
        }
      });
    });
  }

  // Find task by ID with ownership check
  static async findByIdAndUserId(id, userId) {
    const db = getDatabase();
    
    return new Promise((resolve, reject) => {
      // Include admin check: admins can access any task
      const query = `
        SELECT t.* FROM tasks t
        LEFT JOIN users u ON (u.id = ? AND u.role = 'admin')
        WHERE t.id = ? AND (t.user_id = ? OR u.id IS NOT NULL)
      `;
      
      db.get(query, [userId, id, userId], (err, row) => {
        if (err) {
          logger.error(`Error finding task by ID and user ID: ${err.message}`);
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          resolve(new Task(row));
        }
      });
    });
  }

  // Check if a user owns a task or is an admin
  static async canUserAccessTask(taskId, userId) {
    const db = getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        SELECT COUNT(*) as count FROM (
          SELECT 1 FROM tasks t
          WHERE t.id = ? AND t.user_id = ?
          UNION
          SELECT 1 FROM users u
          WHERE u.id = ? AND u.role = 'admin'
        )
      `;
      
      db.get(query, [taskId, userId, userId], (err, row) => {
        if (err) {
          logger.error(`Error checking task access: ${err.message}`);
          reject(err);
        } else {
          resolve(row.count > 0);
        }
      });
    });
  }

  // Find all tasks with optional filters
  static async findAll(filters = {}) {
    const db = getDatabase();
    let query = 'SELECT * FROM tasks';
    const params = [];
    const conditions = [];
    
    // Apply filters
    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }
    
    if (filters.priority) {
      conditions.push('priority = ?');
      params.push(filters.priority);
    }
    
    if (filters.client_id) {
      conditions.push('client_id = ?');
      params.push(filters.client_id);
    }
    
    if (filters.assigned_to) {
      conditions.push('assigned_to = ?');
      params.push(filters.assigned_to);
    }
    
    // User ID filter
    if (filters.user_id) {
      conditions.push('user_id = ?');
      params.push(filters.user_id);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    // Apply order
    query += ' ORDER BY due_date ASC, priority DESC';
    
    return new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) {
          logger.error(`Error finding tasks: ${err.message}`);
          reject(err);
        } else {
          const tasks = rows.map(row => new Task(row));
          resolve(tasks);
        }
      });
    });
  }

  // Find all tasks for a specific user or that the user has access to
  static async findAllForUser(userId, filters = {}, includeAdminAccess = true) {
    const db = getDatabase();
    let query;
    const params = [];
    const conditions = [];
    
    // Check if user is admin first
    const isAdmin = await this.isUserAdmin(userId);
    
    // If admin access is included and user is admin, show all tasks
    if (includeAdminAccess && isAdmin) {
      query = 'SELECT * FROM tasks';
    } else {
      // Only show tasks owned by the user
      conditions.push('user_id = ?');
      params.push(userId);
      query = 'SELECT * FROM tasks';
    }
    
    // Apply additional filters
    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }
    
    if (filters.priority) {
      conditions.push('priority = ?');
      params.push(filters.priority);
    }
    
    if (filters.client_id) {
      conditions.push('client_id = ?');
      params.push(filters.client_id);
    }
    
    if (filters.assigned_to) {
      conditions.push('assigned_to = ?');
      params.push(filters.assigned_to);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    // Apply order
    query += ' ORDER BY due_date ASC, priority DESC';
    
    return new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) {
          logger.error(`Error finding tasks for user: ${err.message}`);
          reject(err);
        } else {
          const tasks = rows.map(row => new Task(row));
          resolve(tasks);
        }
      });
    });
  }

  // Check if a user is an admin
  static async isUserAdmin(userId) {
    const db = getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = 'SELECT role FROM users WHERE id = ?';
      
      db.get(query, [userId], (err, row) => {
        if (err) {
          logger.error(`Error checking user role: ${err.message}`);
          reject(err);
        } else if (!row) {
          resolve(false);
        } else {
          resolve(row.role === 'admin');
        }
      });
    });
  }

  // Delete task
  static async delete(id) {
    const db = getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = 'DELETE FROM tasks WHERE id = ?';
      
      db.run(query, [id], function(err) {
        if (err) {
          logger.error(`Error deleting task: ${err.message}`);
          reject(err);
        } else {
          logger.info(`Task ${id} deleted successfully`);
          resolve({ deleted: this.changes > 0 });
        }
      });
    });
  }

  // Delete task with ownership check
  static async deleteWithOwnershipCheck(id, userId) {
    // First check if user can access this task
    const canAccess = await this.canUserAccessTask(id, userId);
    
    if (!canAccess) {
      return { deleted: false, error: 'unauthorized' };
    }
    
    const db = getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = 'DELETE FROM tasks WHERE id = ?';
      
      db.run(query, [id], function(err) {
        if (err) {
          logger.error(`Error deleting task: ${err.message}`);
          reject(err);
        } else {
          logger.info(`Task ${id} deleted successfully by user ${userId}`);
          resolve({ deleted: this.changes > 0 });
        }
      });
    });
  }
}

module.exports = Task; 