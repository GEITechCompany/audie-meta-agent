/**
 * Authentication Controller
 * Handles user registration, login, refresh token, and logout
 */

const authService = require('../services/AuthService');
const logger = require('../utils/logger');

/**
 * Register a new user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const register = async (req, res) => {
  try {
    // Validate required fields
    const { username, email, password, first_name, last_name, role } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'Username, email, and password are required'
      });
    }
    
    // Validate password complexity
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Invalid password',
        message: 'Password must be at least 8 characters long'
      });
    }
    
    // Register user
    const userData = {
      username,
      email,
      password,
      first_name: first_name || '',
      last_name: last_name || '',
      role: role || 'user' // Default role is 'user'
    };
    
    const result = await authService.register(userData);
    
    // Return tokens and user data (without password)
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: result.user,
        tokens: {
          access: result.accessToken,
          refresh: result.refreshToken
        }
      }
    });
  } catch (error) {
    logger.error(`Registration error: ${error.message}`, {
      error,
      component: 'AuthController.register'
    });
    
    // Handle specific errors
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        error: 'Registration failed',
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Registration failed',
      message: error.message
    });
  }
};

/**
 * Login user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Missing credentials',
        message: 'Username and password are required'
      });
    }
    
    const result = await authService.login(username, password);
    
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: result.user,
        tokens: {
          access: result.accessToken,
          refresh: result.refreshToken
        }
      }
    });
  } catch (error) {
    logger.error(`Login error: ${error.message}`, {
      error,
      component: 'AuthController.login'
    });
    
    // Login errors are always 401 for security (avoid user enumeration)
    res.status(401).json({
      success: false,
      error: 'Login failed',
      message: 'Invalid credentials'
    });
  }
};

/**
 * Refresh access token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Missing token',
        message: 'Refresh token is required'
      });
    }
    
    const result = await authService.refreshToken(refreshToken);
    
    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        tokens: {
          access: result.accessToken,
          refresh: result.refreshToken
        }
      }
    });
  } catch (error) {
    logger.error(`Token refresh error: ${error.message}`, {
      error,
      component: 'AuthController.refreshToken'
    });
    
    res.status(401).json({
      success: false,
      error: 'Token refresh failed',
      message: error.message
    });
  }
};

/**
 * Logout user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    await authService.logout(refreshToken);
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error(`Logout error: ${error.message}`, {
      error,
      component: 'AuthController.logout'
    });
    
    res.status(500).json({
      success: false,
      error: 'Logout failed',
      message: error.message
    });
  }
};

/**
 * Get current user profile
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getProfile = async (req, res) => {
  try {
    // The user object is set by the authenticate middleware
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role
        }
      }
    });
  } catch (error) {
    logger.error(`Get profile error: ${error.message}`, {
      error,
      component: 'AuthController.getProfile'
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to get profile',
      message: error.message
    });
  }
};

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  getProfile
}; 