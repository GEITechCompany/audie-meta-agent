/**
 * API Metrics Service
 * Manages the storage, retrieval, and analysis of API metrics
 */

const { getDatabase } = require('../database');
const logger = require('../utils/logger');

class ApiMetricsService {
  /**
   * Record an API call metric to the database
   * @param {Object} metric - API call metric details
   * @returns {Promise<Object>} The saved metric record
   */
  static async recordApiCall(metric) {
    try {
      const {
        endpoint,
        method = 'GET',
        status,
        source,
        is_mock = false,
        duration = null,
        error_type = null,
        error_message = null,
        request_data = null,
        response_data = null
      } = metric;
      
      // Validate required fields
      if (!endpoint || !source) {
        logger.error('API metric missing required fields', {
          metadata: {
            source: 'ApiMetricsService',
            metric
          }
        });
        return null;
      }
      
      const db = getDatabase();
      
      // Store string version of request/response data if provided
      const requestDataStr = request_data ? JSON.stringify(request_data) : null;
      const responseDataStr = response_data ? JSON.stringify(response_data) : null;
      
      return new Promise((resolve, reject) => {
        const query = `
          INSERT INTO api_metrics (
            endpoint, method, status, source, is_mock, 
            duration, error_type, error_message, 
            request_data, response_data, timestamp
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `;
        
        db.run(
          query, 
          [
            endpoint,
            method,
            status,
            source,
            is_mock ? 1 : 0,
            duration,
            error_type,
            error_message,
            requestDataStr,
            responseDataStr
          ],
          function(err) {
            if (err) {
              logger.error(`Error recording API metric: ${err.message}`);
              reject(err);
            } else {
              resolve({
                id: this.lastID,
                ...metric
              });
            }
          }
        );
      });
    } catch (error) {
      logger.error(`Failed to record API metric: ${error.message}`, {
        metadata: {
          stack: error.stack
        }
      });
      return null;
    }
  }

  /**
   * Update or create daily API metrics summary
   * @param {Object} summary - API call summary details 
   * @returns {Promise<Object>} The updated/created summary record
   */
  static async updateDailySummary(summary) {
    try {
      const {
        endpoint,
        date = new Date().toISOString().split('T')[0],
        total_calls = 1,
        successful_calls = 0,
        failed_calls = 0,
        mock_calls = 0,
        real_calls = 0,
        avg_duration = null,
        max_duration = null,
        min_duration = null
      } = summary;
      
      // Validate required fields
      if (!endpoint) {
        logger.error('API summary missing required fields');
        return null;
      }
      
      const db = getDatabase();
      
      // Check if a summary for this endpoint+date already exists
      return new Promise((resolve, reject) => {
        db.get(
          'SELECT * FROM api_metrics_summary WHERE endpoint = ? AND date = ?',
          [endpoint, date],
          (err, row) => {
            if (err) {
              logger.error(`Error checking API metrics summary: ${err.message}`);
              reject(err);
              return;
            }
            
            if (row) {
              // Update existing summary
              const query = `
                UPDATE api_metrics_summary 
                SET 
                  total_calls = total_calls + ?,
                  successful_calls = successful_calls + ?,
                  failed_calls = failed_calls + ?,
                  mock_calls = mock_calls + ?,
                  real_calls = real_calls + ?,
                  avg_duration = ?,
                  max_duration = ?,
                  min_duration = ?,
                  updated_at = CURRENT_TIMESTAMP
                WHERE endpoint = ? AND date = ?
              `;
              
              db.run(
                query,
                [
                  total_calls,
                  successful_calls,
                  failed_calls,
                  mock_calls,
                  real_calls,
                  avg_duration,
                  max_duration,
                  min_duration,
                  endpoint,
                  date
                ],
                function(err) {
                  if (err) {
                    logger.error(`Error updating API metrics summary: ${err.message}`);
                    reject(err);
                  } else {
                    resolve({
                      id: row.id,
                      endpoint,
                      date,
                      total_calls: row.total_calls + total_calls,
                      successful_calls: row.successful_calls + successful_calls,
                      failed_calls: row.failed_calls + failed_calls,
                      mock_calls: row.mock_calls + mock_calls,
                      real_calls: row.real_calls + real_calls,
                      avg_duration,
                      max_duration,
                      min_duration
                    });
                  }
                }
              );
            } else {
              // Create new summary
              const query = `
                INSERT INTO api_metrics_summary (
                  endpoint, date, total_calls, successful_calls, 
                  failed_calls, mock_calls, real_calls,
                  avg_duration, max_duration, min_duration, 
                  created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
              `;
              
              db.run(
                query,
                [
                  endpoint,
                  date,
                  total_calls,
                  successful_calls,
                  failed_calls,
                  mock_calls,
                  real_calls,
                  avg_duration,
                  max_duration,
                  min_duration
                ],
                function(err) {
                  if (err) {
                    logger.error(`Error creating API metrics summary: ${err.message}`);
                    reject(err);
                  } else {
                    resolve({
                      id: this.lastID,
                      endpoint,
                      date,
                      total_calls,
                      successful_calls,
                      failed_calls,
                      mock_calls,
                      real_calls,
                      avg_duration,
                      max_duration,
                      min_duration
                    });
                  }
                }
              );
            }
          }
        );
      });
    } catch (error) {
      logger.error(`Failed to update API metrics summary: ${error.message}`, {
        metadata: {
          stack: error.stack
        }
      });
      return null;
    }
  }

