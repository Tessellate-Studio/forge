const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

// Initialize Express application with security middleware
const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware setup
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint for monitoring
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Main API routes
app.get('/api/status', (req, res) => {
  // Return application status information
  res.json({
    message: 'Web application is running successfully',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Example user routes with proper error handling
app.get('/api/users', async (req, res) => {
  try {
    // Simulate fetching users from database
    const users = await getUsersFromDatabase();
    
    res.json({
      success: true,
      data: users,
      count: users.length
    });
  } catch (error) {
    // Log error for debugging (remove in production)
    console.error('Error fetching users:', error.message);
    
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve users',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Create new user with validation
app.post('/api/users', async (req, res) => {
  try {
    const { name, email } = req.body;
    
    // Input validation
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Name and email are required fields'
      });
    }
    
    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }
    
    // Create user (simulate database operation)
    const newUser = await createUserInDatabase({ name, email });
    
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: newUser
    });
    
  } catch (error) {
    console.error('Error creating user:', error.message);
    
    res.status(500).json({
      success: false,
      message: 'Failed to create user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 404 handler for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// Simulate database operations (replace with real database)
async function getUsersFromDatabase() {
  // Simulate async database call
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve([
        { id: 1, name: 'John Doe', email: 'john@example.com' },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com' }
      ]);
    }, 100);
  });
}

// Create user in database (simulate)
async function createUserInDatabase(userData) {
  // Simulate async database call
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        id: Date.now(),
        ...userData,
        createdAt: new Date().toISOString()
      });
    }, 100);
  });
}

// Start server with proper error handling
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check available at http://localhost:${PORT}/health`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('🔄 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Process terminated');
    process.exit(0);
  });
});

module.exports = app;