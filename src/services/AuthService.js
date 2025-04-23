/**
 * Authentication Service
 * Handles JWT token generation, verification, and user authentication
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const logger = require('../utils/logger');
const ApiMetricsService = require('./ApiMetricsService');

// Default values
const DEFAULT_ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
const DEFAULT_REFRESH_TOKEN_EXPIRY = '7d'; // 7 days

class AuthService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'audie-meta-agent-secret-key';
    this.accessTokenExpiry = process.env.ACCESS_TOKEN_EXPIRY || DEFAULT_ACCESS_TOKEN_EXPIRY;
    this.refreshTokenExpiry = process.env.REFRESH_TOKEN_EXPIRY || DEFAULT_REFRESH_TOKEN_EXPIRY;
    
    if (!process.env.JWT_SECRET) {
      logger.warn('JWT_SECRET environment variable not set - using default secret (INSECURE)',
        { component: 'AuthService' });
    }
  }

  /**
   * Register a new user
   * @param {Object} userData - User registration data
   * @returns {Promise<Object>} The registered user and tokens
   */
  async register(userData) {
    try {
      // Check if username already exists
      const existingUsername = await User.findByUsername(userData.username);
      if (existingUsername) {
        throw new Error('Username already exists');
      }

      // Check if email already exists
      const existingEmail = await User.findByEmail(userData.email);
      if (existingEmail) {
        throw new Error('Email already exists');
      }

      // Create new user
      const user = new User(userData);
      const savedUser = await user.save();

      // Generate tokens
      const { accessToken, refreshToken } = await this.generateTokens(savedUser);

      // Record API metric
      await ApiMetricsService.recordApiCall({
        endpoint: 'auth/register',
        method: 'POST',
        status: 201,
        source: 'AuthService',
        is_mock: false,
        duration: null,
        response_data: { 
          userId: savedUser.id, 
          username: savedUser.username 
        }
      });

      // Return user data and tokens
      return {
        user: savedUser.getPublicProfile(),
        accessToken,
        refreshToken
      };
    } catch (error) {
      logger.error(`Registration error: ${error.message}`, {
        stack: error.stack,
        component: 'AuthService'
      });

      // Record API error
      await ApiMetricsService.recordApiCall({
        endpoint: 'auth/register',
        method: 'POST',
        status: 400,
        source: 'AuthService',
        is_mock: false,
        duration: null,
        error_type: error.name,
        error_message: error.message
      });

      throw error;
    }
  }

  /**
   * Login a user
   * @param {string} username - Username or email
   * @param {string} password - User password
   * @returns {Promise<Object>} User data and tokens
   */
  async login(username, password) {
    try {
      // Find user by username or email
      let user = await User.findByUsername(username);
      if (!user) {
        user = await User.findByEmail(username);
      }

      // Check if user exists
      if (!user) {
        throw new Error('Invalid credentials');
      }

      // Check if account is locked
      if (user.isLocked()) {
        const lockUntil = new Date(user.locked_until);
        throw new Error(`Account is locked. Try again after ${lockUntil.toLocaleString()}`);
      }

      // Verify password
      const isPasswordValid = await user.verifyPassword(password);
      if (!isPasswordValid) {
        // Record failed login attempt
        await user.recordLoginAttempt(false);
        throw new Error('Invalid credentials');
      }

      // Record successful login
      await user.recordLoginAttempt(true);

      // Generate tokens
      const { accessToken, refreshToken } = await this.generateTokens(user);

      // Record API metric
      await ApiMetricsService.recordApiCall({
        endpoint: 'auth/login',
        method: 'POST',
        status: 200,
        source: 'AuthService',
        is_mock: false,
        duration: null,
        response_data: { 
          userId: user.id, 
          username: user.username 
        }
      });

      // Return user data and tokens
      return {
        user: user.getPublicProfile(),
        accessToken,
        refreshToken
      };
    } catch (error) {
      logger.error(`Login error: ${error.message}`, {
        stack: error.stack,
        component: 'AuthService'
      });

      // Record API error
      await ApiMetricsService.recordApiCall({
        endpoint: 'auth/login',
        method: 'POST',
        status: 401,
        source: 'AuthService',
        is_mock: false,
        duration: null,
        error_type: error.name,
        error_message: error.message
      });

      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   * @param {string} token - Refresh token
   * @returns {Promise<Object>} New tokens
   */
  async refreshToken(token) {
    try {
      // Find token in database
      const refreshTokenDoc = await RefreshToken.findByToken(token);
      if (!refreshTokenDoc) {
        throw new Error('Invalid refresh token');
      }

      // Check if token is valid
      if (!refreshTokenDoc.isValid()) {
        throw new Error('Refresh token expired or revoked');
      }

      // Find user
      const user = await User.findById(refreshTokenDoc.user_id);
      if (!user) {
        throw new Error('User not found');
      }

      // Revoke the old token and generate new ones
      await refreshTokenDoc.revoke();
      const { accessToken, refreshToken } = await this.generateTokens(user);

      // Record API metric
      await ApiMetricsService.recordApiCall({
        endpoint: 'auth/refresh',
        method: 'POST',
        status: 200,
        source: 'AuthService',
        is_mock: false,
        duration: null,
        response_data: { userId: user.id }
      });

      return { accessToken, refreshToken };
    } catch (error) {
      logger.error(`Token refresh error: ${error.message}`, {
        stack: error.stack,
        component: 'AuthService'
      });

      // Record API error
      await ApiMetricsService.recordApiCall({
        endpoint: 'auth/refresh',
        method: 'POST',
        status: 401,
        source: 'AuthService',
        is_mock: false,
        duration: null,
        error_type: error.name,
        error_message: error.message
      });

      throw error;
    }
  }

  /**
   * Logout user
   * @param {string} refreshToken - Refresh token to revoke
   * @returns {Promise<Object>} Logout result
   */
  async logout(refreshToken) {
    try {
      if (!refreshToken) {
        return { success: true, message: 'Logged out' };
      }

      // Find and revoke the refresh token
      const token = await RefreshToken.findByToken(refreshToken);
      if (token) {
        await token.revoke();
      }

      // Record API metric
      await ApiMetricsService.recordApiCall({
        endpoint: 'auth/logout',
        method: 'POST',
        status: 200,
        source: 'AuthService',
        is_mock: false,
        duration: null
      });

      return { success: true, message: 'Logged out' };
    } catch (error) {
      logger.error(`Logout error: ${error.message}`, {
        stack: error.stack,
        component: 'AuthService'
      });

      // Record API error
      await ApiMetricsService.recordApiCall({
        endpoint: 'auth/logout',
        method: 'POST',
        status: 500,
        source: 'AuthService',
        is_mock: false,
        duration: null,
        error_type: error.name,
        error_message: error.message
      });

      throw error;
    }
  }

  /**
   * Generate JWT access and refresh tokens
   * @param {User} user - User object
   * @returns {Promise<Object>} Access and refresh tokens
   */
  async generateTokens(user) {
    // Generate access token
    const accessToken = jwt.sign(
      { sub: user.id, ...user.getPublicProfile() },
      this.jwtSecret,
      { expiresIn: this.accessTokenExpiry }
    );

    // Calculate refresh token expiry
    const refreshExpiry = new Date();
    if (this.refreshTokenExpiry.endsWith('d')) {
      refreshExpiry.setDate(refreshExpiry.getDate() + parseInt(this.refreshTokenExpiry));
    } else if (this.refreshTokenExpiry.endsWith('h')) {
      refreshExpiry.setHours(refreshExpiry.getHours() + parseInt(this.refreshTokenExpiry));
    } else if (this.refreshTokenExpiry.endsWith('m')) {
      refreshExpiry.setMinutes(refreshExpiry.getMinutes() + parseInt(this.refreshTokenExpiry));
    } else {
      // Default to 7 days if format is unrecognized
      refreshExpiry.setDate(refreshExpiry.getDate() + 7);
    }

    // Create refresh token
    const refreshTokenDoc = new RefreshToken({
      user_id: user.id,
      expires_at: refreshExpiry.toISOString()
    });

    // Save refresh token to database
    await refreshTokenDoc.save();

    return {
      accessToken,
      refreshToken: refreshTokenDoc.token
    };
  }

  /**
   * Verify JWT token
   * @param {string} token - JWT token to verify
   * @returns {Object} Decoded token payload
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      logger.error(`Token verification error: ${error.message}`, {
        component: 'AuthService'
      });
      throw error;
    }
  }

  /**
   * Verify JWT access token (alias for verifyToken)
   * @param {string} token - JWT token to verify
   * @returns {Object} Decoded token payload
   */
  verifyAccessToken(token) {
    return this.verifyToken(token);
  }

  /**
   * Clean up expired refresh tokens
   * @returns {Promise<Object>} Cleanup result
   */
  async cleanupExpiredTokens() {
    try {
      return await RefreshToken.cleanExpiredTokens();
    } catch (error) {
      logger.error(`Token cleanup error: ${error.message}`, {
        stack: error.stack,
        component: 'AuthService'
      });
      throw error;
    }
  }
}

module.exports = new AuthService(); 