/**
 * Invoice Scheduler Tasks
 * Handles scheduled tasks related to invoice management
 */

const cron = require('node-cron');
const logger = require('../utils/logger');
const RecurringInvoiceService = require('../services/RecurringInvoiceService');
const OverdueInvoiceService = require('../services/OverdueInvoiceService');

/**
 * Initialize invoice scheduler tasks
 */
function initInvoiceScheduler() {
  logger.info('Initializing invoice scheduler tasks');

  // Schedule daily processing of recurring invoices - run at 1:00 AM every day
  cron.schedule('0 1 * * *', async () => {
    logger.info('Running scheduled task: Process recurring invoices');
    try {
      const result = await RecurringInvoiceService.processDueRecurringInvoices();
      logger.info('Recurring invoice processing complete', result);
    } catch (error) {
      logger.error('Error processing recurring invoices:', error);
    }
  });

  // Schedule daily processing of overdue invoices - run at 2:00 AM every day
  cron.schedule('0 2 * * *', async () => {
    logger.info('Running scheduled task: Process overdue invoices');
    try {
      const result = await OverdueInvoiceService.processOverdueInvoices();
      logger.info('Overdue invoice processing complete', result);
    } catch (error) {
      logger.error('Error processing overdue invoices:', error);
    }
  });

  // Schedule weekly invoice summary report - run at 8:00 AM every Monday
  cron.schedule('0 8 * * 1', async () => {
    logger.info('Running scheduled task: Generate invoice summary report');
    try {
      // Get overdue statistics
      const overdueStats = await OverdueInvoiceService.getOverdueStatistics();
      
      // Log the summary for now - in a real app, this could send an email to admins
      logger.info('Weekly Invoice Summary Report');
      logger.info('Overdue invoice statistics:', overdueStats);
      
      // Additional reporting could be added here
    } catch (error) {
      logger.error('Error generating invoice summary report:', error);
    }
  });

  logger.info('Invoice scheduler tasks initialized');
}

module.exports = { initInvoiceScheduler }; 