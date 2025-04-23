require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const { setupDatabase } = require('./database');
const logger = require('./utils/logger');
const apiRoutes = require('./routes/api');
const webRoutes = require('./routes/web');
const authService = require('./services/AuthService');
const { apiLimiter } = require('./middleware/rateLimitMiddleware');
const { securityHeaders, staticContentHeaders } = require('./middleware/securityHeadersMiddleware');
const { csrfToken, csrfProtection } = require('./middleware/csrfMiddleware');
const apiLoggerMiddleware = require('./middleware/apiLoggerMiddleware');
const schedule = require('node-schedule');

// Check environment variables
if (!process.env.PORT) {
  logger.error('PORT environment variable is not defined!');
  process.exit(1);
}

// Warn about JWT security
if (!process.env.JWT_SECRET) {
  logger.warn('JWT_SECRET environment variable is not defined! Using default secret (INSECURE)');
}

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Apply security headers to all responses
app.use(securityHeaders);

// Basic middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.CORS_ORIGIN || true 
    : true,
  credentials: true
}));
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser(process.env.COOKIE_SECRET || 'audie-meta-agent-cookie-secret'));

// Static files with optimized headers
app.use('/static', staticContentHeaders);
app.use('/static', express.static(path.join(__dirname, '../public')));
app.use(express.static(path.join(__dirname, '../public')));

// View engine setup
app.set('views', path.join(__dirname, '../views'));
app.set('view engine', 'ejs');

// API request logging
app.use('/api', apiLoggerMiddleware);

// Apply rate limiting to all API requests
app.use('/api', apiLimiter);

// Apply CSRF protection to web routes (not API routes that use JWT)
app.use('/api', csrfToken);
app.use('/api/auth/register', csrfProtection);
app.use('/api/auth/login', csrfProtection);
app.use('/', csrfToken);
app.use('/', csrfProtection);

// Routes
app.use('/', webRoutes);
app.use('/api', apiRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`, {
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  
  res.status(err.status || 500).json({
    success: false,
    error: 'server_error',
    message: process.env.NODE_ENV === 'production' 
      ? 'An error occurred while processing your request' 
      : err.message
  });
});

// 404 handler
app.use((req, res) => {
  logger.warn(`Route not found: ${req.method} ${req.path}`);
  
  if (req.path.startsWith('/api')) {
    return res.status(404).json({
      success: false,
      error: 'not_found',
      message: 'The requested endpoint does not exist'
    });
  }
  
  res.status(404).render('error', { 
    title: '404 - Not Found',
    message: 'The page you are looking for does not exist',
    error: { status: 404 }
  });
});

// Schedule token cleanup job (run daily at midnight)
const setupScheduledJobs = () => {
  // Clean up expired refresh tokens every day at midnight
  schedule.scheduleJob('0 0 * * *', async () => {
    try {
      logger.info('Running scheduled job: Clean expired refresh tokens');
      const result = await authService.cleanupExpiredTokens();
      logger.info(`Cleaned ${result.cleaned} expired tokens`);
    } catch (error) {
      logger.error(`Error running token cleanup job: ${error.message}`);
    }
  });
};

// Initialize database and start server
async function startServer() {
  try {
    await setupDatabase();
    
    // Setup scheduled jobs
    setupScheduledJobs();
    
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