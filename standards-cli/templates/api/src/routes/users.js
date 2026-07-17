const express = require('express');
const { body, validationResult, param } = require('express-validator');
const router = express.Router();

// Mock database for demonstration (replace with real database)
let users = [
  { id: 1, name: 'John Doe', email: 'john@example.com', createdAt: new Date().toISOString() },
  { id: 2, name: 'Jane Smith', email: 'jane@example.com', createdAt: new Date().toISOString() }
];
let nextUserId = 3;

// Validation middleware for user creation
const validateUserCreation = [
  body('name')
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters')
    .trim()
    .escape(),
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail()
    .custom(async (email) => {
      // Check if email already exists
      const existingUser = users.find(user => user.email === email);
      if (existingUser) {
        throw new Error('Email already registered');
      }
      return true;
    })
];

// Validation middleware for user ID parameter
const validateUserId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('User ID must be a positive integer')
    .toInt()
];

/**
 * @route GET /api/users
 * @description Get all users with optional pagination
 * @access Public
 */
router.get('/', (req, res) => {
  try {
    // Parse query parameters for pagination
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const offset = (page - 1) * limit;

    // Apply pagination to users array
    const paginatedUsers = users.slice(offset, offset + limit);
    const totalUsers = users.length;
    const totalPages = Math.ceil(totalUsers / limit);

    res.json({
      success: true,
      data: paginatedUsers,
      pagination: {
        currentPage: page,
        totalPages,
        totalUsers,
        usersPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve users',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route GET /api/users/:id
 * @description Get user by ID
 * @access Public
 */
router.get('/:id', validateUserId, (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format',
        errors: errors.array()
      });
    }

    const userId = req.params.id;
    
    // Find user by ID
    const user = users.find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        userId
      });
    }

    res.json({
      success: true,
      data: user
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route POST /api/users
 * @description Create a new user
 * @access Public
 */
router.post('/', validateUserCreation, async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, email } = req.body;

    // Create new user object
    const newUser = {
      id: nextUserId++,
      name,
      email,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Add user to mock database
    users.push(newUser);

    // Log user creation for audit trail
    console.log(`✅ User created: ${email} (ID: ${newUser.id})`);

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: newUser
    });

  } catch (error) {
    console.error('Error creating user:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to create user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route PUT /api/users/:id
 * @description Update user by ID
 * @access Public
 */
router.put('/:id', validateUserId, validateUserCreation, (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const userId = req.params.id;
    const { name, email } = req.body;

    // Find user by ID
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        userId
      });
    }

    // Update user data
    users[userIndex] = {
      ...users[userIndex],
      name,
      email,
      updatedAt: new Date().toISOString()
    };

    console.log(`📝 User updated: ${email} (ID: ${userId})`);

    res.json({
      success: true,
      message: 'User updated successfully',
      data: users[userIndex]
    });

  } catch (error) {
    console.error('Error updating user:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route DELETE /api/users/:id
 * @description Delete user by ID
 * @access Public
 */
router.delete('/:id', validateUserId, (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format',
        errors: errors.array()
      });
    }

    const userId = req.params.id;

    // Find user index
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        userId
      });
    }

    // Remove user from array
    const deletedUser = users.splice(userIndex, 1)[0];

    console.log(`🗑️ User deleted: ${deletedUser.email} (ID: ${userId})`);

    res.json({
      success: true,
      message: 'User deleted successfully',
      data: {
        id: deletedUser.id,
        name: deletedUser.name,
        email: deletedUser.email
      }
    });

  } catch (error) {
    console.error('Error deleting user:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;