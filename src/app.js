const clientRoutes = require('./routes/clients');
const invoiceRoutes = require('./routes/invoices');
const estimateRoutes = require('./routes/estimates');
const userRoutes = require('./routes/users');
const analyticsRoutes = require('./routes/analytics');
const taskRoutes = require('./routes/tasks');
// ... other route imports ...

// Initialize services that need to run on startup
const InvoiceNumberingService = require('./services/InvoiceNumberingService');
const RecurringInvoiceService = require('./services/RecurringInvoiceService');
const PaymentTrackingService = require('./services/PaymentTrackingService');
const OverdueInvoiceService = require('./services/OverdueInvoiceService');

// Import invoice scheduler
const { initInvoiceScheduler } = require('./scheduler/invoiceTasks');

// ... existing code ...

// Register routes
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/estimates', estimateRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/users', userRoutes);
app.use('/api/analytics', analyticsRoutes);
// ... other route registrations ...

// Schedule background jobs
if (process.env.NODE_ENV !== 'test') {
  // Initialize invoice scheduler
  initInvoiceScheduler();
}

// ... existing code ... 