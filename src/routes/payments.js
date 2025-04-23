/**
 * Payment Routes
 * Handles all API endpoints for payment management
 */

const express = require('express');
const router = express.Router();
const { authorize } = require('../middleware/auth');
const PaymentController = require('../controllers/PaymentController');

/**
 * @route GET /api/payments
 * @desc Get all payments with filters
 * @access Private
 */
router.get('/', authorize(), async (req, res) => {
  try {
    const payments = await PaymentController.getAllPayments(req.query);
    res.json({
      success: true,
      count: payments.length,
      data: payments
    });
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payments',
      error: error.message
    });
  }
});

/**
 * @route GET /api/payments/:id
 * @desc Get payment details by ID
 * @access Private
 */
router.get('/:id', authorize(), async (req, res) => {
  try {
    const payment = await PaymentController.getPaymentById(req.params.id);
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }
    res.json({
      success: true,
      data: payment
    });
  } catch (error) {
    console.error('Error fetching payment:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payment',
      error: error.message
    });
  }
});

/**
 * @route POST /api/payments/record
 * @desc Record a new payment
 * @access Private
 */
router.post('/record', authorize(), async (req, res) => {
  try {
    const payment = await PaymentController.recordPayment(req.body);
    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      data: payment
    });
  } catch (error) {
    console.error('Error recording payment:', error);
    res.status(400).json({
      success: false,
      message: 'Error recording payment',
      error: error.message
    });
  }
});

/**
 * @route DELETE /api/payments/:id
 * @desc Void/delete a payment
 * @access Private
 */
router.delete('/:id', authorize(), async (req, res) => {
  try {
    const result = await PaymentController.voidPayment(req.params.id);
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found or already voided'
      });
    }
    res.json({
      success: true,
      message: 'Payment voided successfully'
    });
  } catch (error) {
    console.error('Error voiding payment:', error);
    res.status(500).json({
      success: false,
      message: 'Error voiding payment',
      error: error.message
    });
  }
});

/**
 * @route GET /api/payments/statistics
 * @desc Get payment statistics
 * @access Private
 */
router.get('/statistics', authorize(), async (req, res) => {
  try {
    const stats = await PaymentController.getPaymentStatistics(req.query);
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching payment statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payment statistics',
      error: error.message
    });
  }
});

module.exports = router; 