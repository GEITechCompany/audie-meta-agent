const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dataDir, 'audie.db');
let db;

// Initialize database connection
function getDatabase() {
  if (!db) {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        logger.error(`Error connecting to SQLite database: ${err.message}`);
        throw err;
      }
      logger.info(`Connected to SQLite database at ${dbPath}`);
    });
  }
  return db;
}

// Close database connection
function closeDatabase() {
  if (db) {
    return new Promise((resolve, reject) => {
      db.close((err) => {
        if (err) {
          logger.error(`Error closing database: ${err.message}`);
          reject(err);
        } else {
          logger.info('Database connection closed');
          db = null;
          resolve();
        }
      });
    });
  }
  return Promise.resolve();
}

// Setup all database tables
async function setupDatabase() {
  return new Promise((resolve, reject) => {
    try {
      const database = getDatabase();
      
      // Create tasks table with error handling
      database.run(`
        CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          description TEXT,
          status TEXT NOT NULL,
          priority TEXT NOT NULL,
          due_date TIMESTAMP,
          assigned_to TEXT,
          client_id INTEGER,
          source TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          logger.error(`Error creating tasks table: ${err.message}`);
          return reject(err);
        }
        
        // Continue with other tables if successful
        setupRemainingTables(database, resolve, reject);
      });
    } catch (error) {
      logger.error(`Critical database error: ${error.message}`);
      reject(error);
    }
  });
}

// Helper function to set up remaining tables
function setupRemainingTables(database, resolve, reject) {
  try {
    // Create clients table
    database.run(`
      CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        address TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        logger.error(`Error creating clients table: ${err.message}`);
        return reject(err);
      }

      // Create estimates table
      database.run(`
        CREATE TABLE IF NOT EXISTS estimates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          client_id INTEGER NOT NULL,
          estimate_number TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          status TEXT NOT NULL,
          total_amount REAL NOT NULL,
          valid_until TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (client_id) REFERENCES clients (id)
        )
      `, (err) => {
        if (err) {
          logger.error(`Error creating estimates table: ${err.message}`);
          return reject(err);
        }

        // Create invoices table
        database.run(`
          CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER NOT NULL,
            estimate_id INTEGER,
            invoice_number TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL,
            total_amount REAL NOT NULL,
            amount_paid REAL DEFAULT 0,
            due_date TIMESTAMP,
            paid_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (client_id) REFERENCES clients (id),
            FOREIGN KEY (estimate_id) REFERENCES estimates (id)
          )
        `, (err) => {
          if (err) {
            logger.error(`Error creating invoices table: ${err.message}`);
            return reject(err);
          }

          // Create estimate_items table
          database.run(`
            CREATE TABLE IF NOT EXISTS estimate_items (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              estimate_id INTEGER NOT NULL,
              description TEXT NOT NULL,
              quantity REAL NOT NULL DEFAULT 1,
              unit_price REAL NOT NULL DEFAULT 0,
              amount REAL NOT NULL DEFAULT 0,
              tax_rate REAL DEFAULT 0,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (estimate_id) REFERENCES estimates (id)
            )
          `, (err) => {
            if (err) {
              logger.error(`Error creating estimate_items table: ${err.message}`);
              return reject(err);
            }

            // Create invoice_items table
            database.run(`
              CREATE TABLE IF NOT EXISTS invoice_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                invoice_id INTEGER NOT NULL,
                description TEXT NOT NULL,
                quantity REAL NOT NULL DEFAULT 1,
                unit_price REAL NOT NULL DEFAULT 0,
                amount REAL NOT NULL DEFAULT 0,
                tax_rate REAL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (invoice_id) REFERENCES invoices (id)
              )
            `, (err) => {
              if (err) {
                logger.error(`Error creating invoice_items table: ${err.message}`);
                return reject(err);
              }

              // Create invoice_payments table
              database.run(`
                CREATE TABLE IF NOT EXISTS invoice_payments (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  invoice_id INTEGER NOT NULL,
                  amount REAL NOT NULL,
                  payment_date TIMESTAMP NOT NULL,
                  payment_method TEXT NOT NULL,
                  notes TEXT,
                  transaction_id TEXT,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY (invoice_id) REFERENCES invoices (id)
                )
              `, (err) => {
                if (err) {
                  logger.error(`Error creating invoice_payments table: ${err.message}`);
                  return reject(err);
                }

                // Create users table for authentication
                database.run(`
                  CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE,
                    email TEXT NOT NULL UNIQUE,
                    password TEXT NOT NULL,
                    first_name TEXT,
                    last_name TEXT,
                    role TEXT NOT NULL DEFAULT 'user', 
                    last_login TIMESTAMP,
                    login_attempts INTEGER DEFAULT 0,
                    locked_until TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                  )
                `, (err) => {
                  if (err) {
                    logger.error(`Error creating users table: ${err.message}`);
                    return reject(err);
                  }

                  // Create refresh tokens table for JWT authentication
                  database.run(`
                    CREATE TABLE IF NOT EXISTS refresh_tokens (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      token TEXT NOT NULL UNIQUE,
                      user_id INTEGER NOT NULL,
                      expires_at TIMESTAMP NOT NULL,
                      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                      revoked BOOLEAN DEFAULT 0,
                      FOREIGN KEY (user_id) REFERENCES users (id)
                    )
                  `, (err) => {
                    if (err) {
                      logger.error(`Error creating refresh_tokens table: ${err.message}`);
                      return reject(err);
                    }

                    // Create logs table
                    database.run(`
                      CREATE TABLE IF NOT EXISTS logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        level TEXT NOT NULL,
                        message TEXT NOT NULL,
                        metadata TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                      )
                    `, (err) => {
                      if (err) {
                        logger.error(`Error creating logs table: ${err.message}`);
                        return reject(err);
                      }

                      // Create API metrics table
                      database.run(`
                        CREATE TABLE IF NOT EXISTS api_metrics (
                          id INTEGER PRIMARY KEY AUTOINCREMENT,
                          endpoint TEXT NOT NULL,
                          method TEXT,
                          status INTEGER,
                          source TEXT NOT NULL,
                          is_mock BOOLEAN NOT NULL DEFAULT 0,
                          duration INTEGER,
                          error_type TEXT,
                          error_message TEXT,
                          request_data TEXT,
                          response_data TEXT,
                          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        )
                      `, (err) => {
                        if (err) {
                          logger.error(`Error creating api_metrics table: ${err.message}`);
                          return reject(err);
                        }

                        // Create API metrics summary table for aggregated data
                        database.run(`
                          CREATE TABLE IF NOT EXISTS api_metrics_summary (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            endpoint TEXT NOT NULL,
                            date TEXT NOT NULL,
                            total_calls INTEGER NOT NULL DEFAULT 0,
                            successful_calls INTEGER NOT NULL DEFAULT 0,
                            failed_calls INTEGER NOT NULL DEFAULT 0,
                            mock_calls INTEGER NOT NULL DEFAULT 0,
                            real_calls INTEGER NOT NULL DEFAULT 0,
                            avg_duration REAL,
                            max_duration INTEGER,
                            min_duration INTEGER,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            UNIQUE(endpoint, date)
                          )
                        `, (err) => {
                          if (err) {
                            logger.error(`Error creating api_metrics_summary table: ${err.message}`);
                            return reject(err);
                          }
                          
                          logger.info('Database setup completed successfully');
                          resolve();
                        }); // api_metrics_summary
                      }); // api_metrics
                    }); // logs
                  }); // refresh_tokens
                }); // users
              }); // invoice_payments
            }); // invoice_items
          }); // estimate_items
        }); // invoices
      }); // estimates
    }); // clients
  } catch (error) {
    logger.error(`Error in setupRemainingTables: ${error.message}`);
    reject(error);
  }
}

module.exports = {
  getDatabase,
  closeDatabase,
  setupDatabase
}; 