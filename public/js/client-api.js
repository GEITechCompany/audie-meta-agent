/**
 * Client API Module
 * Handles client-related API requests
 */

class ClientApi {
  /**
   * Get all clients with optional search and pagination
   * @param {string} search - Optional search term
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<Object>} Clients data with pagination
   */
  static async getClients(search = '', page = 1, limit = 10) {
    const queryParams = new URLSearchParams();
    
    if (search) queryParams.append('search', search);
    queryParams.append('page', page);
    queryParams.append('limit', limit);
    
    const queryString = queryParams.toString();
    return ApiClient.get(`/api/clients?${queryString}`);
  }
  
  /**
   * Get a client by ID
   * @param {string|number} clientId - Client ID
   * @returns {Promise<Object>} Client data with task and invoice stats
   */
  static async getClientById(clientId) {
    return ApiClient.get(`/api/clients/${clientId}`);
  }
  
  /**
   * Create a new client
   * @param {Object} clientData - Client data
   * @returns {Promise<Object>} Created client
   */
  static async createClient(clientData) {
    return ApiClient.post('/api/clients', clientData);
  }
  
  /**
   * Update a client
   * @param {string|number} clientId - Client ID
   * @param {Object} clientData - Updated client data
   * @returns {Promise<Object>} Updated client
   */
  static async updateClient(clientId, clientData) {
    return ApiClient.put(`/api/clients/${clientId}`, clientData);
  }
  
  /**
   * Delete a client
   * @param {string|number} clientId - Client ID
   * @returns {Promise<Object>} Deletion result
   */
  static async deleteClient(clientId) {
    return ApiClient.delete(`/api/clients/${clientId}`);
  }
  
  /**
   * Get client's tasks
   * @param {string|number} clientId - Client ID
   * @param {Object} filter - Optional filters
   * @returns {Promise<Object>} Client tasks
   */
  static async getClientTasks(clientId, filter = {}) {
    const queryParams = new URLSearchParams();
    
    Object.entries(filter).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value);
      }
    });
    
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return ApiClient.get(`/api/clients/${clientId}/tasks${queryString}`);
  }
  
  /**
   * Get client's invoices
   * @param {string|number} clientId - Client ID
   * @param {Object} filter - Optional filters
   * @returns {Promise<Object>} Client invoices
   */
  static async getClientInvoices(clientId, filter = {}) {
    const queryParams = new URLSearchParams();
    
    Object.entries(filter).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value);
      }
    });
    
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return ApiClient.get(`/api/clients/${clientId}/invoices${queryString}`);
  }
} 