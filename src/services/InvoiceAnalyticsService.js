/**
 * Invoice Analytics Service
 * Provides comprehensive analytics for the invoice management system
 * including payment trends, overdue analysis, and revenue forecasting
 */
const { getDatabase } = require('../database');
const logger = require('../utils/logger');
const { getFormattedDate } = require('../utils/dateFormatter');

class InvoiceAnalyticsService {
  constructor() {
    this.db = getDatabase();
    this.invoicesTable = 'invoices';
    this.paymentsTable = 'invoice_payments';
    this.clientsTable = 'clients';
    this.recurringInvoicesTable = 'recurring_invoices';
    this.analyticsCache = new Map();
    this.cacheTTL = 30 * 60 * 1000; // 30 minutes in milliseconds
  }

  /**
   * Get invoice summary analytics
   * @param {Object} options - Filter options (dateRange, clientId, etc.)
   * @returns {Promise<Object>} - Summary analytics data
   */
  async getInvoiceSummary(options = {}) {
    try {
      const { startDate, endDate, clientId } = options;
      const cacheKey = `summary_${startDate || ''}_${endDate || ''}_${clientId || ''}`;
      
      // Check cache first
      const cachedData = this._getCachedData(cacheKey);
      if (cachedData) return cachedData;
      
      // Build query parameters
      const params = [];
      let whereClause = '';
      
      if (startDate) {
        whereClause += whereClause ? ' AND ' : ' WHERE ';
        whereClause += 'created_at >= ?';
        params.push(startDate);
      }
      
      if (endDate) {
        whereClause += whereClause ? ' AND ' : ' WHERE ';
        whereClause += 'created_at <= ?';
        params.push(endDate);
      }
      
      if (clientId) {
        whereClause += whereClause ? ' AND ' : ' WHERE ';
        whereClause += 'client_id = ?';
        params.push(clientId);
      }
      
      // Get summary data
      const query = `
        SELECT
          COUNT(*) AS total_invoices,
          SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid_invoices,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_invoices,
          SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) AS overdue_invoices,
          SUM(CASE WHEN status = 'canceled' THEN 1 ELSE 0 END) AS canceled_invoices,
          SUM(total_amount) AS total_amount,
          SUM(amount_paid) AS amount_paid,
          SUM(total_amount - amount_paid) AS amount_outstanding,
          AVG(CASE WHEN status = 'paid' THEN 
              JULIANDAY(paid_at) - JULIANDAY(created_at) 
            ELSE NULL END) AS avg_days_to_payment
        FROM ${this.invoicesTable}
        ${whereClause}
      `;
      
      const result = await this.db.get(query, params);
      
      // Calculate payment rate
      result.payment_rate = result.total_invoices > 0 
        ? (result.paid_invoices / result.total_invoices * 100).toFixed(2) 
        : 0;
      
      // Calculate collection rate
      result.collection_rate = result.total_amount > 0 
        ? (result.amount_paid / result.total_amount * 100).toFixed(2) 
        : 0;
      
      // Cache result
      this._cacheData(cacheKey, result);
      
      return result;
    } catch (error) {
      logger.error('Error getting invoice summary analytics:', error);
      throw { status: 500, message: 'Failed to retrieve invoice analytics' };
    }
  }

