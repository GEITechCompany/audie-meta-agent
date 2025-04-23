/**
 * Authentication Client Module
 * Handles login, registration, token storage, and token refresh logic
 */

// Auth service configuration
const AUTH_CONFIG = {
  tokenRefreshInterval: 4 * 60 * 1000, // 4 minutes (tokens expire in 5 minutes)
  storage: {
    accessToken: 'audie_access_token',
    refreshToken: 'audie_refresh_token',
    user: 'audie_user',
    expiry: 'audie_token_expiry'
  },
  endpoints: {
    login: '/api/auth/login',
    register: '/api/auth/register',
    refresh: '/api/auth/refresh',
    logout: '/api/auth/logout'
  }
};

// Token refresh timer
let tokenRefreshTimer = null;

/**
 * Authentication Service
 */
class AuthService {
  /**
   * Initialize authentication state
   */
  static init() {
    // Check if user is authenticated
    const isAuthenticated = this.isAuthenticated();
    
    // If authenticated, schedule token refresh
    if (isAuthenticated) {
      this.scheduleTokenRefresh();
    } else {
      // If on a protected page and not authenticated, redirect to login
      const isAuthPage = window.location.pathname === '/login' || window.location.pathname === '/register';
      if (!isAuthPage) {
        this.redirectToLogin();
      }
    }
  }
  
  /**
   * Check if user is authenticated with a valid token
   * @returns {boolean} Authentication status
   */
  static isAuthenticated() {
    const token = localStorage.getItem(AUTH_CONFIG.storage.accessToken);
    const expiry = localStorage.getItem(AUTH_CONFIG.storage.expiry);
    
    if (!token || !expiry) {
      return false;
    }
    
    // Check if token is expired
    const expiryTime = parseInt(expiry, 10);
    const currentTime = Date.now();
    
    return currentTime < expiryTime;
  }
  
