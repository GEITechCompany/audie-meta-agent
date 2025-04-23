/**
 * Create Admin User Script
 * Run this script to create an initial admin user
 * 
 * Usage: node src/scripts/createAdminUser.js
 */

require('dotenv').config();
const User = require('../models/User');
const { setupDatabase } = require('../database');
const logger = require('../utils/logger');

// Admin user details (use environment variables or defaults)
const adminDetails = {
  username: process.env.ADMIN_USERNAME || 'admin',
  email: process.env.ADMIN_EMAIL || 'admin@example.com',
  password: process.env.ADMIN_PASSWORD || 'Admin123!',
  first_name: process.env.ADMIN_FIRST_NAME || 'Admin',
  last_name: process.env.ADMIN_LAST_NAME || 'User',
  role: 'admin'
};

async function createAdminUser() {
  try {
    // Initialize database
    await setupDatabase();
    
    // Check if admin user already exists
    const existingUser = await User.findByUsername(adminDetails.username);
    if (existingUser) {
      logger.info(`Admin user '${adminDetails.username}' already exists.`);
      process.exit(0);
    }
    
    // Create admin user
    const adminUser = new User(adminDetails);
    await adminUser.save();
    
    logger.info(`Admin user '${adminDetails.username}' created successfully.`);
    logger.info(`Email: ${adminDetails.email}`);
    logger.info(`Password: ${adminDetails.password}`);
    
    process.exit(0);
  } catch (error) {
    logger.error(`Error creating admin user: ${error.message}`);
    logger.error(error.stack);
    process.exit(1);
  }
}

createAdminUser(); 