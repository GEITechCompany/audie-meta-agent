/**
 * Email Service
 * Handles email sending with template support and attachment capabilities
 */

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const logger = require('../utils/logger');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
    this.templateCache = {};
    this.defaultFromEmail = process.env.EMAIL_FROM || 'noreply@yourbusiness.com';
    this.defaultFromName = process.env.EMAIL_FROM_NAME || 'Your Business';
    this.templatesDir = path.join(__dirname, '../../templates/emails');
    
    // Initialize transporter
    this.init();
  }

  /**
   * Initialize the email service
   */
  init() {
    try {
      // Check for required environment variables
      if (!process.env.EMAIL_HOST || !process.env.EMAIL_PORT) {
        logger.warn('Email configuration incomplete. Some email service options will be unavailable.');
        this.initialized = false;
        return;
      }

      // Create nodemailer transporter
      this.transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD
        },
        // Optional TLS configuration
        tls: {
          rejectUnauthorized: process.env.NODE_ENV === 'production'
        }
      });

      // Set initialization state
      this.initialized = true;
      logger.info('Email service initialized successfully');
    } catch (error) {
      logger.error(`Error initializing email service: ${error.message}`);
      this.initialized = false;
    }
  }

  /**
   * Ensure template directory exists, create if it doesn't
   */
  async ensureTemplateDir() {
    if (!fs.existsSync(this.templatesDir)) {
      fs.mkdirSync(this.templatesDir, { recursive: true });
      
      // Create a basic template if none exist
      const defaultTemplatePath = path.join(this.templatesDir, 'default.ejs');
      if (!fs.existsSync(defaultTemplatePath)) {
        const defaultTemplate = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><%= subject %></title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { border-bottom: 1px solid #eee; padding-bottom: 15px; margin-bottom: 20px; }
    .footer { border-top: 1px solid #eee; padding-top: 15px; margin-top: 20px; font-size: 12px; color: #777; }
    .button { display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2><%= subject %></h2>
    </div>
    
    <div class="content">
      <%- content %>
    </div>
    
    <div class="footer">
      <p>&copy; <%= new Date().getFullYear() %> <%= companyName %>. All rights reserved.</p>
      <p>This email was sent to <%= recipient %>.</p>
    </div>
  </div>
</body>
</html>`;
        fs.writeFileSync(defaultTemplatePath, defaultTemplate);
      }
      
      // Create invoice email template
      const invoiceTemplatePath = path.join(this.templatesDir, 'invoice.ejs');
      if (!fs.existsSync(invoiceTemplatePath)) {
        const invoiceTemplate = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice #<%= invoiceNumber %></title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { border-bottom: 1px solid #eee; padding-bottom: 15px; margin-bottom: 20px; }
    .invoice-details { background-color: #f9f9f9; padding: 15px; border-radius: 4px; margin-bottom: 20px; }
    .summary { margin-bottom: 20px; }
    .amount { font-size: 18px; font-weight: bold; color: #007bff; }
    .footer { border-top: 1px solid #eee; padding-top: 15px; margin-top: 20px; font-size: 12px; color: #777; }
    .button { display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Invoice #<%= invoiceNumber %></h2>
    </div>
    
    <div class="content">
      <p>Dear <%= clientName %>,</p>
      
      <p>Please find attached your invoice #<%= invoiceNumber %> for the amount of $<%= totalAmount.toFixed(2) %>.</p>
      
      <div class="invoice-details">
        <p><strong>Due Date:</strong> <%= dueDate %></p>
        <p><strong>Amount Due:</strong> <span class="amount">$<%= totalAmount.toFixed(2) %></span></p>
      </div>
      
      <div class="summary">
        <% if (description) { %>
          <p><strong>Description:</strong> <%= description %></p>
        <% } %>
      </div>
      
      <p>
        <a href="<%= paymentLink %>" class="button">Pay Now</a>
      </p>
      
      <p>If you have any questions regarding this invoice, please don't hesitate to contact us.</p>
      
      <p>Thank you for your business!</p>
    </div>
    
    <div class="footer">
      <p>&copy; <%= new Date().getFullYear() %> <%= companyName %>. All rights reserved.</p>
      <p>This email was sent to <%= clientEmail %>.</p>
    </div>
  </div>
</body>
</html>`;
        fs.writeFileSync(invoiceTemplatePath, invoiceTemplate);
      }
      
      // Create reminder template
      const reminderTemplatePath = path.join(this.templatesDir, 'reminder.ejs');
      if (!fs.existsSync(reminderTemplatePath)) {
        const reminderTemplate = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Reminder - Invoice #<%= invoiceNumber %></title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { border-bottom: 1px solid #eee; padding-bottom: 15px; margin-bottom: 20px; }
    .reminder-box { background-color: #fff8e1; padding: 15px; border-left: 4px solid #ffc107; margin-bottom: 20px; }
    .urgent-reminder { background-color: #ffebee; border-left: 4px solid #f44336; }
    .invoice-details { background-color: #f9f9f9; padding: 15px; border-radius: 4px; margin-bottom: 20px; }
    .summary { margin-bottom: 20px; }
    .amount { font-size: 18px; font-weight: bold; color: #e53935; }
    .footer { border-top: 1px solid #eee; padding-top: 15px; margin-top: 20px; font-size: 12px; color: #777; }
    .button { display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Payment Reminder</h2>
    </div>
    
    <div class="content">
      <p>Dear <%= clientName %>,</p>
      
      <div class="reminder-box <%= daysOverdue > 30 ? 'urgent-reminder' : '' %>">
        <p>This is a <%= reminderType %> that your payment for Invoice #<%= invoiceNumber %> is now <strong><%= daysOverdue %> days overdue</strong>.</p>
      </div>
      
      <div class="invoice-details">
        <p><strong>Invoice Number:</strong> <%= invoiceNumber %></p>
        <p><strong>Due Date:</strong> <%= dueDate %> (overdue by <%= daysOverdue %> days)</p>
        <p><strong>Amount Due:</strong> <span class="amount">$<%= outstandingAmount.toFixed(2) %></span></p>
      </div>
      
      <% if (lateFeesApplied) { %>
        <p><strong>Note:</strong> Late fees of $<%= lateFeeAmount.toFixed(2) %> have been applied to this invoice.</p>
      <% } %>
      
      <p>
        <a href="<%= paymentLink %>" class="button">Pay Now</a>
      </p>
      
      <p>If you have already sent your payment, please disregard this reminder.</p>
      
      <p>If you're experiencing any issues with payment or need to discuss payment arrangements, please contact our office immediately.</p>
    </div>
    
    <div class="footer">
      <p>&copy; <%= new Date().getFullYear() %> <%= companyName %>. All rights reserved.</p>
      <p>This email was sent to <%= clientEmail %>.</p>
    </div>
  </div>
</body>
</html>`;
        fs.writeFileSync(reminderTemplatePath, reminderTemplate);
      }
      
      // Create estimate email template
      const estimateTemplatePath = path.join(this.templatesDir, 'estimate.ejs');
      if (!fs.existsSync(estimateTemplatePath)) {
        const estimateTemplate = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Estimate #<%= estimateNumber %></title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { border-bottom: 1px solid #eee; padding-bottom: 15px; margin-bottom: 20px; }
    .estimate-details { background-color: #f9f9f9; padding: 15px; border-radius: 4px; margin-bottom: 20px; }
    .summary { margin-bottom: 20px; }
    .amount { font-size: 18px; font-weight: bold; color: #28a745; }
    .valid-until { color: #dc3545; font-weight: bold; }
    .footer { border-top: 1px solid #eee; padding-top: 15px; margin-top: 20px; font-size: 12px; color: #777; }
    .button { display: inline-block; padding: 10px 20px; background-color: #28a745; color: white; text-decoration: none; border-radius: 4px; margin-right: 10px; }
    .button-secondary { background-color: #6c757d; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Estimate #<%= estimateNumber %></h2>
    </div>
    
    <div class="content">
      <p>Dear <%= clientName %>,</p>
      
      <p>Thank you for your interest in our services. Please find attached your estimate #<%= estimateNumber %> for the amount of $<%= totalAmount.toFixed(2) %>.</p>
      
      <div class="estimate-details">
        <p><strong>Total Amount:</strong> <span class="amount">$<%= totalAmount.toFixed(2) %></span></p>
        <p><strong>Valid Until:</strong> <span class="valid-until"><%= validUntil %></span></p>
      </div>
      
      <div class="summary">
        <% if (description) { %>
          <p><strong>Estimate Details:</strong> <%= description %></p>
        <% } %>
      </div>
      
      <p>
        <a href="<%= approveLink %>" class="button">Approve Estimate</a>
        <a href="<%= viewLink %>" class="button button-secondary">View Details</a>
      </p>
      
      <p>If you have any questions or would like to discuss this estimate further, please don't hesitate to contact us.</p>
      
      <p>We look forward to working with you!</p>
    </div>
    
    <div class="footer">
      <p>&copy; <%= new Date().getFullYear() %> <%= companyName %>. All rights reserved.</p>
      <p>This email was sent to <%= clientEmail %>.</p>
    </div>
  </div>
</body>
</html>`;
        fs.writeFileSync(estimateTemplatePath, estimateTemplate);
      }
      
      logger.info('Email templates created successfully');
    }
  }

  /**
   * Send an email
   * @param {Object} emailData - Email configuration
   * @param {string} emailData.to - Recipient email address
   * @param {string} emailData.subject - Email subject
   * @param {string} emailData.body - Email body content (HTML format)
   * @param {string} [emailData.from] - Sender email (optional, uses default if not provided)
   * @param {string} [emailData.type] - Email type for metadata tracking
   * @param {string} [emailData.templateName] - Template name to use (default.ejs is default)
   * @param {Object} [emailData.templateData] - Data to pass to the template
   * @param {Array} [emailData.attachments] - Array of attachments
   * @returns {Promise<Object>} Result object with success status and details
   */
  async sendEmail(emailData) {
    // Safety check for invalid email
    if (!emailData || !emailData.to) {
      logger.error('Invalid email data: recipient email is required');
      return { 
        success: false, 
        message: 'Recipient email is required',
        error: 'INVALID_EMAIL_DATA'
      };
    }

    try {
      // Initialize if not already done
      if (!this.initialized) {
        this.init();
      }

      // Use fallback if still not initialized
      if (!this.initialized) {
        logger.warn(`Email service not initialized, logging email instead`);
        logger.info(`[EMAIL NOT SENT] To: ${emailData.to}, Subject: ${emailData.subject}`);
        return { 
          success: false,
          is_mock: true,
          message: 'Email service not initialized, email logged only',
          to: emailData.to,
          subject: emailData.subject
        };
      }

      // Ensure template directory exists
      await this.ensureTemplateDir();

      // Load template content
      let html = emailData.body;
      
      // Apply template if specified
      if (emailData.templateName) {
        html = await this.renderTemplate(
          emailData.templateName,
          {
            content: emailData.body,
            subject: emailData.subject,
            recipient: emailData.to,
            companyName: process.env.COMPANY_NAME || 'Your Business',
            ...emailData.templateData
          }
        );
      }

      // Prepare email options
      const mailOptions = {
        from: emailData.from || `"${this.defaultFromName}" <${this.defaultFromEmail}>`,
        to: emailData.to,
        subject: emailData.subject,
        html: html,
        attachments: emailData.attachments || []
      };

      // Send email
      const info = await this.transporter.sendMail(mailOptions);
      
      logger.info(`Email sent successfully: ${info.messageId}`, {
        to: emailData.to,
        subject: emailData.subject,
        type: emailData.type || 'general'
      });

      return {
        success: true,
        message: 'Email sent successfully',
        messageId: info.messageId
      };
    } catch (error) {
      logger.error(`Error sending email: ${error.message}`, {
        stack: error.stack,
        to: emailData.to,
        subject: emailData.subject
      });

      return {
        success: false,
        message: `Error sending email: ${error.message}`,
        error: error.message
      };
    }
  }

  /**
   * Render an email template
   * @param {string} templateName - Name of the template file (without path)
   * @param {Object} data - Data to pass to the template
   * @returns {Promise<string>} Rendered HTML
   */
  async renderTemplate(templateName, data) {
    try {
      const templatePath = path.join(this.templatesDir, `${templateName}.ejs`);
      
      // Check if template exists
      if (!fs.existsSync(templatePath)) {
        // Fall back to default template
        logger.warn(`Template ${templateName} not found, using default template`);
        const defaultTemplatePath = path.join(this.templatesDir, 'default.ejs');
        
        // If default template doesn't exist, return content as is
        if (!fs.existsSync(defaultTemplatePath)) {
          return data.content || '';
        }
        
        templateName = 'default';
      }
      
      // Check if template is cached
      if (this.templateCache[templateName]) {
        return ejs.render(this.templateCache[templateName], data);
      }
      
      // Load and cache template
      const templateContent = fs.readFileSync(
        path.join(this.templatesDir, `${templateName}.ejs`), 
        'utf8'
      );
      
      this.templateCache[templateName] = templateContent;
      
      // Render template
      return ejs.render(templateContent, data);
    } catch (error) {
      logger.error(`Error rendering email template ${templateName}: ${error.message}`);
      return data.content || '';
    }
  }

  /**
   * Send an invoice email with PDF attachment
   * @param {Object} invoiceData - Invoice data
   * @param {string} invoiceData.to - Recipient email
   * @param {string} invoiceData.invoiceNumber - Invoice number
   * @param {number} invoiceData.totalAmount - Total amount
   * @param {string} invoiceData.dueDate - Due date
   * @param {string} invoiceData.clientName - Client name
   * @param {string} invoiceData.description - Invoice description
   * @param {string} invoiceData.pdfPath - Path to the invoice PDF
   * @param {string} invoiceData.paymentLink - Link to payment page
   * @returns {Promise<Object>} Result object
   */
  async sendInvoiceEmail(invoiceData) {
    try {
      if (!invoiceData.pdfPath || !fs.existsSync(invoiceData.pdfPath)) {
        logger.error(`Invoice PDF not found: ${invoiceData.pdfPath}`);
        return { 
          success: false, 
          message: 'Invoice PDF not found',
          error: 'PDF_NOT_FOUND'
        };
      }

      const attachments = [{
        filename: `Invoice_${invoiceData.invoiceNumber}.pdf`,
        path: invoiceData.pdfPath,
        contentType: 'application/pdf'
      }];

      return await this.sendEmail({
        to: invoiceData.to,
        subject: `Invoice #${invoiceData.invoiceNumber} from ${this.defaultFromName}`,
        templateName: 'invoice',
        type: 'invoice',
        templateData: {
          invoiceNumber: invoiceData.invoiceNumber,
          totalAmount: invoiceData.totalAmount,
          dueDate: invoiceData.dueDate,
          clientName: invoiceData.clientName,
          clientEmail: invoiceData.to,
          description: invoiceData.description,
          paymentLink: invoiceData.paymentLink,
          companyName: process.env.COMPANY_NAME || 'Your Business'
        },
        attachments
      });
    } catch (error) {
      logger.error(`Error sending invoice email: ${error.message}`);
      return {
        success: false,
        message: `Error sending invoice email: ${error.message}`,
        error: error.message
      };
    }
  }

  /**
   * Send a payment reminder email
   * @param {Object} reminderData - Reminder data
   * @param {string} reminderData.to - Recipient email
   * @param {string} reminderData.invoiceNumber - Invoice number
   * @param {number} reminderData.outstandingAmount - Outstanding amount
   * @param {string} reminderData.dueDate - Due date
   * @param {number} reminderData.daysOverdue - Days overdue
   * @param {string} reminderData.clientName - Client name
   * @param {string} reminderData.reminderType - Type of reminder (friendly, reminder, urgent, final)
   * @param {boolean} reminderData.lateFeesApplied - Whether late fees were applied
   * @param {number} reminderData.lateFeeAmount - Amount of late fees
   * @param {string} reminderData.pdfPath - Path to the invoice PDF (optional)
   * @param {string} reminderData.paymentLink - Link to payment page
   * @returns {Promise<Object>} Result object
   */
  async sendReminderEmail(reminderData) {
    try {
      const attachments = [];
      
      // Add PDF attachment if provided
      if (reminderData.pdfPath && fs.existsSync(reminderData.pdfPath)) {
        attachments.push({
          filename: `Invoice_${reminderData.invoiceNumber}.pdf`,
          path: reminderData.pdfPath,
          contentType: 'application/pdf'
        });
      }

      // Determine subject based on reminder type
      let subject = `Payment Reminder: Invoice #${reminderData.invoiceNumber}`;
      
      if (reminderData.reminderType === 'urgent') {
        subject = `URGENT: Overdue Invoice #${reminderData.invoiceNumber}`;
      } else if (reminderData.reminderType === 'final') {
        subject = `FINAL NOTICE: Invoice #${reminderData.invoiceNumber}`;
      }

      return await this.sendEmail({
        to: reminderData.to,
        subject,
        templateName: 'reminder',
        type: 'payment_reminder',
        templateData: {
          invoiceNumber: reminderData.invoiceNumber,
          outstandingAmount: reminderData.outstandingAmount,
          dueDate: reminderData.dueDate,
          daysOverdue: reminderData.daysOverdue,
          clientName: reminderData.clientName,
          clientEmail: reminderData.to,
          reminderType: reminderData.reminderType,
          lateFeesApplied: reminderData.lateFeesApplied || false,
          lateFeeAmount: reminderData.lateFeeAmount || 0,
          paymentLink: reminderData.paymentLink,
          companyName: process.env.COMPANY_NAME || 'Your Business'
        },
        attachments
      });
    } catch (error) {
      logger.error(`Error sending reminder email: ${error.message}`);
      return {
        success: false,
        message: `Error sending reminder email: ${error.message}`,
        error: error.message
      };
    }
  }

  /**
   * Send an estimate email with PDF attachment
   * @param {Object} estimateData - Estimate data
   * @param {string} estimateData.to - Recipient email
   * @param {string} estimateData.estimateNumber - Estimate number
   * @param {number} estimateData.totalAmount - Total amount
   * @param {string} estimateData.validUntil - Valid until date
   * @param {string} estimateData.clientName - Client name
   * @param {string} estimateData.description - Estimate description
   * @param {string} estimateData.pdfPath - Path to the estimate PDF
   * @param {string} estimateData.approveLink - Link to approve the estimate
   * @param {string} estimateData.viewLink - Link to view the estimate
   * @returns {Promise<Object>} Result object
   */
  async sendEstimateEmail(estimateData) {
    try {
      if (!estimateData.pdfPath || !fs.existsSync(estimateData.pdfPath)) {
        logger.error(`Estimate PDF not found: ${estimateData.pdfPath}`);
        return { 
          success: false, 
          message: 'Estimate PDF not found',
          error: 'PDF_NOT_FOUND'
        };
      }

      const attachments = [{
        filename: `Estimate_${estimateData.estimateNumber}.pdf`,
        path: estimateData.pdfPath,
        contentType: 'application/pdf'
      }];

      return await this.sendEmail({
        to: estimateData.to,
        subject: `Estimate #${estimateData.estimateNumber} from ${this.defaultFromName}`,
        templateName: 'estimate',
        type: 'estimate',
        templateData: {
          estimateNumber: estimateData.estimateNumber,
          totalAmount: estimateData.totalAmount,
          validUntil: estimateData.validUntil,
          clientName: estimateData.clientName,
          clientEmail: estimateData.to,
          description: estimateData.description,
          approveLink: estimateData.approveLink,
          viewLink: estimateData.viewLink,
          companyName: process.env.COMPANY_NAME || 'Your Business'
        },
        attachments
      });
    } catch (error) {
      logger.error(`Error sending estimate email: ${error.message}`);
      return {
        success: false,
        message: `Error sending estimate email: ${error.message}`,
        error: error.message
      };
    }
  }
}

module.exports = new EmailService(); 