/**
 * Controller handling analytics and reporting functionality
 * Provides data for dashboards, reports and business intelligence
 */

const Invoice = require('../models/Invoice');
const Client = require('../models/Client');
const logger = require('../utils/logger');
const { getDatabase } = require('../database');
const cache = require('../utils/cache');

class AnalyticsController {
  /**
   * Get summary statistics for invoices
   * Includes total revenue, average invoice value, payment rate, etc.
   */
  async getInvoiceSummary(req, res) {
    try {
      // Check cache first
      const cacheKey = `invoice_summary_${req.user.id}`;
      const cachedData = cache.get(cacheKey);
      
      if (cachedData) {
        return res.status(200).json(cachedData);
      }
      
      const db = getDatabase();
      
      // Get summary statistics
      const stats = await db.get(`
        SELECT 
          COUNT(*) as total_invoices,
          SUM(total_amount) as total_revenue,
          AVG(total_amount) as average_invoice,
          SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid_count,
          SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as overdue_count,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
          SUM(CASE WHEN status = 'canceled' THEN 1 ELSE 0 END) as canceled_count,
          SUM(amount_paid) as total_collected,
          SUM(total_amount - amount_paid) as total_outstanding
        FROM invoices
        WHERE user_id = ?
      `, [req.user.id]);
      
      // Calculate payment rate
      stats.payment_rate = stats.total_invoices > 0 
        ? (stats.paid_count / stats.total_invoices * 100).toFixed(2) 
        : 0;
        
      // Calculate collection rate
      stats.collection_rate = stats.total_revenue > 0 
        ? (stats.total_collected / stats.total_revenue * 100).toFixed(2) 
        : 0;
      
      // Cache the result for 30 minutes
      cache.set(cacheKey, stats, 30 * 60);
      
      return res.status(200).json(stats);
    } catch (error) {
      logger.error('Error getting invoice summary:', error);
      return res.status(500).json({ error: 'Failed to get invoice summary statistics' });
    }
  }

  /**
   * Get invoice trends over time
   * Returns data for charts showing monthly/quarterly invoicing and payment trends
   */
  async getInvoiceTrends(req, res) {
    try {
      const { period = 'monthly', months = 12 } = req.query;
      const cacheKey = `invoice_trends_${req.user.id}_${period}_${months}`;
      const cachedData = cache.get(cacheKey);
      
      if (cachedData) {
        return res.status(200).json(cachedData);
      }
      
      const db = getDatabase();
      let timeFormat;
      
      // Set SQL datetime format based on period
      if (period === 'monthly') {
        timeFormat = '%Y-%m';
      } else if (period === 'quarterly') {
        timeFormat = '%Y-Q%q';
      } else if (period === 'yearly') {
        timeFormat = '%Y';
      } else {
        return res.status(400).json({ error: 'Invalid period. Use monthly, quarterly, or yearly.' });
      }
      
      // Get trends over time
      const trends = await db.all(`
        SELECT 
          strftime('${timeFormat}', created_at) as time_period,
          COUNT(*) as invoice_count,
          SUM(total_amount) as invoiced_amount,
          SUM(amount_paid) as collected_amount,
          AVG(total_amount) as average_invoice
        FROM invoices
        WHERE user_id = ? 
        AND created_at >= date('now', '-${months} month')
        GROUP BY time_period
        ORDER BY time_period ASC
      `, [req.user.id]);
      
      // Cache for 1 hour
      cache.set(cacheKey, trends, 60 * 60);
      
      return res.status(200).json(trends);
    } catch (error) {
      logger.error('Error getting invoice trends:', error);
      return res.status(500).json({ error: 'Failed to get invoice trends' });
    }
  }

