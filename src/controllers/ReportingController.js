/**
 * Reporting Controller
 * Handles financial reporting and data analytics
 */

const { getDatabase } = require('../database');
const logger = require('../utils/logger');
const Invoice = require('../models/Invoice');
const Estimate = require('../models/Estimate');
const Client = require('../models/Client');
const PaymentTrackingService = require('../services/PaymentTrackingService');
const OverdueInvoiceService = require('../services/OverdueInvoiceService');

class ReportingController {
  /**
   * Get revenue summary report
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async getRevenueSummary(req, res) {
    try {
      const { period, start_date, end_date } = req.query;
      
      // Determine date range based on period parameter
      let startDate, endDate;
      
      if (start_date && end_date) {
        startDate = new Date(start_date);
        endDate = new Date(end_date);
      } else {
        const now = new Date();
        endDate = new Date();
        
        // Set start date based on period
        switch (period) {
          case 'day':
            startDate = new Date(now.setHours(0, 0, 0, 0));
            break;
          case 'week':
            const day = now.getDay();
            startDate = new Date(now.setDate(now.getDate() - day));
            startDate.setHours(0, 0, 0, 0);
            break;
          case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
          case 'quarter':
            const quarter = Math.floor(now.getMonth() / 3);
            startDate = new Date(now.getFullYear(), quarter * 3, 1);
            break;
          case 'year':
            startDate = new Date(now.getFullYear(), 0, 1);
            break;
          default:
            // Default to last 30 days
            startDate = new Date();
            startDate.setDate(startDate.getDate() - 30);
        }
      }
      
      // Format dates for SQL
      const formattedStartDate = startDate.toISOString();
      const formattedEndDate = endDate.toISOString();
      
      const db = getDatabase();
      
      // Get total invoiced amount
      const invoicedAmount = await new Promise((resolve, reject) => {
        const query = `
          SELECT SUM(total_amount) as total_invoiced
          FROM invoices
          WHERE created_at >= ? AND created_at <= ?
        `;
        
        db.get(query, [formattedStartDate, formattedEndDate], (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row?.total_invoiced || 0);
          }
        });
      });
      
      // Get total payments received
      const paymentsReceived = await new Promise((resolve, reject) => {
        const query = `
          SELECT SUM(amount) as total_payments
          FROM invoice_payments
          WHERE payment_date >= ? AND payment_date <= ?
        `;
        
        db.get(query, [formattedStartDate, formattedEndDate], (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row?.total_payments || 0);
          }
        });
      });
      
      // Get payment method breakdown
      const paymentMethodBreakdown = await new Promise((resolve, reject) => {
        const query = `
          SELECT payment_method, SUM(amount) as total, COUNT(*) as count
          FROM invoice_payments
          WHERE payment_date >= ? AND payment_date <= ?
          GROUP BY payment_method
        `;
        
        db.all(query, [formattedStartDate, formattedEndDate], (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        });
      });
      
      // Get invoice status breakdown
      const invoiceStatusBreakdown = await new Promise((resolve, reject) => {
        const query = `
          SELECT status, COUNT(*) as count, SUM(total_amount) as total
          FROM invoices
          WHERE created_at >= ? AND created_at <= ?
          GROUP BY status
        `;
        
        db.all(query, [formattedStartDate, formattedEndDate], (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        });
      });
      
      // Get top clients by revenue
      const topClients = await new Promise((resolve, reject) => {
        const query = `
          SELECT 
            i.client_id, 
            c.name as client_name, 
            COUNT(i.id) as invoice_count, 
            SUM(i.total_amount) as total_amount
          FROM invoices i
          JOIN clients c ON i.client_id = c.id
          WHERE i.created_at >= ? AND i.created_at <= ?
          GROUP BY i.client_id
          ORDER BY total_amount DESC
          LIMIT 5
        `;
        
        db.all(query, [formattedStartDate, formattedEndDate], (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        });
      });
      
      // Get ongoing performance
      const monthlyBreakdown = await new Promise((resolve, reject) => {
        const query = `
          SELECT 
            strftime('%Y-%m', created_at) as month,
            SUM(total_amount) as invoiced,
            COUNT(*) as count
          FROM invoices
          WHERE created_at >= ? AND created_at <= ?
          GROUP BY month
          ORDER BY month
        `;
        
        db.all(query, [formattedStartDate, formattedEndDate], (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        });
      });
      
      res.json({
        success: true,
        data: {
          period: {
            start: formattedStartDate,
            end: formattedEndDate
          },
          summary: {
            total_invoiced: invoicedAmount,
            total_received: paymentsReceived,
            outstanding: invoicedAmount - paymentsReceived
          },
          payment_methods: paymentMethodBreakdown,
          invoice_status: invoiceStatusBreakdown,
          top_clients: topClients,
          monthly_breakdown: monthlyBreakdown
        }
      });
    } catch (error) {
      logger.error(`Error generating revenue summary: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: error.message
      });
    }
  }

  /**
   * Get accounts receivable aging report
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async getAccountsReceivableAging(req, res) {
    try {
      // Get overdue invoices report from the service
      const overdueReport = await OverdueInvoiceService.generateOverdueReport();
      
      // Get upcoming invoices that will be due soon
      const upcomingInvoices = await OverdueInvoiceService.getUpcomingOverdueInvoices(14); // Next 14 days
      
      res.json({
        success: true,
        data: {
          generated_at: new Date().toISOString(),
          aging_summary: overdueReport.aging_summary,
          total_overdue: {
            count: overdueReport.total_overdue_invoices,
            amount: overdueReport.total_overdue_amount
          },
          by_client: overdueReport.by_client,
          overdue_invoices: overdueReport.invoices,
          upcoming_due: upcomingInvoices.map(invoice => ({
            id: invoice.id,
            invoice_number: invoice.invoice_number,
            client_id: invoice.client_id,
            client_name: invoice.client_name,
            due_date: invoice.due_date,
            days_until_due: Math.round(invoice.days_until_due),
            amount: invoice.total_amount - invoice.amount_paid
          }))
        }
      });
    } catch (error) {
      logger.error(`Error generating accounts receivable aging report: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: error.message
      });
    }
  }

  /**
   * Get clients summary report
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async getClientsSummary(req, res) {
    try {
      const db = getDatabase();
      
      // Get clients with their invoice and payment summaries
      const clientSummaries = await new Promise((resolve, reject) => {
        const query = `
          SELECT 
            c.id,
            c.name,
            c.email,
            c.created_at,
            COUNT(DISTINCT i.id) as invoice_count,
            SUM(i.total_amount) as total_invoiced,
            SUM(i.amount_paid) as total_paid,
            MAX(i.created_at) as last_invoice_date
          FROM clients c
          LEFT JOIN invoices i ON c.id = i.client_id
          GROUP BY c.id
          ORDER BY total_invoiced DESC
        `;
        
        db.all(query, [], (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        });
      });
      
      // Enhance with more calculated metrics
      const enhancedSummaries = clientSummaries.map(client => {
        // Calculate outstanding amount
        const outstanding = parseFloat((client.total_invoiced - client.total_paid) || 0);
        
        // Calculate payment rate
        const paymentRate = client.total_invoiced > 0
          ? parseFloat(((client.total_paid / client.total_invoiced) * 100).toFixed(2))
          : 100;
        
        return {
          ...client,
          total_invoiced: client.total_invoiced || 0,
          total_paid: client.total_paid || 0,
          outstanding,
          payment_rate: paymentRate
        };
      });
      
      // Get lifetime value ranking
      const sortedByValue = [...enhancedSummaries]
        .sort((a, b) => b.total_paid - a.total_paid);
      
      res.json({
        success: true,
        data: {
          generated_at: new Date().toISOString(),
          total_clients: enhancedSummaries.length,
          total_invoiced: enhancedSummaries.reduce((sum, client) => sum + client.total_invoiced, 0),
          total_received: enhancedSummaries.reduce((sum, client) => sum + client.total_paid, 0),
          clients: enhancedSummaries,
          top_clients_by_value: sortedByValue.slice(0, 5)
        }
      });
    } catch (error) {
      logger.error(`Error generating clients summary report: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: error.message
      });
    }
  }

  /**
   * Get estimate conversion report
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async getEstimateConversion(req, res) {
    try {
      const { start_date, end_date } = req.query;
      
      // Set default date range (last 12 months)
      const endDate = end_date ? new Date(end_date) : new Date();
      const startDate = start_date 
        ? new Date(start_date) 
        : new Date(endDate.getFullYear() - 1, endDate.getMonth(), endDate.getDate());
      
      // Format dates for SQL
      const formattedStartDate = startDate.toISOString();
      const formattedEndDate = endDate.toISOString();
      
      const db = getDatabase();
      
      // Get overall estimate statistics
      const estimateStats = await new Promise((resolve, reject) => {
        const query = `
          SELECT 
            COUNT(*) as total_estimates,
            SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
            SUM(CASE WHEN status = 'declined' THEN 1 ELSE 0 END) as declined,
            SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) as converted
          FROM estimates
          WHERE created_at >= ? AND created_at <= ?
        `;
        
        db.get(query, [formattedStartDate, formattedEndDate], (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row || { total_estimates: 0, approved: 0, declined: 0, converted: 0 });
          }
        });
      });
      
      // Calculate conversion rates
      const approvalRate = estimateStats.total_estimates > 0
        ? parseFloat(((estimateStats.approved / estimateStats.total_estimates) * 100).toFixed(2))
        : 0;
        
      const conversionRate = estimateStats.approved > 0
        ? parseFloat(((estimateStats.converted / estimateStats.approved) * 100).toFixed(2))
        : 0;
      
      // Get monthly breakdown
      const monthlyBreakdown = await new Promise((resolve, reject) => {
        const query = `
          SELECT 
            strftime('%Y-%m', created_at) as month,
            COUNT(*) as total,
            SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
            SUM(CASE WHEN status = 'declined' THEN 1 ELSE 0 END) as declined,
            SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) as converted
          FROM estimates
          WHERE created_at >= ? AND created_at <= ?
          GROUP BY month
          ORDER BY month
        `;
        
        db.all(query, [formattedStartDate, formattedEndDate], (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        });
      });
      
      // Calculate monthly rates
      const monthlyRates = monthlyBreakdown.map(month => {
        const monthApprovalRate = month.total > 0
          ? parseFloat(((month.approved / month.total) * 100).toFixed(2))
          : 0;
          
        const monthConversionRate = month.approved > 0
          ? parseFloat(((month.converted / month.approved) * 100).toFixed(2))
          : 0;
          
        return {
          ...month,
          approval_rate: monthApprovalRate,
          conversion_rate: monthConversionRate
        };
      });
      
      res.json({
        success: true,
        data: {
          period: {
            start: formattedStartDate,
            end: formattedEndDate
          },
          summary: {
            total_estimates: estimateStats.total_estimates,
            approved: estimateStats.approved,
            declined: estimateStats.declined,
            converted: estimateStats.converted,
            approval_rate: approvalRate,
            conversion_rate: conversionRate
          },
          monthly: monthlyRates
        }
      });
    } catch (error) {
      logger.error(`Error generating estimate conversion report: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: error.message
      });
    }
  }

  /**
   * Get dashboard summary statistics
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async getDashboardStats(req, res) {
    try {
      const db = getDatabase();
      
      // Get current date for calculations
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      
      // Start of current month
      const startOfMonth = new Date(currentYear, currentMonth, 1).toISOString();
      
      // Start of previous month
      const startOfPrevMonth = new Date(currentYear, currentMonth - 1, 1).toISOString();
      
      // End of previous month
      const endOfPrevMonth = new Date(currentYear, currentMonth, 0).toISOString();
      
      // Current month revenue
      const currentMonthRevenue = await new Promise((resolve, reject) => {
        const query = `
          SELECT SUM(amount) as revenue
          FROM invoice_payments
          WHERE payment_date >= ?
        `;
        
        db.get(query, [startOfMonth], (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row?.revenue || 0);
          }
        });
      });
      
      // Previous month revenue
      const prevMonthRevenue = await new Promise((resolve, reject) => {
        const query = `
          SELECT SUM(amount) as revenue
          FROM invoice_payments
          WHERE payment_date >= ? AND payment_date <= ?
        `;
        
        db.get(query, [startOfPrevMonth, endOfPrevMonth], (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row?.revenue || 0);
          }
        });
      });
      
      // Calculate revenue change
      const revenueChange = prevMonthRevenue > 0
        ? parseFloat((((currentMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100).toFixed(2))
        : 100;
      
      // Get overdue invoices count and amount
      const overdueSummary = await OverdueInvoiceService.getOverdueStatistics();
      
      // Get pending invoices (sent but not paid)
      const pendingInvoices = await new Promise((resolve, reject) => {
        const query = `
          SELECT COUNT(*) as count, SUM(total_amount - amount_paid) as amount
          FROM invoices
          WHERE status = 'sent'
        `;
        
        db.get(query, [], (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve({
              count: row?.count || 0,
              amount: row?.amount || 0
            });
          }
        });
      });
      
      // Get draft estimates count
      const draftEstimates = await new Promise((resolve, reject) => {
        const query = `
          SELECT COUNT(*) as count
          FROM estimates
          WHERE status = 'draft'
        `;
        
        db.get(query, [], (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row?.count || 0);
          }
        });
      });
      
      // Get client count
      const clientCount = await new Promise((resolve, reject) => {
        const query = `
          SELECT COUNT(*) as count
          FROM clients
        `;
        
        db.get(query, [], (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row?.count || 0);
          }
        });
      });
      
      res.json({
        success: true,
        data: {
          generated_at: new Date().toISOString(),
          this_month_revenue: currentMonthRevenue,
          prev_month_revenue: prevMonthRevenue,
          revenue_change: revenueChange,
          overdue_invoices: {
            count: overdueSummary.overdue_count,
            amount: overdueSummary.overdue_amount
          },
          pending_invoices: pendingInvoices,
          draft_estimates: draftEstimates,
          client_count: clientCount
        }
      });
    } catch (error) {
      logger.error(`Error generating dashboard statistics: ${error.message}`);
      res.status(500).json({
        success: false,
        error: 'server_error',
        message: error.message
      });
    }
  }
}

module.exports = new ReportingController(); 