  /**
   * Get invoice trend analytics
   * @param {Object} options - Filter options
   * @returns {Promise<Object>} - Trend analytics data
   */
  async getInvoiceTrends(options = {}) {
    try {
      const { period = 'month', months = 12, clientId } = options;
      const cacheKey = `trends_${period}_${months}_${clientId || ''}`;
      
      // Check cache first
      const cachedData = this._getCachedData(cacheKey);
      if (cachedData) return cachedData;
      
      // Determine group by format based on period
      let dateFormat;
      let labelFormat;
      
      switch (period) {
        case 'day':
          dateFormat = '%Y-%m-%d';
          labelFormat = 'YYYY-MM-DD';
          break;
        case 'week':
          dateFormat = '%Y-%W';
          labelFormat = 'YYYY-WW';
          break;
        case 'month':
        default:
          dateFormat = '%Y-%m';
          labelFormat = 'YYYY-MM';
          break;
        case 'quarter':
          dateFormat = '%Y-Q%Q';
          labelFormat = 'YYYY-QQ';
          break;
        case 'year':
          dateFormat = '%Y';
          labelFormat = 'YYYY';
          break;
      }
      
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months);
      
      // Build query parameters
      const params = [startDate.toISOString().split('T')[0]];
      let whereClause = 'WHERE created_at >= ?';
      
      if (clientId) {
        whereClause += ' AND client_id = ?';
        params.push(clientId);
      }
      
      // Get trend data
      const query = `
        SELECT
          strftime('${dateFormat}', created_at) AS period,
          COUNT(*) AS invoice_count,
          SUM(total_amount) AS total_amount,
          SUM(amount_paid) AS amount_paid,
          SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid_count,
          SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) AS overdue_count
        FROM ${this.invoicesTable}
        ${whereClause}
        GROUP BY period
        ORDER BY period ASC
      `;
      
      const results = await this.db.all(query, params);
      
      // Format results
      const trends = results.map(row => ({
        period: row.period,
        period_label: this._formatPeriodLabel(row.period, labelFormat),
        invoice_count: row.invoice_count,
        total_amount: row.total_amount || 0,
        amount_paid: row.amount_paid || 0,
        payment_rate: row.invoice_count > 0 
          ? (row.paid_count / row.invoice_count * 100).toFixed(2) 
          : 0,
        overdue_rate: row.invoice_count > 0 
          ? (row.overdue_count / row.invoice_count * 100).toFixed(2) 
          : 0
      }));
      
      // Cache result
      this._cacheData(cacheKey, trends);
      
      return trends;
    } catch (error) {
      logger.error('Error getting invoice trend analytics:', error);
      throw { status: 500, message: 'Failed to retrieve invoice trends' };
    }
  }

  /**
   * Get client payment analytics
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} - Client payment analytics data
   */
  async getClientPaymentAnalytics(options = {}) {
    try {
      const { startDate, endDate, limit = 10, sortBy = 'total_amount', sortDir = 'DESC' } = options;
      const cacheKey = `client_analytics_${startDate || ''}_${endDate || ''}_${limit}_${sortBy}_${sortDir}`;
      
      // Check cache first
      const cachedData = this._getCachedData(cacheKey);
      if (cachedData) return cachedData;
      
      // Build query parameters
      const params = [];
      let whereClause = '';
      
      if (startDate) {
        whereClause += whereClause ? ' AND ' : ' WHERE ';
        whereClause += 'i.created_at >= ?';
        params.push(startDate);
      }
      
      if (endDate) {
        whereClause += whereClause ? ' AND ' : ' WHERE ';
        whereClause += 'i.created_at <= ?';
        params.push(endDate);
      }
      
      // Validate sort parameters
      const validSortFields = ['total_amount', 'amount_paid', 'invoice_count', 'avg_days_to_payment', 'payment_rate'];
      const validSortDirs = ['ASC', 'DESC'];
      
      const actualSortBy = validSortFields.includes(sortBy) ? sortBy : 'total_amount';
      const actualSortDir = validSortDirs.includes(sortDir.toUpperCase()) ? sortDir.toUpperCase() : 'DESC';
      
      // Get client payment analytics
      const query = `
        SELECT 
          c.id,
          c.name,
          COUNT(i.id) AS invoice_count,
          SUM(i.total_amount) AS total_amount,
          SUM(i.amount_paid) AS amount_paid,
          SUM(i.total_amount - i.amount_paid) AS amount_outstanding,
          SUM(CASE WHEN i.status = 'paid' THEN 1 ELSE 0 END) AS paid_count,
          SUM(CASE WHEN i.status = 'overdue' THEN 1 ELSE 0 END) AS overdue_count,
          AVG(CASE WHEN i.status = 'paid' THEN 
              JULIANDAY(i.paid_at) - JULIANDAY(i.created_at) 
            ELSE NULL END) AS avg_days_to_payment
        FROM ${this.clientsTable} c
        LEFT JOIN ${this.invoicesTable} i ON c.id = i.client_id
        ${whereClause}
        GROUP BY c.id, c.name
        ORDER BY ${actualSortBy} ${actualSortDir}
        LIMIT ?
      `;
      
      params.push(limit);
      
      const results = await this.db.all(query, params);
      
      // Format results
      const clientAnalytics = results.map(row => ({
        client_id: row.id,
        client_name: row.name,
        invoice_count: row.invoice_count || 0,
        total_amount: row.total_amount || 0,
        amount_paid: row.amount_paid || 0,
        amount_outstanding: row.amount_outstanding || 0,
        payment_rate: row.invoice_count > 0 
          ? (row.paid_count / row.invoice_count * 100).toFixed(2) 
          : 0,
        overdue_rate: row.invoice_count > 0 
          ? (row.overdue_count / row.invoice_count * 100).toFixed(2) 
          : 0,
        avg_days_to_payment: row.avg_days_to_payment 
          ? Math.round(row.avg_days_to_payment) 
          : null
      }));
      
      // Cache result
      this._cacheData(cacheKey, clientAnalytics);
      
      return clientAnalytics;
    } catch (error) {
      logger.error('Error getting client payment analytics:', error);
      throw { status: 500, message: 'Failed to retrieve client payment analytics' };
    }
  }

  /**
   * Get revenue forecast
   * @param {Object} options - Forecast options
   * @returns {Promise<Object>} - Revenue forecast data
   */
  async getRevenueForecast(options = {}) {
    try {
      const { months = 3, includeRecurring = true } = options;
      const cacheKey = `forecast_${months}_${includeRecurring}`;
      
      // Check cache first
      const cachedData = this._getCachedData(cacheKey);
      if (cachedData) return cachedData;
      
      // Get current date
      const currentDate = new Date();
      const startDate = new Date(currentDate);
      startDate.setDate(1); // Start from beginning of current month
      
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + months);
      
      // Get pending invoices due within forecast period
      const pendingQuery = `
        SELECT 
          strftime('%Y-%m', due_date) AS month,
          SUM(total_amount - amount_paid) AS expected_amount
        FROM ${this.invoicesTable}
        WHERE status IN ('pending', 'overdue')
        AND due_date BETWEEN ? AND ?
        GROUP BY month
        ORDER BY month ASC
      `;
      
      const pendingResults = await this.db.all(pendingQuery, [
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      ]);
      
      // Initialize forecast with pending invoices
      const forecastByMonth = {};
      pendingResults.forEach(row => {
        forecastByMonth[row.month] = {
          month: row.month,
          pending_amount: row.expected_amount || 0,
          recurring_amount: 0,
          total_forecast: row.expected_amount || 0
        };
      });
      
      // Include recurring invoices if requested
      if (includeRecurring) {
        const recurringQuery = `
          SELECT 
            frequency,
            next_date,
            total_amount
          FROM ${this.recurringInvoicesTable}
          WHERE status = 'active'
          AND next_date IS NOT NULL
        `;
        
        const recurringInvoices = await this.db.all(recurringQuery);
        
        // Project recurring invoices into forecast period
        recurringInvoices.forEach(invoice => {
          const nextDate = new Date(invoice.next_date);
          const amount = invoice.total_amount;
          
          // Project based on frequency
          while (nextDate < endDate) {
            const monthKey = nextDate.toISOString().substring(0, 7); // YYYY-MM format
            
            if (!forecastByMonth[monthKey]) {
              forecastByMonth[monthKey] = {
                month: monthKey,
                pending_amount: 0,
                recurring_amount: 0,
                total_forecast: 0
              };
            }
            
            forecastByMonth[monthKey].recurring_amount += amount;
            forecastByMonth[monthKey].total_forecast += amount;
            
            // Advance date based on frequency
            switch (invoice.frequency) {
              case 'weekly':
                nextDate.setDate(nextDate.getDate() + 7);
                break;
              case 'biweekly':
                nextDate.setDate(nextDate.getDate() + 14);
                break;
              case 'monthly':
                nextDate.setMonth(nextDate.getMonth() + 1);
                break;
              case 'quarterly':
                nextDate.setMonth(nextDate.getMonth() + 3);
                break;
              case 'semiannual':
                nextDate.setMonth(nextDate.getMonth() + 6);
                break;
              case 'annual':
                nextDate.setFullYear(nextDate.getFullYear() + 1);
                break;
              default:
                // Move past end date to exit loop for unknown frequencies
                nextDate.setFullYear(endDate.getFullYear() + 1);
            }
          }
        });
      }
      
      // Convert to sorted array
      const forecast = Object.values(forecastByMonth).sort((a, b) => a.month.localeCompare(b.month));
      
      // Calculate totals
      const totals = {
        pending_amount: forecast.reduce((sum, item) => sum + item.pending_amount, 0),
        recurring_amount: forecast.reduce((sum, item) => sum + item.recurring_amount, 0),
        total_forecast: forecast.reduce((sum, item) => sum + item.total_forecast, 0)
      };
      
      const result = {
        forecast_period: {
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          months: months
        },
        monthly_forecast: forecast,
        totals: totals
      };
      
      // Cache result
      this._cacheData(cacheKey, result);
      
      return result;
    } catch (error) {
      logger.error('Error generating revenue forecast:', error);
      throw { status: 500, message: 'Failed to generate revenue forecast' };
    }
  }

  /**
   * Get overdue invoice analytics
   * @param {Object} options - Filter options
   * @returns {Promise<Object>} - Overdue analytics data
   */
  async getOverdueAnalytics(options = {}) {
    try {
      const { clientId } = options;
      const cacheKey = `overdue_analytics_${clientId || ''}`;
      
      // Check cache first
      const cachedData = this._getCachedData(cacheKey);
      if (cachedData) return cachedData;
      
      // Build query parameters
      const params = [];
      let whereClause = "WHERE status = 'overdue'";
      
      if (clientId) {
        whereClause += ' AND client_id = ?';
        params.push(clientId);
      }
      
      // Get overdue analytics
      const query = `
        SELECT
          COUNT(*) AS overdue_count,
          SUM(total_amount - amount_paid) AS overdue_amount,
          AVG(JULIANDAY('now') - JULIANDAY(due_date)) AS avg_days_overdue,
          SUM(CASE WHEN JULIANDAY('now') - JULIANDAY(due_date) <= 30 THEN 1 ELSE 0 END) AS overdue_30_days,
          SUM(CASE WHEN JULIANDAY('now') - JULIANDAY(due_date) BETWEEN 31 AND 60 THEN 1 ELSE 0 END) AS overdue_60_days,
          SUM(CASE WHEN JULIANDAY('now') - JULIANDAY(due_date) BETWEEN 61 AND 90 THEN 1 ELSE 0 END) AS overdue_90_days,
          SUM(CASE WHEN JULIANDAY('now') - JULIANDAY(due_date) > 90 THEN 1 ELSE 0 END) AS overdue_90_plus_days,
          SUM(CASE WHEN JULIANDAY('now') - JULIANDAY(due_date) <= 30 THEN total_amount - amount_paid ELSE 0 END) AS amount_30_days,
          SUM(CASE WHEN JULIANDAY('now') - JULIANDAY(due_date) BETWEEN 31 AND 60 THEN total_amount - amount_paid ELSE 0 END) AS amount_60_days,
          SUM(CASE WHEN JULIANDAY('now') - JULIANDAY(due_date) BETWEEN 61 AND 90 THEN total_amount - amount_paid ELSE 0 END) AS amount_90_days,
          SUM(CASE WHEN JULIANDAY('now') - JULIANDAY(due_date) > 90 THEN total_amount - amount_paid ELSE 0 END) AS amount_90_plus_days
        FROM ${this.invoicesTable}
        ${whereClause}
      `;
      
      const result = await this.db.get(query, params);
      
      // Get top overdue clients if not filtered by client
      let topOverdueClients = [];
      if (!clientId) {
        const clientQuery = `
          SELECT
            c.id,
            c.name,
            COUNT(i.id) AS overdue_count,
            SUM(i.total_amount - i.amount_paid) AS overdue_amount,
            AVG(JULIANDAY('now') - JULIANDAY(i.due_date)) AS avg_days_overdue
          FROM ${this.invoicesTable} i
          JOIN ${this.clientsTable} c ON i.client_id = c.id
          WHERE i.status = 'overdue'
          GROUP BY c.id, c.name
          ORDER BY overdue_amount DESC
          LIMIT 5
        `;
        
        topOverdueClients = await this.db.all(clientQuery);
      }
      
      const analytics = {
        summary: {
          overdue_count: result.overdue_count || 0,
          overdue_amount: result.overdue_amount || 0,
          avg_days_overdue: result.avg_days_overdue ? Math.round(result.avg_days_overdue) : 0
        },
        aging: {
          '1-30_days': {
            count: result.overdue_30_days || 0,
            amount: result.amount_30_days || 0
          },
          '31-60_days': {
            count: result.overdue_60_days || 0,
            amount: result.amount_60_days || 0
          },
          '61-90_days': {
            count: result.overdue_90_days || 0,
            amount: result.amount_90_days || 0
          },
          '90+_days': {
            count: result.overdue_90_plus_days || 0,
            amount: result.amount_90_plus_days || 0
          }
        },
        top_overdue_clients: topOverdueClients
      };
      
      // Cache result
      this._cacheData(cacheKey, analytics);
      
      return analytics;
    } catch (error) {
      logger.error('Error getting overdue invoice analytics:', error);
      throw { status: 500, message: 'Failed to retrieve overdue analytics' };
    }
  }

  /**
   * Format period label based on format
   * @private
   * @param {string} period - Period string
   * @param {string} format - Format string
   * @returns {string} - Formatted period label
   */
  _formatPeriodLabel(period, format) {
    // Simple implementation - in a real app, use a date library like moment.js
    return period;
  }

  /**
   * Cache data with TTL
   * @private
   * @param {string} key - Cache key
   * @param {any} data - Data to cache
   */
  _cacheData(key, data) {
    this.analyticsCache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Get cached data if not expired
   * @private
   * @param {string} key - Cache key
   * @returns {any|null} - Cached data or null if expired/not found
   */
  _getCachedData(key) {
    const cached = this.analyticsCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }
    return null;
  }

  /**
   * Clear analytics cache
   * @param {string} key - Specific cache key to clear (optional)
   */
  clearCache(key = null) {
    if (key) {
      this.analyticsCache.delete(key);
    } else {
      this.analyticsCache.clear();
    }
  }
}

module.exports = new InvoiceAnalyticsService(); 