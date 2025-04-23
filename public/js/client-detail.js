/**
 * Client Detail JS
 * Handles client detail view and related data
 */

// State variables
let clientId = null;
let client = null;
let clientTasks = [];
let clientInvoices = [];
let taskFilters = { status: '', priority: '' };
let invoiceFilters = { status: '' };

// DOM Elements
const clientNameHeading = document.getElementById('clientName');
const clientEmail = document.getElementById('clientEmail');
const clientPhone = document.getElementById('clientPhone');
const clientAddress = document.getElementById('clientAddress');
const clientCreated = document.getElementById('clientCreated');
const clientUpdated = document.getElementById('clientUpdated');
const clientNotes = document.getElementById('clientNotes');
const editClientBtn = document.getElementById('editClientBtn');
const deleteClientBtn = document.getElementById('deleteClientBtn');
const loadingState = document.getElementById('loadingState');
const clientDetailContainer = document.getElementById('clientDetailContainer');
const alertContainer = document.getElementById('alertContainer');
const taskStatusFilter = document.getElementById('taskStatusFilter');
const taskPriorityFilter = document.getElementById('taskPriorityFilter');
const invoiceStatusFilter = document.getElementById('invoiceStatusFilter');
const clientTasksTableBody = document.getElementById('clientTasksTableBody');
const clientInvoicesTableBody = document.getElementById('clientInvoicesTableBody');
const tasksEmptyState = document.getElementById('tasksEmptyState');
const invoicesEmptyState = document.getElementById('invoicesEmptyState');
const clientModal = new bootstrap.Modal(document.getElementById('clientModal'));
const deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));
const saveClientBtn = document.getElementById('saveClientBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const clientForm = document.getElementById('clientForm');
const clientIdInput = document.getElementById('clientId');
const newTaskForClientBtn = document.getElementById('newTaskForClientBtn');
const newInvoiceForClientBtn = document.getElementById('newInvoiceForClientBtn');

// Task and invoice stats elements
const totalTasks = document.getElementById('totalTasks');
const pendingTasks = document.getElementById('pendingTasks');
const completedTasks = document.getElementById('completedTasks');
const overdueTasks = document.getElementById('overdueTasks');
const totalInvoices = document.getElementById('totalInvoices');
const pendingInvoices = document.getElementById('pendingInvoices');
const paidInvoices = document.getElementById('paidInvoices');
const overdueInvoices = document.getElementById('overdueInvoices');

// Init
document.addEventListener('DOMContentLoaded', init);

function init() {
  // Extract client ID from URL
  const urlParts = window.location.pathname.split('/');
  clientId = urlParts[urlParts.length - 1];
  
  // Add event listeners
  addEventListeners();
  
  // Load client data
  loadClientData();
}

function addEventListeners() {
  // Edit client
  editClientBtn.addEventListener('click', () => showClientModal());
  
  // Delete client
  deleteClientBtn.addEventListener('click', showDeleteModal);
  
  // Save client
  saveClientBtn.addEventListener('click', saveClient);
  
  // Confirm delete
  confirmDeleteBtn.addEventListener('click', deleteClient);
  
  // Task filters
  taskStatusFilter.addEventListener('change', filterTasks);
  taskPriorityFilter.addEventListener('change', filterTasks);
  
  // Invoice filters
  invoiceStatusFilter.addEventListener('change', filterInvoices);
  
  // New task for client
  newTaskForClientBtn.addEventListener('click', () => {
    // Redirect to task form with client ID
    window.location.href = `/tasks/new?client_id=${clientId}`;
  });
  
  // New invoice for client
  newInvoiceForClientBtn.addEventListener('click', () => {
    // Redirect to invoice form with client ID
    window.location.href = `/invoices/new?client_id=${clientId}`;
  });
  
  // Form validation
  clientForm.addEventListener('submit', (e) => e.preventDefault());
}

/**
 * Load client data
 */
async function loadClientData() {
  try {
    showLoading(true);
    
    const response = await ClientApi.getClientById(clientId);
    
    if (response.success) {
      client = response.data;
      renderClientData();
      
      // Load related data
      await Promise.all([
        loadClientTasks(),
        loadClientInvoices()
      ]);
    } else {
      showAlert('Error loading client data', 'danger');
    }
  } catch (error) {
    console.error('Error loading client data:', error);
    showAlert('Failed to load client data. Please try again.', 'danger');
  } finally {
    showLoading(false);
  }
}

/**
 * Render client data
 */
function renderClientData() {
  // Update page title
  document.title = `${client.name} | Client Detail`;
  
  // Update client info
  clientNameHeading.textContent = client.name;
  clientEmail.textContent = client.email || '-';
  clientPhone.textContent = client.phone || '-';
  clientAddress.textContent = client.address || '-';
  clientNotes.textContent = client.notes || '-';
  
  // Format dates
  clientCreated.textContent = formatDate(client.created_at);
  clientUpdated.textContent = formatDate(client.updated_at);
  
  // Update task stats
  totalTasks.textContent = client.taskStats?.total || 0;
  pendingTasks.textContent = client.taskStats?.pending || 0;
  completedTasks.textContent = client.taskStats?.completed || 0;
  overdueTasks.textContent = client.taskStats?.overdue || 0;
  
  // Update invoice stats
  totalInvoices.textContent = client.invoiceStats?.total || 0;
  pendingInvoices.textContent = client.invoiceStats?.pending || 0;
  paidInvoices.textContent = client.invoiceStats?.paid || 0;
  overdueInvoices.textContent = client.invoiceStats?.overdue || 0;
}

/**
 * Load client tasks
 */
async function loadClientTasks() {
  try {
    const response = await ClientApi.getClientTasks(clientId);
    
    if (response.success) {
      clientTasks = response.data;
      renderClientTasks();
    } else {
      showAlert('Error loading client tasks', 'danger');
    }
  } catch (error) {
    console.error('Error loading client tasks:', error);
    tasksEmptyState.classList.remove('d-none');
  }
}

/**
 * Load client invoices
 */
async function loadClientInvoices() {
  try {
    const response = await ClientApi.getClientInvoices(clientId);
    
    if (response.success) {
      clientInvoices = response.data;
      renderClientInvoices();
    } else {
      showAlert('Error loading client invoices', 'danger');
    }
  } catch (error) {
    console.error('Error loading client invoices:', error);
    invoicesEmptyState.classList.remove('d-none');
  }
}

/**
 * Render client tasks with filters
 */
function renderClientTasks() {
  // Apply filters
  const filteredTasks = clientTasks.filter(task => {
    return (!taskFilters.status || task.status === taskFilters.status) &&
           (!taskFilters.priority || task.priority === taskFilters.priority);
  });
  
  if (!filteredTasks.length) {
    tasksEmptyState.classList.remove('d-none');
    clientTasksTableBody.innerHTML = '';
    return;
  }
  
  tasksEmptyState.classList.add('d-none');
  clientTasksTableBody.innerHTML = '';
  
  filteredTasks.forEach(task => {
    const row = document.createElement('tr');
    
    row.innerHTML = `
      <td><a href="/tasks/${task.id}">${task.title}</a></td>
      <td>
        <span class="badge rounded-pill bg-${getStatusBadgeColor(task.status)}">${formatStatus(task.status)}</span>
      </td>
      <td>
        <span class="badge rounded-pill bg-${getPriorityBadgeColor(task.priority)}">${formatPriority(task.priority)}</span>
      </td>
      <td>${task.due_date ? formatDate(task.due_date) : '-'}</td>
      <td>
        <div class="btn-group btn-group-sm">
          <a href="/tasks/${task.id}" class="btn btn-outline-primary">
            <i class="bi bi-eye"></i>
          </a>
          <a href="/tasks/${task.id}/edit" class="btn btn-outline-secondary">
            <i class="bi bi-pencil"></i>
          </a>
        </div>
      </td>
    `;
    
    clientTasksTableBody.appendChild(row);
  });
}

/**
 * Render client invoices with filters
 */
function renderClientInvoices() {
  // Apply filters
  const filteredInvoices = clientInvoices.filter(invoice => {
    return (!invoiceFilters.status || invoice.status === invoiceFilters.status);
  });
  
  if (!filteredInvoices.length) {
    invoicesEmptyState.classList.remove('d-none');
    clientInvoicesTableBody.innerHTML = '';
    return;
  }
  
  invoicesEmptyState.classList.add('d-none');
  clientInvoicesTableBody.innerHTML = '';
  
  filteredInvoices.forEach(invoice => {
    const row = document.createElement('tr');
    
    row.innerHTML = `
      <td>${invoice.invoice_number}</td>
      <td><a href="/invoices/${invoice.id}">${invoice.title}</a></td>
      <td>${formatCurrency(invoice.total_amount)}</td>
      <td>
        <span class="badge rounded-pill bg-${getInvoiceStatusBadgeColor(invoice.status)}">${formatInvoiceStatus(invoice.status)}</span>
      </td>
      <td>${invoice.due_date ? formatDate(invoice.due_date) : '-'}</td>
      <td>
        <div class="btn-group btn-group-sm">
          <a href="/invoices/${invoice.id}" class="btn btn-outline-primary">
            <i class="bi bi-eye"></i>
          </a>
          <a href="/invoices/${invoice.id}/edit" class="btn btn-outline-secondary">
            <i class="bi bi-pencil"></i>
          </a>
        </div>
      </td>
    `;
    
    clientInvoicesTableBody.appendChild(row);
  });
}

/**
 * Filter tasks based on selected options
 */
function filterTasks() {
  taskFilters.status = taskStatusFilter.value;
  taskFilters.priority = taskPriorityFilter.value;
  renderClientTasks();
}

/**
 * Filter invoices based on selected options
 */
function filterInvoices() {
  invoiceFilters.status = invoiceStatusFilter.value;
  renderClientInvoices();
}

/**
 * Show/hide loading state
 * @param {boolean} show - Whether to show or hide loading
 */
function showLoading(show) {
  loadingState.classList.toggle('d-none', !show);
  clientDetailContainer.classList.toggle('d-none', show);
}

/**
 * Show client edit modal
 */
function showClientModal() {
  // Set form values
  clientIdInput.value = client.id;
  document.getElementById('clientNameInput').value = client.name;
  document.getElementById('clientEmailInput').value = client.email || '';
  document.getElementById('clientPhoneInput').value = client.phone || '';
  document.getElementById('clientAddressInput').value = client.address || '';
  document.getElementById('clientNotesInput').value = client.notes || '';
  
  // Reset validation
  clientForm.classList.remove('was-validated');
  
  clientModal.show();
}

/**
 * Show delete confirmation modal
 */
function showDeleteModal() {
  deleteModal.show();
}

/**
 * Save client changes
 */
async function saveClient() {
  // Validate form
  if (!clientForm.checkValidity()) {
    clientForm.classList.add('was-validated');
    return;
  }
  
  const clientData = {
    name: document.getElementById('clientNameInput').value,
    email: document.getElementById('clientEmailInput').value,
    phone: document.getElementById('clientPhoneInput').value,
    address: document.getElementById('clientAddressInput').value,
    notes: document.getElementById('clientNotesInput').value
  };
  
  try {
    const response = await ClientApi.updateClient(clientId, clientData);
    
    if (response.success) {
      clientModal.hide();
      showAlert('Client updated successfully', 'success');
      
      // Update client data
      client = response.data;
      renderClientData();
    } else {
      showAlert(response.message || 'Failed to update client', 'danger');
    }
  } catch (error) {
    console.error('Error updating client:', error);
    showAlert('Error updating client. Please try again.', 'danger');
  }
}

/**
 * Delete client
 */
async function deleteClient() {
  try {
    const response = await ClientApi.deleteClient(clientId);
    
    if (response.success) {
      showAlert('Client deleted successfully', 'success');
      
      // Redirect to clients page after short delay
      setTimeout(() => {
        window.location.href = '/clients';
      }, 1500);
    } else {
      deleteModal.hide();
      showAlert(response.message || 'Failed to delete client', 'danger');
    }
  } catch (error) {
    console.error('Error deleting client:', error);
    deleteModal.hide();
    showAlert('Error deleting client. Please try again.', 'danger');
  }
}

/**
 * Show alert message
 * @param {string} message - Alert message
 * @param {string} type - Alert type (success, danger, etc.)
 */
function showAlert(message, type = 'info') {
  const alert = document.createElement('div');
  alert.className = `alert alert-${type} alert-dismissible fade show`;
  alert.role = 'alert';
  
  alert.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
  `;
  
  alertContainer.innerHTML = '';
  alertContainer.appendChild(alert);
  
  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    if (alert.parentNode) {
      const bsAlert = new bootstrap.Alert(alert);
      bsAlert.close();
    }
  }, 5000);
}

// Helper functions

/**
 * Format date string
 * @param {string} dateString - Date string
 * @returns {string} Formatted date
 */
function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Format status text
 * @param {string} status - Status code
 * @returns {string} Formatted status
 */
function formatStatus(status) {
  switch (status) {
    case 'pending': return 'Pending';
    case 'in_progress': return 'In Progress';
    case 'completed': return 'Completed';
    default: return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

/**
 * Format priority text
 * @param {string} priority - Priority code
 * @returns {string} Formatted priority
 */
function formatPriority(priority) {
  switch (priority) {
    case 'low': return 'Low';
    case 'medium': return 'Medium';
    case 'high': return 'High';
    default: return priority.charAt(0).toUpperCase() + priority.slice(1);
  }
}

/**
 * Format invoice status text
 * @param {string} status - Status code
 * @returns {string} Formatted status
 */
function formatInvoiceStatus(status) {
  switch (status) {
    case 'draft': return 'Draft';
    case 'pending': return 'Pending';
    case 'paid': return 'Paid';
    case 'overdue': return 'Overdue';
    default: return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

/**
 * Format currency value
 * @param {number} value - Amount
 * @returns {string} Formatted currency
 */
function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(value);
}

/**
 * Get badge color for task status
 * @param {string} status - Status code
 * @returns {string} Bootstrap color class
 */
function getStatusBadgeColor(status) {
  switch (status) {
    case 'pending': return 'warning';
    case 'in_progress': return 'info';
    case 'completed': return 'success';
    default: return 'secondary';
  }
}

/**
 * Get badge color for task priority
 * @param {string} priority - Priority code
 * @returns {string} Bootstrap color class
 */
function getPriorityBadgeColor(priority) {
  switch (priority) {
    case 'low': return 'success';
    case 'medium': return 'info';
    case 'high': return 'danger';
    default: return 'secondary';
  }
}

/**
 * Get badge color for invoice status
 * @param {string} status - Status code
 * @returns {string} Bootstrap color class
 */
function getInvoiceStatusBadgeColor(status) {
  switch (status) {
    case 'draft': return 'secondary';
    case 'pending': return 'warning';
    case 'paid': return 'success';
    case 'overdue': return 'danger';
    default: return 'info';
  }
} 