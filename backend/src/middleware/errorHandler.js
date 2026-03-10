const logger = require('../utils/logger');

// Standardized error response format
const createErrorResponse = (error, statusCode = 500) => {
  // Don't expose internal errors in production
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  return {
    success: false,
    error: {
      message: error.message || 'Internal Server Error',
      ...(isDevelopment && { stack: error.stack }),
      code: error.code || 'INTERNAL_ERROR',
      statusCode
    },
    timestamp: new Date().toISOString()
  };
};

// Main error handling middleware
const errorHandler = (err, req, res, next) => {
  // Log the error
  logger.error('Request error', err, {
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: req.body,
    user: req.user?.uid
  });

  // Handle specific error types
  let statusCode = 500;
  let message = 'Internal Server Error';

  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    message = 'Unauthorized';
  } else if (err.name === 'ForbiddenError') {
    statusCode = 403;
    message = 'Forbidden';
  } else if (err.name === 'NotFoundError') {
    statusCode = 404;
    message = 'Resource Not Found';
  } else if (err.name === 'ConflictError') {
    statusCode = 409;
    message = 'Conflict';
  }

  res.status(statusCode).json(createErrorResponse(err, statusCode));
};

// Async error wrapper
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Custom error classes
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'APP_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = 'AppError';
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
    this.name = 'ValidationError';
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

module.exports = {
  errorHandler,
  asyncHandler,
  createErrorResponse,
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError
};
