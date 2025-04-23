/**
 * Scheduled jobs for invoice management
 */
const cron = require('node-cron');
const logger = require('../utils/logger');
const RecurringInvoiceService = require('../services/RecurringInvoiceService');
const OverdueInvoiceService = require('../services/OverdueInvoiceService');

/**
 * Initialize all invoice-related cron jobs
 */
function initializeInvoiceJobs() {
  logger.info('Initializing invoice cron jobs');
  
  // Process recurring invoices daily at 1:00 AM
  cron.schedule('0 1 * * *', async () => {
    try {
      logger.info('Running scheduled job: Generate invoices from recurring templates');
      const result = await RecurringInvoiceService.processDueRecurringInvoices();
      logger.info(`Processed ${result.processed} recurring invoices, generated ${result.generated} new invoices`);
    } catch (error) {
      logger.error(`Error processing recurring invoices: ${error.message}`);
    }
  });
  
  // Check for overdue invoices and send reminders daily at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    try {
      logger.info('Running scheduled job: Send overdue invoice reminders');
      const result = await OverdueInvoiceService.sendReminders();
      logger.info(`Sent ${result.sent} overdue reminders`);
    } catch (error) {
      logger.error(`Error sending overdue reminders: ${error.message}`);
    }
  });
  
  // Apply late fees to overdue invoices every Monday at 3:00 AM
  cron.schedule('0 3 * * 1', async () => {
    try {
      logger.info('Running scheduled job: Apply late fees to overdue invoices');
      const result = await OverdueInvoiceService.applyLateFees();
      logger.info(`Applied late fees to ${result.applied} of ${result.total_overdue} overdue invoices`);
    } catch (error) {
      logger.error(`Error applying late fees: ${error.message}`);
    }
  });
  
  // Generate monthly invoice analytics report on the 1st of each month at 4:00 AM
  cron.schedule('0 4 1 * *', async () => {
    try {
      logger.info('Running scheduled job: Generate monthly invoice analytics');
      
      // Get overdue analytics
      const overdueAnalytics = await OverdueInvoiceService.getOverdueAnalytics();
      
      logger.info(`Generated monthly invoice analytics: ${overdueAnalytics.current_overdue.count} currently overdue invoices totaling $${overdueAnalytics.current_overdue.total_amount}`);
      
      // You could store this data or send a report email here
      
    } catch (error) {
      logger.error(`Error generating monthly invoice analytics: ${error.message}`);
    }
  });
}

module.exports = {
  initializeInvoiceJobs
}; 