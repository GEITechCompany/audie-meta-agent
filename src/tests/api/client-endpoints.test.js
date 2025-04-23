/**
 * Client API Endpoints Test Script
 * Tests all client management endpoints including CRUD operations
 * and related client tasks/invoices retrieval
 */

const axios = require('axios');
const logger = require('../../utils/logger');

// Configuration
const API_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';
let authToken = '';
let testClientId = '';

// Test client data
const testClient = {
  name: 'Test Client',
  email: 'testclient@example.com',
  phone: '555-123-4567',
  company: 'Test Company Inc.',
  address: '123 Test Street, Test City, TS 12345'
};

const updatedClient = {
  name: 'Updated Test Client',
  email: 'updated@example.com',
  phone: '555-987-6543'
};

// Helper function for consistent error handling
const handleError = (error, endpoint) => {
  if (error.response) {
    logger.error(`Error testing ${endpoint}: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
  } else if (error.request) {
    logger.error(`Error testing ${endpoint}: No response received`);
  } else {
    logger.error(`Error testing ${endpoint}: ${error.message}`);
  }
};

/**
 * Run all client API tests in sequence
 */
async function runClientTests() {
  try {
    logger.info('Starting client API endpoint tests...');
    
    // First login to get auth token
    await login();
    
    // Run tests in sequence
    await createClient();
    await getAllClients();
    await getClientById();
    await updateClient();
    await getClientTasks();
    await getClientInvoices();
    await deleteClient();
    
    logger.info('✅ All client API endpoint tests completed successfully!');
  } catch (error) {
    logger.error('❌ Client API endpoint tests failed:', error.message);
  }
}

/**
 * Login to get authentication token
 * 
 * Note on CSRF Protection:
 * If your API uses CSRF protection, you'll need one of these approaches:
 * 1. Disable CSRF for tests by setting DISABLE_CSRF_FOR_TESTS=true in .env
 * 2. Or implement proper CSRF token handling by first requesting it from a
 *    /api/auth/csrf endpoint and including it in subsequent requests
 */
async function login() {
  try {
    const loginData = {
      email: process.env.TEST_USER_EMAIL || 'admin@example.com',
      password: process.env.TEST_USER_PASSWORD || 'password123'
    };
    
    // If we need to handle CSRF tokens
    if (process.env.HANDLE_CSRF === 'true') {
      try {
        logger.info('Fetching CSRF token...');
        const csrfResponse = await axios.get(`${API_URL}/auth/csrf`);
        if (csrfResponse.data && csrfResponse.data.csrfToken) {
          axios.defaults.headers.common['X-CSRF-Token'] = csrfResponse.data.csrfToken;
          logger.info('✓ CSRF token received and set in headers');
        }
      } catch (csrfError) {
        logger.warn('Failed to fetch CSRF token, proceeding without it');
      }
    }
    
    logger.info(`Logging in as ${loginData.email}...`);
    const response = await axios.post(`${API_URL}/auth/login`, loginData);
    
    if (response.data.success && response.data.token) {
      authToken = response.data.token;
      logger.info('✓ Login successful, auth token received');
      
      // Set default auth header for all subsequent requests
      axios.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
    } else {
      throw new Error('Invalid login response format');
    }
  } catch (error) {
    handleError(error, 'login');
    throw new Error('Login failed, cannot proceed with tests');
  }
}

/**
 * Test creating a new client
 */
async function createClient() {
  try {
    logger.info('Testing POST /clients endpoint...');
    const response = await axios.post(`${API_URL}/clients`, testClient);
    
    if (response.status === 201 && response.data.success && response.data.data && response.data.data.id) {
      testClientId = response.data.data.id;
      logger.info(`✓ Client created successfully with ID: ${testClientId}`);
    } else {
      throw new Error('Invalid response format');
    }
  } catch (error) {
    handleError(error, 'POST /clients');
    throw error;
  }
}

/**
 * Test retrieving all clients
 */
async function getAllClients() {
  try {
    logger.info('Testing GET /clients endpoint...');
    const response = await axios.get(`${API_URL}/clients`);
    
    if (response.status === 200 && response.data.success && Array.isArray(response.data.data)) {
      logger.info(`✓ Retrieved ${response.data.data.length} clients successfully`);
      if (response.data.pagination) {
        logger.info(`✓ Pagination data received: page ${response.data.pagination.page} of ${response.data.pagination.pages}`);
      }
    } else {
      throw new Error('Invalid response format');
    }
  } catch (error) {
    handleError(error, 'GET /clients');
    throw error;
  }
}

/**
 * Test retrieving a specific client by ID
 */
async function getClientById() {
  try {
    logger.info(`Testing GET /clients/${testClientId} endpoint...`);
    const response = await axios.get(`${API_URL}/clients/${testClientId}`);
    
    if (response.status === 200 && response.data.success && response.data.data && response.data.data.id) {
      logger.info('✓ Retrieved client by ID successfully');
      logger.info(`✓ Client data includes task stats: ${JSON.stringify(response.data.data.taskStats)}`);
    } else {
      throw new Error('Invalid response format or client ID mismatch');
    }
  } catch (error) {
    handleError(error, `GET /clients/${testClientId}`);
    throw error;
  }
}

/**
 * Test updating a client
 */
async function updateClient() {
  try {
    logger.info(`Testing PUT /clients/${testClientId} endpoint...`);
    const response = await axios.put(`${API_URL}/clients/${testClientId}`, updatedClient);
    
    if (response.status === 200 && 
        response.data.success && 
        response.data.data && 
        response.data.data.name === updatedClient.name) {
      logger.info('✓ Updated client successfully');
    } else {
      throw new Error('Invalid response format or client update failed');
    }
  } catch (error) {
    handleError(error, `PUT /clients/${testClientId}`);
    throw error;
  }
}

/**
 * Test retrieving client tasks
 */
async function getClientTasks() {
  try {
    logger.info(`Testing GET /clients/${testClientId}/tasks endpoint...`);
    const response = await axios.get(`${API_URL}/clients/${testClientId}/tasks`);
    
    if (response.status === 200 && response.data.success && Array.isArray(response.data.data)) {
      logger.info(`✓ Retrieved ${response.data.count || response.data.data.length} tasks for client`);
    } else {
      throw new Error('Invalid response format');
    }
  } catch (error) {
    handleError(error, `GET /clients/${testClientId}/tasks`);
    throw error;
  }
}

/**
 * Test retrieving client invoices
 */
async function getClientInvoices() {
  try {
    logger.info(`Testing GET /clients/${testClientId}/invoices endpoint...`);
    const response = await axios.get(`${API_URL}/clients/${testClientId}/invoices`);
    
    if (response.status === 200 && response.data.success && Array.isArray(response.data.data)) {
      logger.info(`✓ Retrieved ${response.data.count || response.data.data.length} invoices for client`);
    } else {
      throw new Error('Invalid response format');
    }
  } catch (error) {
    handleError(error, `GET /clients/${testClientId}/invoices`);
    throw error;
  }
}

/**
 * Test deleting a client
 */
async function deleteClient() {
  try {
    logger.info(`Testing DELETE /clients/${testClientId} endpoint...`);
    const response = await axios.delete(`${API_URL}/clients/${testClientId}`);
    
    if (response.status === 200 && response.data.success) {
      logger.info('✓ Deleted client successfully');
      
      // Verify deletion by trying to fetch the deleted client
      try {
        await axios.get(`${API_URL}/clients/${testClientId}`);
        throw new Error('Client still exists after deletion');
      } catch (error) {
        if (error.response && error.response.status === 404) {
          logger.info('✓ Verified client was properly deleted');
        } else {
          throw error;
        }
      }
    } else {
      throw new Error('Invalid response format or client deletion failed');
    }
  } catch (error) {
    handleError(error, `DELETE /clients/${testClientId}`);
    throw error;
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runClientTests();
}

module.exports = {
  runClientTests
}; 