/**
 * Clients Management JS
 * Handles client listing, searching, and CRUD operations
 */

// State variables
let currentPage = 1;
const pageSize = 10;
let totalClients = 0;
let searchTerm = '';
let clients = [];

// DOM Elements
const clientSearchInput = document.getElementById('clientSearchInput');
const clientSearchBtn = document.getElementById('clientSearchBtn');
const clientsTableBody = document.getElementById('clientsTableBody');
const emptyState = document.getElementById('emptyState');
const loadingState = document.getElementById('loadingState');
const pagination = document.getElementById('pagination');
const pageInfo = document.getElementById('pageInfo');
const startIndex = document.getElementById('startIndex');
const endIndex = document.getElementById('endIndex');
const totalItems = document.getElementById('totalItems');
const addClientBtn = document.getElementById('addClientBtn');
const saveClientBtn = document.getElementById('saveClientBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const clientModal = new bootstrap.Modal(document.getElementById('clientModal'));
const deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));
const alertContainer = document.getElementById('alertContainer');
const clientForm = document.getElementById('clientForm');
const clientIdInput = document.getElementById('clientId');

// Init
document.addEventListener('DOMContentLoaded', init);

function init() {
  // Load initial data
  loadClients();
  
  // Add event listeners
  addEventListeners();
}

function addEventListeners() {
  // Search
  clientSearchBtn.addEventListener('click', handleSearch);
  clientSearchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
  });
  
  // Add client
  addClientBtn.addEventListener('click', () => showClientModal());
  
  // Save client
  saveClientBtn.addEventListener('click', saveClient);
  
  // Delete client
  confirmDeleteBtn.addEventListener('click', deleteClient);
  
  // Form validation
  clientForm.addEventListener('submit', (e) => e.preventDefault());
}

/**
 * Load clients with current filters and pagination
 */
async function loadClients() {
  try {
    showLoading(true);
    
    const response = await ClientApi.getClients(searchTerm, currentPage, pageSize);
    
    if (response.success) {
      clients = response.data;
      totalClients = response.pagination.total;
      
      renderClients();
      renderPagination(response.pagination);
      updatePageInfo(response.pagination);
    } else {
      showAlert('Error loading clients', 'danger');
    }
  } catch (error) {
    console.error('Error loading clients:', error);
    showAlert('Failed to load clients. Please try again.', 'danger');
  } finally {
    showLoading(false);
  }
}

/**
 * Render clients table
 */
function renderClients() {
  if (!clients.length) {
    showEmptyState(true);
    return;
  }
  
  showEmptyState(false);
  
  clientsTableBody.innerHTML = '';
  
  clients.forEach(client => {
    const row = document.createElement('tr');
    
    row.innerHTML = `
      <td><a href="/clients/${client.id}" class="fw-bold">${client.name}</a></td>
      <td>${client.email || '-'}</td>
      <td>${client.phone || '-'}</td>
      <td>
        <span class="badge rounded-pill bg-secondary">${client.taskStats?.total || 0}</span>
      </td>
      <td>
        <div class="btn-group btn-group-sm">
          <a href="/clients/${client.id}" class="btn btn-outline-primary">
            <i class="bi bi-eye"></i>
          </a>
          <button class="btn btn-outline-secondary edit-client" data-id="${client.id}">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-outline-danger delete-client" data-id="${client.id}" data-name="${client.name}">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </td>
    `;
    
    // Add event listeners to buttons
    row.querySelector('.edit-client').addEventListener('click', () => {
      showClientModal(client);
    });
    
    row.querySelector('.delete-client').addEventListener('click', () => {
      showDeleteModal(client);
    });
    
    clientsTableBody.appendChild(row);
  });
}

/**
 * Render pagination controls
 * @param {Object} paginationData - Pagination info
 */
function renderPagination(paginationData) {
  pagination.innerHTML = '';
  
  // Only show pagination if we have multiple pages
  if (paginationData.pages <= 1) {
    return;
  }
  
  // Previous button
  const prevLi = document.createElement('li');
  prevLi.classList.add('page-item');
  if (!paginationData.hasPrev) prevLi.classList.add('disabled');
  
  const prevLink = document.createElement('a');
  prevLink.classList.add('page-link');
  prevLink.href = '#';
  prevLink.innerHTML = '&laquo;';
  prevLink.setAttribute('aria-label', 'Previous');
  
  if (paginationData.hasPrev) {
    prevLink.addEventListener('click', (e) => {
      e.preventDefault();
      goToPage(currentPage - 1);
    });
  }
  
  prevLi.appendChild(prevLink);
  pagination.appendChild(prevLi);
  
  // Page buttons
  for (let i = 1; i <= paginationData.pages; i++) {
    // Only show 5 pages max (first, last, current, and 1 on each side of current)
    if (paginationData.pages > 5 && 
        i !== 1 && 
        i !== paginationData.pages && 
        (i < currentPage - 1 || i > currentPage + 1)) {
      // Show ellipsis instead of all pages
      if (i === 2 || i === paginationData.pages - 1) {
        const ellipsisLi = document.createElement('li');
        ellipsisLi.classList.add('page-item', 'disabled');
        ellipsisLi.innerHTML = '<span class="page-link">...</span>';
        pagination.appendChild(ellipsisLi);
      }
      continue;
    }
    
    const pageLi = document.createElement('li');
    pageLi.classList.add('page-item');
    if (i === currentPage) pageLi.classList.add('active');
    
    const pageLink = document.createElement('a');
    pageLink.classList.add('page-link');
    pageLink.href = '#';
    pageLink.textContent = i;
    
    pageLink.addEventListener('click', (e) => {
      e.preventDefault();
      goToPage(i);
    });
    
    pageLi.appendChild(pageLink);
    pagination.appendChild(pageLi);
  }
  
  // Next button
  const nextLi = document.createElement('li');
  nextLi.classList.add('page-item');
  if (!paginationData.hasNext) nextLi.classList.add('disabled');
  
  const nextLink = document.createElement('a');
  nextLink.classList.add('page-link');
  nextLink.href = '#';
  nextLink.innerHTML = '&raquo;';
  nextLink.setAttribute('aria-label', 'Next');
  
  if (paginationData.hasNext) {
    nextLink.addEventListener('click', (e) => {
      e.preventDefault();
      goToPage(currentPage + 1);
    });
  }
  
  nextLi.appendChild(nextLink);
  pagination.appendChild(nextLi);
}

