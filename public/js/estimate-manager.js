/**
 * Estimate Manager
 * Handles UI functionality for estimate generation, templates, and approval workflow
 */

class EstimateManager {
  constructor() {
    this.initEventListeners();
    this.selectedTasks = new Set();
    this.templates = [];
    this.loadTemplates();
  }
  
  /**
   * Initialize event listeners
   */
  initEventListeners() {
    // Listen for template selection
    document.addEventListener('DOMContentLoaded', () => {
      const templateSelect = document.getElementById('estimate-template');
      if (templateSelect) {
        templateSelect.addEventListener('change', this.handleTemplateSelection.bind(this));
      }
      
      // Task selection for estimate generation
      const taskCheckboxes = document.querySelectorAll('.task-select-checkbox');
      taskCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', this.handleTaskSelection.bind(this));
      });
      
      // Generate estimate from tasks button
      const generateButton = document.getElementById('generate-estimate-btn');
      if (generateButton) {
        generateButton.addEventListener('click', this.generateEstimateFromTasks.bind(this));
      }
      
      // Generate from template button
      const templateButton = document.getElementById('generate-from-template-btn');
      if (templateButton) {
        templateButton.addEventListener('click', this.generateEstimateFromTemplate.bind(this));
      }
      
      // Estimate status buttons
      document.querySelectorAll('.estimate-status-btn').forEach(btn => {
        btn.addEventListener('click', this.updateEstimateStatus.bind(this));
      });
      
      // Convert to invoice button
      document.querySelectorAll('.convert-to-invoice-btn').forEach(btn => {
        btn.addEventListener('click', this.convertToInvoice.bind(this));
      });
    });
  }
  
  /**
   * Load available estimate templates
   */
  async loadTemplates() {
    try {
      const response = await fetch('/api/estimate-templates', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to load estimate templates');
      }
      
      const result = await response.json();
      
      if (result.success) {
        this.templates = result.data;
        this.populateTemplateDropdown();
      }
    } catch (error) {
      console.error('Error loading estimate templates:', error);
      this.showNotification('error', 'Failed to load estimate templates');
    }
  }
  
  /**
   * Populate template dropdown with available templates
   */
  populateTemplateDropdown() {
    const templateSelect = document.getElementById('estimate-template');
    if (!templateSelect) return;
    
    // Clear existing options
    templateSelect.innerHTML = '<option value="">Select a template...</option>';
    
    // Add template options
    this.templates.forEach(template => {
      const option = document.createElement('option');
      option.value = template.id;
      option.textContent = template.name;
      option.dataset.description = template.description;
      templateSelect.appendChild(option);
    });
  }
  
  /**
   * Handle template selection change
   * @param {Event} event - Change event
   */
  handleTemplateSelection(event) {
    const templateId = event.target.value;
    const descriptionEl = document.getElementById('template-description');
    
    if (!descriptionEl) return;
    
    if (templateId) {
      const selectedTemplate = this.templates.find(t => t.id === templateId);
      if (selectedTemplate) {
        descriptionEl.textContent = selectedTemplate.description;
        descriptionEl.classList.remove('hidden');
      }
    } else {
      descriptionEl.textContent = '';
      descriptionEl.classList.add('hidden');
    }
  }
  
  /**
   * Handle task selection for estimate generation
   * @param {Event} event - Change event
   */
  handleTaskSelection(event) {
    const checkbox = event.target;
    const taskId = checkbox.dataset.taskId;
    
    if (checkbox.checked) {
      this.selectedTasks.add(taskId);
    } else {
      this.selectedTasks.delete(taskId);
    }
    
    // Update UI to show number of selected tasks
    const selectedCount = document.getElementById('selected-tasks-count');
    if (selectedCount) {
      selectedCount.textContent = this.selectedTasks.size;
    }
    
    // Enable/disable generate button
    const generateButton = document.getElementById('generate-estimate-btn');
    if (generateButton) {
      generateButton.disabled = this.selectedTasks.size === 0;
    }
  }
  
  /**
   * Generate estimate from selected tasks
   */
  async generateEstimateFromTasks() {
    try {
      const clientId = document.getElementById('client-select').value;
      if (!clientId) {
        this.showNotification('error', 'Please select a client');
        return;
      }
      
      if (this.selectedTasks.size === 0) {
        this.showNotification('error', 'Please select at least one task');
        return;
      }
      
      const title = document.getElementById('estimate-title').value;
      const description = document.getElementById('estimate-description').value;
      const hourlyRate = document.getElementById('hourly-rate').value;
      
      const response = await fetch('/api/estimates/from-tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        },
        body: JSON.stringify({
          task_ids: Array.from(this.selectedTasks),
          client_id: parseInt(clientId),
          title: title,
          description: description,
          hourly_rate: parseFloat(hourlyRate)
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate estimate from tasks');
      }
      
      const result = await response.json();
      
      if (result.success) {
        this.showNotification('success', 'Estimate created successfully');
        // Redirect to the estimate detail page
        window.location.href = `/estimates/${result.data.id}`;
      } else {
        throw new Error(result.message || 'Failed to generate estimate');
      }
    } catch (error) {
      console.error('Error generating estimate from tasks:', error);
      this.showNotification('error', error.message || 'Failed to generate estimate');
    }
  }
  
  /**
   * Generate estimate from template
   */
  async generateEstimateFromTemplate() {
    try {
      const templateId = document.getElementById('estimate-template').value;
      const clientId = document.getElementById('client-select').value;
      
      if (!templateId) {
        this.showNotification('error', 'Please select a template');
        return;
      }
      
      if (!clientId) {
        this.showNotification('error', 'Please select a client');
        return;
      }
      
      const title = document.getElementById('estimate-title').value;
      const description = document.getElementById('estimate-description').value;
      const hourlyRate = document.getElementById('hourly-rate').value;
      
      const response = await fetch('/api/estimates/from-template', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        },
        body: JSON.stringify({
          template_id: templateId,
          client_id: parseInt(clientId),
          title: title,
          description: description,
          hourly_rate: parseFloat(hourlyRate)
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate estimate from template');
      }
      
      const result = await response.json();
      
      if (result.success) {
        this.showNotification('success', 'Estimate created successfully');
        // Redirect to the estimate detail page
        window.location.href = `/estimates/${result.data.id}`;
      } else {
        throw new Error(result.message || 'Failed to generate estimate');
      }
    } catch (error) {
      console.error('Error generating estimate from template:', error);
      this.showNotification('error', error.message || 'Failed to generate estimate');
    }
  }
  
  /**
   * Update estimate status
   * @param {Event} event - Click event
   */
  async updateEstimateStatus(event) {
    try {
      const button = event.target.closest('.estimate-status-btn');
      const estimateId = button.dataset.estimateId;
      const status = button.dataset.status;
      
      const response = await fetch(`/api/estimates/${estimateId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        },
        body: JSON.stringify({
          status: status
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update estimate status');
      }
      
      const result = await response.json();
      
      if (result.success) {
        this.showNotification('success', `Estimate ${status === 'approved' ? 'approved' : 'updated'} successfully`);
        
        // Update UI
        const statusBadge = document.querySelector('.estimate-status-badge');
        if (statusBadge) {
          statusBadge.textContent = this.capitalizeFirstLetter(status);
          statusBadge.className = `estimate-status-badge status-${status}`;
        }
        
        // If approved, show convert button
        if (status === 'approved') {
          const convertBtn = document.querySelector('.convert-to-invoice-btn');
          if (convertBtn) {
            convertBtn.classList.remove('hidden');
          }
        }
        
        // Reload the page after a delay to refresh all UI elements
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        throw new Error(result.message || 'Failed to update estimate status');
      }
    } catch (error) {
      console.error('Error updating estimate status:', error);
      this.showNotification('error', error.message || 'Failed to update estimate status');
    }
  }
  
  /**
   * Convert estimate to invoice
   * @param {Event} event - Click event
   */
  async convertToInvoice(event) {
    try {
      const button = event.target.closest('.convert-to-invoice-btn');
      const estimateId = button.dataset.estimateId;
      
      // Optional: Show dialog to confirm and set due date
      const dueDays = prompt('Enter number of days until payment is due (default: 30):', '30');
      
      // Calculate due date
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + parseInt(dueDays || 30));
      
      const response = await fetch(`/api/estimates/${estimateId}/convert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        },
        body: JSON.stringify({
          due_date: dueDate.toISOString()
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to convert estimate to invoice');
      }
      
      const result = await response.json();
      
      if (result.success) {
        this.showNotification('success', 'Estimate converted to invoice successfully');
        
        // Redirect to the invoice detail page
        setTimeout(() => {
          window.location.href = `/invoices/${result.data.invoice.id}`;
        }, 1500);
      } else {
        throw new Error(result.message || 'Failed to convert estimate to invoice');
      }
    } catch (error) {
      console.error('Error converting estimate to invoice:', error);
      this.showNotification('error', error.message || 'Failed to convert estimate to invoice');
    }
  }
  
  /**
   * Show notification to the user
   * @param {string} type - Notification type (success, error)
   * @param {string} message - Notification message
   */
  showNotification(type, message) {
    const notificationContainer = document.getElementById('notification-container');
    if (!notificationContainer) return;
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <span>${message}</span>
      <button class="close-btn">&times;</button>
    `;
    
    notificationContainer.appendChild(notification);
    
    // Close button functionality
    notification.querySelector('.close-btn').addEventListener('click', () => {
      notification.remove();
    });
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      notification.remove();
    }, 5000);
  }
  
  /**
   * Get authentication token from local storage
   * @returns {string} Auth token
   */
  getAuthToken() {
    return localStorage.getItem('authToken') || '';
  }
  
  /**
   * Capitalize first letter of a string
   * @param {string} string - String to capitalize
   * @returns {string} Capitalized string
   */
  capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  }
}

// Initialize the estimate manager
const estimateManager = new EstimateManager(); 