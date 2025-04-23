/**
 * InvoiceManager - Client-side handler for invoice operations
 * Manages invoice creation, payment tracking, recurring invoices, and overdue handling
 */
class InvoiceManager {
  constructor() {
    this.baseUrl = '/api/invoices';
    this.selectedPaymentMethod = null;
    this.recurringFrequencies = ['weekly', 'monthly', 'quarterly', 'yearly'];
    this.initEventListeners();
    this.initTableFilters();
    this.loadInvoices();
    this.loadPaymentMethods();
  }

  initEventListeners() {
    // Invoice creation and management
    document.addEventListener('click', (e) => {
      if (e.target.matches('#create-invoice-btn')) this.handleCreateInvoice(e);
      if (e.target.matches('#invoice-from-estimate-btn')) this.createFromEstimate(e);
      if (e.target.matches('.send-invoice-btn')) this.sendInvoice(e);
      if (e.target.matches('.mark-paid-btn')) this.markAsPaid(e);
      if (e.target.matches('.delete-invoice-btn')) this.deleteInvoice(e);
      if (e.target.matches('.edit-invoice-btn')) this.openEditModal(e);
      if (e.target.matches('#save-invoice-btn')) this.saveInvoice(e);
    });

    // Payment handling
    document.addEventListener('click', (e) => {
      if (e.target.matches('#record-payment-btn')) this.recordPayment(e);
      if (e.target.matches('.view-payments-btn')) this.viewPayments(e);
      if (e.target.matches('.edit-payment-btn')) this.editPayment(e);
      if (e.target.matches('.delete-payment-btn')) this.deletePayment(e);
      if (e.target.matches('.payment-method')) this.selectPaymentMethod(e);
    });

    // Recurring invoices
    document.addEventListener('click', (e) => {
      if (e.target.matches('#create-recurring-btn')) this.createRecurringInvoice(e);
      if (e.target.matches('.view-recurring-btn')) this.viewRecurringInvoices(e);
      if (e.target.matches('.cancel-recurring-btn')) this.cancelRecurringInvoice(e);
      if (e.target.matches('.reactivate-recurring-btn')) this.reactivateRecurringInvoice(e);
    });
    
    // Overdue handling
    document.addEventListener('click', (e) => {
      if (e.target.matches('.view-overdue-btn')) this.viewOverdueInvoices(e);
      if (e.target.matches('.send-reminder-btn')) this.sendReminder(e);
      if (e.target.matches('.apply-fee-btn')) this.applyLateFee(e);
    });

    // Form related events
    const recurringToggle = document.getElementById('recurring-invoice-toggle');
    if (recurringToggle) {
      recurringToggle.addEventListener('change', this.toggleRecurringOptions.bind(this));
    }

    // Filter events
    document.querySelector('#invoice-status-filter')?.addEventListener('change', this.loadInvoices.bind(this));
    document.querySelector('#date-range-filter')?.addEventListener('change', this.loadInvoices.bind(this));
  }

  initTableFilters() {
    const statusFilter = document.querySelector('#invoice-status-filter');
    if (statusFilter) {
      statusFilter.innerHTML = `
        <option value="all">All Statuses</option>
        <option value="draft">Draft</option>
        <option value="sent">Sent</option>
        <option value="partial">Partially Paid</option>
        <option value="paid">Paid</option>
        <option value="overdue">Overdue</option>
        <option value="canceled">Canceled</option>
      `;
    }
  }

  async loadInvoices() {
    try {
      const statusFilter = document.querySelector('#invoice-status-filter')?.value || 'all';
      const dateRange = document.querySelector('#date-range-filter')?.value || 'all';
      
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (dateRange !== 'all') params.append('dateRange', dateRange);
      
      const response = await fetch(`${this.baseUrl}?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`
        }
      });
      
      if (!response.ok) throw new Error('Failed to load invoices');
      
      const data = await response.json();
      this.renderInvoiceTable(data.invoices);
      
