#!/bin/bash

# Run Client API Tests
# This script sets up the environment variables and runs the client API tests

# Define colors for better readability
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Setting up environment for client API tests...${NC}"

# Set default environment variables
export API_BASE_URL="http://localhost:3000/api"
export TEST_USER_EMAIL="admin@example.com"
export TEST_USER_PASSWORD="password123"
export PORT=3000 # Ensure consistent port
export DISABLE_CSRF_FOR_TESTS="true" # Set this to disable CSRF for testing

# Check for and load test-specific environment variables
if [ -f ".env.test" ]; then
  echo -e "${BLUE}Loading test environment variables from .env.test${NC}"
  set -a # automatically export all variables
  source .env.test
  set +a
fi

# Print current test configuration
echo -e "${BLUE}Test Configuration:${NC}"
echo -e "  API URL:   ${API_BASE_URL}"
echo -e "  Test User: ${TEST_USER_EMAIL}"
echo -e "  API Port:  ${PORT}"
echo

# Check if the server is running
echo -e "${YELLOW}Checking if API server is running on port $PORT...${NC}"
if curl -s http://localhost:$PORT/api/health > /dev/null; then
  echo -e "${GREEN}✓ API server is running${NC}"
else
  echo -e "${RED}✗ API server does not appear to be running on port $PORT${NC}"
  echo -e "${YELLOW}Please start the server with: npm run dev${NC}"
  exit 1
fi

# Run the tests
echo -e "${YELLOW}Running client API endpoint tests...${NC}"

# CSRF Warning
echo -e "${BLUE}Note about CSRF Protection:${NC}"
echo -e "If tests fail with CSRF errors, you may need to:"
echo -e "1. Set DISABLE_CSRF_FOR_TESTS=true in your .env file"
echo -e "2. Restart your API server"
echo

# Execute the tests and capture the exit status
node src/tests/api/client-endpoints.test.js
TEST_EXIT_STATUS=$?

# Check exit status
if [ $TEST_EXIT_STATUS -eq 0 ]; then
  echo -e "${GREEN}✓ Client API tests completed successfully${NC}"
  exit 0
else
  echo -e "${RED}✗ Client API tests failed with exit code $TEST_EXIT_STATUS${NC}"
  echo -e "${YELLOW}Check error logs above for details.${NC}"
  echo -e "${YELLOW}Common issues:${NC}"
  echo -e "  - CSRF protection (set DISABLE_CSRF_FOR_TESTS=true in .env)"
  echo -e "  - Authentication failure (check TEST_USER_EMAIL and TEST_USER_PASSWORD)"
  echo -e "  - API response format mismatch (check if API has changed)"
  exit $TEST_EXIT_STATUS
fi 