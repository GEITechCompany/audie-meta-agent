/**
 * Financial Reporting Routes
 * Handles all API endpoints for financial reports and analytics
 */

const express = require('express');
const router = express.Router();
const { authorize } = require('../middleware/auth');
const ReportingController = require('../controllers/ReportingController');

/**
 * @route GET /api/reports/revenue
 * @desc Get revenue summary report
 * @access Private
 */
router.get('/revenue', authorize(), async (req, res) => {
  await ReportingController.getRevenueSummary(req, res);
});

/**
 * @route GET /api/reports/accounts-receivable
 * @desc Get accounts receivable aging report
 * @access Private
 */
router.get('/accounts-receivable', authorize(), async (req, res) => {
  await ReportingController.getAccountsReceivableAging(req, res);
});

/**
 * @route GET /api/reports/clients
 * @desc Get clients summary report
 * @access Private
 */
router.get('/clients', authorize(), async (req, res) => {
  await ReportingController.getClientsSummary(req, res);
});

/**
 * @route GET /api/reports/estimate-conversion
 * @desc Get estimate to invoice conversion report
 * @access Private
 */
router.get('/estimate-conversion', authorize(), async (req, res) => {
  await ReportingController.getEstimateConversion(req, res);
});

/**
 * @route GET /api/reports/dashboard
 * @desc Get dashboard summary statistics
 * @access Private
 */
router.get('/dashboard', authorize(), async (req, res) => {
  await ReportingController.getDashboardStats(req, res);
});

module.exports = router; 