/**
 * Client Data Controller
 * 
 * Handles client data import/export operations via API endpoints
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const clientDataService = require('../services/ClientDataService');
const logger = require('../utils/logger');

// Configure multer storage for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/tmp');
    
    // Create the directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// Configure file filter to only allow CSV and vCard files
const fileFilter = (req, file, cb) => {
  const allowedExtensions = ['.csv', '.vcf', '.vcard'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV and vCard files are allowed'));
  }
};

// Create multer upload instance
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

class ClientDataController {
  /**
   * Upload handler middleware for CSV import
   */
  uploadCSV() {
    return upload.single('csv_file');
  }
  
  /**
   * Upload handler middleware for vCard import
   */
  uploadVCard() {
    return upload.single('vcard_file');
  }
  
  /**
   * Import clients from CSV file
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async importCSV(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'missing_file',
          message: 'No CSV file was uploaded'
        });
      }
      
      // Get file path
      const filePath = req.file.path;
      
      // Read file content
      const fileContent = fs.readFileSync(filePath, 'utf8');
      
      // Parse options from request
      const options = {
        skipHeader: req.body.skip_header !== 'false', // Default to true
        updateExisting: req.body.update_existing === 'true',
        delimiter: req.body.delimiter || ','
      };
      
      // Process CSV import
      const result = await clientDataService.importFromCSV(fileContent, options);
      
      // Clean up uploaded file
      fs.unlinkSync(filePath);
      
      if (result.success) {
        return res.json({
          success: true,
          message: `Successfully imported ${result.imported} clients, skipped ${result.skipped} clients`,
          data: {
            imported: result.imported,
            skipped: result.skipped,
            errors: result.errors
          }
        });
      } else {
        return res.status(400).json({
          success: false,
          error: 'import_failed',
          message: 'Failed to import clients',
          data: {
            imported: result.imported,
            skipped: result.skipped,
            errors: result.errors
          }
        });
      }
    } catch (error) {
      logger.error(`Error importing CSV: ${error.message}`, { error });
      
      // Clean up uploaded file if it exists
      if (req.file && req.file.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (e) {
          logger.error(`Error deleting uploaded file: ${e.message}`);
        }
      }
      
      return res.status(500).json({
        success: false,
        error: 'server_error',
        message: `Error importing CSV: ${error.message}`
      });
    }
  }
  
  /**
   * Import clients from vCard file
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async importVCard(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'missing_file',
          message: 'No vCard file was uploaded'
        });
      }
      
      // Get file path
      const filePath = req.file.path;
      
      // Read file content
      const fileContent = fs.readFileSync(filePath, 'utf8');
      
      // Parse options from request
      const options = {
        updateExisting: req.body.update_existing === 'true'
      };
      
      // Process vCard import
      const result = await clientDataService.importFromVCard(fileContent, options);
      
      // Clean up uploaded file
      fs.unlinkSync(filePath);
      
      if (result.success) {
        return res.json({
          success: true,
          message: `Successfully imported ${result.imported} clients, skipped ${result.skipped} clients`,
          data: {
            imported: result.imported,
            skipped: result.skipped,
            errors: result.errors
          }
        });
      } else {
        return res.status(400).json({
          success: false,
          error: 'import_failed',
          message: 'Failed to import clients',
          data: {
            imported: result.imported,
            skipped: result.skipped,
            errors: result.errors
          }
        });
      }
    } catch (error) {
      logger.error(`Error importing vCard: ${error.message}`, { error });
      
      // Clean up uploaded file if it exists
      if (req.file && req.file.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (e) {
          logger.error(`Error deleting uploaded file: ${e.message}`);
        }
      }
      
      return res.status(500).json({
        success: false,
        error: 'server_error',
        message: `Error importing vCard: ${error.message}`
      });
    }
  }
  
  /**
   * Export all clients as CSV
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async exportCSV(req, res) {
    try {
      // Parse options from request
      const options = {
        includeHeader: req.query.include_header !== 'false', // Default to true
        delimiter: req.query.delimiter || ','
      };
      
      // Generate CSV data
      const csvData = await clientDataService.exportToCSV(options);
      
      // Set headers for file download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="clients.csv"');
      
      // Send CSV data
      return res.send(csvData);
    } catch (error) {
      logger.error(`Error exporting to CSV: ${error.message}`, { error });
      
      return res.status(500).json({
        success: false,
        error: 'server_error',
        message: `Error exporting to CSV: ${error.message}`
      });
    }
  }
  
  /**
   * Export single client as vCard
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async exportVCard(req, res) {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'missing_id',
          message: 'Client ID is required'
        });
      }
      
      // Generate vCard data
      const vCardData = await clientDataService.exportToVCard(id);
      
      // Set headers for file download
      res.setHeader('Content-Type', 'text/vcard');
      res.setHeader('Content-Disposition', `attachment; filename="client_${id}.vcf"`);
      
      // Send vCard data
      return res.send(vCardData);
    } catch (error) {
      logger.error(`Error exporting to vCard: ${error.message}`, { error, clientId: req.params.id });
      
      return res.status(500).json({
        success: false,
        error: 'server_error',
        message: `Error exporting to vCard: ${error.message}`
      });
    }
  }
  
  /**
   * Export all clients as vCards (in a zip file)
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async exportAllVCards(req, res) {
    try {
      const Client = require('../models/Client');
      const AdmZip = require('adm-zip');
      
      // Get all clients
      const clients = await Client.findAll();
      
      if (!clients || clients.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'no_clients',
          message: 'No clients found to export'
        });
      }
      
      // Create a zip file
      const zip = new AdmZip();
      
      // Add each client as a vCard
      for (const client of clients) {
        try {
          const vCardData = await clientDataService.exportToVCard(client.id);
          zip.addFile(`client_${client.id}_${client.name.replace(/[^a-z0-9]/gi, '_')}.vcf`, Buffer.from(vCardData));
        } catch (error) {
          logger.warn(`Error exporting client ${client.id} to vCard: ${error.message}`);
          // Continue with other clients
        }
      }
      
      // Generate zip buffer
      const zipBuffer = zip.toBuffer();
      
      // Set headers for file download
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="all_clients.zip"');
      
      // Send zip data
      return res.send(zipBuffer);
    } catch (error) {
      logger.error(`Error exporting all clients to vCards: ${error.message}`, { error });
      
      return res.status(500).json({
        success: false,
        error: 'server_error',
        message: `Error exporting all clients to vCards: ${error.message}`
      });
    }
  }
  
  /**
   * Generate client activity report
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async generateReport(req, res) {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'missing_id',
          message: 'Client ID is required'
        });
      }
      
      // Parse options from request
      const options = {
        includeTasksCount: req.query.include_tasks_count !== 'false', // Default to true
        includeTasksDetails: req.query.include_tasks_details === 'true', // Default to false
        includeInvoicesCount: req.query.include_invoices_count !== 'false', // Default to true
        includeInvoicesDetails: req.query.include_invoices_details === 'true', // Default to false
        from_date: req.query.from_date || null,
        to_date: req.query.to_date || null
      };
      
      // Generate report
      const report = await clientDataService.generateClientReport(id, options);
      
      // Check if PDF format requested
      if (req.query.format === 'pdf') {
        // This would require a PDF generation library
        // For simplicity, we're just returning JSON in this example
        return res.status(400).json({
          success: false,
          error: 'not_implemented',
          message: 'PDF format is not yet supported, use JSON instead'
        });
      }
      
      return res.json({
        success: true,
        data: report
      });
    } catch (error) {
      logger.error(`Error generating client report: ${error.message}`, { error, clientId: req.params.id });
      
      return res.status(500).json({
        success: false,
        error: 'server_error',
        message: `Error generating client report: ${error.message}`
      });
    }
  }
}

module.exports = new ClientDataController(); 