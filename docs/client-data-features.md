# Client Data Import/Export Features

This document provides information on how to use the client data import/export features of the Audie Meta-Agent system.

## Features Overview

The system includes the following client data features:

1. **CSV Import** - Bulk import clients from CSV files
2. **vCard Import** - Import clients from vCard/address book files
3. **CSV Export** - Export clients to CSV for spreadsheet applications
4. **vCard Export** - Export client contact information for address books
5. **Client Activity Reports** - Generate detailed client activity reports

## API Endpoints

All client data import/export endpoints are protected by authentication and require admin privileges.

### Import Endpoints

#### Import Clients from CSV

```
POST /api/clients/import/csv
```

**Request:**
- Content-Type: `multipart/form-data`
- Body:
  - `csv_file`: CSV file upload (required)
  - `skip_header`: Whether to skip the first line of the CSV file (default: true)
  - `update_existing`: Whether to update existing clients instead of skipping them (default: false)
  - `delimiter`: CSV delimiter character (default: ',')

**CSV Format:**
The CSV file should have the following columns (in this order):
```
name,email,phone,address,notes
```

Example:
```
Name,Email,Phone,Address,Notes
John Doe,john@example.com,123-456-7890,"123 Main St, City, ST 12345","Important client"
Jane Smith,jane@example.com,555-555-5555,"456 Oak Ave, Town, ST 67890","New client"
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Successfully imported 2 clients, skipped 0 clients",
  "data": {
    "imported": 2,
    "skipped": 0,
    "errors": []
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "import_failed",
  "message": "Failed to import clients",
  "data": {
    "imported": 1,
    "skipped": 0,
    "errors": [
      {
        "row": 3,
        "message": "Invalid email format",
        "data": {
          "name": "Invalid Example",
          "email": "not-an-email"
        }
      }
    ]
  }
}
```

#### Import Clients from vCard

```
POST /api/clients/import/vcard
```

**Request:**
- Content-Type: `multipart/form-data`
- Body:
  - `vcard_file`: vCard file upload (required)
  - `update_existing`: Whether to update existing clients instead of skipping them (default: false)

**Response:** Similar to CSV import

### Export Endpoints

#### Export Clients to CSV

```
GET /api/clients/export/csv
```

**Query Parameters:**
- `include_header`: Whether to include header row (default: true)
- `delimiter`: CSV delimiter character (default: ',')

**Response:**
- Content-Type: `text/csv`
- Content-Disposition: `attachment; filename="clients.csv"`
- Body: CSV data

#### Export Client to vCard

```
GET /api/clients/:id/export/vcard
```

**URL Parameters:**
- `id`: Client ID

**Response:**
- Content-Type: `text/vcard`
- Content-Disposition: `attachment; filename="client_123.vcf"`
- Body: vCard data

#### Export All Clients to vCards (Zip)

```
GET /api/clients/export/vcard/all
```

**Response:**
- Content-Type: `application/zip`
- Content-Disposition: `attachment; filename="all_clients.zip"`
- Body: ZIP file containing vCard files for all clients

### Reporting Endpoints

#### Generate Client Activity Report

```
GET /api/clients/:id/report
```

**URL Parameters:**
- `id`: Client ID

**Query Parameters:**
- `include_tasks_count`: Whether to include task counts (default: true)
- `include_tasks_details`: Whether to include task details (default: false)
- `include_invoices_count`: Whether to include invoice counts (default: true)
- `include_invoices_details`: Whether to include invoice details (default: false)
- `from_date`: Filter by start date (ISO format)
- `to_date`: Filter by end date (ISO format)
- `format`: Output format (currently only 'json' is supported)

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "client": {
      "id": 123,
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "123-456-7890",
      "address": "123 Main St, City, ST 12345",
      "created_at": "2025-01-01T00:00:00.000Z"
    },
    "generated_at": "2025-04-23T14:30:00.000Z",
    "filter_period": {
      "from": "2025-01-01",
      "to": "2025-04-23"
    },
    "summary": {
      "total_tasks": 5,
      "tasks_pending": 2,
      "tasks_completed": 3,
      "tasks_overdue": 1,
      "total_invoices": 2,
      "invoices_pending": 1,
      "invoices_paid": 1,
      "invoices_overdue": 0,
      "total_revenue": "1500.00",
      "outstanding_amount": "750.00"
    },
    "tasks": [
      {
        "id": 1,
        "title": "Website Redesign",
        "status": "completed",
        "priority": "high",
        "due_date": "2025-02-15T00:00:00.000Z",
        "created_at": "2025-01-10T00:00:00.000Z",
        "updated_at": "2025-02-10T00:00:00.000Z"
      },
      // ...more tasks
    ],
    "invoices": [
      {
        "id": 1,
        "invoice_number": "INV-2025-001",
        "title": "Website Design - Phase 1",
        "status": "paid",
        "total_amount": "1500.00",
        "amount_paid": "1500.00",
        "due_date": "2025-02-01T00:00:00.000Z",
        "created_at": "2025-01-15T00:00:00.000Z"
      },
      // ...more invoices
    ]
  }
}
```

## Command Line Tool

For bulk operations, a command-line tool is provided to import clients from CSV files.

### Usage

```bash
node src/utils/import-clients.js --file=clients.csv [--update-existing] [--delimiter=,] [--skip-header]
```

**Options:**
- `--file=FILE`: Path to the CSV file (required)
- `--update-existing`: Update existing clients instead of skipping them
- `--delimiter=CHAR`: CSV delimiter character (default: ',')
- `--skip-header`: Skip the first line of the CSV file (default: true)
- `--help`: Display help message

### Example

```bash
node src/utils/import-clients.js --file=./data/clients.csv --update-existing
```

## Required Dependencies

To use these features, make sure the following NPM packages are installed:

```bash
npm install csv-parse vcards-js adm-zip multer
```

## Error Handling

The import/export features include comprehensive error handling:

1. **File Validation** - Files are validated for correct format and size
2. **Data Validation** - Data is validated before import
3. **Duplicate Handling** - Options to skip or update duplicates
4. **Clean-up** - Temporary files are automatically cleaned up

All errors are logged for troubleshooting purposes.

## Security Considerations

- All import/export endpoints require admin privileges
- File uploads are limited to 5MB max size
- Only CSV and vCard formats are accepted
- Temporary files are properly handled and deleted after processing
- Data is validated before import to prevent injection attacks 