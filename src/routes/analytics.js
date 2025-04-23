/**
 * Analytics Routes
 * Endpoints for retrieving invoice and client analytics data
 */

const express = require('express');
const router = express.Router();
const AnalyticsController = require('../controllers/AnalyticsController');
const { authenticateToken } = require('../middleware/auth');

// Apply authentication middleware to all analytics routes
router.use(authenticateToken);

// Invoice summary statistics
router.get('/invoice-summary', AnalyticsController.getInvoiceSummary);

// Invoice trends over time (monthly/quarterly)
router.get('/invoice-trends', AnalyticsController.getInvoiceTrends);

// Client payment analytics
router.get('/client-payments', AnalyticsController.getClientPaymentAnalytics);

// Revenue forecast
router.get('/revenue-forecast', AnalyticsController.getRevenueForecast);

// Overdue invoice analytics
router.get('/overdue', AnalyticsController.getOverdueAnalytics);

// Clear analytics cache (admin only)
router.post('/clear-cache', AnalyticsController.clearAnalyticsCache);

module.exports = router; 