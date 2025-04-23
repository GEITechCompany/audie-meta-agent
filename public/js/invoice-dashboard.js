/**
 * Invoice Dashboard
 * Handles visualization and statistics for invoice overview
 */
class InvoiceDashboard {
  constructor() {
    this.baseUrl = '/api/invoices';
    this.initDashboard();
    this.initCharts();
  }

  async initDashboard() {
    try {
      // Load statistics data
      const statsResponse = await fetch(`${this.baseUrl}/statistics`, {
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`
        }
      });
      
      if (!statsResponse.ok) throw new Error('Failed to load invoice statistics');
      const stats = await statsResponse.json();
      
      // Load overdue data
      const overdueResponse = await fetch(`${this.baseUrl}/overdue/statistics`, {
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`
        }
      });
      
      if (!overdueResponse.ok) throw new Error('Failed to load overdue statistics');
      const overdueStats = await overdueResponse.json();
      
      // Update dashboard metrics
      this.updateDashboardMetrics(stats, overdueStats);
      
      // Initialize charts with data
      this.updateCharts(stats, overdueStats);
    } catch (error) {
      console.error('Error initializing dashboard:', error);
      this.showNotification('error', `Error loading dashboard data: ${error.message}`);
    }
  }

  updateDashboardMetrics(stats, overdueStats) {
    // Update key metrics
    document.querySelector('#total-invoices-count').textContent = stats.totalCount || 0;
    document.querySelector('#paid-invoices-amount').textContent = `$${(stats.paidAmount || 0).toFixed(2)}`;
    document.querySelector('#outstanding-amount').textContent = `$${(stats.outstandingAmount || 0).toFixed(2)}`;
    document.querySelector('#average-payment-time').textContent = `${stats.averagePaymentDays || 0} days`;
    
    // Update overdue metrics
    document.querySelector('#overdue-invoices-count').textContent = overdueStats.totals.count || 0;
    document.querySelector('#overdue-amount').textContent = `$${(overdueStats.totals.amount || 0).toFixed(2)}`;
    
    // Calculate overdue percentage
    const overduePercentage = stats.totalCount > 0 
      ? ((overdueStats.totals.count / stats.totalCount) * 100).toFixed(1) 
      : 0;
    document.querySelector('#overdue-percentage').textContent = `${overduePercentage}%`;
    
    // Update aging brackets
    const agingTable = document.querySelector('#aging-table tbody');
    if (agingTable) {
      agingTable.innerHTML = '';
      
      overdueStats.by_age.forEach(bracket => {
        agingTable.innerHTML += `
          <tr>
            <td>${bracket.age_bracket}</td>
            <td>${bracket.count}</td>
            <td>$${bracket.total_amount.toFixed(2)}</td>
          </tr>
        `;
      });
    }
  }

  initCharts() {
    // Initialize empty charts that will be populated when data arrives
    
    // Invoice status chart
    const statusCtx = document.getElementById('invoice-status-chart')?.getContext('2d');
    if (statusCtx) {
      this.statusChart = new Chart(statusCtx, {
        type: 'doughnut',
        data: {
          labels: ['Paid', 'Pending', 'Overdue', 'Draft'],
          datasets: [{
            data: [0, 0, 0, 0],
            backgroundColor: ['#28a745', '#17a2b8', '#dc3545', '#6c757d']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom'
            }
          }
        }
      });
    }
    
    // Monthly revenue chart
    const revenueCtx = document.getElementById('monthly-revenue-chart')?.getContext('2d');
    if (revenueCtx) {
      this.revenueChart = new Chart(revenueCtx, {
        type: 'bar',
        data: {
          labels: [],
          datasets: [{
            label: 'Revenue',
            data: [],
            backgroundColor: '#4e73df'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: function(value) {
                  return '$' + value;
                }
              }
            }
          },
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return '$' + context.parsed.y.toFixed(2);
                }
              }
            }
          }
        }
      });
    }
    
    // Payment methods chart
    const methodsCtx = document.getElementById('payment-methods-chart')?.getContext('2d');
    if (methodsCtx) {
      this.methodsChart = new Chart(methodsCtx, {
        type: 'pie',
        data: {
          labels: [],
          datasets: [{
            data: [],
            backgroundColor: [
              '#4e73df', '#1cc88a', '#36b9cc', '#f6c23e', '#e74a3b'
            ]
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom'
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const value = context.parsed;
                  const total = context.dataset.data.reduce((a, b) => a + b, 0);
                  const percentage = Math.round((value / total) * 100);
                  return `${context.label}: $${value.toFixed(2)} (${percentage}%)`;
                }
              }
            }
          }
        }
      });
    }
  }

  async updateCharts(stats, overdueStats) {
    // Update status chart
    if (this.statusChart) {
      this.statusChart.data.datasets[0].data = [
        stats.statusCounts.paid || 0,
        stats.statusCounts.sent || 0,
        overdueStats.totals.count || 0,
        stats.statusCounts.draft || 0
      ];
      this.statusChart.update();
    }
    
    // Fetch payment method statistics
    if (this.methodsChart) {
      try {
        const response = await fetch(`${this.baseUrl}/payment-statistics`, {
          headers: {
            'Authorization': `Bearer ${this.getAuthToken()}`
          }
        });
        
        if (!response.ok) throw new Error('Failed to load payment statistics');
        const paymentStats = await response.json();
        
        // Update payment methods chart
        const methodLabels = [];
        const methodData = [];
        
        paymentStats.by_method.forEach(method => {
          methodLabels.push(method.method_name || 'Other');
          methodData.push(method.total_amount || 0);
        });
        
        this.methodsChart.data.labels = methodLabels;
        this.methodsChart.data.datasets[0].data = methodData;
        this.methodsChart.update();
      } catch (error) {
        console.error('Error loading payment statistics:', error);
      }
    }
    
    // Update monthly revenue chart
    if (this.revenueChart && stats.revenueByMonth) {
      const months = [];
      const revenueData = [];
      
      stats.revenueByMonth.forEach(item => {
        // Format month for display (e.g., "Jan 2023")
        const dateParts = item.month.split('-');
        const date = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1);
        const formattedMonth = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        
        months.push(formattedMonth);
        revenueData.push(item.amount);
      });
      
      this.revenueChart.data.labels = months;
      this.revenueChart.data.datasets[0].data = revenueData;
      this.revenueChart.update();
    }
  }

  getAuthToken() {
    return localStorage.getItem('authToken');
  }

  showNotification(type, message) {
    const notificationArea = document.querySelector('.notification-area');
    if (!notificationArea) return;
    
    const alert = document.createElement('div');
    alert.className = `alert alert-${type === 'success' ? 'success' : 'danger'} alert-dismissible fade show`;
    alert.innerHTML = `
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    notificationArea.appendChild(alert);
    
    // Auto dismiss after 5 seconds
    setTimeout(() => {
      alert.classList.remove('show');
      setTimeout(() => alert.remove(), 150);
    }, 5000);
  }
}

// Initialize the dashboard when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  // Only initialize if we're on the dashboard page
  if (document.getElementById('invoice-dashboard')) {
    const dashboard = new InvoiceDashboard();
  }
}); 