/**
 * Update page info text
 * @param {Object} paginationData - Pagination info
 */
function updatePageInfo(paginationData) {
  const start = (paginationData.page - 1) * paginationData.limit + 1;
  const end = Math.min(start + paginationData.limit - 1, paginationData.total);
  
  startIndex.textContent = paginationData.total > 0 ? start : 0;
  endIndex.textContent = end;
  totalItems.textContent = paginationData.total;
}

/**
 * Navigate to a specific page
 * @param {number} page - Page number
 */
function goToPage(page) {
  currentPage = page;
  loadClients();
}

/**
 * Handle search button click
 */
function handleSearch() {
  searchTerm = clientSearchInput.value.trim();
  currentPage = 1; // Reset to first page
  loadClients();
}

/**
 * Show/hide loading state
 * @param {boolean} show - Whether to show or hide loading
 */
function showLoading(show) {
  loadingState.classList.toggle('d-none', !show);
  document.getElementById('clientsTable').classList.toggle('d-none', show);
}

/**
 * Show/hide empty state
 * @param {boolean} show - Whether to show or hide empty state
 */
function showEmptyState(show) {
  emptyState.classList.toggle('d-none', !show);
  document.getElementById('clientsTable').classList.toggle('d-none', show);
}

/**
 * Show client modal for create/edit
 * @param {Object} client - Client data for edit (optional)
 */
function showClientModal(client = null) {
  // Reset form
  clientForm.reset();
  clientForm.classList.remove('was-validated');
  
  // Update modal title and data
  if (client) {
    document.getElementById('clientModalLabel').textContent = 'Edit Client';
    clientIdInput.value = client.id;
    document.getElementById('clientName').value = client.name;
    document.getElementById('clientEmail').value = client.email || '';
    document.getElementById('clientPhone').value = client.phone || '';
    document.getElementById('clientAddress').value = client.address || '';
    document.getElementById('clientNotes').value = client.notes || '';
  } else {
    document.getElementById('clientModalLabel').textContent = 'New Client';
    clientIdInput.value = '';
  }
  
  clientModal.show();
}

/**
 * Show delete confirmation modal
 * @param {Object} client - Client to delete
 */
function showDeleteModal(client) {
  document.getElementById('deleteClientName').textContent = client.name;
  clientIdInput.value = client.id; // Store ID for delete operation
  deleteModal.show();
}

/**
 * Save client (create or update)
 */
async function saveClient() {
  // Validate form
  if (!clientForm.checkValidity()) {
    clientForm.classList.add('was-validated');
    return;
  }
  
  const clientData = {
    name: document.getElementById('clientName').value,
    email: document.getElementById('clientEmail').value,
    phone: document.getElementById('clientPhone').value,
    address: document.getElementById('clientAddress').value,
    notes: document.getElementById('clientNotes').value
  };
  
  const clientId = clientIdInput.value;
  const isEdit = !!clientId;
  
  try {
    let response;
    
    if (isEdit) {
      response = await ClientApi.updateClient(clientId, clientData);
    } else {
      response = await ClientApi.createClient(clientData);
    }
    
    if (response.success) {
      clientModal.hide();
      showAlert(`Client ${isEdit ? 'updated' : 'created'} successfully`, 'success');
      loadClients();
    } else {
      showAlert(response.message || `Failed to ${isEdit ? 'update' : 'create'} client`, 'danger');
    }
  } catch (error) {
    console.error(`Error ${isEdit ? 'updating' : 'creating'} client:`, error);
    showAlert(`Error ${isEdit ? 'updating' : 'creating'} client. Please try again.`, 'danger');
  }
}

/**
 * Delete client
 */
async function deleteClient() {
  const clientId = clientIdInput.value;
  
  try {
    const response = await ClientApi.deleteClient(clientId);
    
    if (response.success) {
      deleteModal.hide();
      showAlert('Client deleted successfully', 'success');
      loadClients();
    } else {
      showAlert(response.message || 'Failed to delete client', 'danger');
    }
  } catch (error) {
    console.error('Error deleting client:', error);
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