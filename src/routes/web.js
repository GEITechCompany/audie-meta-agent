const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const logger = require('../utils/logger');

// Dashboard - Main interface
router.get('/', async (req, res) => {
  try {
    // Fetch tasks for the dashboard
    const pendingTasks = await Task.findAll({ status: 'pending' });
    const inProgressTasks = await Task.findAll({ status: 'in_progress' });
    
    res.render('dashboard', {
      title: 'Audie - Meta-Agent Dashboard',
      pendingTasks,
      inProgressTasks,
      page: 'dashboard'
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
    // Fetch all tasks
    const tasks = await Task.findAll();
    
    res.render('tasks', {
      title: 'Audie - Tasks',
      tasks,
      page: 'tasks'
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
    page: 'tasks'
  });
});

// Edit task form
router.get('/tasks/edit/:id', async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      return res.status(404).render('error', {
        message: 'Task not found',
        error: { status: 404 }
      });
    }
    
    res.render('task-form', {
      title: 'Audie - Edit Task',
      task,
      isNew: false,
      page: 'tasks'
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
    page: 'estimates'
  });
});

// Clients page (placeholder)
router.get('/clients', (req, res) => {
  res.render('clients', {
    title: 'Audie - Clients',
    page: 'clients'
  });
});

// Settings page (placeholder)
router.get('/settings', (req, res) => {
  res.render('settings', {
    title: 'Audie - Settings',
    page: 'settings'
  });
});

// Chat interface for communicating with Audie
router.get('/chat', (req, res) => {
  res.render('chat', {
    title: 'Audie - Chat',
    page: 'chat'
  });
});

module.exports = router; 