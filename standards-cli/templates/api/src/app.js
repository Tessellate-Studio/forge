const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import route modules
const healthRoutes = require('./routes/health');
const userRoutes = require('./routes/users');
const authRoutes = require('./routes/auth');

// Initialize Express application
const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware - applies to all routes
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting to prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Maximum 100 requests per window
  message: {
    error: 'Too many requests, please try again later',
    retryAfter: '15 minutes'
  }
});
app.use('/api/', limiter);

// Compression and logging middleware
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Body parsing middleware with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API Documentation route (if swagger is set up)
if (process.env.NODE_ENV !== 'production') {
  app.get('/api-docs', (req, res) => {
    res.json({
      message: 'API Documentation',
      endpoints: {
        health: '/health',
        users: '/api/users',
        auth: '/api/auth'
      },
      version: '1.0.0'
    });
  });
}

// Mount route handlers
app.use('/health', healthRoutes);
app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);

// Root endpoint with API information
app.get('/', (req, res) => {
  res.json({
    name: 'Best Practices API',
    version: '1.0.0',
    description: 'REST API built with security and performance best practices',
    documentation: '/api-docs',
    health: '/health',
    endpoints: ['/api/users', '/api/auth']
  });
});

// 404 handler for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    path: req.originalUrl,
    method: req.method,
    availableEndpoints: ['/', '/health', '/api/users', '/api/auth']
  });
});

// Global error handling middleware
app.use((error, req, res, next) => {
  // Log error details for debugging
  console.error('API Error:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });

  // Determine error status code
  const statusCode = error.statusCode || error.status || 500;
  
  // Send error response
  res.status(statusCode).json({
    success: false,
    message: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && {
      stack: error.stack,
      details: error.details
    })
  });
});

// Start server with proper error handling
const server = app.listen(PORT, () => {
  console.log(`🚀 API Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📚 API docs: http://localhost:${PORT}/api-docs`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  console.log(`🔄 ${signal} received, shutting down gracefully`);
  
  server.close((err) => {
    if (err) {
      console.error('❌ Error during server shutdown:', err);
      process.exit(1);
    }
    
    console.log('✅ Server closed successfully');
    process.exit(0);
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error('⏰ Forcing shutdown after timeout');
    process.exit(1);
  }, 30000);
};

// Listen for shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('🚫 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = app;