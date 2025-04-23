document.addEventListener('DOMContentLoaded', () => {
  // Chat interface elements
  const chatMessages = document.getElementById('chatMessages');
  const messageInput = document.getElementById('messageInput');
  const sendMessageBtn = document.getElementById('sendMessageBtn');
  const toggleChatBtn = document.getElementById('toggleChatBtn');
  const chatContainer = document.querySelector('.chat-container');
  const chatBody = document.querySelector('.chat-body');
  
  // Task elements
  const newTaskBtn = document.getElementById('newTaskBtn');
  const saveTaskBtn = document.getElementById('saveTaskBtn');
  const taskForm = document.getElementById('taskForm');
  const completeTaskBtns = document.querySelectorAll('.complete-task-btn');
  
  // Dashboard buttons
  const refreshBtn = document.getElementById('refreshBtn');
  const morningBriefBtn = document.getElementById('morningBriefBtn');
  const checkEmailsBtn = document.getElementById('checkEmailsBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  
  // Initialize Bootstrap components
  const taskModal = new bootstrap.Modal(document.getElementById('taskModal'));
  
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
  
  // Toggle chat visibility
  let chatOpen = true;
  toggleChatBtn.addEventListener('click', () => {
    chatOpen = !chatOpen;
    chatBody.style.display = chatOpen ? 'block' : 'none';
    document.querySelector('.chat-footer').style.display = chatOpen ? 'block' : 'none';
    toggleChatBtn.innerHTML = chatOpen ? '<i class="bi bi-chevron-down"></i>' : '<i class="bi bi-chevron-up"></i>';
  });
  
  // Send message function
  const sendMessage = async () => {
    const message = messageInput.value.trim();
    if (!message) return;
    
    // Add user message to chat
    addMessageToChat('user', message);
    messageInput.value = '';
    
    // Show typing indicator
    const typingIndicator = addTypingIndicator();
    
    try {
      // Send message to server (Audie) using API client
      const data = await ChatApi.sendMessage(message);
      
      // Remove typing indicator
      typingIndicator.remove();
      
      // Add assistant response to chat
      addMessageToChat('assistant', data.message);
      
      // Handle any actions returned by Audie
      if (data.actions && data.actions.length > 0) {
        handleAudieActions(data.actions);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      typingIndicator.remove();
      addMessageToChat('assistant', 'Sorry, I encountered an error processing your request.');
    }
  };
  
  // Add message to chat
  const addMessageToChat = (sender, message) => {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', sender, 'fade-in');
    
    const messageContent = document.createElement('div');
    messageContent.classList.add('message-content');
    
    // Process message text (could contain markdown or newlines)
    const formattedMessage = message.replace(/\n/g, '<br>');
    messageContent.innerHTML = `<p>${formattedMessage}</p>`;
    
    messageElement.appendChild(messageContent);
    chatMessages.appendChild(messageElement);
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
  };
  
  // Add typing indicator
  const addTypingIndicator = () => {
    const typingElement = document.createElement('div');
    typingElement.classList.add('message', 'assistant', 'typing-indicator');
    
    const typingContent = document.createElement('div');
    typingContent.classList.add('message-content');
    typingContent.innerHTML = `
      <div class="typing">
        <span></span>
        <span></span>
        <span></span>
      </div>
    `;
    
    typingElement.appendChild(typingContent);
    chatMessages.appendChild(typingElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    return typingElement;
  };
  
  // Handle Audie actions
  const handleAudieActions = (actions) => {
    actions.forEach(action => {
      switch (action.type) {
        case 'task_created':
          // Refresh task list
          refreshTasks();
          break;
        case 'tasks_listed':
          // Nothing special needed here
          break;
        case 'emails_checked':
          // Update inbox feed
          updateInboxFeed(action.data);
          break;
        case 'morning_brief_delivered':
          // Nothing special needed here
          break;
        default:
          console.log('Unknown action type:', action.type);
      }
    });
  };
  
  // Refresh tasks
  const refreshTasks = async () => {
    try {
      const response = await TaskApi.getTasks();
      
      // Reload the page to refresh task lists
      // In a production app, we would update the DOM directly
      window.location.reload();
    } catch (error) {
      console.error('Error refreshing tasks:', error);
    }
  };
  
  // Update inbox feed
  const updateInboxFeed = (emails) => {
    const inboxFeed = document.getElementById('inboxFeed');
    
    if (!emails || emails.length === 0) {
      inboxFeed.innerHTML = '<p class="text-center text-muted my-5">No recent messages</p>';
      return;
    }
    
    let emailsHtml = '';
    emails.forEach((email, index) => {
      const fromName = email.from.split('<')[0].trim();
      emailsHtml += `
        <div class="email-item mb-3 p-2 border-bottom">
          <div class="d-flex justify-content-between">
            <strong>${fromName}</strong>
            <small class="text-muted">${new Date(email.date).toLocaleTimeString()}</small>
          </div>
          <div>${email.subject}</div>
          <div class="text-muted text-truncate">${email.snippet}</div>
        </div>
      `;
    });
    
    inboxFeed.innerHTML = emailsHtml;
  };
  
  // Create new task
  const createTask = async () => {
    const taskTitle = document.getElementById('taskTitle').value.trim();
    const taskDescription = document.getElementById('taskDescription').value.trim();
    const taskPriority = document.getElementById('taskPriority').value;
    const taskDueDate = document.getElementById('taskDueDate').value;
    const taskAssignedTo = document.getElementById('taskAssignedTo').value.trim();
    
    if (!taskTitle) {
      alert('Task title is required');
      return;
    }
    
    try {
      const response = await TaskApi.createTask({
        title: taskTitle,
        description: taskDescription,
        priority: taskPriority,
        due_date: taskDueDate,
        assigned_to: taskAssignedTo,
        status: 'pending',
        source: 'dashboard'
      });
      
      // Close modal and reset form
      taskModal.hide();
      taskForm.reset();
      
      // Refresh task list
      refreshTasks();
      
      // Add confirmation message to chat
      addMessageToChat('assistant', `I've created a new task: "${taskTitle}"`);
    } catch (error) {
      console.error('Error creating task:', error);
      alert('Error creating task. Please try again.');
    }
  };
  
  // Complete task
  const completeTask = async (taskId) => {
    try {
      const response = await TaskApi.updateTask(taskId, {
        status: 'completed'
      });
      
      // Refresh tasks
      refreshTasks();
    } catch (error) {
      console.error('Error completing task:', error);
      alert('Error completing task. Please try again.');
    }
  };
  
  // Request morning brief
  const requestMorningBrief = async () => {
    // Show typing indicator
    const typingIndicator = addTypingIndicator();
    
    try {
      const data = await ChatApi.getMorningBrief();
      
      // Remove typing indicator
      typingIndicator.remove();
      
      // Add morning brief to chat
      addMessageToChat('assistant', data.message);
      
      // Handle any actions
      if (data.actions && data.actions.length > 0) {
        handleAudieActions(data.actions);
      }
    } catch (error) {
      console.error('Error requesting morning brief:', error);
      typingIndicator.remove();
      addMessageToChat('assistant', 'Sorry, I encountered an error generating your morning brief.');
    }
  };
  
  // Check emails
  const checkEmails = async () => {
    // Show typing indicator
    const typingIndicator = addTypingIndicator();
    
    try {
      const data = await ChatApi.checkEmails();
      
      // Remove typing indicator
      typingIndicator.remove();
      
      // Add morning brief to chat
      addMessageToChat('assistant', data.message);
      
      // Update inbox feed
      if (data.emails) {
        updateInboxFeed(data.emails);
      }
    } catch (error) {
      console.error('Error checking emails:', error);
      typingIndicator.remove();
      addMessageToChat('assistant', 'Sorry, I encountered an error checking your emails.');
    }
  };
  
  // Event: Send message button click
  sendMessageBtn.addEventListener('click', sendMessage);
  
  // Event: Message input enter key
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  // Event: Complete task button click
  completeTaskBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const taskId = btn.getAttribute('data-task-id');
      if (taskId) {
        completeTask(taskId);
      }
    });
  });
  
  // Event: Save task button click
  if (saveTaskBtn) {
    saveTaskBtn.addEventListener('click', createTask);
  }
  
  // Event: Morning brief button click
  if (morningBriefBtn) {
    morningBriefBtn.addEventListener('click', requestMorningBrief);
  }
  
  // Event: Check emails button click
  if (checkEmailsBtn) {
    checkEmailsBtn.addEventListener('click', checkEmails);
  }
  
  // Event: Refresh button click
  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshTasks);
  }
}); 