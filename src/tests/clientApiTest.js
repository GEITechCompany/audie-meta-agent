/**
 * Client API Test Script
 * Tests the RESTful API endpoints for client management
 */

require('dotenv').config();
const axios = require('axios');
const logger = require('../utils/logger');

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3000/api';
let authToken = null;
let testClientId = null;

// Test client data
const testClient = {
  name: 'Test Company Inc.',
  email: 'test@testcompany.com',
  phone: '555-123-4567',
  address: '123 Test Street, Test City, TS 12345',
  notes: 'This is a test client created by the API test script'
};

// Helper for API requests with authentication
const apiRequest = async (method, endpoint, data = null) => {
  try {
    const headers = {};
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }
    
    const response = await axios({
      method,
      url: `${API_URL}${endpoint}`,
      data,
      headers
    });
    
    return response.data;
  } catch (error) {
    if (error.response) {
      logger.error(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      return error.response.data;
    }
    logger.error(`Request Error: ${error.message}`);
    throw error;
  }
};

// Login to get auth token (adjust with your admin credentials)
async function login() {
  try {
    logger.info('Authenticating...');
    const response = await apiRequest('post', '/auth/login', {
      email: 'admin@example.com',  // Replace with valid admin credentials
      password: 'admin123'         // Replace with valid admin credentials
    });
    
    if (response.success) {
      authToken = response.token;
      logger.info('Authentication successful');
      return true;
    } else {
      logger.error('Authentication failed:', response.message);
      return false;
    }
  } catch (error) {
    logger.error('Authentication error:', error.message);
    return false;
  }
}

// Test creating a client
async function testCreateClient() {
  logger.info('Testing client creation...');
  const response = await apiRequest('post', '/clients', testClient);
  
  if (response.success) {
    testClientId = response.data.id;
    logger.info(`Client created successfully with ID: ${testClientId}`);
    return true;
  } else {
    logger.error('Client creation failed:', response.message);
    return false;
  }
}

// Test getting all clients
async function testGetAllClients() {
  logger.info('Testing get all clients...');
  const response = await apiRequest('get', '/clients?page=1&limit=10');
  
  if (response.success) {
    logger.info(`Retrieved ${response.pagination.total} clients`);
    return true;
  } else {
    logger.error('Get all clients failed:', response.message);
    return false;
  }
}

// Test getting client by ID
async function testGetClientById() {
  if (!testClientId) {
    logger.error('No client ID available for testing');
    return false;
  }
  
  logger.info(`Testing get client by ID: ${testClientId}`);
  const response = await apiRequest('get', `/clients/${testClientId}`);
  
  if (response.success) {
    logger.info(`Retrieved client: ${response.data.name}`);
    logger.info(`Task stats: ${JSON.stringify(response.data.taskStats)}`);
    logger.info(`Invoice stats: ${JSON.stringify(response.data.invoiceStats)}`);
    return true;
  } else {
    logger.error('Get client by ID failed:', response.message);
    return false;
  }
}

// Test updating a client
async function testUpdateClient() {
  if (!testClientId) {
    logger.error('No client ID available for testing');
    return false;
  }
  
  logger.info(`Testing update client: ${testClientId}`);
  const updatedData = {
    name: `${testClient.name} (Updated)`,
    notes: `${testClient.notes} - Updated on ${new Date().toISOString()}`
  };
  
  const response = await apiRequest('put', `/clients/${testClientId}`, updatedData);
  
  if (response.success) {
    logger.info(`Client updated successfully: ${response.data.name}`);
    return true;
  } else {
    logger.error('Update client failed:', response.message);
    return false;
  }
}

// Test getting client tasks
async function testGetClientTasks() {
  if (!testClientId) {
    logger.error('No client ID available for testing');
    return false;
  }
  
  logger.info(`Testing get client tasks: ${testClientId}`);
  const response = await apiRequest('get', `/clients/${testClientId}/tasks`);
  
  if (response.success) {
    logger.info(`Retrieved ${response.count} tasks for client`);
    return true;
  } else {
    logger.error('Get client tasks failed:', response.message);
    return false;
  }
}

// Test getting client invoices
async function testGetClientInvoices() {
  if (!testClientId) {
    logger.error('No client ID available for testing');
    return false;
  }
  
  logger.info(`Testing get client invoices: ${testClientId}`);
  const response = await apiRequest('get', `/clients/${testClientId}/invoices`);
  
  if (response.success) {
    logger.info(`Retrieved ${response.count} invoices for client`);
    return true;
  } else {
    logger.error('Get client invoices failed:', response.message);
    return false;
  }
}

// Test deleting a client (comment this out if you want to keep the test client)
async function testDeleteClient() {
  if (!testClientId) {
    logger.error('No client ID available for testing');
    return false;
  }
  
  logger.info(`Testing delete client: ${testClientId}`);
  const response = await apiRequest('delete', `/clients/${testClientId}`);
  
  if (response.success) {
    logger.info('Client deleted successfully');
    testClientId = null;
    return true;
  } else {
    logger.error('Delete client failed:', response.message);
    return false;
  }
}

// Run all tests
async function runTests() {
  try {
    // Login first
    const isLoggedIn = await login();
    if (!isLoggedIn) {
      logger.error('Tests aborted: Authentication failed');
      return;
    }
    
    // Run tests in sequence
    await testCreateClient();
    await testGetAllClients();
    await testGetClientById();
    await testUpdateClient();
    await testGetClientTasks();
    await testGetClientInvoices();
    
    // Uncomment to test deletion
    // await testDeleteClient();
    
    logger.info('All tests completed');
  } catch (error) {
    logger.error('Test suite error:', error.message);
  }
}

// Run the test suite
runTests(); 