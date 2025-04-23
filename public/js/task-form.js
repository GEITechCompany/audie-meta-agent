document.addEventListener('DOMContentLoaded', () => {
  // Initialize Authentication
  if (!AuthService.isAuthenticated()) {
    AuthService.redirectToLogin();
    return;
  }
  
  const taskForm = document.getElementById('taskForm');
  const saveTaskBtn = document.getElementById('saveTaskBtn');
  const deleteTaskBtn = document.getElementById('deleteTaskBtn');
  const taskId = document.getElementById('taskId')?.value;
  const logoutBtn = document.getElementById('logoutBtn');
  
  // Handle logout
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      AuthService.logout();
    });
  }
  
  // Save task
  const saveTask = async (e) => {
    e.preventDefault();
    
    const formData = new FormData(taskForm);
    const taskData = {};
    
    // Convert FormData to regular object
    for (const [key, value] of formData.entries()) {
      taskData[key] = value;
    }
    
    // Validate required fields
    if (!taskData.title?.trim()) {
      alert('Title is required');
      return;
    }
    
    try {
      let response;
      
      if (taskId) {
        // Update existing task
        response = await TaskApi.updateTask(taskId, taskData);
      } else {
        // Create new task
        response = await TaskApi.createTask(taskData);
      }
      
      // Redirect to tasks list
      window.location.href = '/tasks';
    } catch (error) {
      console.error('Error saving task:', error);
      alert(`Error saving task: ${error.message || 'Unknown error'}`);
    }
  };
  
  // Delete task
  const deleteTask = async () => {
    if (!taskId) return;
    
    if (!confirm('Are you sure you want to delete this task?')) {
      return;
    }
    
    try {
      await TaskApi.deleteTask(taskId);
      
      // Redirect to tasks list
      window.location.href = '/tasks';
    } catch (error) {
      console.error('Error deleting task:', error);
      alert(`Error deleting task: ${error.message || 'Unknown error'}`);
    }
  };
  
  // Event: Save task form submission
  if (taskForm) {
    taskForm.addEventListener('submit', saveTask);
  }
  
  // Event: Save task button click
  if (saveTaskBtn) {
    saveTaskBtn.addEventListener('click', saveTask);
  }
  
  // Event: Delete task button click
  if (deleteTaskBtn) {
    deleteTaskBtn.addEventListener('click', deleteTask);
  }
}); 