  /**
   * Get client payment analytics
   * Analyze payment patterns by client, including on-time payment rates
   */
  async getClientPaymentAnalytics(req, res) {
    try {
      const cacheKey = `client_payment_analytics_${req.user.id}`;
      const cachedData = cache.get(cacheKey);
      
      if (cachedData) {
        return res.status(200).json(cachedData);
      }
      
      const db = getDatabase();
      
      // Get client payment analytics
      const clientAnalytics = await db.all(`
        SELECT 
          c.id as client_id,
          c.name as client_name,
          COUNT(i.id) as invoice_count,
          SUM(i.total_amount) as total_billed,
          SUM(i.amount_paid) as total_paid,
          AVG(JULIANDAY(COALESCE(i.paid_at, 'now')) - JULIANDAY(i.due_date)) as avg_days_to_payment,
          SUM(CASE WHEN i.status = 'paid' AND JULIANDAY(i.paid_at) <= JULIANDAY(i.due_date) THEN 1 ELSE 0 END) as on_time_payments,
          SUM(CASE WHEN i.status = 'paid' THEN 1 ELSE 0 END) as paid_invoices
        FROM clients c
        JOIN invoices i ON c.id = i.client_id
        WHERE c.user_id = ?
        GROUP BY c.id
        ORDER BY total_billed DESC
      `, [req.user.id]);
      
      // Calculate on-time payment rate
      clientAnalytics.forEach(client => {
        client.on_time_payment_rate = client.paid_invoices > 0 
          ? (client.on_time_payments / client.paid_invoices * 100).toFixed(2) 
          : 0;
          
        client.payment_completion_rate = client.invoice_count > 0 
          ? (client.paid_invoices / client.invoice_count * 100).toFixed(2) 
          : 0;
      });
      
      // Cache for 2 hours
      cache.set(cacheKey, clientAnalytics, 2 * 60 * 60);
      
      return res.status(200).json(clientAnalytics);
    } catch (error) {
      logger.error('Error getting client payment analytics:', error);
      return res.status(500).json({ error: 'Failed to get client payment analytics' });
    }
  }

  /**
   * Get revenue forecast
   * Projects expected revenue based on recurring invoices and historical data
   */
  async getRevenueForecast(req, res) {
    try {
      const { months = 3 } = req.query;
      const cacheKey = `revenue_forecast_${req.user.id}_${months}`;
      const cachedData = cache.get(cacheKey);
      
      if (cachedData) {
        return res.status(200).json(cachedData);
      }
      
      const db = getDatabase();
      
      // Get pending invoices
      const pendingRevenue = await db.get(`
        SELECT SUM(total_amount - amount_paid) as amount
        FROM invoices
        WHERE user_id = ? AND status IN ('pending', 'sent', 'overdue')
      `, [req.user.id]);
      
      // Get recurring invoice forecasts
      const recurringForecast = await db.all(`
        SELECT 
          strftime('%Y-%m', datetime(next_date)) as month,
          SUM(total_amount) as projected_amount
        FROM recurring_invoices
        WHERE user_id = ? 
        AND status = 'active'
        AND next_date <= date('now', '+${months} month')
        GROUP BY month
        ORDER BY month ASC
      `, [req.user.id]);
      
      // Get historical monthly averages
      const historicalAverage = await db.get(`
        SELECT AVG(monthly_total) as average_monthly
        FROM (
          SELECT 
            strftime('%Y-%m', created_at) as month,
            SUM(total_amount) as monthly_total
          FROM invoices
          WHERE user_id = ? 
          AND created_at >= date('now', '-6 month')
          GROUP BY month
        )
      `, [req.user.id]);
      
      const forecast = {
        pending_revenue: pendingRevenue.amount || 0,
        recurring_forecast: recurringForecast,
        historical_monthly_average: historicalAverage.average_monthly || 0,
        forecast_months: parseInt(months),
        forecast_total: pendingRevenue.amount || 0
      };
      
      // Add recurring revenue to forecast total
      recurringForecast.forEach(item => {
        forecast.forecast_total += parseFloat(item.projected_amount);
      });
      
      // Cache for 12 hours
      cache.set(cacheKey, forecast, 12 * 60 * 60);
      
      return res.status(200).json(forecast);
    } catch (error) {
      logger.error('Error generating revenue forecast:', error);
      return res.status(500).json({ error: 'Failed to generate revenue forecast' });
    }
  }

