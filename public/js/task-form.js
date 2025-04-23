document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const taskForm = document.getElementById('taskForm');
  
  // Handle form submission
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    
    // Get form data
    const formData = new FormData(taskForm);
    const taskData = {
      title: formData.get('title'),
      description: formData.get('description'),
      status: formData.get('status'),
      priority: formData.get('priority'),
      due_date: formData.get('due_date'),
      assigned_to: formData.get('assigned_to'),
      client_id: formData.get('client_id') || null
    };
    
    // Validate title
    if (!taskData.title) {
      alert('Task title is required');
      return;
    }
    
    try {
      // Determine if it's an update or create
      const isUpdate = taskForm.getAttribute('action').includes('/api/tasks/');
      let url = isUpdate ? taskForm.getAttribute('action') : '/api/tasks';
      let method = isUpdate ? 'PUT' : 'POST';
      
      // Handle method override for forms
      if (formData.get('_method')) {
        method = formData.get('_method');
      }
      
      // Send request
      const response = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(taskData)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error saving task');
      }
      
      // Redirect to tasks page on success
      window.location.href = '/tasks';
    } catch (error) {
      console.error('Error submitting form:', error);
      alert(`Error: ${error.message || 'Failed to save task'}`);
    }
  };
  
  // Fetch clients for dropdown
  const fetchClients = async () => {
    const clientSelect = document.getElementById('taskClient');
    if (!clientSelect) return;
    
    try {
      const response = await fetch('/api/clients');
      
      if (!response.ok) {
        throw new Error('Failed to fetch clients');
      }
      
      const data = await response.json();
      
      if (data.success && data.data) {
        // Clear options (keep the default none option)
        const noneOption = clientSelect.querySelector('option[value=""]');
        clientSelect.innerHTML = '';
        clientSelect.appendChild(noneOption);
        
        // Add client options
        data.data.forEach(client => {
          const option = document.createElement('option');
          option.value = client.id;
          option.textContent = client.name;
          
          // Set selected if matches current client_id
          const currentClientId = taskForm.getAttribute('data-client-id');
          if (currentClientId && currentClientId === client.id.toString()) {
            option.selected = true;
          }
          
          clientSelect.appendChild(option);
        });
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
      // Don't show alert, just log the error
    }
  };
  
  // Event: Form submission
  if (taskForm) {
    taskForm.addEventListener('submit', handleFormSubmit);
  }
  
  // Initialize
  fetchClients();
}); 