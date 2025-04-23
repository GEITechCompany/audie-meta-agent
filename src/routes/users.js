/**
 * User Routes
 * Handles user management operations (admin only)
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const logger = require('../utils/logger');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { apiLimiter } = require('../middleware/rateLimitMiddleware');

/**
 * @route GET /api/users
 * @desc Get all users
 * @access Private/Admin
 */
router.get('/', authenticate, authorize(['admin']), apiLimiter, async (req, res) => {
  try {
    const filters = {
      role: req.query.role
    };
    
    // Remove undefined filters
    Object.keys(filters).forEach(key => 
      filters[key] === undefined && delete filters[key]
    );
    
    const users = await User.findAll(filters);
    res.json({ success: true, data: users });
  } catch (error) {
    logger.error(`Error fetching users: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch users',
      message: error.message
    });
  }
});

/**
 * @route GET /api/users/:id
 * @desc Get user by ID
 * @access Private/Admin
 */
router.get('/:id', authenticate, authorize(['admin']), apiLimiter, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    // Remove sensitive fields
    const userData = user.getPublicProfile();
    
    res.json({ success: true, data: userData });
  } catch (error) {
    logger.error(`Error fetching user: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch user',
      message: error.message
    });
  }
});

/**
 * @route PUT /api/users/:id
 * @desc Update user
 * @access Private/Admin
 */
router.put('/:id', authenticate, authorize(['admin']), apiLimiter, async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    // Update allowed fields
    if (req.body.first_name) user.first_name = req.body.first_name;
    if (req.body.last_name) user.last_name = req.body.last_name;
    if (req.body.role) user.role = req.body.role;
    
    // Update password if provided
    if (req.body.password) {
      user.password = req.body.password;
    }
    
    const updatedUser = await user.save();
    
    // Return updated user without sensitive data
    const userData = updatedUser.getPublicProfile();
    
    res.json({ 
      success: true, 
      message: 'User updated successfully',
      data: userData
    });
  } catch (error) {
    logger.error(`Error updating user: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update user',
      message: error.message
    });
  }
});

/**
 * @route DELETE /api/users/:id
 * @desc Delete user
 * @access Private/Admin
 */
router.delete('/:id', authenticate, authorize(['admin']), apiLimiter, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Prevent deleting self
    if (req.user.id === parseInt(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete your own account'
      });
    }
    
    const result = await User.delete(userId);
    
    if (!result.deleted) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found or already deleted' 
      });
    }
    
    res.json({ 
      success: true, 
      message: 'User deleted successfully' 
    });
  } catch (error) {
    logger.error(`Error deleting user: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete user',
      message: error.message
    });
  }
});

module.exports = router; 