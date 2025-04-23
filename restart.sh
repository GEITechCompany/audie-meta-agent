#!/bin/bash

# Audie Meta-Agent Restart Script
# This script ensures proper environment setup and application restart

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
  echo "Creating default .env file..."
  cat > .env << EOL
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
EOL
  echo ".env file created with default settings"
fi

# Check if port is defined in .env
if ! grep -q "PORT=" .env; then
  echo "ERROR: PORT is not defined in .env file"
  echo "Adding default PORT=3000 to .env file..."
  echo "PORT=3000" >> .env
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Create data directory if it doesn't exist
if [ ! -d "data" ]; then
  echo "Creating data directory..."
  mkdir -p data
fi

# Create logs directory if it doesn't exist
if [ ! -d "logs" ]; then
  echo "Creating logs directory..."
  mkdir -p logs
fi

# Stop any running instances
echo "Stopping any running instances..."
pkill -f "node.*src/index.js" || true

# Start the application
echo "Starting Audie Meta-Agent..."
npm run dev

# Check if application started successfully
if [ $? -eq 0 ]; then
  echo "Audie Meta-Agent started successfully"
  echo "Access the dashboard at http://localhost:3000"
else
  echo "Failed to start Audie Meta-Agent"
  exit 1
fi 