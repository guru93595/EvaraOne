const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware.js");
const authController = require("../controllers/auth.controller.js");

const router = express.Router();

/**
 * POST /api/v1/auth/verify-token
 * Verify Firebase ID token and return user profile with correct role
 * Used during initial login
 * Public endpoint - no auth required
 */
router.post("/verify-token", authController.verifyToken);

/**
 * GET /api/v1/auth/me
 * Get current authenticated user's profile with correct role
 * Protected endpoint - requires valid token
 */
router.get("/me", requireAuth, authController.getUserProfile);

module.exports = router;
