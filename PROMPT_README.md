# Audie Meta-Agent Prompt Guide

This repository contains a comprehensive Meta-Agent system called Audie that integrates with various APIs for task management, email processing, and scheduling. The system has been designed with robust error handling, fallback mechanisms, and API integration safety.

## Overview

Audie is structured as a multi-agent system:
- **MetaAgent**: Central coordinator that routes requests to specialized agents
- **SchedulerAgent**: Handles calendar functionality with Google Calendar integration
- **InboxAgent**: Processes emails and extracts tasks with Gmail integration
- **Task Management**: Full CRUD API for task tracking and management

## Getting Started

1. **Clone the repository**

2. **Run the restart script**
   ```bash
   ./restart.sh
   ```
   This script will:
   - Create the necessary environment configuration
   - Install dependencies
   - Create required directories
   - Start the application

3. **Access the dashboard**
   Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

## Using the Prompt

The `AUDIE_PROMPT.md` file contains a detailed prompt that can be used with AI models to:

1. **Understand the system architecture**
2. **Extend the functionality with new agents or integrations** 
3. **Adapt the system for specific use cases**

### Key Features of the Prompt

- **API Integration with Fallbacks**: All external API integrations gracefully degrade to mock data
- **Port and Token Safety**: Consistent port usage and credential management
- **Error Resilience**: Comprehensive error handling throughout the system
- **Modular Architecture**: Easy to extend with new capabilities

## Development Guide

### API Endpoints

- **GET /api/health** - System status
- **POST /api/chat** - Process messages
- **GET /api/morning-brief** - Daily summary
- **GET /api/check-emails** - Email processing
- **GET /api/schedule** - Calendar view
- **GET /api/tasks** - Task listing
- **POST /api/tasks** - Task creation
- **PUT /api/tasks/:id** - Task updates
- **DELETE /api/tasks/:id** - Task deletion

### Debugging

- Check logs in `logs/combined.log` and `logs/error.log`
- API errors return useful debug information
- Set `LOG_LEVEL=debug` in `.env` for more verbose logging

## Advanced Configuration

For production use or integration with real APIs:

1. Edit the `.env` file to add your API credentials:
   ```
   # Google Calendar API
   GCAL_CLIENT_ID=your_id
   GCAL_CLIENT_SECRET=your_secret
   GCAL_REDIRECT_URI=http://localhost:3000/auth/calendar/callback
   GCAL_REFRESH_TOKEN=your_token

   # Gmail API
   GMAIL_CLIENT_ID=your_id
   GMAIL_CLIENT_SECRET=your_secret
   GMAIL_REDIRECT_URI=http://localhost:3000/auth/gmail/callback
   GMAIL_REFRESH_TOKEN=your_token
   ```

2. The system will automatically detect and use these credentials instead of mock data

## Troubleshooting

- **Port conflicts**: Change the PORT value in `.env` if 3000 is in use
- **Database issues**: Delete the `data/audie.db` file to reset the database
- **API errors**: Check that your credentials are correct and not expired

## Next Steps

This system can be extended in several ways:

1. Add more specialized agents (e.g., for finance, project management)
2. Enhance the NLP capabilities for better message understanding
3. Add more sophisticated API integrations
4. Develop a more feature-rich front-end interface 