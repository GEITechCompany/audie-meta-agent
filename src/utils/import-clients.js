#!/usr/bin/env node

/**
 * Client Import Utility
 * 
 * Command-line tool for importing clients from CSV files
 * 
 * Usage:
 *   node import-clients.js --file=clients.csv [--update-existing] [--delimiter=,]
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const Client = require('../models/Client');
const logger = require('./logger');
const { setupDatabase } = require('../database');

// Parse command line arguments
const args = process.argv.slice(2).reduce((result, arg) => {
  const match = arg.match(/^--([^=]+)(?:=(.*))?$/);
  if (match) {
    const [, key, value = true] = match;
    result[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
  }
  return result;
}, {});

// Display usage
if (args.help || !args.file) {
  console.log(`
Client Import Utility

Usage:
  node import-clients.js --file=clients.csv [--update-existing] [--delimiter=,] [--skip-header]

Options:
  --file=FILE           Path to the CSV file (required)
  --update-existing     Update existing clients instead of skipping them
  --delimiter=CHAR      CSV delimiter character (default: ,)
  --skip-header         Skip the first line of the CSV file (default: true)
  --help                Display this help message
  `);
  process.exit(0);
}

// Get the file path
const filePath = args.file.startsWith('/') ? args.file : path.join(process.cwd(), args.file);

// Validate file existence
if (!fs.existsSync(filePath)) {
  console.error(`Error: File ${filePath} does not exist`);
  process.exit(1);
}

// Configure import options
const options = {
  updateExisting: !!args.updateExisting,
  delimiter: args.delimiter || ',',
  skipHeader: args.skipHeader !== false
};

/**
 * Import clients from CSV
 */
async function importClients() {
  try {
    // Initialize database
    await setupDatabase();
    
    console.log(`Importing clients from ${filePath}...`);
    console.log(`Options: ${JSON.stringify(options, null, 2)}`);
    
    // Read and parse CSV file
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const records = parse(fileContent, {
      columns: ['name', 'email', 'phone', 'address', 'notes'],
      skip_empty_lines: true,
      from_line: options.skipHeader ? 2 : 1,
      delimiter: options.delimiter,
      trim: true
    });
    
    // Validate records
    if (!records || records.length === 0) {
      console.error('Error: No valid records found in CSV file');
      process.exit(1);
    }
    
    console.log(`Found ${records.length} records in CSV file`);
    
    // Initialize counters
    let imported = 0;
    let skipped = 0;
    let errors = 0;
    
    // Process records
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const recordNum = i + (options.skipHeader ? 2 : 1);
      
      // Validate name
      if (!record.name) {
        console.error(`Error in record #${recordNum}: Name is required`);
        errors++;
        continue;
      }
      
      try {
        // Check for existing client
        let existingClient = null;
        if (record.email) {
          existingClient = await Client.findByEmail(record.email);
        }
        
        if (existingClient && !options.updateExisting) {
          console.log(`Skipping record #${recordNum}: Client with email ${record.email} already exists`);
          skipped++;
          continue;
        }
        
        const clientData = {
          name: record.name,
          email: record.email || '',
          phone: record.phone || '',
          address: record.address || '',
          notes: record.notes || ''
        };
        
        if (existingClient && options.updateExisting) {
          // Update existing client
          Object.assign(existingClient, clientData);
          await existingClient.save();
          console.log(`Updated client #${recordNum}: ${record.name} (ID: ${existingClient.id})`);
          imported++;
        } else {
          // Create new client
          const client = new Client(clientData);
          const savedClient = await client.save();
          console.log(`Imported client #${recordNum}: ${record.name} (ID: ${savedClient.id})`);
          imported++;
        }
      } catch (error) {
        console.error(`Error processing record #${recordNum}: ${error.message}`);
        errors++;
      }
    }
    
    // Print summary
    console.log('\nImport summary:');
    console.log(`- Total records: ${records.length}`);
    console.log(`- Imported: ${imported}`);
    console.log(`- Skipped: ${skipped}`);
    console.log(`- Errors: ${errors}`);
    
    if (errors > 0) {
      process.exit(1);
    }
    
    process.exit(0);
  } catch (error) {
    console.error(`Error importing clients: ${error.message}`);
    process.exit(1);
  }
}

// Run the import
importClients(); 