      // Update dashboard stats if dashboard elements exist
      this.updateDashboardStats();
    } catch (error) {
      this.showNotification('error', `Error loading invoices: ${error.message}`);
    }
  }

  renderInvoiceTable(invoices) {
    const tableBody = document.querySelector('#invoices-table tbody');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    if (invoices.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="8" class="text-center">No invoices found</td></tr>';
      return;
    }
    
    invoices.forEach(invoice => {
      const dueDate = new Date(invoice.due_date);
      const isOverdue = invoice.status !== 'paid' && invoice.status !== 'canceled' && dueDate < new Date();
      
      const paymentStatus = this.getPaymentStatusBadge(invoice.status, invoice.amount_paid, invoice.total_amount, isOverdue);
      
      tableBody.innerHTML += `
        <tr data-invoice-id="${invoice.id}">
          <td>${invoice.invoice_number}</td>
          <td>${invoice.client_name || 'N/A'}</td>
          <td>${invoice.title}</td>
          <td>${paymentStatus}</td>
          <td>$${invoice.total_amount.toFixed(2)}</td>
          <td>$${invoice.amount_paid.toFixed(2)}</td>
          <td>${new Date(invoice.due_date).toLocaleDateString()}</td>
          <td>
            <div class="btn-group">
              <button class="btn btn-sm btn-outline-primary view-invoice" data-invoice-id="${invoice.id}">
                <i class="fas fa-eye"></i>
              </button>
              <button class="btn btn-sm btn-outline-success record-payment" data-invoice-id="${invoice.id}" 
                ${invoice.status === 'paid' || invoice.status === 'canceled' ? 'disabled' : ''}>
                <i class="fas fa-dollar-sign"></i>
              </button>
              <button class="btn btn-sm btn-outline-info send-invoice" data-invoice-id="${invoice.id}"
                ${invoice.status === 'canceled' ? 'disabled' : ''}>
                <i class="fas fa-paper-plane"></i>
              </button>
              <button class="btn btn-sm btn-outline-danger delete-invoice" data-invoice-id="${invoice.id}" 
                ${invoice.status !== 'draft' ? 'disabled' : ''}>
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    });
  }

  getPaymentStatusBadge(status, amountPaid, totalAmount, isOverdue) {
    if (isOverdue) {
      return '<span class="badge bg-danger">Overdue</span>';
    }
    
    switch (status) {
      case 'draft':
        return '<span class="badge bg-secondary">Draft</span>';
      case 'sent':
        return '<span class="badge bg-primary">Sent</span>';
      case 'paid':
        return '<span class="badge bg-success">Paid</span>';
      case 'canceled':
        return '<span class="badge bg-dark">Canceled</span>';
      default:
        // Check if partially paid
        if (amountPaid > 0 && amountPaid < totalAmount) {
          return '<span class="badge bg-warning">Partial</span>';
        }
        return '<span class="badge bg-info">Pending</span>';
    }
  }

  async handleInvoiceAction(event) {
    const target = event.target.closest('button');
    if (!target) return;
    
    const invoiceId = target.dataset.invoiceId;
    if (!invoiceId) return;
    
    if (target.classList.contains('view-invoice')) {
      this.viewInvoice(invoiceId);
    } else if (target.classList.contains('record-payment')) {
      this.showRecordPaymentModal(invoiceId);
    } else if (target.classList.contains('send-invoice')) {
      this.sendInvoice(invoiceId);
    } else if (target.classList.contains('delete-invoice')) {
      this.deleteInvoice(invoiceId);
    }
  }

  async showRecordPaymentModal(invoiceId) {
    try {
      const response = await fetch(`${this.baseUrl}/${invoiceId}`, {
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`
        }
      });
      
      if (!response.ok) throw new Error('Failed to fetch invoice details');
      
      const invoice = await response.json();
      
      // Get payment methods
      const methodsResponse = await fetch(`${this.baseUrl}/payment-methods`, {
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`
        }
      });
      
      if (!methodsResponse.ok) throw new Error('Failed to load payment methods');
      const methods = await methodsResponse.json();
      
      const modal = document.querySelector('#payment-modal');
      const balanceDue = invoice.total_amount - invoice.amount_paid;
      
      if (modal) {
        modal.querySelector('#payment-invoice-id').value = invoice.id;
        modal.querySelector('#payment-invoice-number').textContent = invoice.invoice_number;
        modal.querySelector('#payment-invoice-total').textContent = `$${invoice.total_amount.toFixed(2)}`;
        modal.querySelector('#payment-amount-paid').textContent = `$${invoice.amount_paid.toFixed(2)}`;
        modal.querySelector('#payment-balance-due').textContent = `$${balanceDue.toFixed(2)}`;
        
        const amountInput = modal.querySelector('#payment-amount');
        amountInput.value = balanceDue.toFixed(2);
        amountInput.max = balanceDue;
        
        // Populate payment methods dropdown
        const methodSelect = modal.querySelector('#payment-method');
        methodSelect.innerHTML = '';
        methods.forEach(method => {
          methodSelect.innerHTML += `<option value="${method.id}">${method.name}</option>`;
        });
        
        // Show the modal
        const bootstrapModal = new bootstrap.Modal(modal);
        bootstrapModal.show();
      }
    } catch (error) {
      this.showNotification('error', `Error loading payment details: ${error.message}`);
    }
  }

  async recordPayment(event) {
    event.preventDefault();
    
    const form = event.target;
    const invoiceId = form.querySelector('#payment-invoice-id').value;
    const amount = parseFloat(form.querySelector('#payment-amount').value);
    const methodId = form.querySelector('#payment-method').value;
    const notes = form.querySelector('#payment-notes').value;
    
    try {
      const response = await fetch(`${this.baseUrl}/${invoiceId}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        },
        body: JSON.stringify({
          amount,
          payment_method_id: methodId,
          notes
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to record payment');
      }
      
      // Close the modal
      const modal = bootstrap.Modal.getInstance(document.querySelector('#payment-modal'));
      modal.hide();
      
      this.showNotification('success', 'Payment recorded successfully');
      this.loadInvoices();
    } catch (error) {
      this.showNotification('error', `Error recording payment: ${error.message}`);
    }
  }

  async handlePaymentAction(event) {
    const target = event.target.closest('button');
    if (!target) return;
    
    const paymentId = target.dataset.paymentId;
    if (!paymentId) return;
    
    if (target.classList.contains('delete-payment')) {
      this.deletePayment(paymentId);
    }
  }

  async deletePayment(paymentId) {
    if (!confirm('Are you sure you want to delete this payment?')) return;
    
    try {
      const response = await fetch(`${this.baseUrl}/payments/${paymentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`
        }
      });
      
      if (!response.ok) throw new Error('Failed to delete payment');
      
      this.showNotification('success', 'Payment deleted successfully');
      // Reload current invoice details or payment list
      this.loadInvoices();
    } catch (error) {
      this.showNotification('error', `Error deleting payment: ${error.message}`);
    }
  }

  // --- Invoice Creation & Management ---

  async handleCreateInvoice(event) {
    event.preventDefault();
    const form = document.getElementById('invoice-form');
    
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const formData = new FormData(form);
    const invoiceData = {
      client_id: formData.get('client_id'),
      title: formData.get('title'),
      description: formData.get('description'),
      due_date: formData.get('due_date'),
      items: this.collectLineItems(),
      is_recurring: formData.get('is_recurring') === 'on',
    };

    // Add recurring info if needed
    if (invoiceData.is_recurring) {
      invoiceData.recurring = {
        frequency: formData.get('frequency'),
        start_date: formData.get('start_date'),
        end_date: formData.get('end_date') || null,
        day_of_month: formData.get('day_of_month') || null,
        max_occurrences: formData.get('max_occurrences') || null
      };
    }

    try {
      const endpoint = invoiceData.is_recurring ? `${this.baseUrl}/recurring` : this.baseUrl;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        },
        body: JSON.stringify(invoiceData)
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || 'Failed to create invoice');
      }

      this.showNotification('success', invoiceData.is_recurring ? 
        'Recurring invoice created successfully' : 
        'Invoice created successfully');
      
      setTimeout(() => {
        window.location.href = '/invoices';
      }, 1500);
    } catch (error) {
      this.showNotification('error', error.message);
    }
  }

  collectLineItems() {
    const items = [];
    const itemRows = document.querySelectorAll('.invoice-item-row');
    
    itemRows.forEach(row => {
      const description = row.querySelector('.item-description').value;
      const quantity = parseFloat(row.querySelector('.item-quantity').value);
      const unitPrice = parseFloat(row.querySelector('.item-unit-price').value);
      const taxRate = parseFloat(row.querySelector('.item-tax-rate').value || 0);
      
      if (description && !isNaN(quantity) && !isNaN(unitPrice)) {
        items.push({
          description,
          quantity,
          unit_price: unitPrice,
          tax_rate: taxRate
        });
      }
    });
    
    return items;
  }

  async createFromEstimate(event) {
    const estimateId = event.target.dataset.estimateId;
    if (!estimateId) {
      this.showNotification('error', 'No estimate selected');
      return;
    }

    try {
      const response = await fetch(`${this.baseUrl}/from-estimate/${estimateId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        }
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || 'Failed to create invoice from estimate');
      }

      this.showNotification('success', 'Invoice created from estimate');
      
      setTimeout(() => {
        window.location.href = `/invoices/${result.data.id}`;
      }, 1500);
    } catch (error) {
      this.showNotification('error', error.message);
    }
  }

  async sendInvoice(event) {
    const invoiceId = event.target.dataset.invoiceId;
    try {
      const response = await fetch(`${this.baseUrl}/${invoiceId}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        }
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || 'Failed to send invoice');
      }

      this.showNotification('success', 'Invoice sent to client');
    } catch (error) {
      this.showNotification('error', error.message);
    }
  }

  async markAsPaid(event) {
    const invoiceId = event.target.dataset.invoiceId;
    const paymentDate = new Date().toISOString().split('T')[0];
    
    try {
      const response = await fetch(`${this.baseUrl}/${invoiceId}/mark-paid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        },
        body: JSON.stringify({
          payment_date: paymentDate,
          payment_method: this.selectedPaymentMethod || 'bank_transfer'
        })
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || 'Failed to mark invoice as paid');
      }

      this.showNotification('success', 'Invoice marked as paid');
      
      // Refresh the page to show updated status
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      this.showNotification('error', error.message);
    }
  }

  async deleteInvoice(event) {
    if (!confirm('Are you sure you want to delete this invoice? This action cannot be undone.')) {
      return;
    }

    const invoiceId = event.target.dataset.invoiceId;
    try {
      const response = await fetch(`${this.baseUrl}/${invoiceId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`
        }
      });
      
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || 'Failed to delete invoice');
      }

      this.showNotification('success', 'Invoice deleted successfully');
      
      setTimeout(() => {
        window.location.href = '/invoices';
      }, 1500);
    } catch (error) {
      this.showNotification('error', error.message);
    }
  }

  // --- Recurring Invoice Management ---

  toggleRecurringOptions(event) {
    const recurringOptions = document.getElementById('recurring-options');
    if (recurringOptions) {
      recurringOptions.style.display = event.target.checked ? 'block' : 'none';
    }
  }

  async createRecurringInvoice(event) {
    // This is handled by the handleCreateInvoice method with is_recurring flag
    this.handleCreateInvoice(event);
  }

  async viewRecurringInvoices() {
    try {
      const response = await fetch(`${this.baseUrl}/recurring`, {
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`
        }
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || 'Failed to fetch recurring invoices');
      }

      // Update UI with recurring invoices
      const container = document.getElementById('recurring-invoices-container');
      if (!container) return;
      
      container.innerHTML = '';
      
      const invoices = result.data;
      if (invoices.length === 0) {
        container.innerHTML = '<p>No recurring invoices found.</p>';
        return;
      }
      
      const table = document.createElement('table');
      table.className = 'table table-striped';
      table.innerHTML = `
        <thead>
          <tr>
            <th>Client</th>
            <th>Title</th>
            <th>Amount</th>
            <th>Frequency</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${invoices.map(invoice => `
            <tr>
              <td>${invoice.client_name}</td>
              <td>${invoice.title}</td>
              <td>${this.formatCurrency(invoice.total_amount)}</td>
              <td>${this.capitalizeFirstLetter(invoice.frequency)}</td>
              <td>${this.getStatusBadge(invoice.status)}</td>
              <td>
                ${invoice.status === 'active' ? 
                  `<button class="btn btn-sm btn-warning cancel-recurring-btn" data-id="${invoice.id}">Cancel</button>` : 
                  `<button class="btn btn-sm btn-success reactivate-recurring-btn" data-id="${invoice.id}">Reactivate</button>`
                }
                <button class="btn btn-sm btn-danger delete-recurring-btn" data-id="${invoice.id}">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      `;
      
      container.appendChild(table);
    } catch (error) {
      this.showNotification('error', error.message);
    }
  }

  async cancelRecurringInvoice(event) {
    const invoiceId = event.target.dataset.id;
    try {
      const response = await fetch(`${this.baseUrl}/recurring/${invoiceId}/cancel`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`
        }
      });
      
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || 'Failed to cancel recurring invoice');
      }

      this.showNotification('success', 'Recurring invoice canceled');
      this.viewRecurringInvoices();
    } catch (error) {
      this.showNotification('error', error.message);
    }
  }

  async reactivateRecurringInvoice(event) {
    const invoiceId = event.target.dataset.id;
    try {
      const response = await fetch(`${this.baseUrl}/recurring/${invoiceId}/reactivate`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`
        }
      });
      
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || 'Failed to reactivate recurring invoice');
      }

      this.showNotification('success', 'Recurring invoice reactivated');
      this.viewRecurringInvoices();
    } catch (error) {
      this.showNotification('error', error.message);
    }
  }

  // --- Overdue Invoice Management ---

  async viewOverdueInvoices() {
    try {
      const response = await fetch(`${this.baseUrl}/overdue`, {
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`
        }
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || 'Failed to fetch overdue invoices');
      }

      // Update UI with overdue invoices
      const container = document.getElementById('overdue-invoices-container');
      if (!container) {
        console.error('Overdue invoices container not found');
        return;
      }
      
      container.innerHTML = '';
      
      const invoices = result.data;
      if (invoices.length === 0) {
        container.innerHTML = '<div class="alert alert-success">No overdue invoices found.</div>';
        return;
      }
      
      const table = document.createElement('table');
      table.className = 'table table-striped table-hover';
      table.innerHTML = `
        <thead>
          <tr>
            <th>Invoice #</th>
            <th>Client</th>
            <th>Amount Due</th>
            <th>Due Date</th>
            <th>Days Overdue</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${invoices.map(invoice => {
            const daysOverdue = this.calculateDaysOverdue(invoice.due_date);
            return `
              <tr class="${daysOverdue > 30 ? 'table-danger' : daysOverdue > 15 ? 'table-warning' : ''}">
                <td>${invoice.invoice_number}</td>
                <td>${invoice.client_name}</td>
                <td>${this.formatCurrency(invoice.amount_due)}</td>
                <td>${this.formatDate(invoice.due_date)}</td>
                <td>${daysOverdue} days</td>
                <td>
                  <button class="btn btn-sm btn-primary send-reminder-btn" data-id="${invoice.id}">Send Reminder</button>
                  <button class="btn btn-sm btn-warning apply-fee-btn" data-id="${invoice.id}">Apply Late Fee</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      `;
      
      container.appendChild(table);
    } catch (error) {
      this.showNotification('error', error.message);
    }
  }

  async sendReminder(event) {
    const invoiceId = event.target.dataset.id;
    try {
      const response = await fetch(`${this.baseUrl}/${invoiceId}/reminder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        }
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || 'Failed to send reminder');
      }

      this.showNotification('success', 'Payment reminder sent to client');
    } catch (error) {
      this.showNotification('error', error.message);
    }
  }

  async applyLateFee(event) {
    const invoiceId = event.target.dataset.id;
    
    // Prompt for late fee amount or percentage
    const feeType = prompt('Enter fee type (fixed or percentage):', 'fixed');
    if (!feeType || !['fixed', 'percentage'].includes(feeType.toLowerCase())) {
      this.showNotification('error', 'Invalid fee type');
      return;
    }
    
    const feeAmount = prompt('Enter fee amount' + (feeType.toLowerCase() === 'percentage' ? ' (%)' : ''), '25');
    if (!feeAmount || isNaN(parseFloat(feeAmount))) {
      this.showNotification('error', 'Invalid fee amount');
      return;
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/${invoiceId}/late-fee`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        },
        body: JSON.stringify({
          fee_type: feeType.toLowerCase(),
          fee_amount: parseFloat(feeAmount)
        })
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || 'Failed to apply late fee');
      }

      this.showNotification('success', 'Late fee applied successfully');
      
      // Refresh the page
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      this.showNotification('error', error.message);
    }
  }

  // --- Helper Methods ---

  calculateDaysOverdue(dueDate) {
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = today - due;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }

  getStatusBadge(status) {
    const statusMap = {
      'draft': 'badge bg-secondary',
      'pending': 'badge bg-warning',
      'sent': 'badge bg-primary',
      'paid': 'badge bg-success',
      'overdue': 'badge bg-danger',
      'canceled': 'badge bg-dark',
      'active': 'badge bg-success',
      'inactive': 'badge bg-secondary'
    };
    
    const badgeClass = statusMap[status] || 'badge bg-secondary';
    return `<span class="${badgeClass}">${this.capitalizeFirstLetter(status)}</span>`;
  }

  formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  showNotification(type, message) {
    const container = document.getElementById('notification-container');
    if (!container) {
      // Create container if it doesn't exist
      const newContainer = document.createElement('div');
      newContainer.id = 'notification-container';
      newContainer.style.position = 'fixed';
      newContainer.style.top = '20px';
      newContainer.style.right = '20px';
      newContainer.style.zIndex = '9999';
      document.body.appendChild(newContainer);
    }
    
    const notification = document.createElement('div');
    notification.className = `alert alert-${type === 'success' ? 'success' : 'danger'} alert-dismissible fade show`;
    notification.innerHTML = `
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    const notificationContainer = document.getElementById('notification-container');
    notificationContainer.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      notification.remove();
    }, 5000);
  }

  getAuthToken() {
    return localStorage.getItem('auth_token');
  }

  capitalizeFirstLetter(string) {
    if (!string) return '';
    return string.charAt(0).toUpperCase() + string.slice(1);
  }

  async loadPaymentMethods() {
    try {
      const response = await fetch(`${this.baseUrl}/payment-methods`, {
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`
        }
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || 'Failed to load payment methods');
      }

      const methods = result.data;
      const container = document.getElementById('payment-methods-container');
      
      if (!container) return;
      
      container.innerHTML = '';
      
      methods.forEach(method => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-outline-secondary payment-method';
        button.dataset.method = method.id;
        button.textContent = this.capitalizeFirstLetter(method.name.replace('_', ' '));
        
        button.addEventListener('click', () => {
          document.querySelectorAll('.payment-method').forEach(btn => {
            btn.classList.remove('active');
          });
          button.classList.add('active');
          this.selectedPaymentMethod = method.id;
        });
        
        container.appendChild(button);
      });
    } catch (error) {
      console.error('Error loading payment methods:', error);
    }
  }

  selectPaymentMethod(event) {
    const method = event.target.dataset.method;
    if (!method) return;
    
    document.querySelectorAll('.payment-method').forEach(btn => {
      btn.classList.remove('active');
    });
    event.target.classList.add('active');
    this.selectedPaymentMethod = method;
    
    // If we have a form, update the payment method field
    const paymentMethodInput = document.querySelector('input[name="payment_method"]');
    if (paymentMethodInput) {
      paymentMethodInput.value = method;
    }
  }

  async updateDashboardStats() {
    try {
      // Only proceed if we're on the dashboard page
      const dashboardStats = document.querySelector('#invoice-dashboard-stats');
      if (!dashboardStats) return;
      
      const response = await fetch('/api/invoices/statistics', {
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`
        }
      });
      
      if (!response.ok) throw new Error('Failed to fetch invoice statistics');
      
      const stats = await response.json();
      
      // Update dashboard statistics
      document.querySelector('#total-invoices-count').textContent = stats.totalInvoices || 0;
      document.querySelector('#paid-invoices-amount').textContent = `$${(stats.paidAmount || 0).toFixed(2)}`;
      document.querySelector('#overdue-invoices-count').textContent = stats.overdueCount || 0;
      document.querySelector('#overdue-amount').textContent = `$${(stats.overdueAmount || 0).toFixed(2)}`;
      
      // If chart elements exist, update them
      this.updateDashboardCharts(stats);
    } catch (error) {
      console.error('Error updating dashboard stats:', error);
    }
  }

  updateDashboardCharts(stats) {
    // Implement chart updates if needed
  }
}

// Initialize the invoice manager
const invoiceManager = new InvoiceManager(); 