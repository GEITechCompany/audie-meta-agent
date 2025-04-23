# Invoice Management System

This document provides an overview of the invoice management system, including its features and API endpoints.

## Features

The invoice management system includes the following features:

### 1. Invoice Numbering

- Configurable invoice numbering format with support for prefixes, year, month, and sequential numbering
- Ability to reset numbering sequences
- Automatic generation of unique invoice numbers

### 2. Recurring Invoices

- Create invoices that recur at specified intervals (weekly, monthly, quarterly, yearly)
- Define start and optional end dates for recurring invoices
- Automatic generation of invoices based on the defined schedule
- Support for copying line items and other details from recurring templates to new invoices

### 3. Payment Tracking

- Record full or partial payments against invoices
- Support for multiple payment methods
- Track payment history for each invoice
- Automatic status updates based on payment amounts (pending, partial, paid)

### 4. Overdue Invoice Management

- Automatic detection of overdue invoices
- Configurable reminder templates for different overdue stages
- Automated sending of reminders at specified intervals
- Status tracking for overdue invoices (overdue, late, collection)

## API Endpoints

### Invoice Management

- `GET /api/invoices` - Get all invoices with pagination and filters
- `GET /api/invoices/:id` - Get a single invoice by ID
- `POST /api/invoices` - Create a new invoice
- `PUT /api/invoices/:id` - Update an existing invoice
- `DELETE /api/invoices/:id` - Delete an invoice
- `POST /api/invoices/:id/send` - Send an invoice to a client via email
- `GET /api/invoices/summary` - Get invoice summary statistics

### Invoice Numbering

- `POST /api/invoices/numbering/configure` - Configure invoice numbering format
- `POST /api/invoices/numbering/reset` - Reset invoice numbering sequence

### Recurring Invoices

- `POST /api/invoices/recurring` - Create a recurring invoice
- `GET /api/invoices/recurring` - Get all recurring invoices
- `GET /api/invoices/recurring/:id` - Get a single recurring invoice by ID
- `PUT /api/invoices/recurring/:id` - Update a recurring invoice
- `DELETE /api/invoices/recurring/:id` - Delete a recurring invoice
- `POST /api/invoices/recurring/process` - Process due recurring invoices

### Payment Tracking

- `POST /api/invoices/:id/payments` - Record a payment for an invoice
- `GET /api/invoices/:id/payments` - Get all payments for an invoice
- `DELETE /api/invoices/:id/payments/:paymentId` - Delete a payment
- `GET /api/invoices/payment-methods` - Get all available payment methods
- `POST /api/invoices/payment-methods` - Create a new payment method

### Overdue Invoice Management

- `GET /api/invoices/overdue` - Get all overdue invoices
- `POST /api/invoices/overdue/process` - Process overdue invoices (send reminders, update statuses)
- `GET /api/invoices/overdue/statistics` - Get overdue invoice statistics
- `GET /api/invoices/reminders/templates` - Get all reminder templates
- `POST /api/invoices/reminders/templates` - Create a reminder template
- `PUT /api/invoices/reminders/templates/:id` - Update a reminder template
- `DELETE /api/invoices/reminders/templates/:id` - Delete a reminder template
- `GET /api/invoices/:id/reminders/history` - Get reminder history for an invoice

## Automated Tasks

The system includes scheduled tasks for:

1. Processing recurring invoices (daily at 1:00 AM)
2. Processing overdue invoices (daily at 2:00 AM)
3. Generating weekly invoice summary reports (Mondays at 8:00 AM)

These tasks are implemented in `src/scheduler/invoiceTasks.js` and initialized in the main application.

## Services

The invoice management system is built on these service modules:

- `InvoiceNumberingService` - Handles invoice number generation and formatting
- `RecurringInvoiceService` - Manages recurring invoice templates and generation
- `PaymentTrackingService` - Tracks payments and payment methods
- `OverdueInvoiceService` - Manages overdue invoices and reminder templates

## Database Tables

The system uses the following database tables:

- `invoices` - Stores invoice data
- `invoice_items` - Stores line items for invoices
- `invoice_payments` - Records payments made against invoices
- `recurring_invoices` - Stores recurring invoice templates
- `recurring_invoice_items` - Stores line items for recurring invoice templates
- `recurring_invoice_history` - Tracks history of generated invoices
- `invoice_reminder_templates` - Stores templates for reminder emails
- `invoice_reminder_history` - Records sent reminders
- `payment_methods` - Stores available payment methods

## Implementation Notes

- All monetary values are stored as decimal numbers
- Dates are stored in ISO 8601 format (YYYY-MM-DD)
- Invoice statuses include: draft, pending, partial, paid, overdue, late, collection, cancelled
- Recurring invoice frequencies include: weekly, biweekly, monthly, quarterly, yearly 