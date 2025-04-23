/**
 * Client Data Service
 * 
 * Provides functionality for importing and exporting client data
 * - CSV import for bulk client addition
 * - vCard/address book integration
 * - Contact information export
 * - Client reporting with activity summaries
 */

const fs = require('fs');
const path = require('path');
const { parse, unparse } = require('csv-parse/sync');
const vCardsJS = require('vcards-js');
const Client = require('../models/Client');
const logger = require('../utils/logger');
const { getDatabase } = require('../database');

class ClientDataService {
  /**
   * Import clients from CSV file
   * @param {string|Buffer} csvData - CSV file content as string or buffer
   * @param {Object} options - Import options
   * @returns {Promise<{success: boolean, imported: number, errors: Array, skipped: number}>}
   */
  async importFromCSV(csvData, options = {}) {
    try {
      // Default options
      const defaultOptions = {
        skipHeader: true,
        updateExisting: false,
        columns: ['name', 'email', 'phone', 'address', 'notes'],
        delimiter: ',',
      };
      
      const importOptions = { ...defaultOptions, ...options };
      
      // Parse CSV data
      const records = parse(csvData, {
        columns: importOptions.columns,
        skip_empty_lines: true,
        from_line: importOptions.skipHeader ? 2 : 1,
        delimiter: importOptions.delimiter,
        trim: true
      });
      
      if (!records || records.length === 0) {
        return {
          success: false,
          imported: 0,
          skipped: 0,
          errors: [{
            row: 0,
            message: 'No valid records found in CSV'
          }]
        };
      }
      
      // Process records
      const result = {
        success: true,
        imported: 0,
        skipped: 0,
        errors: []
      };
      
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        
        // Validate required fields
        if (!record.name) {
          result.errors.push({
            row: i + (importOptions.skipHeader ? 2 : 1),
            message: 'Name is required',
            data: record
          });
          continue;
        }
        
        try {
          // Check if client with email already exists
          let existingClient = null;
          if (record.email) {
            existingClient = await Client.findByEmail(record.email);
          }
          
          if (existingClient && !importOptions.updateExisting) {
            result.skipped++;
            continue;
          }
          
          const clientData = {
            name: record.name,
            email: record.email || '',
            phone: record.phone || '',
            address: record.address || '',
            notes: record.notes || ''
          };
          
          if (existingClient && importOptions.updateExisting) {
            // Update existing client
            Object.assign(existingClient, clientData);
            await existingClient.save();
            result.imported++;
          } else {
            // Create new client
            const client = new Client(clientData);
            await client.save();
            result.imported++;
          }
        } catch (error) {
          result.errors.push({
            row: i + (importOptions.skipHeader ? 2 : 1),
            message: error.message,
            data: record
          });
        }
      }
      
      logger.info(`CSV import completed: ${result.imported} imported, ${result.skipped} skipped, ${result.errors.length} errors`);
      
      return result;
    } catch (error) {
      logger.error(`Error importing CSV: ${error.message}`, { error });
      
      return {
        success: false,
        imported: 0,
        skipped: 0,
        errors: [{
          row: 0,
          message: `CSV parsing error: ${error.message}`
        }]
      };
    }
  }
  
  /**
   * Export all clients to CSV
   * @param {Object} options - Export options
   * @returns {Promise<string>} CSV data as string
   */
  async exportToCSV(options = {}) {
    try {
      // Default options
      const defaultOptions = {
        includeHeader: true,
        columns: ['id', 'name', 'email', 'phone', 'address', 'notes', 'created_at', 'updated_at'],
        delimiter: ',',
      };
      
      const exportOptions = { ...defaultOptions, ...options };
      
      // Get all clients
      const clients = await Client.findAll();
      
      // Generate CSV
      const csvData = unparse(clients, {
        columns: exportOptions.columns,
        header: exportOptions.includeHeader,
        delimiter: exportOptions.delimiter
      });
      
      return csvData;
    } catch (error) {
      logger.error(`Error exporting to CSV: ${error.message}`, { error });
      throw error;
    }
  }
  
  /**
   * Import clients from vCard file
   * @param {string|Buffer} vCardData - vCard file content as string or buffer
   * @param {Object} options - Import options
   * @returns {Promise<{success: boolean, imported: number, errors: Array, skipped: number}>}
   */
  async importFromVCard(vCardData, options = {}) {
    try {
      // Default options
      const defaultOptions = {
        updateExisting: false
      };
      
      const importOptions = { ...defaultOptions, ...options };
      
      // Parse vCard data
      // This is a simplified implementation - a real implementation would use a vCard parser library
      const vCardLines = vCardData.toString().split('\n');
      const records = [];
      let currentRecord = {};
      
      for (const line of vCardLines) {
        const trimmedLine = line.trim();
        
        if (trimmedLine === 'BEGIN:VCARD') {
          currentRecord = {};
        } else if (trimmedLine === 'END:VCARD') {
          records.push(currentRecord);
        } else if (trimmedLine.includes(':')) {
          const [key, value] = trimmedLine.split(':', 2);
          
          if (key === 'FN') {
            currentRecord.name = value;
          } else if (key === 'EMAIL') {
            currentRecord.email = value;
          } else if (key === 'TEL') {
            currentRecord.phone = value;
          } else if (key === 'ADR') {
            currentRecord.address = value.replace(/;/g, ' ').trim();
          } else if (key === 'NOTE') {
            currentRecord.notes = value;
          }
        }
      }
      
      // Process records
      const result = {
        success: true,
        imported: 0,
        skipped: 0,
        errors: []
      };
      
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        
        // Validate required fields
        if (!record.name) {
          result.errors.push({
            index: i,
            message: 'Name is required',
            data: record
          });
          continue;
        }
        
        try {
          // Check if client with email already exists
          let existingClient = null;
          if (record.email) {
            existingClient = await Client.findByEmail(record.email);
          }
          
          if (existingClient && !importOptions.updateExisting) {
            result.skipped++;
            continue;
          }
          
          const clientData = {
            name: record.name,
            email: record.email || '',
            phone: record.phone || '',
            address: record.address || '',
            notes: record.notes || ''
          };
          
          if (existingClient && importOptions.updateExisting) {
            // Update existing client
            Object.assign(existingClient, clientData);
            await existingClient.save();
            result.imported++;
          } else {
            // Create new client
            const client = new Client(clientData);
            await client.save();
            result.imported++;
          }
        } catch (error) {
          result.errors.push({
            index: i,
            message: error.message,
            data: record
          });
        }
      }
      
      logger.info(`vCard import completed: ${result.imported} imported, ${result.skipped} skipped, ${result.errors.length} errors`);
      
      return result;
    } catch (error) {
      logger.error(`Error importing vCard: ${error.message}`, { error });
      
      return {
        success: false,
        imported: 0,
        skipped: 0,
        errors: [{
          index: 0,
          message: `vCard parsing error: ${error.message}`
        }]
      };
    }
  }
  
  /**
   * Export client as vCard
   * @param {number} clientId - Client ID
   * @returns {Promise<string>} vCard data as string
   */
  async exportToVCard(clientId) {
    try {
      // Get client
      const client = await Client.getById(clientId);
      
      if (!client) {
        throw new Error('Client not found');
      }
      
      // Create vCard
      const vCard = vCardsJS();
      
      // Set properties
      vCard.firstName = client.name.split(' ')[0] || '';
      vCard.lastName = client.name.split(' ').slice(1).join(' ') || '';
      vCard.organization = client.company || '';
      vCard.workEmail = client.email || '';
      vCard.workPhone = client.phone || '';
      
      // Handle address if present
      if (client.address) {
        const addressParts = client.address.split(',').map(part => part.trim());
        
        if (addressParts.length >= 3) {
          vCard.workAddress.street = addressParts[0] || '';
          vCard.workAddress.city = addressParts[1] || '';
          vCard.workAddress.stateProvince = addressParts[2] || '';
          
          if (addressParts.length > 3) {
            vCard.workAddress.postalCode = addressParts[3] || '';
          }
        } else {
          vCard.workAddress.street = client.address;
        }
      }
      
      // Add notes
      if (client.notes) {
        vCard.note = client.notes;
      }
      
      // Generate vCard string
      return vCard.getFormattedString();
    } catch (error) {
      logger.error(`Error exporting to vCard: ${error.message}`, { error });
      throw error;
    }
  }
  
  /**
   * Generate client activity report
   * @param {number} clientId - Client ID
   * @param {Object} options - Report options
   * @returns {Promise<Object>} Report data
   */
  async generateClientReport(clientId, options = {}) {
    try {
      // Default options
      const defaultOptions = {
        includeTasksCount: true,
        includeTasksDetails: true,
        includeInvoicesCount: true,
        includeInvoicesDetails: true,
        from_date: null,
        to_date: null
      };
      
      const reportOptions = { ...defaultOptions, ...options };
      
      // Get client
      const client = await Client.getById(clientId);
      
      if (!client) {
        throw new Error('Client not found');
      }
      
      // Initialize report
      const report = {
        client: {
          id: client.id,
          name: client.name,
          email: client.email,
          phone: client.phone,
          address: client.address,
          created_at: client.created_at
        },
        generated_at: new Date().toISOString(),
        filter_period: {
          from: reportOptions.from_date,
          to: reportOptions.to_date
        },
        summary: {},
        tasks: null,
        invoices: null
      };
      
      // Get tasks and invoices
      const tasks = reportOptions.includeTasksCount || reportOptions.includeTasksDetails ? 
        await client.getTasks() : [];
        
      const invoices = reportOptions.includeInvoicesCount || reportOptions.includeInvoicesDetails ? 
        await client.getInvoices() : [];
      
      // Apply date filters if provided
      let filteredTasks = [...tasks];
      let filteredInvoices = [...invoices];
      
      if (reportOptions.from_date) {
        const fromDate = new Date(reportOptions.from_date);
        filteredTasks = filteredTasks.filter(task => new Date(task.created_at) >= fromDate);
        filteredInvoices = filteredInvoices.filter(invoice => new Date(invoice.created_at) >= fromDate);
      }
      
      if (reportOptions.to_date) {
        const toDate = new Date(reportOptions.to_date);
        filteredTasks = filteredTasks.filter(task => new Date(task.created_at) <= toDate);
        filteredInvoices = filteredInvoices.filter(invoice => new Date(invoice.created_at) <= toDate);
      }
      
      // Build summary
      report.summary = {
        total_tasks: filteredTasks.length,
        tasks_pending: filteredTasks.filter(task => task.status === 'pending').length,
        tasks_completed: filteredTasks.filter(task => task.status === 'completed').length,
        tasks_overdue: filteredTasks.filter(task => {
          return task.status !== 'completed' && 
                 task.due_date && 
                 new Date(task.due_date) < new Date();
        }).length,
        total_invoices: filteredInvoices.length,
        invoices_pending: filteredInvoices.filter(inv => inv.status === 'pending').length,
        invoices_paid: filteredInvoices.filter(inv => inv.status === 'paid').length,
        invoices_overdue: filteredInvoices.filter(inv => inv.status === 'overdue').length,
        total_revenue: filteredInvoices.reduce((sum, inv) => sum + (parseFloat(inv.amount_paid) || 0), 0).toFixed(2),
        outstanding_amount: filteredInvoices.reduce((sum, inv) => {
          const total = parseFloat(inv.total_amount) || 0;
          const paid = parseFloat(inv.amount_paid) || 0;
          return sum + (total - paid);
        }, 0).toFixed(2)
      };
      
      // Add details if requested
      if (reportOptions.includeTasksDetails) {
        report.tasks = filteredTasks.map(task => ({
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          due_date: task.due_date,
          created_at: task.created_at,
          updated_at: task.updated_at
        }));
      }
      
      if (reportOptions.includeInvoicesDetails) {
        report.invoices = filteredInvoices.map(invoice => ({
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          title: invoice.title,
          status: invoice.status,
          total_amount: invoice.total_amount,
          amount_paid: invoice.amount_paid,
          due_date: invoice.due_date,
          created_at: invoice.created_at
        }));
      }
      
      return report;
    } catch (error) {
      logger.error(`Error generating client report: ${error.message}`, { error, clientId });
      throw error;
    }
  }
}

module.exports = new ClientDataService(); 