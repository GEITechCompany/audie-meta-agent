const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const logger = require('../utils/logger');
const chatController = require('../controllers/ChatController');

// API health check
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Audie Meta-Agent API is running',
    timestamp: new Date().toISOString()
  });
});

// ==================== Chat Routes ====================

// Process chat message
router.post('/chat', chatController.processMessage.bind(chatController));

// Get morning brief
router.get('/morning-brief', chatController.getMorningBrief.bind(chatController));

// Check emails
router.get('/check-emails', chatController.checkEmails.bind(chatController));

// Get schedule
router.get('/schedule', chatController.getSchedule.bind(chatController));

// ==================== Task Routes ====================

// Get all tasks
router.get('/tasks', async (req, res) => {
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
    
    const tasks = await Task.findAll(filters);
    res.json({ success: true, data: tasks });
  } catch (error) {
    logger.error(`Error fetching tasks: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch tasks',
      message: error.message
    });
  }
});

// Get task by ID
router.get('/tasks/:id', async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      return res.status(404).json({ 
        success: false, 
        error: 'Task not found' 
      });
    }
    
    res.json({ success: true, data: task });
  } catch (error) {
    logger.error(`Error fetching task: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch task',
      message: error.message
    });
  }
});

// Create new task
router.post('/tasks', async (req, res) => {
  try {
    const taskData = {
      title: req.body.title,
      description: req.body.description,
      status: req.body.status,
      priority: req.body.priority,
      due_date: req.body.due_date,
      assigned_to: req.body.assigned_to,
      client_id: req.body.client_id,
      source: req.body.source || 'api'
    };
    
    // Validate required fields
    if (!taskData.title) {
      return res.status(400).json({
        success: false,
        error: 'Task title is required'
      });
    }
    
    const task = new Task(taskData);
    const savedTask = await task.save();
    
    res.status(201).json({ 
      success: true, 
      message: 'Task created successfully',
      data: savedTask 
    });
  } catch (error) {
    logger.error(`Error creating task: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create task',
      message: error.message
    });
  }
});

// Update task
router.put('/tasks/:id', async (req, res) => {
  try {
    const taskId = req.params.id;
    const task = await Task.findById(taskId);
    
    if (!task) {
      return res.status(404).json({ 
        success: false, 
        error: 'Task not found' 
      });
    }
    
    // Update task fields
    task.title = req.body.title || task.title;
    task.description = req.body.description || task.description;
    task.status = req.body.status || task.status;
    task.priority = req.body.priority || task.priority;
    task.due_date = req.body.due_date || task.due_date;
    task.assigned_to = req.body.assigned_to || task.assigned_to;
    task.client_id = req.body.client_id || task.client_id;
    
    const updatedTask = await task.save();
    
    res.json({ 
      success: true, 
      message: 'Task updated successfully',
      data: updatedTask 
    });
  } catch (error) {
    logger.error(`Error updating task: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update task',
      message: error.message
    });
  }
});

// Delete task
router.delete('/tasks/:id', async (req, res) => {
  try {
    const taskId = req.params.id;
    const result = await Task.delete(taskId);
    
    if (!result.deleted) {
      return res.status(404).json({ 
        success: false, 
        error: 'Task not found or already deleted' 
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Task deleted successfully' 
    });
  } catch (error) {
    logger.error(`Error deleting task: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete task',
      message: error.message
    });
  }
});

// ==================== Client Routes ====================

// Client routes will be added here

// ==================== Estimate/Invoice Routes ====================

// Estimate/Invoice routes will be added here

module.exports = router; 