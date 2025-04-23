/**
 * Invoice routes
 * Handles all API endpoints for invoice management
 */

const express = require('express');
const router = express.Router();
const { authorize } = require('../middleware/auth');
const InvoiceController = require('../controllers/InvoiceController');
const { authenticateJWT } = require('../middleware/auth');
const { validateInvoice } = require('../middleware/validators');
const InvoiceNumberingService = require('../services/InvoiceNumberingService');
const RecurringInvoiceService = require('../services/RecurringInvoiceService');
const PaymentTrackerService = require('../services/PaymentTrackerService');
const OverdueInvoiceService = require('../services/OverdueInvoiceService');
const { body, param, query } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');

const invoiceController = new InvoiceController();

// Apply authentication middleware to all invoice routes
router.use(authenticateJWT);

/**
 * @route GET /api/invoices
 * @desc Get all invoices with pagination and filters
 * @access Private
 */
router.get('/', async (req, res) => {
  try {
    const filters = {
      client_id: req.query.client_id,
      status: req.query.status,
      start_date: req.query.start_date,
      end_date: req.query.end_date,
      search: req.query.search,
      limit: parseInt(req.query.limit) || 10,
      offset: parseInt(req.query.offset) || 0,
      sort_by: req.query.sort_by || 'created_at',
      sort_order: req.query.sort_order || 'desc'
    };
    
    const result = await invoiceController.getAll(filters);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/invoices/:id
 * @desc Get a single invoice by ID with items
 * @access Private
 */
router.get('/:id', [
  param('id').isInt().withMessage('Invoice ID must be an integer')
], validateRequest, async (req, res) => {
  try {
    const invoice = await invoiceController.getById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/invoices
 * @desc Create a new invoice
 * @access Private
 */
router.post('/', [
  body('client_id').isInt().withMessage('Client ID is required'),
  body('title').notEmpty().withMessage('Title is required'),
  body('due_date').isISO8601().toDate().withMessage('Valid due date is required'),
  body('items').isArray().withMessage('Items must be an array'),
  body('items.*.description').notEmpty().withMessage('Item description is required'),
  body('items.*.quantity').isFloat({ min: 0.01 }).withMessage('Item quantity must be greater than 0'),
  body('items.*.unit_price').isFloat({ min: 0 }).withMessage('Item unit price must be a non-negative number')
], validateRequest, async (req, res) => {
  try {
    const result = await invoiceController.create(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route PUT /api/invoices/:id
 * @desc Update an existing invoice
 * @access Private
 */
router.put('/:id', [
  param('id').isInt().withMessage('Invoice ID must be an integer'),
  body('title').optional().notEmpty().withMessage('Title cannot be empty'),
  body('items').optional().isArray().withMessage('Items must be an array'),
  body('status').optional().isIn(['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled']).withMessage('Invalid status')
], validateRequest, async (req, res) => {
  try {
    const result = await invoiceController.update(req.params.id, req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route DELETE /api/invoices/:id
 * @desc Delete an invoice
 * @access Private
 */
router.delete('/:id', [
  param('id').isInt().withMessage('Invoice ID must be an integer')
], validateRequest, async (req, res) => {
  try {
    const result = await invoiceController.delete(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/invoices/:id/send
 * @desc Send invoice to client via email
 * @access Private
 */
router.post('/:id/send', [
  param('id').isInt().withMessage('Invoice ID must be an integer')
], validateRequest, async (req, res) => {
  try {
    const result = await invoiceController.sendToClient(req.params.id, req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/invoices/summary
 * @desc Get invoice summary (count by status, totals)
 * @access Private
 */
router.get('/summary', InvoiceController.getSummary);

/**
 * @route POST /api/invoices/:id/mark-paid
 * @desc Mark invoice as paid
 * @access Private
 */
router.post('/:id/mark-paid', [
  param('id').isInt().withMessage('Invoice ID must be an integer'),
  body('payment_date').optional().isISO8601().toDate().withMessage('Valid payment date is required'),
  body('payment_method').optional().notEmpty().withMessage('Payment method cannot be empty')
], validateRequest, async (req, res) => {
  try {
    const result = await invoiceController.markAsPaid(req.params.id, req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/invoices/overdue
 * @desc Get all overdue invoices
 * @access Private
 */
router.get('/overdue', InvoiceController.getOverdue);

// === Payment Management Routes ===

/**
 * @route POST /api/invoices/:id/payments
 * @desc Record a payment for an invoice
 * @access Private
 */
router.post('/:id/payments', [
  param('id').isInt().withMessage('Invoice ID must be an integer'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Payment amount must be greater than 0'),
  body('payment_method_id').optional().isInt().withMessage('Payment method ID must be an integer'),
  body('payment_date').optional().isISO8601().toDate().withMessage('Valid payment date is required'),
  body('transaction_reference').optional().isString().withMessage('Transaction reference must be a string'),
  body('notes').optional().isString().withMessage('Notes must be a string'),
  body('status').optional().isIn(['pending', 'confirmed', 'failed', 'refunded']).withMessage('Invalid status')
], validateRequest, async (req, res) => {
  try {
    const result = await invoiceController.recordPayment({
      invoice_id: parseInt(req.params.id),
      ...req.body
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/invoices/:id/payments
 * @desc Get all payments for an invoice
 * @access Private
 */
router.get('/:id/payments', [
  param('id').isInt().withMessage('Invoice ID must be an integer')
], validateRequest, async (req, res) => {
  try {
    const payments = await invoiceController.getPaymentsByInvoiceId(req.params.id);
    res.json(payments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route DELETE /api/invoices/:id/payments/:paymentId
 * @desc Delete a payment for an invoice
 * @access Private
 */
router.delete('/:id/payments/:paymentId', [
  param('id').isInt().withMessage('Invoice ID must be an integer'),
  param('paymentId').isInt().withMessage('Payment ID must be an integer')
], validateRequest, async (req, res) => {
  try {
    const result = await invoiceController.deletePayment(req.params.paymentId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/invoices/payment-methods
 * @desc Get all available payment methods
 * @access Private
 */
router.get('/payment-methods', InvoiceController.getPaymentMethods);

/**
 * @route POST /api/invoices/payment-methods
 * @desc Create a new payment method
 * @access Private
 */
router.post('/payment-methods', InvoiceController.addPaymentMethod);

/**
 * @route PUT /api/invoices/payments/:paymentId
 * @desc Update a payment
 * @access Private
 */
router.put('/payments/:paymentId', [
  param('paymentId').isInt().withMessage('Payment ID must be an integer'),
  body('amount').optional().isFloat({ min: 0.01 }).withMessage('Payment amount must be greater than 0'),
  body('payment_method_id').optional().isInt().withMessage('Payment method ID must be an integer'),
  body('payment_date').optional().isISO8601().toDate().withMessage('Valid payment date is required'),
  body('status').optional().isIn(['pending', 'confirmed', 'failed', 'refunded']).withMessage('Invalid status')
], validateRequest, async (req, res) => {
  try {
    const result = await invoiceController.updatePayment(req.params.paymentId, req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route DELETE /api/invoices/payments/:paymentId
 * @desc Delete a payment
 * @access Private
 */
router.delete('/payments/:paymentId', [
  param('paymentId').isInt().withMessage('Payment ID must be an integer')
], validateRequest, async (req, res) => {
  try {
    const result = await invoiceController.deletePayment(req.params.paymentId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/invoices/payment-methods/all
 * @desc Get all payment methods
 * @access Private
 */
router.get('/payment-methods/all', async (req, res) => {
  try {
    const methods = await invoiceController.getPaymentMethods();
    res.json(methods);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/invoices/payment-methods
 * @desc Create a new payment method
 * @access Private
 */
router.post('/payment-methods', [
  body('name').notEmpty().withMessage('Name is required'),
  body('is_online').optional().isBoolean().withMessage('is_online must be a boolean'),
  body('is_default').optional().isBoolean().withMessage('is_default must be a boolean'),
  body('requires_confirmation').optional().isBoolean().withMessage('requires_confirmation must be a boolean'),
  body('processing_fee_type').optional().isIn(['none', 'percentage', 'fixed']).withMessage('Invalid processing fee type'),
  body('processing_fee_amount').optional().isFloat({ min: 0 }).withMessage('Processing fee amount must be a non-negative number')
], validateRequest, async (req, res) => {
  try {
    const result = await invoiceController.addPaymentMethod(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route PUT /api/invoices/payment-methods/:id
 * @desc Update a payment method
 * @access Private
 */
router.put('/payment-methods/:id', [
  param('id').isInt().withMessage('Payment method ID must be an integer'),
  body('name').optional().notEmpty().withMessage('Name cannot be empty'),
  body('is_online').optional().isBoolean().withMessage('is_online must be a boolean'),
  body('is_default').optional().isBoolean().withMessage('is_default must be a boolean'),
  body('status').optional().isIn(['active', 'inactive']).withMessage('Invalid status')
], validateRequest, async (req, res) => {
  try {
    const result = await invoiceController.updatePaymentMethod(req.params.id, req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route DELETE /api/invoices/payment-methods/:id
 * @desc Delete a payment method
 * @access Private
 */
router.delete('/payment-methods/:id', [
  param('id').isInt().withMessage('Payment method ID must be an integer')
], validateRequest, async (req, res) => {
  try {
    const result = await invoiceController.deletePaymentMethod(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/invoices/payment-statistics/report
 * @desc Get payment statistics
 * @access Private
 */
router.get('/payment-statistics/report', [
  query('start_date').optional().isISO8601().toDate().withMessage('Valid start date is required'),
  query('end_date').optional().isISO8601().toDate().withMessage('Valid end date is required'),
  query('client_id').optional().isInt().withMessage('Client ID must be an integer')
], validateRequest, async (req, res) => {
  try {
    const filters = {
      start_date: req.query.start_date,
      end_date: req.query.end_date,
      client_id: req.query.client_id
    };
    const statistics = await invoiceController.getPaymentStatistics(filters);
    res.json(statistics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// === Invoice Numbering Routes ===

/**
 * @route POST /api/invoices/numbering/configure
 * @desc Configure invoice numbering format
 * @access Private
 */
router.post('/numbering/configure', [
  body('format').notEmpty().withMessage('Format is required'),
  body('sequence_length').optional().isInt({ min: 1 }).withMessage('Sequence length must be a positive integer'),
  body('sequence_start').optional().isInt({ min: 1 }).withMessage('Sequence start must be a positive integer')
], validateRequest, async (req, res) => {
  try {
    const result = await invoiceController.configureInvoiceNumbering(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/invoices/numbering/reset
 * @desc Reset invoice numbering sequence
 * @access Private
 */
router.post('/numbering/reset', InvoiceController.resetNumberingSequence);

/**
 * @route GET /api/invoices/numbering/config
 * @desc Get invoice numbering configuration
 * @access Private
 */
router.get('/numbering/config', async (req, res) => {
  try {
    const config = await invoiceController.getInvoiceNumberingConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// === Recurring Invoice Routes ===

/**
 * @route POST /api/invoices/recurring
 * @desc Create a recurring invoice
 * @access Private
 */
router.post('/recurring', [
  body('client_id').isInt().withMessage('Client ID is required'),
  body('title').notEmpty().withMessage('Title is required'),
  body('frequency').isIn(['weekly', 'biweekly', 'monthly', 'quarterly', 'biannually', 'annually']).withMessage('Invalid frequency'),
  body('start_date').isISO8601().toDate().withMessage('Valid start date is required'),
  body('end_date').optional().isISO8601().toDate().withMessage('Valid end date is required'),
  body('items').isArray().withMessage('Items must be an array'),
  body('items.*.description').notEmpty().withMessage('Item description is required'),
  body('items.*.quantity').isFloat({ min: 0.01 }).withMessage('Item quantity must be greater than 0'),
  body('items.*.unit_price').isFloat({ min: 0 }).withMessage('Item unit price must be a non-negative number')
], validateRequest, async (req, res) => {
  try {
    const result = await invoiceController.createRecurringInvoice(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/invoices/recurring
 * @desc Get all recurring invoices
 * @access Private
 */
router.get('/recurring/all', async (req, res) => {
  try {
    const filters = {
      client_id: req.query.client_id,
      status: req.query.status,
      limit: parseInt(req.query.limit) || 10,
      offset: parseInt(req.query.offset) || 0
    };
    const result = await invoiceController.getRecurringInvoices(filters);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/invoices/recurring/:id
 * @desc Get a single recurring invoice by ID
 * @access Private
 */
router.get('/recurring/:id', [
  param('id').isInt().withMessage('Recurring invoice ID must be an integer')
], validateRequest, async (req, res) => {
  try {
    const recurringInvoice = await invoiceController.getRecurringInvoiceById(req.params.id);
    if (!recurringInvoice) {
      return res.status(404).json({ error: 'Recurring invoice not found' });
    }
    res.json(recurringInvoice);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route PUT /api/invoices/recurring/:id
 * @desc Update a recurring invoice
 * @access Private
 */
router.put('/recurring/:id', [
  param('id').isInt().withMessage('Recurring invoice ID must be an integer'),
  body('title').optional().notEmpty().withMessage('Title cannot be empty'),
  body('frequency').optional().isIn(['weekly', 'biweekly', 'monthly', 'quarterly', 'biannually', 'annually']).withMessage('Invalid frequency'),
  body('start_date').optional().isISO8601().toDate().withMessage('Valid start date is required'),
  body('end_date').optional().isISO8601().toDate().withMessage('Valid end date is required')
], validateRequest, async (req, res) => {
  try {
    const result = await invoiceController.updateRecurringInvoice(req.params.id, req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/invoices/recurring/:id/cancel
 * @desc Cancel a recurring invoice
 * @access Private
 */
router.post('/recurring/:id/cancel', [
  param('id').isInt().withMessage('Recurring invoice ID must be an integer')
], validateRequest, async (req, res) => {
  try {
    const result = await invoiceController.cancelRecurringInvoice(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/invoices/recurring/:id/reactivate
 * @desc Reactivate a recurring invoice
 * @access Private
 */
router.post('/recurring/:id/reactivate', [
  param('id').isInt().withMessage('Recurring invoice ID must be an integer')
], validateRequest, async (req, res) => {
  try {
    const result = await invoiceController.reactivateRecurringInvoice(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route DELETE /api/invoices/recurring/:id
 * @desc Delete a recurring invoice
 * @access Private
 */
router.delete('/recurring/:id', [
  param('id').isInt().withMessage('Recurring invoice ID must be an integer')
], validateRequest, async (req, res) => {
  try {
    const result = await invoiceController.deleteRecurringInvoice(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/invoices/recurring/process
 * @desc Process due recurring invoices
 * @access Private
 */
router.post('/recurring/process/due', async (req, res) => {
  try {
    const result = await invoiceController.generateFromRecurring();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// === Overdue Invoice Management Routes ===

/**
 * @route GET /api/invoices/overdue
 * @desc Get all overdue invoices
 * @access Private
 */
router.get('/overdue/all', async (req, res) => {
  try {
    const filters = {
      client_id: req.query.client_id,
      days_overdue: req.query.days_overdue ? parseInt(req.query.days_overdue) : null,
      limit: parseInt(req.query.limit) || 10,
      offset: parseInt(req.query.offset) || 0,
      sort_by: req.query.sort_by || 'due_date',
      sort_order: req.query.sort_order || 'asc'
    };
    const result = await invoiceController.getOverdueInvoices(filters);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/invoices/overdue/process
 * @desc Process overdue invoices (send reminders, update statuses)
 * @access Private
 */
router.post('/overdue/process', async (req, res) => {
  try {
    const result = await invoiceController.processOverdueInvoices();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/invoices/:id/apply-late-fee
 * @desc Apply late fee to an invoice
 * @access Private
 */
router.post('/:id/apply-late-fee', [
  param('id').isInt().withMessage('Invoice ID must be an integer'),
  body('amount').optional().isFloat({ min: 0 }).withMessage('Amount must be a non-negative number'),
  body('percentage').optional().isFloat({ min: 0, max: 100 }).withMessage('Percentage must be between 0 and 100')
], validateRequest, async (req, res) => {
  try {
    const result = await invoiceController.applyLateFee(req.params.id, req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/invoices/:id/send-reminder
 * @desc Send reminder for an overdue invoice
 * @access Private
 */
router.post('/:id/send-reminder', [
  param('id').isInt().withMessage('Invoice ID must be an integer'),
  body('level').optional().isIn(['gentle', 'firm', 'urgent']).withMessage('Invalid reminder level'),
  body('template_id').optional().isInt().withMessage('Template ID must be an integer')
], validateRequest, async (req, res) => {
  try {
    const result = await invoiceController.sendReminder(req.params.id, req.body.level, req.body.template_id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/invoices/overdue/statistics
 * @desc Get overdue invoice statistics
 * @access Private
 */
router.get('/overdue/statistics', async (req, res) => {
  try {
    const statistics = await invoiceController.getOverdueStatistics();
    res.json(statistics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route GET /api/invoices/overdue/config
 * @desc Get overdue invoice configuration
 * @access Private
 */
router.get('/overdue/config', async (req, res) => {
  try {
    const config = await invoiceController.getOverdueConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route PUT /api/invoices/overdue/config
 * @desc Update overdue invoice configuration
 * @access Private
 */
router.put('/overdue/config', [
  body('reminder_days').optional().isArray().withMessage('Reminder days must be an array'),
  body('reminder_days.*').optional().isInt({ min: 1 }).withMessage('Reminder days must be positive integers'),
  body('late_fee_type').optional().isIn(['none', 'fixed', 'percentage']).withMessage('Invalid late fee type'),
  body('late_fee_amount').optional().isFloat({ min: 0 }).withMessage('Late fee amount must be a non-negative number'),
  body('late_fee_grace_period').optional().isInt({ min: 0 }).withMessage('Grace period must be a non-negative integer'),
  body('auto_send_reminders').optional().isBoolean().withMessage('Auto send reminders must be a boolean')
], validateRequest, async (req, res) => {
  try {
    const result = await invoiceController.updateOverdueConfig(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// === Invoice Statistics Routes ===

/**
 * @route GET /api/invoices/statistics
 * @desc Get invoice statistics
 * @access Private
 */
router.get('/statistics', async (req, res) => {
  try {
    const statistics = await invoiceController.getInvoiceStatistics();
    res.json(statistics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router; 