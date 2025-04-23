/**
 * API Client Module
 * Handles API requests with authentication headers
 */

/**
 * Base API Client with authentication
 */
class ApiClient {
  /**
   * Make an authenticated API request
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} API response
   */
  static async request(endpoint, options = {}) {
    try {
      // Get access token
      const token = AuthService.getAccessToken();
      
      // Prepare headers
      const headers = {
        'Content-Type': 'application/json',
        ...options.headers
      };
      
      // Add authorization header if token exists
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      // Make request
      const response = await fetch(endpoint, {
        ...options,
        headers
      });
      
      // Parse JSON response
      const data = await response.json();
      
      // Handle API errors
      if (!response.ok) {
        const error = new Error(data.message || 'API request failed');
        error.status = response.status;
        error.data = data;
        
        // If unauthorized (401), redirect to login
        if (response.status === 401) {
          // Try to refresh token first if not a refresh token request
          if (!endpoint.includes('/api/auth/refresh')) {
            try {
              await AuthService.refreshToken();
              // Retry request with new token
              return this.request(endpoint, options);
            } catch (refreshError) {
              // If refresh failed, redirect to login
              AuthService.redirectToLogin();
              throw error;
            }
          } else {
            // If refresh token request failed, redirect to login
            AuthService.redirectToLogin();
            throw error;
          }
        }
        
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error(`API request error: ${error.message}`, error);
      throw error;
    }
  }
  
  /**
   * Make a GET request
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Additional fetch options
   * @returns {Promise<Object>} API response
   */
  static async get(endpoint, options = {}) {
    return this.request(endpoint, {
      method: 'GET',
      ...options
    });
  }
  
  /**
   * Make a POST request
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request body data
   * @param {Object} options - Additional fetch options
   * @returns {Promise<Object>} API response
   */
  static async post(endpoint, data, options = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
      ...options
    });
  }
  
  /**
   * Make a PUT request
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request body data
   * @param {Object} options - Additional fetch options
   * @returns {Promise<Object>} API response
   */
  static async put(endpoint, data, options = {}) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
      ...options
    });
  }
  
  /**
   * Make a DELETE request
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Additional fetch options
   * @returns {Promise<Object>} API response
   */
  static async delete(endpoint, options = {}) {
    return this.request(endpoint, {
      method: 'DELETE',
      ...options
    });
  }
}

/**
 * Task API Client
 */
class TaskApi {
  /**
   * Get all tasks
   * @param {Object} filter - Task filter parameters
   * @returns {Promise<Object>} Tasks data
   */
  static async getTasks(filter = {}) {
    // Build query string from filter
    const queryParams = new URLSearchParams();
    
    Object.entries(filter).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value);
      }
    });
    
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    
    return ApiClient.get(`/api/tasks${queryString}`);
  }
  
  /**
   * Get a task by ID
   * @param {string|number} taskId - Task ID
   * @returns {Promise<Object>} Task data
   */
  static async getTaskById(taskId) {
    return ApiClient.get(`/api/tasks/${taskId}`);
  }
  
  /**
   * Create a new task
   * @param {Object} taskData - Task data
   * @returns {Promise<Object>} Created task
   */
  static async createTask(taskData) {
    return ApiClient.post('/api/tasks', taskData);
  }
  
  /**
   * Update a task
   * @param {string|number} taskId - Task ID
   * @param {Object} taskData - Updated task data
   * @returns {Promise<Object>} Updated task
   */
  static async updateTask(taskId, taskData) {
    return ApiClient.put(`/api/tasks/${taskId}`, taskData);
  }
  
  /**
   * Delete a task
   * @param {string|number} taskId - Task ID
   * @returns {Promise<Object>} Deletion result
   */
  static async deleteTask(taskId) {
    return ApiClient.delete(`/api/tasks/${taskId}`);
  }
}

/**
 * Chat API Client
 */
class ChatApi {
  /**
   * Send a message to the assistant
   * @param {string} message - User message
   * @returns {Promise<Object>} Assistant response
   */
  static async sendMessage(message) {
    return ApiClient.post('/api/chat', { message });
  }
  
  /**
   * Get morning brief
   * @returns {Promise<Object>} Morning brief data
   */
  static async getMorningBrief() {
    return ApiClient.get('/api/morning-brief');
  }
  
  /**
   * Check emails
   * @returns {Promise<Object>} Email data
   */
  static async checkEmails() {
    return ApiClient.get('/api/check-emails');
  }
  
  /**
   * Get schedule
   * @returns {Promise<Object>} Schedule data
   */
  static async getSchedule() {
    return ApiClient.get('/api/schedule');
  }
} 