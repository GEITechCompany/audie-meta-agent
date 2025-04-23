/**
 * PDF Generation Service
 * Handles generation of PDF documents for invoices, estimates, and reports
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const logger = require('../utils/logger');
const { getFormattedDate } = require('../utils/dateFormatter');

class PdfGenerationService {
  constructor() {
    this.templateCache = {};
    this.templatesDir = path.join(__dirname, '../../templates/pdf');
    this.outputDir = path.join(__dirname, '../../temp/pdf');
    
    // Ensure directories exist
    this._ensureDirectories();
  }

  /**
   * Ensure required directories exist
   */
  _ensureDirectories() {
    if (!fs.existsSync(this.templatesDir)) {
      fs.mkdirSync(this.templatesDir, { recursive: true });
    }
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Initialize default templates if they don't exist
   */
  async initializeTemplates() {
    try {
      // Create invoice template
      const invoiceTemplatePath = path.join(this.templatesDir, 'invoice.ejs');
      if (!fs.existsSync(invoiceTemplatePath)) {
        const invoiceTemplate = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice #<%= invoice.invoice_number %></title>
  <style>
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 12px;
      line-height: 1.5;
      color: #333;
      margin: 0;
      padding: 0;
    }
    .invoice-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 30px;
      border: 1px solid #eee;
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.15);
    }
    .invoice-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 20px;
      padding-bottom: 20px;
      border-bottom: 1px solid #ddd;
    }
    .invoice-from, .invoice-to {
      margin-bottom: 30px;
    }
    h1, h2, h3, h4 {
      margin: 5px 0;
      color: #2a4b78;
    }
    h1 {
      font-size: 28px;
    }
    h3 {
      font-size: 16px;
      font-weight: 400;
    }
    h4 {
      font-size: 14px;
      font-weight: 600;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th, td {
      text-align: left;
      padding: 10px;
    }
    th {
      background-color: #f8f8f8;
      font-weight: 500;
      border-bottom: 1px solid #ddd;
    }
    tr:nth-child(even) {
      background-color: #f9f9f9;
    }
    .text-right {
      text-align: right;
    }
    .total-row {
      font-weight: bold;
      border-top: 2px solid #ddd;
    }
    .status-badge {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 20px;
      text-transform: uppercase;
      font-size: 12px;
      font-weight: bold;
      letter-spacing: 1px;
    }
    .status-badge.paid {
      background-color: #d4edda;
      color: #155724;
    }
    .status-badge.pending {
      background-color: #fff3cd;
      color: #856404;
    }
    .status-badge.overdue {
      background-color: #f8d7da;
      color: #721c24;
    }
    .status-badge.partially-paid {
      background-color: #d1ecf1;
      color: #0c5460;
    }
    .invoice-notes {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
    }
    .payment-info {
      margin-top: 20px;
      background-color: #f9f9f9;
      padding: 15px;
      border-radius: 4px;
    }
    .company-logo {
      max-height: 80px;
      max-width: 200px;
      margin-bottom: 10px;
    }
    .footer {
      margin-top: 50px;
      text-align: center;
      color: #777;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <div class="invoice-header">
      <div>
        <% if (company.logo_url) { %>
          <img src="<%= company.logo_url %>" alt="<%= company.name %>" class="company-logo">
        <% } %>
        <h2><%= company.name %></h2>
        <p><%= company.address %></p>
        <p><%= company.phone %></p>
        <p><%= company.email %></p>
      </div>
      <div class="text-right">
        <h1>INVOICE</h1>
        <h3>Invoice #: <%= invoice.invoice_number %></h3>
        <h3>Date: <%= getFormattedDate(invoice.created_at) %></h3>
        <h3>Due Date: <%= getFormattedDate(invoice.due_date) %></h3>
        <div class="status-badge <%= invoice.status.toLowerCase().replace(' ', '-') %>">
          <%= invoice.status %>
        </div>
      </div>
    </div>

    <div class="invoice-to">
      <h4>BILL TO:</h4>
      <p><strong><%= client.name %></strong></p>
      <% if (client.address) { %><p><%= client.address %></p><% } %>
      <% if (client.phone) { %><p>Phone: <%= client.phone %></p><% } %>
      <% if (client.email) { %><p>Email: <%= client.email %></p><% } %>
    </div>

    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th>Description</th>
          <th>Quantity</th>
          <th>Unit Price</th>
          <th class="text-right">Amount</th>
        </tr>
      </thead>
      <tbody>
        <% items.forEach(function(item, index) { %>
          <tr>
            <td><%= index + 1 %></td>
            <td><%= item.description %></td>
            <td><%= item.quantity %></td>
            <td>$<%= item.unit_price.toFixed(2) %></td>
            <td class="text-right">$<%= item.amount.toFixed(2) %></td>
          </tr>
        <% }); %>
        <% if (invoice.tax_rate && invoice.tax_rate > 0) { %>
          <tr>
            <td colspan="4" class="text-right">Subtotal:</td>
            <td class="text-right">$<%= invoice.subtotal.toFixed(2) %></td>
          </tr>
          <tr>
            <td colspan="4" class="text-right">Tax (<%= invoice.tax_rate %>%):</td>
            <td class="text-right">$<%= invoice.tax_amount.toFixed(2) %></td>
          </tr>
        <% } %>
        <tr class="total-row">
          <td colspan="4" class="text-right">Total:</td>
          <td class="text-right">$<%= invoice.total_amount.toFixed(2) %></td>
        </tr>
        <% if (invoice.amount_paid > 0) { %>
          <tr>
            <td colspan="4" class="text-right">Amount Paid:</td>
            <td class="text-right">$<%= invoice.amount_paid.toFixed(2) %></td>
          </tr>
          <tr>
            <td colspan="4" class="text-right">Balance Due:</td>
            <td class="text-right">$<%= (invoice.total_amount - invoice.amount_paid).toFixed(2) %></td>
          </tr>
        <% } %>
      </tbody>
    </table>

    <% if (invoice.notes) { %>
      <div class="invoice-notes">
        <h4>Notes:</h4>
        <p><%= invoice.notes %></p>
      </div>
    <% } %>

    <div class="payment-info">
      <h4>Payment Information:</h4>
      <% if (paymentMethods && paymentMethods.length > 0) { %>
        <% paymentMethods.forEach(function(method) { %>
          <p><strong><%= method.name %>:</strong> <%= method.details %></p>
        <% }); %>
      <% } else { %>
        <p>Please make payment by the due date.</p>
      <% } %>
    </div>

    <div class="footer">
      <p>&copy; <%= new Date().getFullYear() %> <%= company.name %>. All rights reserved.</p>
      <% if (company.website) { %><p><%= company.website %></p><% } %>
    </div>
  </div>
</body>
</html>`;
        fs.writeFileSync(invoiceTemplatePath, invoiceTemplate);
      }

      // Create estimate template
      const estimateTemplatePath = path.join(this.templatesDir, 'estimate.ejs');
      if (!fs.existsSync(estimateTemplatePath)) {
        const estimateTemplate = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Estimate #<%= estimate.estimate_number %></title>
  <style>
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 12px;
      line-height: 1.5;
      color: #333;
      margin: 0;
      padding: 0;
    }
    .estimate-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 30px;
      border: 1px solid #eee;
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.15);
    }
    .estimate-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 20px;
      padding-bottom: 20px;
      border-bottom: 1px solid #ddd;
    }
    .estimate-from, .estimate-to {
      margin-bottom: 30px;
    }
    h1, h2, h3, h4 {
      margin: 5px 0;
      color: #2a4b78;
    }
    h1 {
      font-size: 28px;
    }
    h3 {
      font-size: 16px;
      font-weight: 400;
    }
    h4 {
      font-size: 14px;
      font-weight: 600;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th, td {
      text-align: left;
      padding: 10px;
    }
    th {
      background-color: #f8f8f8;
      font-weight: 500;
      border-bottom: 1px solid #ddd;
    }
    tr:nth-child(even) {
      background-color: #f9f9f9;
    }
    .text-right {
      text-align: right;
    }
    .total-row {
      font-weight: bold;
      border-top: 2px solid #ddd;
    }
    .status-badge {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 20px;
      text-transform: uppercase;
      font-size: 12px;
      font-weight: bold;
      letter-spacing: 1px;
    }
    .status-badge.approved {
      background-color: #d4edda;
      color: #155724;
    }
    .status-badge.pending {
      background-color: #fff3cd;
      color: #856404;
    }
    .status-badge.declined {
      background-color: #f8d7da;
      color: #721c24;
    }
    .status-badge.draft {
      background-color: #e2e3e5;
      color: #383d41;
    }
    .estimate-notes {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
    }
    .valid-until {
      margin-top: 20px;
      background-color: #f9f9f9;
      padding: 15px;
      border-radius: 4px;
    }
    .company-logo {
      max-height: 80px;
      max-width: 200px;
      margin-bottom: 10px;
    }
    .footer {
      margin-top: 50px;
      text-align: center;
      color: #777;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="estimate-container">
    <div class="estimate-header">
      <div>
        <% if (company.logo_url) { %>
          <img src="<%= company.logo_url %>" alt="<%= company.name %>" class="company-logo">
        <% } %>
        <h2><%= company.name %></h2>
        <p><%= company.address %></p>
        <p><%= company.phone %></p>
        <p><%= company.email %></p>
      </div>
      <div class="text-right">
        <h1>ESTIMATE</h1>
        <h3>Estimate #: <%= estimate.estimate_number %></h3>
        <h3>Date: <%= getFormattedDate(estimate.created_at) %></h3>
        <h3>Valid Until: <%= getFormattedDate(estimate.valid_until) %></h3>
        <div class="status-badge <%= estimate.status.toLowerCase() %>">
          <%= estimate.status %>
        </div>
      </div>
    </div>

    <div class="estimate-to">
      <h4>PREPARED FOR:</h4>
      <p><strong><%= client.name %></strong></p>
      <% if (client.address) { %><p><%= client.address %></p><% } %>
      <% if (client.phone) { %><p>Phone: <%= client.phone %></p><% } %>
      <% if (client.email) { %><p>Email: <%= client.email %></p><% } %>
    </div>

    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th>Description</th>
          <th>Quantity</th>
          <th>Unit Price</th>
          <th class="text-right">Amount</th>
        </tr>
      </thead>
      <tbody>
        <% items.forEach(function(item, index) { %>
          <tr>
            <td><%= index + 1 %></td>
            <td><%= item.description %></td>
            <td><%= item.quantity %></td>
            <td>$<%= item.unit_price.toFixed(2) %></td>
            <td class="text-right">$<%= item.amount.toFixed(2) %></td>
          </tr>
        <% }); %>
        <% if (estimate.tax_rate && estimate.tax_rate > 0) { %>
          <tr>
            <td colspan="4" class="text-right">Subtotal:</td>
            <td class="text-right">$<%= estimate.subtotal.toFixed(2) %></td>
          </tr>
          <tr>
            <td colspan="4" class="text-right">Tax (<%= estimate.tax_rate %>%):</td>
            <td class="text-right">$<%= estimate.tax_amount.toFixed(2) %></td>
          </tr>
        <% } %>
        <tr class="total-row">
          <td colspan="4" class="text-right">Total:</td>
          <td class="text-right">$<%= estimate.total_amount.toFixed(2) %></td>
        </tr>
      </tbody>
    </table>

    <% if (estimate.notes) { %>
      <div class="estimate-notes">
        <h4>Notes:</h4>
        <p><%= estimate.notes %></p>
      </div>
    <% } %>

    <div class="valid-until">
      <p><strong>This estimate is valid until <%= getFormattedDate(estimate.valid_until) %></strong></p>
      <p>To approve this estimate, please contact us or visit: <%= approvalUrl %></p>
    </div>

    <div class="footer">
      <p>&copy; <%= new Date().getFullYear() %> <%= company.name %>. All rights reserved.</p>
      <% if (company.website) { %><p><%= company.website %></p><% } %>
    </div>
  </div>
</body>
</html>`;
        fs.writeFileSync(estimateTemplatePath, estimateTemplate);
      }
      
      logger.info('PDF templates created successfully');
    } catch (error) {
      logger.error(`Error initializing PDF templates: ${error.message}`);
      throw error;
    }
  }

  /**
   * Render a template with provided data
   * @param {string} templateName - Name of the template (without .ejs extension)
   * @param {Object} data - Data to be rendered in the template
   * @returns {Promise<string>} - Rendered HTML content
   */
  async renderTemplate(templateName, data) {
    try {
      // Ensure template directory and templates exist
      await this.initializeTemplates();
      
      const templatePath = path.join(this.templatesDir, `${templateName}.ejs`);
      
      if (!fs.existsSync(templatePath)) {
        throw new Error(`Template not found: ${templateName}`);
      }
      
      // Add utility functions to data
      data.getFormattedDate = getFormattedDate;
      
      // Check if template is cached
      if (!this.templateCache[templateName]) {
        const template = fs.readFileSync(templatePath, 'utf8');
        this.templateCache[templateName] = template;
      }
      
      const html = ejs.render(this.templateCache[templateName], data);
      return html;
    } catch (error) {
      logger.error(`Error rendering template ${templateName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate a PDF from HTML content
   * @param {string} html - HTML content to convert to PDF
   * @param {string} outputPath - Path to save the PDF
   * @param {Object} options - PDF generation options
   * @returns {Promise<string>} - Path to the generated PDF
   */
  async generatePdfFromHtml(html, outputPath, options = {}) {
    let browser = null;
    try {
      const defaultOptions = {
        printBackground: true,
        format: 'A4',
        margin: {
          top: '1cm',
          right: '1cm',
          bottom: '1cm',
          left: '1cm'
        }
      };
      
      // Merge options
      const pdfOptions = { ...defaultOptions, ...options };
      
      // Launch browser
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      
      // Generate PDF
      await page.pdf({
        path: outputPath,
        ...pdfOptions
      });
      
      logger.info(`PDF generated successfully: ${outputPath}`);
      return outputPath;
    } catch (error) {
      logger.error(`Error generating PDF: ${error.message}`);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Generate an invoice PDF
   * @param {Object} invoiceData - Invoice data to render in the PDF
   * @param {Object} options - PDF generation options
   * @returns {Promise<string>} - Path to the generated PDF
   */
  async generateInvoicePdf(invoiceData, options = {}) {
    try {
      const fileName = `invoice_${invoiceData.invoice.invoice_number.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
      const outputPath = path.join(this.outputDir, fileName);
      
      // Render HTML from template
      const html = await this.renderTemplate('invoice', invoiceData);
      
      // Generate PDF
      return await this.generatePdfFromHtml(html, outputPath, options);
    } catch (error) {
      logger.error(`Error generating invoice PDF: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate an estimate PDF
   * @param {Object} estimateData - Estimate data to render in the PDF
   * @param {Object} options - PDF generation options
   * @returns {Promise<string>} - Path to the generated PDF
   */
  async generateEstimatePdf(estimateData, options = {}) {
    try {
      const fileName = `estimate_${estimateData.estimate.estimate_number.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
      const outputPath = path.join(this.outputDir, fileName);
      
      // Render HTML from template
      const html = await this.renderTemplate('estimate', estimateData);
      
      // Generate PDF
      return await this.generatePdfFromHtml(html, outputPath, options);
    } catch (error) {
      logger.error(`Error generating estimate PDF: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clean up old PDF files
   * @param {number} maxAgeHours - Maximum age of files to keep in hours (default: 24)
   * @returns {Promise<number>} - Number of files deleted
   */
  async cleanupOldFiles(maxAgeHours = 24) {
    try {
      const files = fs.readdirSync(this.outputDir);
      const now = Date.now();
      const maxAge = maxAgeHours * 60 * 60 * 1000;
      let deleted = 0;
      
      for (const file of files) {
        const filePath = path.join(this.outputDir, file);
        const stats = fs.statSync(filePath);
        const fileAge = now - stats.mtimeMs;
        
        // Delete files older than maxAge
        if (fileAge > maxAge) {
          fs.unlinkSync(filePath);
          deleted++;
        }
      }
      
      logger.info(`Cleaned up ${deleted} old PDF files`);
      return deleted;
    } catch (error) {
      logger.error(`Error cleaning up old files: ${error.message}`);
      return 0;
    }
  }
}

module.exports = new PdfGenerationService(); 