  /**
   * Get overdue invoice analytics
   * Analyze patterns in overdue invoices and late payments
   */
  async getOverdueAnalytics(req, res) {
    try {
      const cacheKey = `overdue_analytics_${req.user.id}`;
      const cachedData = cache.get(cacheKey);
      
      if (cachedData) {
        return res.status(200).json(cachedData);
      }
      
      const db = getDatabase();
      
      // Get overdue invoice statistics
      const overdueStats = await db.get(`
        SELECT
          COUNT(*) as overdue_count,
          SUM(total_amount - amount_paid) as overdue_amount,
          AVG(JULIANDAY('now') - JULIANDAY(due_date)) as avg_days_overdue,
          MAX(JULIANDAY('now') - JULIANDAY(due_date)) as max_days_overdue
        FROM invoices
        WHERE user_id = ? AND status = 'overdue'
      `, [req.user.id]);
      
      // Get aging analysis of overdue invoices
      const agingAnalysis = await db.all(`
        SELECT
          CASE
            WHEN JULIANDAY('now') - JULIANDAY(due_date) <= 30 THEN '0-30 days'
            WHEN JULIANDAY('now') - JULIANDAY(due_date) <= 60 THEN '31-60 days'
            WHEN JULIANDAY('now') - JULIANDAY(due_date) <= 90 THEN '61-90 days'
            ELSE 'Over 90 days'
          END as aging_category,
          COUNT(*) as invoice_count,
          SUM(total_amount - amount_paid) as outstanding_amount
        FROM invoices
        WHERE user_id = ? AND status = 'overdue'
        GROUP BY aging_category
        ORDER BY 
          CASE aging_category
            WHEN '0-30 days' THEN 1
            WHEN '31-60 days' THEN 2
            WHEN '61-90 days' THEN 3
            ELSE 4
          END
      `, [req.user.id]);
      
      // Get client with most overdue invoices
      const clientOverdueData = await db.all(`
        SELECT
          c.id as client_id,
          c.name as client_name,
          COUNT(i.id) as overdue_count,
          SUM(i.total_amount - i.amount_paid) as overdue_amount,
          AVG(JULIANDAY('now') - JULIANDAY(i.due_date)) as avg_days_overdue
        FROM clients c
        JOIN invoices i ON c.id = i.client_id
        WHERE c.user_id = ? AND i.status = 'overdue'
        GROUP BY c.id
        ORDER BY overdue_amount DESC
      `, [req.user.id]);
      
      const analytics = {
        overdue_stats: overdueStats,
        aging_analysis: agingAnalysis,
        client_overdue_data: clientOverdueData
      };
      
      // Cache for 4 hours
      cache.set(cacheKey, analytics, 4 * 60 * 60);
      
      return res.status(200).json(analytics);
    } catch (error) {
      logger.error('Error getting overdue analytics:', error);
      return res.status(500).json({ error: 'Failed to get overdue invoice analytics' });
    }
  }

  /**
   * Clear analytics cache
   * Admin only - forces regeneration of analytics data
   */
  async clearAnalyticsCache(req, res) {
    try {
      // Clear all cache keys starting with user ID
      const userCachePattern = new RegExp(`^.*_${req.user.id}.*$`);
      const clearedCount = cache.clearPattern(userCachePattern);
      
      logger.info(`Cleared ${clearedCount} analytics cache entries for user ${req.user.id}`);
      
      return res.status(200).json({ 
        message: 'Analytics cache cleared successfully',
        entries_cleared: clearedCount
      });
    } catch (error) {
      logger.error('Error clearing analytics cache:', error);
      return res.status(500).json({ error: 'Failed to clear analytics cache' });
    }
  }
}

module.exports = new AnalyticsController(); 