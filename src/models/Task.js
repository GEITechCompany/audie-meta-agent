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
              due_date = ?, assigned_to = ?, client_id = ?, source = ?,
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
          (title, description, status, priority, due_date, assigned_to, client_id, source)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
}

module.exports = Task; 