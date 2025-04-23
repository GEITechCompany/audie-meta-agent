# Audie Meta-Agent AI Scheduler

Audie is a Meta-Agent based hybrid system that serves as a central interface for task management, scheduling, email processing, and business workflow automation.

## Key Features

- **Single Voice Interface**: Chat directly with Audie for all commands and requests
- **Task Management**: Create, track, and complete tasks through a unified system
- **Email Integration**: Process emails into tasks and notifications
- **Calendar Management**: Schedule and manage appointments with Google Calendar integration
- **Estimate & Invoice Lifecycle**: Full workflow from estimate creation to payment tracking

## System Architecture

Audie is built on a modular architecture with specialized sub-agents:

- **MetaAgent (Audie)**: Central coordinator and user communication hub
- **SchedulerAgent**: Calendar management and scheduling logic
- **InboxAgent**: Email processing and task extraction
- **Logger**: System memory and activity tracking
- **Invoice Agent**: Manages the estimate-to-invoice lifecycle

## Getting Started

### Prerequisites

- Node.js 14.x or higher
- npm or yarn
- SQLite (included)

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/GEITechCompany/audie-meta-agent.git
   cd audie-meta-agent
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create `.env` file from template:
   ```
   cp .env.example .env
   ```

4. Customize your environment variables in `.env`:
   - Configure your `PORT` (default: 3000)
   - Set up API credentials for Gmail and Google Calendar
   - Adjust other settings as needed

5. Start the development server:
   ```
   npm run dev
   ```

6. Open your browser to `http://localhost:3000`

## API Endpoints

### Chat Interface

- `POST /api/chat` - Send a message to Audie
- `GET /api/morning-brief` - Get today's summary and schedule
- `GET /api/check-emails` - Check for new emails
- `GET /api/schedule` - Get calendar schedule

### Task Management

- `GET /api/tasks` - Get all tasks (with optional filters)
- `GET /api/tasks/:id` - Get a specific task
- `POST /api/tasks` - Create a new task
- `PUT /api/tasks/:id` - Update a task
- `DELETE /api/tasks/:id` - Delete a task

## Usage Examples

### Basic Task Creation

Send a message to Audie:
```
create task to review the design proposal due tomorrow with high priority
```

Audie will process this and create a task with the appropriate parameters.

### Morning Brief

Click the "Morning Brief" button to get a summary of:
- Today's schedule
- Pending tasks
- New emails
- Reminders for the day

### Email Processing

Audie automatically processes incoming emails and can extract potential tasks from their content. These are presented to you for review or direct action.

## Configuration

The system is designed to be highly configurable:

- **Port**: Fixed port configuration via `.env` file
- **API Credentials**: Secure storage in `.env`
- **Database**: SQLite by default (configurable path)
- **Templates**: Customizable email and PDF templates

## Deployment

For production deployment:

1. Build the project:
   ```
   npm run build
   ```

2. Start in production mode:
   ```
   npm start
   ```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details. 