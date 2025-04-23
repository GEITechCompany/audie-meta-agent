# 🤖 AUDIE META-AGENT PROMPT

## 📊 SYSTEM ARCHITECTURE OVERVIEW

Audie is an API-integrated Meta-Agent that serves as a comprehensive task management and scheduling system with the following key components:

1. **Meta-Agent Core** - Central intelligence that coordinates between sub-agents
2. **SchedulerAgent** - Handles calendar integration and appointment management
3. **InboxAgent** - Processes emails and extracts actionable tasks
4. **Task Management System** - Stores and organizes tasks with priorities
5. **API Layer** - RESTful endpoints for frontend and external integrations

## 🔌 API INTEGRATION MODEL

The system implements robust API connections with fallback mechanisms:

- **Google Calendar API**: For schedule management with graceful fallback to mock data
- **Gmail API**: For email processing with graceful fallback to mock data
- **RESTful Task API**: For task creation, updates and management

## 🛠️ CORE FUNCTIONALITY

Audie provides these essential capabilities:

1. **Task Creation & Management**
   - Create tasks manually or extract from emails/messages
   - Prioritize and categorize tasks
   - Track task status and completion

2. **Email Processing**
   - Analyze incoming emails for action items
   - Convert relevant emails to tasks
   - Summarize important communications

3. **Schedule Management**
   - View and organize daily/weekly calendar
   - Receive scheduling notifications
   - Manage appointments and meetings

4. **Morning Brief**
   - Daily summary of tasks, emails, and schedule
   - Prioritized action items for the day
   - Overview of pending work

## 🔒 ENVIRONMENT CONFIGURATION

Audie requires the following environment setup:

```
PORT=3000                    # Fixed server port (required)
NODE_ENV=development         # Environment mode
LOG_LEVEL=info               # Logging verbosity

# Google Calendar API (optional)
GCAL_CLIENT_ID=your_id
GCAL_CLIENT_SECRET=your_secret
GCAL_REDIRECT_URI=http://localhost:3000/auth/calendar/callback
GCAL_REFRESH_TOKEN=your_token

# Gmail API (optional)
GMAIL_CLIENT_ID=your_id
GMAIL_CLIENT_SECRET=your_secret
GMAIL_REDIRECT_URI=http://localhost:3000/auth/gmail/callback
GMAIL_REFRESH_TOKEN=your_token
```

## 💻 DEVELOPMENT GUIDE

### Starting the Application

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Access the dashboard
# http://localhost:3000
```

### API Endpoints

- **GET /api/health** - Check system status
- **POST /api/chat** - Process a chat message
- **GET /api/morning-brief** - Get daily summary
- **GET /api/check-emails** - Check recent emails
- **GET /api/schedule** - View calendar
- **GET /api/tasks** - List all tasks
- **POST /api/tasks** - Create new task
- **PUT /api/tasks/:id** - Update task
- **DELETE /api/tasks/:id** - Delete task

### Mock Data & Testing

Without API credentials, the system automatically falls back to mock data:
- Calendar events are simulated
- Email messages are generated with realistic content
- Tasks can still be created and managed

### Debugging

- Check logs in `logs/combined.log` and `logs/error.log`
- Enable verbose logging with `LOG_LEVEL=debug`
- API responses include detailed error information

## 🔍 AGENT SYSTEM DESIGN

The multi-agent architecture follows these principles:

1. **Modular Design**
   - Each agent handles a specific domain
   - Agents communicate through a central coordinator
   - New agents can be added with minimal changes

2. **Fallback Mechanisms**
   - External API failures gracefully degrade to mock data
   - System remains functional even when connections fail
   - Users experience continuous operation

3. **Database Integration**
   - Uses SQLite for simplicity and portability
   - Tables for tasks, clients, invoices, and logs
   - Automated schema setup on first run

## 🚀 EXTENSION POINTS

Audie can be extended in these areas:

1. **New Agent Types**
   - Create specialized agents for new domains
   - Implement in `src/agents/` following existing patterns
   - Register with MetaAgent for coordination

2. **Additional APIs**
   - Add connections to billing/CRM systems
   - Integrate with project management tools
   - Connect to communication platforms

3. **Enhanced NLP**
   - Improve intent detection in the MetaAgent
   - Add more sophisticated email parsing rules
   - Implement contextual conversation handling

## 🔄 PORT & TOKEN SAFETY

This system implements several safety measures:

1. **Fixed Port Usage**
   - PORT environment variable is required and verified at startup
   - System will fail gracefully if PORT is undefined
   - All callback URLs derive from the base server URL

2. **Token Lifecycle Management**
   - API tokens are validated on startup
   - Missing credentials trigger fallback to mock data
   - Clear error messages guide configuration

3. **Error Resilience**
   - All API calls use try/catch with fallback
   - API errors are logged with detailed context
   - User experience remains consistent despite backend issues

## 🧩 PROMPT CUSTOMIZATION

When adapting this system for specific use cases:

1. **Configure Environment First**
   - Set required PORT variable for stability
   - Add relevant API credentials if available
   - Adjust logging to appropriate level

2. **Start With Basic Functionality**
   - Begin with task management to establish core flow
   - Add API integrations incrementally
   - Test fallback mechanisms at each stage

3. **Extend Intentionally**
   - Add only the agents and connections needed
   - Maintain the fallback architecture
   - Preserve the fixed port and token safety patterns 