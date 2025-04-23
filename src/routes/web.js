const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/authMiddleware');

// Public Auth Routes
router.get('/login', (req, res) => {
  res.render('login', {
    title: 'Audie - Login',
    page: 'login'
  });
});

router.get('/register', (req, res) => {
  res.render('register', {
    title: 'Audie - Register',
    page: 'register'
  });
});

// Protected Routes (Authentication Required)
router.use('/', authenticate);

// Dashboard - Main interface
router.get('/', async (req, res) => {
  try {
    // Fetch tasks for the dashboard with user ID filter
    const pendingTasks = await Task.findAllForUser(req.user.id, { status: 'pending' });
    const inProgressTasks = await Task.findAllForUser(req.user.id, { status: 'in_progress' });
    
    res.render('dashboard', {
      title: 'Audie - Meta-Agent Dashboard',
      pendingTasks,
      inProgressTasks,
      page: 'dashboard',
      user: req.user
    });
  } catch (error) {
    logger.error(`Error loading dashboard: ${error.message}`);
    res.status(500).render('error', {
      message: 'Failed to load dashboard',
      error
    });
  }
});

// Tasks page
router.get('/tasks', async (req, res) => {
  try {
    // Fetch user's tasks
    const tasks = await Task.findAllForUser(req.user.id);
    
    res.render('tasks', {
      title: 'Audie - Tasks',
      tasks,
      page: 'tasks',
      user: req.user
    });
  } catch (error) {
    logger.error(`Error loading tasks page: ${error.message}`);
    res.status(500).render('error', {
      message: 'Failed to load tasks',
      error
    });
  }
});

// Create task form
router.get('/tasks/new', (req, res) => {
  res.render('task-form', {
    title: 'Audie - New Task',
    task: {},
    isNew: true,
    page: 'tasks',
    user: req.user
  });
});

// Edit task form
router.get('/tasks/edit/:id', async (req, res) => {
  try {
    const task = await Task.findByIdAndUserId(req.params.id, req.user.id);
    
    if (!task) {
      return res.status(404).render('error', {
        message: 'Task not found or access denied',
        error: { status: 404 }
      });
    }
    
    res.render('task-form', {
      title: 'Audie - Edit Task',
      task,
      isNew: false,
      page: 'tasks',
      user: req.user
    });
  } catch (error) {
    logger.error(`Error loading task edit form: ${error.message}`);
    res.status(500).render('error', {
      message: 'Failed to load task edit form',
      error
    });
  }
});

// Estimates/Invoices page (placeholder)
router.get('/estimates', (req, res) => {
  res.render('estimates', {
    title: 'Audie - Estimates & Invoices',
    page: 'estimates',
    user: req.user
  });
});

// Clients page (placeholder)
router.get('/clients', (req, res) => {
  res.render('clients', {
    title: 'Audie - Clients',
    page: 'clients',
    user: req.user
  });
});

// Settings page (placeholder)
router.get('/settings', (req, res) => {
  res.render('settings', {
    title: 'Audie - Settings',
    page: 'settings',
    user: req.user
  });
});

// Chat interface for communicating with Audie
router.get('/chat', (req, res) => {
  res.render('chat', {
    title: 'Audie - Chat',
    page: 'chat',
    user: req.user
  });
});

module.exports = router; 