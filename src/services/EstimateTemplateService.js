/**
 * Estimate Template Service
 * Manages estimate templates and generation of estimates from templates
 */

const { getDatabase } = require('../database');
const logger = require('../utils/logger');
const Estimate = require('../models/Estimate');

class EstimateTemplateService {
  constructor() {
    this.defaultTemplates = {
      hourly_service: {
        name: 'Hourly Service',
        description: 'Standard hourly service rate template',
        items: [
          {
            description: 'Professional services',
            quantity: 1,
            unit_price: 100,
            amount: 100,
            tax_rate: 0
          }
        ]
      },
      fixed_project: {
        name: 'Fixed Price Project',
        description: 'Standard fixed price project template',
        items: [
          {
            description: 'Project planning and requirements gathering',
            quantity: 1,
            unit_price: 500,
            amount: 500,
            tax_rate: 0
          },
          {
            description: 'Development and implementation',
            quantity: 1,
            unit_price: 2000,
            amount: 2000,
            tax_rate: 0
          },
          {
            description: 'Testing and deployment',
            quantity: 1,
            unit_price: 500,
            amount: 500,
            tax_rate: 0
          }
        ]
      },
      maintenance_contract: {
        name: 'Monthly Maintenance',
        description: 'Standard monthly maintenance contract template',
        items: [
          {
            description: 'Monthly maintenance and support',
            quantity: 1,
            unit_price: 750,
            amount: 750,
            tax_rate: 0
          }
        ]
      }
    };
  }

  /**
   * Get all available template types
   * @returns {Array<Object>} Array of template type objects
   */
  getTemplateTypes() {
    return Object.keys(this.defaultTemplates).map(key => ({
      id: key,
      name: this.defaultTemplates[key].name,
      description: this.defaultTemplates[key].description
    }));
  }

  /**
   * Get a template by its ID
   * @param {string} templateId - The template ID 
   * @returns {Object|null} The template object or null if not found
   */
  getTemplateById(templateId) {
    if (this.defaultTemplates[templateId]) {
      return {
        id: templateId,
        ...this.defaultTemplates[templateId]
      };
    }
    return null;
  }

  /**
   * Generate an estimate from a template
   * @param {string} templateId - Template ID to use
   * @param {Object} data - Additional data for the estimate
   * @returns {Promise<Estimate>} The generated estimate
   */
  async generateEstimateFromTemplate(templateId, data) {
    try {
      const template = this.getTemplateById(templateId);
      
      if (!template) {
        throw new Error(`Template with ID '${templateId}' not found`);
      }
      
      // Create estimate from template and provided data
      const estimate = new Estimate({
        client_id: data.client_id,
        title: data.title || template.name,
        description: data.description || template.description,
        status: 'draft',
        total_amount: this.calculateTotal(template.items),
        valid_until: data.valid_until || this.getDefaultValidUntil(),
        items: JSON.parse(JSON.stringify(template.items)) // Deep clone
      });

      // Apply customizations if provided
      if (data.hourlyRate && templateId === 'hourly_service') {
        estimate.items[0].unit_price = parseFloat(data.hourlyRate);
        estimate.items[0].amount = estimate.items[0].quantity * estimate.items[0].unit_price;
        estimate.total_amount = this.calculateTotal(estimate.items);
      }
      
      // Save the estimate
      return await estimate.save();
    } catch (error) {
      logger.error(`Error generating estimate from template: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate total amount from line items
   * @param {Array<Object>} items - Line items
   * @returns {number} Total amount
   */
  calculateTotal(items) {
    return items.reduce((total, item) => {
      const amount = parseFloat(item.amount) || 0;
      const taxAmount = amount * (parseFloat(item.tax_rate) || 0) / 100;
      return total + amount + taxAmount;
    }, 0);
  }

  /**
   * Generate default valid until date (30 days from now)
   * @returns {string} ISO date string
   */
  getDefaultValidUntil() {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString();
  }
}

module.exports = new EstimateTemplateService(); 