  /**
   * Get API metrics for a specific period
   * @param {Object} options - Query options
   * @returns {Promise<Array>} List of API metrics
   */
  static async getApiMetrics(options = {}) {
    try {
      const {
        startDate = null,
        endDate = null,
        endpoint = null,
        source = null,
        is_mock = null,
        limit = 100,
        offset = 0
      } = options;
      
      const db = getDatabase();
      
      // Build query conditions
      const conditions = [];
      const params = [];
      
      if (startDate) {
        conditions.push('timestamp >= ?');
        params.push(startDate);
      }
      
      if (endDate) {
        conditions.push('timestamp <= ?');
        params.push(endDate);
      }
      
      if (endpoint) {
        conditions.push('endpoint = ?');
        params.push(endpoint);
      }
      
      if (source) {
        conditions.push('source = ?');
        params.push(source);
      }
      
      if (is_mock !== null) {
        conditions.push('is_mock = ?');
        params.push(is_mock ? 1 : 0);
      }
      
      // Build query
      let query = 'SELECT * FROM api_metrics';
      
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      
      query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      
      return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
          if (err) {
            logger.error(`Error getting API metrics: ${err.message}`);
            reject(err);
          } else {
            resolve(rows.map(row => ({
              ...row,
              is_mock: !!row.is_mock,
              request_data: row.request_data ? JSON.parse(row.request_data) : null,
              response_data: row.response_data ? JSON.parse(row.response_data) : null
            })));
          }
        });
      });
    } catch (error) {
      logger.error(`Failed to get API metrics: ${error.message}`, {
        metadata: {
          stack: error.stack
        }
      });
      return [];
    }
  }

  /**
   * Get API metrics summaries for analysis
   * @param {Object} options - Query options
   * @returns {Promise<Array>} List of API metrics summaries
   */
  static async getMetricsSummary(options = {}) {
    try {
      const {
        startDate = null,
        endDate = null,
        endpoint = null,
        groupBy = 'endpoint' // 'endpoint' or 'date'
      } = options;
      
      const db = getDatabase();
      
      // Build query conditions
      const conditions = [];
      const params = [];
      
      if (startDate) {
        conditions.push('date >= ?');
        params.push(startDate);
      }
      
      if (endDate) {
        conditions.push('date <= ?');
        params.push(endDate);
      }
      
      if (endpoint) {
        conditions.push('endpoint = ?');
        params.push(endpoint);
      }
      
      // Build query
      let query = 'SELECT * FROM api_metrics_summary';
      
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      
      query += ` ORDER BY ${groupBy === 'date' ? 'date' : 'endpoint'}, total_calls DESC`;
      
      return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
          if (err) {
            logger.error(`Error getting API metrics summary: ${err.message}`);
            reject(err);
          } else {
            resolve(rows);
          }
        });
      });
    } catch (error) {
      logger.error(`Failed to get API metrics summary: ${error.message}`, {
        metadata: {
          stack: error.stack
        }
      });
      return [];
    }
  }

  /**
   * Calculate real-time vs mock data usage statistics
   * @returns {Promise<Object>} Statistics object
   */
  static async getRealVsMockStats() {
    try {
      const db = getDatabase();
      
      return new Promise((resolve, reject) => {
        const query = `
          SELECT 
            SUM(CASE WHEN is_mock = 1 THEN 1 ELSE 0 END) AS mock_count,
            SUM(CASE WHEN is_mock = 0 THEN 1 ELSE 0 END) AS real_count,
            COUNT(*) AS total_count,
            (SUM(CASE WHEN is_mock = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*)) AS mock_percentage,
            (SUM(CASE WHEN is_mock = 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*)) AS real_percentage,
            endpoint,
            source
          FROM api_metrics
          GROUP BY endpoint, source
          ORDER BY total_count DESC
        `;
        
        db.all(query, [], (err, rows) => {
          if (err) {
            logger.error(`Error getting real vs mock stats: ${err.message}`);
            reject(err);
          } else {
            // Calculate overall stats
            let totalMock = 0;
            let totalReal = 0;
            
            rows.forEach(row => {
              totalMock += row.mock_count;
              totalReal += row.real_count;
            });
            
            const totalCalls = totalMock + totalReal;
            
            resolve({
              overall: {
                totalCalls,
                mockCount: totalMock,
                realCount: totalReal,
                mockPercentage: totalCalls > 0 ? (totalMock / totalCalls * 100).toFixed(2) : 0,
                realPercentage: totalCalls > 0 ? (totalReal / totalCalls * 100).toFixed(2) : 0
              },
              byEndpoint: rows
            });
          }
        });
      });
    } catch (error) {
      logger.error(`Failed to get real vs mock stats: ${error.message}`, {
        metadata: {
          stack: error.stack
        }
      });
      return {
        overall: {
          totalCalls: 0,
          mockCount: 0,
          realCount: 0,
          mockPercentage: 0,
          realPercentage: 0
        },
        byEndpoint: []
      };
    }
  }

  /**
   * Get error statistics by type and endpoint
   * @returns {Promise<Object>} Error statistics object
   */
  static async getErrorStats() {
    try {
      const db = getDatabase();
      
      return new Promise((resolve, reject) => {
        const query = `
          SELECT 
            error_type,
            COUNT(*) AS error_count,
            endpoint,
            MAX(timestamp) AS last_occurrence
          FROM api_metrics
          WHERE error_type IS NOT NULL
          GROUP BY error_type, endpoint
          ORDER BY error_count DESC
        `;
        
        db.all(query, [], (err, rows) => {
          if (err) {
            logger.error(`Error getting error stats: ${err.message}`);
            reject(err);
          } else {
            // Group by error type
            const byErrorType = {};
            let totalErrors = 0;
            
            rows.forEach(row => {
              totalErrors += row.error_count;
              
              if (!byErrorType[row.error_type]) {
                byErrorType[row.error_type] = {
                  count: 0,
                  byEndpoint: []
                };
              }
              
              byErrorType[row.error_type].count += row.error_count;
              byErrorType[row.error_type].byEndpoint.push({
                endpoint: row.endpoint,
                count: row.error_count,
                lastOccurrence: row.last_occurrence
              });
            });
            
            resolve({
              totalErrors,
              byErrorType
            });
          }
        });
      });
    } catch (error) {
      logger.error(`Failed to get error stats: ${error.message}`, {
        metadata: {
          stack: error.stack
        }
      });
      return {
        totalErrors: 0,
        byErrorType: {}
      };
    }
  }
}

module.exports = ApiMetricsService; 