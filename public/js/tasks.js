document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const refreshTasksBtn = document.getElementById('refreshTasksBtn');
  const deleteTaskBtns = document.querySelectorAll('.delete-task-btn');
  const completeTaskBtns = document.querySelectorAll('.complete-task-btn');
  const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
  const statusFilterBtns = document.querySelectorAll('input[name="statusFilter"]');
  const taskSearchInput = document.getElementById('taskSearchInput');
  const taskSearchBtn = document.getElementById('taskSearchBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  
  // Delete task modal
  let deleteTaskModal;
  let taskIdToDelete;
  
  // Initialize Authentication
  if (!AuthService.isAuthenticated()) {
    AuthService.redirectToLogin();
    return;
  }
  
  // Handle logout
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      AuthService.logout();
    });
  }
  
  // Initialize Bootstrap components
  if (document.getElementById('deleteTaskModal')) {
    deleteTaskModal = new bootstrap.Modal(document.getElementById('deleteTaskModal'));
  }
  
  // Refresh tasks
  const refreshTasks = () => {
    window.location.reload();
  };
  
  // Delete task
  const deleteTask = async (taskId) => {
    try {
      await TaskApi.deleteTask(taskId);
      refreshTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
      alert('Error deleting task. Please try again.');
    }
  };
  
  // Complete task
  const completeTask = async (taskId) => {
    try {
      await TaskApi.updateTask(taskId, {
        status: 'completed'
      });
      
      refreshTasks();
    } catch (error) {
      console.error('Error completing task:', error);
      alert('Error completing task. Please try again.');
    }
  };
  
  // Filter tasks by status
  const filterTasksByStatus = (status) => {
    const url = new URL(window.location);
    
    if (status && status !== 'all') {
      url.searchParams.set('status', status);
    } else {
      url.searchParams.delete('status');
    }
    
    window.location.href = url.toString();
  };
  
  // Search tasks
  const searchTasks = () => {
    const searchQuery = taskSearchInput.value.trim();
    if (!searchQuery) return;
    
    const url = new URL(window.location);
    url.searchParams.set('q', searchQuery);
    window.location.href = url.toString();
  };
  
  // Event: Refresh button click
  if (refreshTasksBtn) {
    refreshTasksBtn.addEventListener('click', refreshTasks);
  }
  
  // Event: Delete task button click
  deleteTaskBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      taskIdToDelete = btn.getAttribute('data-task-id');
      if (deleteTaskModal) {
        deleteTaskModal.show();
      }
    });
  });
  
  // Event: Confirm delete button click
  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', () => {
      if (taskIdToDelete) {
        deleteTask(taskIdToDelete);
        if (deleteTaskModal) {
          deleteTaskModal.hide();
        }
      }
    });
  }
  
  // Event: Complete task button click
  completeTaskBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const taskId = btn.getAttribute('data-task-id');
      if (taskId) {
        completeTask(taskId);
      }
    });
  });
  
  // Event: Status filter change
  statusFilterBtns.forEach(btn => {
    btn.addEventListener('change', () => {
      if (btn.checked) {
        const status = btn.id.replace('Tasks', '').toLowerCase();
        filterTasksByStatus(status === 'all' ? null : status);
      }
    });
  });
  
  // Event: Search button click
  if (taskSearchBtn) {
    taskSearchBtn.addEventListener('click', searchTasks);
  }
  
  // Event: Search input enter key
  if (taskSearchInput) {
    taskSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        searchTasks();
      }
    });
  }
  
  // Initialize status filter based on URL params
  const initFilters = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const statusParam = urlParams.get('status');
    
    if (statusParam) {
      const filterBtn = document.getElementById(`${statusParam}Tasks`);
      if (filterBtn) {
        filterBtn.checked = true;
      }
    }
    
    const searchQuery = urlParams.get('q');
    if (searchQuery && taskSearchInput) {
      taskSearchInput.value = searchQuery;
    }
  };
  
  // Initialize
  initFilters();
}); 