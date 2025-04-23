/**
 * Estimate routes
 * Handles all API endpoints for estimate management
 */

const express = require('express');
const router = express.Router();
const { authorize } = require('../middleware/auth');
const EstimateController = require('../controllers/EstimateController');

/**
 * @route GET /api/estimates
 * @desc Get all estimates with pagination and filters
 * @access Private
 */
router.get('/', authorize(), async (req, res) => {
  await EstimateController.getAll(req, res);
});

/**
 * @route GET /api/estimates/:id
 * @desc Get a single estimate by ID with items
 * @access Private
 */
router.get('/:id', authorize(), async (req, res) => {
  await EstimateController.getById(req, res);
});

/**
 * @route POST /api/estimates
 * @desc Create a new estimate
 * @access Private
 */
router.post('/', authorize(), async (req, res) => {
  await EstimateController.create(req, res);
});

/**
 * @route PUT /api/estimates/:id
 * @desc Update an existing estimate
 * @access Private
 */
router.put('/:id', authorize(), async (req, res) => {
  await EstimateController.update(req, res);
});

/**
 * @route DELETE /api/estimates/:id
 * @desc Delete an estimate
 * @access Private
 */
router.delete('/:id', authorize(), async (req, res) => {
  await EstimateController.delete(req, res);
});

/**
 * @route PATCH /api/estimates/:id/status
 * @desc Update estimate status (draft, sent, approved, declined)
 * @access Private
 */
router.patch('/:id/status', authorize(), async (req, res) => {
  await EstimateController.updateStatus(req, res);
});

/**
 * @route POST /api/estimates/:id/convert
 * @desc Convert an estimate to an invoice
 * @access Private
 */
router.post('/:id/convert', authorize(), async (req, res) => {
  await EstimateController.convertToInvoice(req, res);
});

/**
 * @route GET /api/estimates/templates
 * @desc Get all available estimate templates
 * @access Private
 */
router.get('/templates', authorize(), async (req, res) => {
  await EstimateController.getTemplates(req, res);
});

/**
 * @route POST /api/estimates/from-template
 * @desc Generate a new estimate from a template
 * @access Private
 */
router.post('/from-template', authorize(), async (req, res) => {
  await EstimateController.generateFromTemplate(req, res);
});

/**
 * @route POST /api/estimates/from-tasks
 * @desc Generate a new estimate from tasks
 * @access Private
 */
router.post('/from-tasks', authorize(), async (req, res) => {
  await EstimateController.generateFromTasks(req, res);
});

module.exports = router; 