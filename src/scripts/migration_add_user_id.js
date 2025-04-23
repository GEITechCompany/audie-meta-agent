/**
 * Database Migration Script: Add user_id to tasks table
 * 
 * This script adds a user_id column to the tasks table and establishes
 * a foreign key relationship to the users table.
 * 
 * Usage: node src/scripts/migration_add_user_id.js
 */

require('dotenv').config();
const { getDatabase, closeDatabase } = require('../database');
const logger = require('../utils/logger');

async function addUserIdToTasks() {
  const db = getDatabase();
  
  return new Promise((resolve, reject) => {
    // Start a transaction
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      // Check if user_id column already exists
      db.get(
        "SELECT COUNT(*) AS count FROM pragma_table_info('tasks') WHERE name = 'user_id'",
        (err, row) => {
          if (err) {
            logger.error(`Error checking tasks table schema: ${err.message}`);
            db.run('ROLLBACK');
            return reject(err);
          }
          
          if (row.count === 0) {
            // Add the user_id column
            db.run(
              `ALTER TABLE tasks ADD COLUMN user_id INTEGER REFERENCES users(id)`,
              (err) => {
                if (err) {
                  logger.error(`Error adding user_id column: ${err.message}`);
                  db.run('ROLLBACK');
                  return reject(err);
                }
                
                logger.info('Added user_id column to tasks table');
                
                // Set default user_id to 1 (admin user) for existing tasks
                db.get('SELECT COUNT(*) AS count FROM users WHERE id = 1', (err, row) => {
                  if (err || row.count === 0) {
                    logger.warn('Admin user (id=1) not found, skipping default assignment');
                    db.run('COMMIT');
                    return resolve();
                  }
                  
                  db.run(
                    `UPDATE tasks SET user_id = 1 WHERE user_id IS NULL`,
                    (err) => {
                      if (err) {
                        logger.error(`Error setting default user_id: ${err.message}`);
                        db.run('ROLLBACK');
                        return reject(err);
                      }
                      
                      logger.info('Set default user_id=1 for existing tasks');
                      db.run('COMMIT');
                      resolve();
                    }
                  );
                });
              }
            );
          } else {
            logger.info('user_id column already exists in tasks table');
            db.run('COMMIT');
            resolve();
          }
        }
      );
    });
  });
}

// Create an index on the user_id column for performance
async function createUserIdIndex() {
  const db = getDatabase();
  
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='index' AND name='idx_tasks_user_id'",
      (err, row) => {
        if (err) {
          logger.error(`Error checking index: ${err.message}`);
          return reject(err);
        }
        
        if (row.count === 0) {
          db.run(
            'CREATE INDEX idx_tasks_user_id ON tasks(user_id)',
            (err) => {
              if (err) {
                logger.error(`Error creating index: ${err.message}`);
                return reject(err);
              }
              
              logger.info('Created index on tasks.user_id');
              resolve();
            }
          );
        } else {
          logger.info('Index on user_id already exists');
          resolve();
        }
      }
    );
  });
}

// Run the migration
async function runMigration() {
  try {
    await addUserIdToTasks();
    await createUserIdIndex();
    
    logger.info('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error(`Migration failed: ${error.message}`);
    logger.error(error.stack);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

runMigration(); 