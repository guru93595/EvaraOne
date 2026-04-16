const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

/**
 * ✅ TASK #8: Strict rate limiter for authentication endpoints
 * 
 * VULNERABILITY: Auth endpoints wide open to brute force
 * CURRENT: 100 requests per minute (4.3k per hour)
 * NEW: 5 attempts per 15 minutes (20 per hour)
 * 
 * This prevents:
 * - Brute force login attempts
 * - Token verification spam
 * - CSRF attacks using scattered requests
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minute window
  max: 5,                      // 5 attempts max
  standardHeaders: true,       // Return RateLimit-* headers
  legacyHeaders: false,        // Disable X-RateLimit-* headers
  message: {
    error: 'Too many authentication attempts. Please try again in 15 minutes.',
    retryAfter: '900'  // 15 minutes in seconds
  },
  skip: (req, res) => {
    // Skip rate limiting for superadmin (they need to test)
    // Only skip if they pass valid Firebase admin token
    if (req.user?.role === 'superadmin') {
      console.log('[Auth Rate Limit] Skipping for superadmin:', req.user.uid);
      return true;
    }
    return false;
  },
  keyGenerator: (req, res) => {
    // Rate-limit by IP + username (if both provided)
    // Use ipKeyGenerator for IPv6 support
    const ipKey = ipKeyGenerator(req, res);
    const username = req.body?.email || 'unknown';
    return `${ipKey}:${username}`;
  },
  handler: (req, res) => {
    console.warn('[Auth Rate Limit] ❌ Rate limit exceeded', {
      ip: req.ip,
      email: req.body?.email,
      timestamp: new Date().toISOString()
    });
    res.status(429).json({
      error: 'Too many authentication attempts. Please try again in 15 minutes.'
    });
  }
});

module.exports = authLimiter;
