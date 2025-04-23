const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const logger = require('../utils/logger');
const chatController = require('../controllers/ChatController');
const { authenticate, hasRole } = require('../middleware/authMiddleware');
const { apiLimiter } = require('../middleware/rateLimitMiddleware');
const { validateCreateTask } = require('../middleware/validationMiddleware');
const { errorResponse, forbiddenResponse, notFoundResponse } = require('../utils/responseUtil');

// Import auth and user routes
const authRoutes = require('./auth');
const userRoutes = require('./users');

// Use auth and user routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);

// API health check (public)
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Audie Meta-Agent API is running',
    timestamp: new Date().toISOString()
  });
});

// ==================== Protected Routes (Authentication Required) ====================

// Protect all routes below this middleware
router.use(authenticate);

// ==================== Chat Routes ====================

// Process chat message
router.post('/chat', apiLimiter, chatController.processMessage.bind(chatController));

// Get morning brief
router.get('/morning-brief', apiLimiter, chatController.getMorningBrief.bind(chatController));

// Check emails
router.get('/check-emails', apiLimiter, chatController.checkEmails.bind(chatController));

// Get schedule
router.get('/schedule', apiLimiter, chatController.getSchedule.bind(chatController));

// ==================== Task Routes ====================

// Get all tasks (filtered by user)
router.get('/tasks', apiLimiter, async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      priority: req.query.priority,
      client_id: req.query.client_id,
      assigned_to: req.query.assigned_to
    };
    
    // Remove undefined filters
    Object.keys(filters).forEach(key => 
      filters[key] === undefined && delete filters[key]
    );
    
    // Get tasks for the current user
    const tasks = await Task.findAllForUser(req.user.id, filters);
    
    res.json({ success: true, data: tasks });
  } catch (error) {
    logger.error(`Error fetching tasks: ${error.message}`, {
      userId: req.user.id,
      error
    });
    
    errorResponse(res, 'Failed to fetch tasks', 500, 'tasks_fetch_error');
  }
});

// Get task by ID (with ownership check)
router.get('/tasks/:id', apiLimiter, async (req, res) => {
  try {
    const taskId = req.params.id;
    const userId = req.user.id;
    
    // Find task with ownership check
    const task = await Task.findByIdAndUserId(taskId, userId);
    
    if (!task) {
      return notFoundResponse(res, 'Task not found');
    }
    
    res.json({ success: true, data: task });
  } catch (error) {
    logger.error(`Error fetching task: ${error.message}`, {
      userId: req.user.id,
      taskId: req.params.id,
      error
    });
    
    errorResponse(res, 'Failed to fetch task', 500, 'task_fetch_error');
  }
});

// Create new task
router.post('/tasks', apiLimiter, validateCreateTask, async (req, res) => {
  try {
    const taskData = {
      title: req.body.title,
      description: req.body.description,
      status: req.body.status || 'pending',
      priority: req.body.priority || 'medium',
      due_date: req.body.due_date,
      assigned_to: req.body.assigned_to,
      client_id: req.body.client_id,
      source: req.body.source || 'api',
      user_id: req.user.id // Set the owner to the current user
    };
    
    const task = new Task(taskData);
    const savedTask = await task.save();
    
    res.status(201).json({ 
      success: true, 
      message: 'Task created successfully',
      data: savedTask 
    });
  } catch (error) {
    logger.error(`Error creating task: ${error.message}`, {
      userId: req.user.id,
      taskData: req.body,
      error
    });
    
    errorResponse(res, 'Failed to create task', 500, 'task_create_error');
  }
});

// Update task (with ownership check)
router.put('/tasks/:id', apiLimiter, async (req, res) => {
  try {
    const taskId = req.params.id;
    const userId = req.user.id;
    
    // Find task with ownership check
    const task = await Task.findByIdAndUserId(taskId, userId);
    
    if (!task) {
      return notFoundResponse(res, 'Task not found or access denied');
    }
    
    // Update task fields
    task.title = req.body.title || task.title;
    task.description = req.body.description || task.description;
    task.status = req.body.status || task.status;
    task.priority = req.body.priority || task.priority;
    task.due_date = req.body.due_date || task.due_date;
    task.assigned_to = req.body.assigned_to || task.assigned_to;
    task.client_id = req.body.client_id || task.client_id;
    // Don't allow changing ownership
    
    const updatedTask = await task.save();
    
    res.json({ 
      success: true, 
      message: 'Task updated successfully',
      data: updatedTask 
    });
  } catch (error) {
    logger.error(`Error updating task: ${error.message}`, {
      userId: req.user.id,
      taskId: req.params.id,
      taskData: req.body,
      error
    });
    
    errorResponse(res, 'Failed to update task', 500, 'task_update_error');
  }
});

// Delete task (with ownership check)
router.delete('/tasks/:id', apiLimiter, async (req, res) => {
  try {
    const taskId = req.params.id;
    const userId = req.user.id;
    
    // Delete with ownership check
    const result = await Task.deleteWithOwnershipCheck(taskId, userId);
    
    if (!result.deleted) {
      if (result.error === 'unauthorized') {
        return forbiddenResponse(res, 'You do not have permission to delete this task');
      }
      return notFoundResponse(res, 'Task not found or already deleted');
    }
    
    res.json({ 
      success: true, 
      message: 'Task deleted successfully' 
    });
  } catch (error) {
    logger.error(`Error deleting task: ${error.message}`, {
      userId: req.user.id,
      taskId: req.params.id,
      error
    });
    
    errorResponse(res, 'Failed to delete task', 500, 'task_delete_error');
  }
});

// ==================== Client Routes (Admin Only) ====================

// Protect all admin routes with admin role authorization
router.use('/clients', hasRole(['admin']));

// Client routes will be added here

// ==================== Estimate/Invoice Routes (Admin Only) ====================

// Protect all admin routes with admin role authorization
router.use('/estimates', hasRole(['admin']));
router.use('/invoices', hasRole(['admin']));

// Estimate/Invoice routes will be added here

module.exports = router; 