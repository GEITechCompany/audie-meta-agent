require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { setupDatabase } = require('./database');
const logger = require('./utils/logger');
const apiRoutes = require('./routes/api');
const webRoutes = require('./routes/web');

// Check environment variables
if (!process.env.PORT) {
  logger.error('PORT environment variable is not defined!');
  process.exit(1);
}

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// View engine setup
app.set('views', path.join(__dirname, '../views'));
app.set('view engine', 'ejs');

// Routes
app.use('/', webRoutes);
app.use('/api', apiRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`);
  res.status(err.status || 500).json({
    error: {
      message: err.message,
      status: err.status || 500
    }
  });
});

// Initialize database and start server
async function startServer() {
  try {
    await setupDatabase();
    
    app.listen(PORT, () => {
      const baseUrl = `http://localhost:${PORT}`;
      logger.info(`Audie Meta-Agent system running at ${baseUrl}`);
      logger.info(`Dashboard available at ${baseUrl}`);
      logger.info(`API endpoints available at ${baseUrl}/api`);
    });
  } catch (error) {
    logger.error(`Failed to start Audie system: ${error.message}`);
    process.exit(1);
  }
}

startServer(); 