/**
 * Authentication Routes
 * Handles user registration, login, refresh token, and logout
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/AuthController');
const { authenticate, hasRole } = require('../middleware/authMiddleware');
const { authLimiter, criticalLimiter } = require('../middleware/rateLimitMiddleware');
const { validateRegistration, validateLogin, validateRefreshToken } = require('../middleware/validationMiddleware');

/**
 * @route POST /api/auth/register
 * @desc Register a new user
 * @access Public
 */
router.post('/register', authLimiter, validateRegistration, authController.register);

/**
 * @route POST /api/auth/login
 * @desc Login user and get tokens
 * @access Public
 */
router.post('/login', authLimiter, validateLogin, authController.login);

/**
 * @route POST /api/auth/refresh
 * @desc Refresh access token
 * @access Public
 */
router.post('/refresh', authLimiter, validateRefreshToken, authController.refreshToken);

/**
 * @route POST /api/auth/logout
 * @desc Logout user
 * @access Public
 */
router.post('/logout', authController.logout);

/**
 * @route GET /api/auth/me
 * @desc Get current user profile
 * @access Private
 */
router.get('/me', authenticate, authController.getProfile);

/**
 * @route POST /api/auth/admin/register
 * @desc Register a new admin user (admin only)
 * @access Private/Admin
 */
router.post(
  '/admin/register', 
  criticalLimiter,
  authenticate, 
  hasRole(['admin']), 
  validateRegistration,
  authController.register
);

module.exports = router; 