  /**
   * Login user with username and password
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<Object>} Login result
   */
  static async login(username, password) {
    try {
      const response = await fetch(AUTH_CONFIG.endpoints.login, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }
      
      // Store tokens and user data
      this.storeAuthData(data.data);
      
      // Schedule token refresh
      this.scheduleTokenRefresh();
      
      return data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }
  
  /**
   * Register a new user
   * @param {Object} userData - User registration data
   * @returns {Promise<Object>} Registration result
   */
  static async register(userData) {
    try {
      const response = await fetch(AUTH_CONFIG.endpoints.register, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(userData)
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Registration failed');
      }
      
      // Store tokens and user data
      this.storeAuthData(data.data);
      
      // Schedule token refresh
      this.scheduleTokenRefresh();
      
      return data;
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  }
  
  /**
   * Logout user and clear tokens
   * @returns {Promise<void>}
   */
  static async logout() {
    try {
      const refreshToken = localStorage.getItem(AUTH_CONFIG.storage.refreshToken);
      
      if (refreshToken) {
        // Try to notify server about logout
        await fetch(AUTH_CONFIG.endpoints.logout, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem(AUTH_CONFIG.storage.accessToken)}`
          },
          body: JSON.stringify({ refreshToken })
        }).catch(err => console.warn('Logout notification error:', err));
      }
    } finally {
      // Clear local storage and stop refresh timer
      this.clearAuthData();
      this.clearTokenRefresh();
      
      // Redirect to login page
      window.location.href = '/login';
    }
  }
  
  /**
   * Refresh the access token using refresh token
   * @returns {Promise<Object>} New tokens
   */
  static async refreshToken() {
    try {
      const refreshToken = localStorage.getItem(AUTH_CONFIG.storage.refreshToken);
      
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }
      
      const response = await fetch(AUTH_CONFIG.endpoints.refresh, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refreshToken })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Token refresh failed');
      }
      
      // Update tokens only (keep existing user data)
      this.updateTokens(data.data.tokens);
      
      return data;
    } catch (error) {
      console.error('Token refresh error:', error);
      
      // If refresh fails, logout user
      this.clearAuthData();
      this.redirectToLogin();
      
      throw error;
    }
  }
  
  /**
   * Store authentication data in local storage
   * @param {Object} data - Authentication data with tokens and user
   */
  static storeAuthData(data) {
    if (data.tokens && data.tokens.access) {
      localStorage.setItem(AUTH_CONFIG.storage.accessToken, data.tokens.access);
      
      // Calculate and store expiry time (current time + 5 minutes in milliseconds)
      const expiryTime = Date.now() + 5 * 60 * 1000;
      localStorage.setItem(AUTH_CONFIG.storage.expiry, expiryTime.toString());
      
      if (data.tokens.refresh) {
        localStorage.setItem(AUTH_CONFIG.storage.refreshToken, data.tokens.refresh);
      }
    }
    
    if (data.user) {
      localStorage.setItem(AUTH_CONFIG.storage.user, JSON.stringify(data.user));
    }
  }
  
  /**
   * Update tokens after refresh
   * @param {Object} tokens - New tokens
   */
  static updateTokens(tokens) {
    if (tokens.access) {
      localStorage.setItem(AUTH_CONFIG.storage.accessToken, tokens.access);
      
      // Calculate and store expiry time (current time + 5 minutes in milliseconds)
      const expiryTime = Date.now() + 5 * 60 * 1000;
      localStorage.setItem(AUTH_CONFIG.storage.expiry, expiryTime.toString());
    }
    
    if (tokens.refresh) {
      localStorage.setItem(AUTH_CONFIG.storage.refreshToken, tokens.refresh);
    }
  }
  
  /**
   * Clear all authentication data from local storage
   */
  static clearAuthData() {
    localStorage.removeItem(AUTH_CONFIG.storage.accessToken);
    localStorage.removeItem(AUTH_CONFIG.storage.refreshToken);
    localStorage.removeItem(AUTH_CONFIG.storage.user);
    localStorage.removeItem(AUTH_CONFIG.storage.expiry);
  }
  
  /**
   * Get current user data
   * @returns {Object|null} User data
   */
  static getUser() {
    const userJson = localStorage.getItem(AUTH_CONFIG.storage.user);
    return userJson ? JSON.parse(userJson) : null;
  }
  
  /**
   * Get access token for API requests
   * @returns {string|null} Access token
   */
  static getAccessToken() {
    return localStorage.getItem(AUTH_CONFIG.storage.accessToken);
  }
  
  /**
   * Schedule token refresh before expiry
   */
  static scheduleTokenRefresh() {
    this.clearTokenRefresh();
    
    tokenRefreshTimer = setInterval(async () => {
      try {
        await this.refreshToken();
        console.log('Token refreshed successfully');
      } catch (error) {
        console.error('Failed to refresh token:', error);
      }
    }, AUTH_CONFIG.tokenRefreshInterval);
  }
  
  /**
   * Clear token refresh timer
   */
  static clearTokenRefresh() {
    if (tokenRefreshTimer) {
      clearInterval(tokenRefreshTimer);
      tokenRefreshTimer = null;
    }
  }
  
  /**
   * Redirect to login page with return URL
   */
  static redirectToLogin() {
    const currentPath = window.location.pathname + window.location.search;
    
    if (currentPath !== '/login') {
      window.location.href = `/login?returnUrl=${encodeURIComponent(currentPath)}`;
    } else {
      window.location.href = '/login';
    }
  }
}

/**
 * Form handling functions
 */
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const alertContainer = document.getElementById('alertContainer');
  
  // Check if we're on login page and have a return URL
  const returnUrl = new URLSearchParams(window.location.search).get('returnUrl');
  
  // Initialize authentication
  AuthService.init();
  
  // If user is already authenticated and on auth pages, redirect to dashboard
  if (AuthService.isAuthenticated() && (window.location.pathname === '/login' || window.location.pathname === '/register')) {
    window.location.href = '/';
  }
  
  /**
   * Show alert message
   * @param {string} message - Alert message
   * @param {string} type - Alert type (success, danger, warning, etc.)
   */
  const showAlert = (message, type = 'danger') => {
    // Clear existing alerts
    alertContainer.innerHTML = '';
    
    // Create alert element
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show`;
    alert.role = 'alert';
    alert.innerHTML = `
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    alertContainer.appendChild(alert);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      const bsAlert = new bootstrap.Alert(alert);
      bsAlert.close();
    }, 5000);
  };
  
  // Handle login form submission
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      const loginButton = document.getElementById('loginButton');
      const loginSpinner = document.getElementById('loginSpinner');
      
      // Validate form
      if (!username || !password) {
        showAlert('Please enter both username and password.');
        return;
      }
      
      // Show loading state
      loginButton.disabled = true;
      loginSpinner.classList.remove('d-none');
      
      try {
        // Login
        await AuthService.login(username, password);
        
        // Redirect to dashboard or specified return URL
        window.location.href = returnUrl || '/';
      } catch (error) {
        showAlert(error.message || 'Login failed. Please check your credentials.');
      } finally {
        // Hide loading state
        loginButton.disabled = false;
        loginSpinner.classList.add('d-none');
      }
    });
  }
  
  // Handle registration form submission
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const username = document.getElementById('username').value.trim();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirm_password').value;
      const firstName = document.getElementById('first_name').value.trim();
      const lastName = document.getElementById('last_name').value.trim();
      const registerButton = document.getElementById('registerButton');
      const registerSpinner = document.getElementById('registerSpinner');
      
      // Validate form
      if (!username || !email || !password) {
        showAlert('Please fill in all required fields.');
        return;
      }
      
      if (password !== confirmPassword) {
        showAlert('Passwords do not match.');
        return;
      }
      
      if (password.length < 8) {
        showAlert('Password must be at least 8 characters long.');
        return;
      }
      
      // Show loading state
      registerButton.disabled = true;
      registerSpinner.classList.remove('d-none');
      
      try {
        // Register user
        await AuthService.register({
          username,
          email,
          password,
          first_name: firstName,
          last_name: lastName
        });
        
        // Redirect to dashboard
        window.location.href = '/';
      } catch (error) {
        showAlert(error.message || 'Registration failed. Please try again.');
      } finally {
        // Hide loading state
        registerButton.disabled = false;
        registerSpinner.classList.add('d-none');
      }
    });
  }
}); 