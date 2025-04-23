const fs = require('fs');
const path = require('path');
const clientDataService = require('../../services/ClientDataService');
const Client = require('../../models/Client');
const { setupDatabase, closeDatabase } = require('../../database');

// Mock Client model
jest.mock('../../models/Client');

describe('Client Data Service', () => {
  beforeAll(async () => {
    // Setup database
    await setupDatabase();
  });

  afterAll(async () => {
    // Close database
    await closeDatabase();
  });

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
  });

  describe('importFromCSV', () => {
    it('should parse and import clients from CSV', async () => {
      // Mock data
      const csvData = `name,email,phone,address,notes
John Doe,john@example.com,123-456-7890,"123 Main St, City, ST 12345",Important client
Jane Smith,jane@example.com,555-555-5555,"456 Oak Ave, Town, ST 67890",New client`;

      // Mock Client.findByEmail to return null (no existing clients)
      Client.findByEmail.mockResolvedValue(null);

      // Mock Client.save to return the client with ID
      Client.prototype.save = jest.fn().mockImplementation(function() {
        this.id = Math.floor(Math.random() * 1000);
        return Promise.resolve(this);
      });

      // Call the service
      const result = await clientDataService.importFromCSV(csvData);

      // Assertions
      expect(result.success).toBe(true);
      expect(result.imported).toBe(2);
      expect(result.skipped).toBe(0);
      expect(result.errors.length).toBe(0);

      // Check that Client.save was called twice
      expect(Client.prototype.save).toHaveBeenCalledTimes(2);

      // Check first client
      const firstClientCall = Client.prototype.save.mock.instances[0];
      expect(firstClientCall.name).toBe('John Doe');
      expect(firstClientCall.email).toBe('john@example.com');
      expect(firstClientCall.phone).toBe('123-456-7890');
      expect(firstClientCall.address).toBe('123 Main St, City, ST 12345');
      expect(firstClientCall.notes).toBe('Important client');

      // Check second client
      const secondClientCall = Client.prototype.save.mock.instances[1];
      expect(secondClientCall.name).toBe('Jane Smith');
    });

    it('should handle existing clients based on updateExisting option', async () => {
      // Mock data
      const csvData = `name,email,phone,address,notes
John Doe,john@example.com,123-456-7890,"123 Main St, City, ST 12345",Important client`;

      // Mock existing client
      const existingClient = new Client({
        id: 123,
        name: 'John Old',
        email: 'john@example.com',
        phone: '000-000-0000',
        address: 'Old Address',
        notes: 'Old Notes'
      });
      
      existingClient.save = jest.fn().mockResolvedValue(existingClient);
      Client.findByEmail.mockResolvedValue(existingClient);

      // Skip existing - should not update
      const skipResult = await clientDataService.importFromCSV(csvData, { 
        updateExisting: false 
      });

      expect(skipResult.success).toBe(true);
      expect(skipResult.imported).toBe(0);
      expect(skipResult.skipped).toBe(1);
      expect(existingClient.save).not.toHaveBeenCalled();

      // Update existing - should update
      const updateResult = await clientDataService.importFromCSV(csvData, { 
        updateExisting: true 
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.imported).toBe(1);
      expect(updateResult.skipped).toBe(0);
      expect(existingClient.save).toHaveBeenCalled();
      expect(existingClient.name).toBe('John Doe');
      expect(existingClient.phone).toBe('123-456-7890');
    });

    it('should handle empty or invalid CSV data', async () => {
      // Empty CSV
      const emptyResult = await clientDataService.importFromCSV('');
      expect(emptyResult.success).toBe(false);
      expect(emptyResult.imported).toBe(0);

      // Invalid CSV
      const invalidResult = await clientDataService.importFromCSV('not,a,valid,csv');
      expect(invalidResult.success).toBe(false);
      expect(invalidResult.imported).toBe(0);
    });

    it('should validate required fields', async () => {
      // Missing name
      const csvData = `name,email,phone,address,notes
,john@example.com,123-456-7890,"123 Main St, City, ST 12345",Important client`;

      const result = await clientDataService.importFromCSV(csvData);

      expect(result.success).toBe(true); // Service succeeds but reports errors
      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].message).toBe('Name is required');
    });
  });

  describe('exportToCSV', () => {
    it('should export clients to CSV format', async () => {
      // Mock clients
      const mockClients = [
        new Client({
          id: 1,
          name: 'John Doe',
          email: 'john@example.com',
          phone: '123-456-7890',
          address: '123 Main St, City, ST 12345',
          notes: 'Important client',
          created_at: '2025-01-01T00:00:00.000Z',
          updated_at: '2025-01-01T00:00:00.000Z'
        }),
        new Client({
          id: 2,
          name: 'Jane Smith',
          email: 'jane@example.com',
          phone: '555-555-5555',
          address: '456 Oak Ave, Town, ST 67890',
          notes: 'New client',
          created_at: '2025-01-02T00:00:00.000Z',
          updated_at: '2025-01-02T00:00:00.000Z'
        })
      ];

      // Mock Client.findAll
      Client.findAll.mockResolvedValue(mockClients);

      // Call the service
      const csvData = await clientDataService.exportToCSV();

      // Assertions
      expect(csvData).toContain('id,name,email,phone,address,notes,created_at,updated_at');
      expect(csvData).toContain('1,John Doe,john@example.com,123-456-7890,"123 Main St, City, ST 12345",Important client');
      expect(csvData).toContain('2,Jane Smith,jane@example.com,555-555-5555,"456 Oak Ave, Town, ST 67890",New client');
    });

    it('should handle empty client list', async () => {
      // Mock empty client list
      Client.findAll.mockResolvedValue([]);

      // Call the service
      const csvData = await clientDataService.exportToCSV();

      // Should still have header
      expect(csvData).toContain('id,name,email,phone,address,notes,created_at,updated_at');
      // But no data rows
      expect(csvData.trim().split('\n').length).toBe(1);
    });

    it('should respect column and delimiter options', async () => {
      // Mock clients
      const mockClients = [
        new Client({
          id: 1,
          name: 'John Doe',
          email: 'john@example.com'
        })
      ];

      // Mock Client.findAll
      Client.findAll.mockResolvedValue(mockClients);

      // Call the service with custom options
      const csvData = await clientDataService.exportToCSV({
        columns: ['name', 'email'],
        delimiter: ';',
        includeHeader: true
      });

      // Should only have specified columns with specified delimiter
      expect(csvData).toContain('name;email');
      expect(csvData).toContain('John Doe;john@example.com');
      expect(csvData).not.toContain('id');
    });
  });

  describe('exportToVCard', () => {
    it('should export client to vCard format', async () => {
      // Mock client
      const mockClient = new Client({
        id: 1,
        name: 'John Doe',
        email: 'john@example.com',
        phone: '123-456-7890',
        address: '123 Main St, City, ST 12345',
        notes: 'Important client'
      });

      // Mock Client.getById
      Client.getById.mockResolvedValue(mockClient);

      // Call the service
      const vCardData = await clientDataService.exportToVCard(1);

      // Assertions
      expect(vCardData).toContain('BEGIN:VCARD');
      expect(vCardData).toContain('END:VCARD');
      expect(vCardData).toContain('FN:John Doe');
      expect(vCardData).toContain('EMAIL;type=WORK:john@example.com');
      expect(vCardData).toContain('TEL;type=WORK:123-456-7890');
      expect(vCardData).toContain('NOTE:Important client');
    });

    it('should throw error if client not found', async () => {
      // Mock Client.getById to return null
      Client.getById.mockResolvedValue(null);

      // Call the service
      await expect(clientDataService.exportToVCard(999)).rejects.toThrow('Client not found');
    });
  });

  describe('generateClientReport', () => {
    it('should generate client activity report', async () => {
      // Mock client
      const mockClient = new Client({
        id: 1,
        name: 'John Doe',
        email: 'john@example.com',
        phone: '123-456-7890',
        address: '123 Main St, City, ST 12345',
        created_at: '2025-01-01T00:00:00.000Z'
      });

      // Mock tasks
      const mockTasks = [
        {
          id: 1,
          title: 'Task 1',
          status: 'pending',
          priority: 'high',
          due_date: '2025-02-01T00:00:00.000Z',
          created_at: '2025-01-10T00:00:00.000Z',
          updated_at: '2025-01-10T00:00:00.000Z'
        },
        {
          id: 2,
          title: 'Task 2',
          status: 'completed',
          priority: 'medium',
          due_date: '2025-01-15T00:00:00.000Z',
          created_at: '2025-01-05T00:00:00.000Z',
          updated_at: '2025-01-16T00:00:00.000Z'
        }
      ];

      // Mock invoices
      const mockInvoices = [
        {
          id: 1,
          invoice_number: 'INV-2025-001',
          title: 'Invoice 1',
          status: 'paid',
          total_amount: 1000,
          amount_paid: 1000,
          due_date: '2025-01-31T00:00:00.000Z',
          created_at: '2025-01-15T00:00:00.000Z'
        },
        {
          id: 2,
          invoice_number: 'INV-2025-002',
          title: 'Invoice 2',
          status: 'pending',
          total_amount: 500,
          amount_paid: 0,
          due_date: '2025-02-15T00:00:00.000Z',
          created_at: '2025-01-25T00:00:00.000Z'
        }
      ];

      // Setup mocks
      Client.getById.mockResolvedValue(mockClient);
      mockClient.getTasks = jest.fn().mockResolvedValue(mockTasks);
      mockClient.getInvoices = jest.fn().mockResolvedValue(mockInvoices);

      // Call the service
      const report = await clientDataService.generateClientReport(1);

      // Assertions
      expect(report.client.id).toBe(1);
      expect(report.client.name).toBe('John Doe');
      
      // Check summary
      expect(report.summary.total_tasks).toBe(2);
      expect(report.summary.tasks_pending).toBe(1);
      expect(report.summary.tasks_completed).toBe(1);
      expect(report.summary.total_invoices).toBe(2);
      expect(report.summary.invoices_paid).toBe(1);
      expect(report.summary.invoices_pending).toBe(1);
      expect(report.summary.total_revenue).toBe('1000.00');
      expect(report.summary.outstanding_amount).toBe('500.00');
      
      // Check details
      expect(report.tasks.length).toBe(2);
      expect(report.invoices.length).toBe(2);
    });

    it('should filter by date range if provided', async () => {
      // Mock client
      const mockClient = new Client({
        id: 1,
        name: 'John Doe',
        email: 'john@example.com'
      });

      // Mock tasks with different dates
      const mockTasks = [
        {
          id: 1,
          title: 'Task 1',
          status: 'pending',
          created_at: '2025-01-10T00:00:00.000Z'
        },
        {
          id: 2,
          title: 'Task 2',
          status: 'completed',
          created_at: '2025-02-15T00:00:00.000Z'
        }
      ];

      // Mock invoices with different dates
      const mockInvoices = [
        {
          id: 1,
          title: 'Invoice 1',
          status: 'paid',
          total_amount: 1000,
          amount_paid: 1000,
          created_at: '2025-01-15T00:00:00.000Z'
        },
        {
          id: 2,
          title: 'Invoice 2',
          status: 'pending',
          total_amount: 500,
          amount_paid: 0,
          created_at: '2025-02-25T00:00:00.000Z'
        }
      ];

      // Setup mocks
      Client.getById.mockResolvedValue(mockClient);
      mockClient.getTasks = jest.fn().mockResolvedValue(mockTasks);
      mockClient.getInvoices = jest.fn().mockResolvedValue(mockInvoices);

      // Call the service with date range
      const report = await clientDataService.generateClientReport(1, {
        from_date: '2025-02-01',
        to_date: '2025-03-01'
      });

      // Should only include items from February
      expect(report.summary.total_tasks).toBe(1);
      expect(report.summary.total_invoices).toBe(1);
      expect(report.tasks.length).toBe(1);
      expect(report.tasks[0].id).toBe(2);
      expect(report.invoices.length).toBe(1);
      expect(report.invoices[0].id).toBe(2);
    });

    it('should throw error if client not found', async () => {
      // Mock Client.getById to return null
      Client.getById.mockResolvedValue(null);

      // Call the service
      await expect(clientDataService.generateClientReport(999)).rejects.toThrow('Client not found');
    });
  });
}); 