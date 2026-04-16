/**
 * ✅ FIX #1: ENFORCE SUPERADMIN-ONLY ACCESS
 * 
 * VULNERABILITY FIXED:
 * - Customers could POST to /api/v1/admin/* endpoints
 * - No role validation at router level
 * - Competitors' accounts could be hijacked
 * 
 * SOLUTION:
 * - Check req.user.role === "superadmin" BEFORE any request processing
 * - Return 403 Forbidden for non-superadmins
 * - Log audit trail of failed attempts
 */

const adminOnly = (req, res, next) => {
  // Extract role from authenticated user
  const userRole = req.user?.role || '';
  const userId = req.user?.uid || 'unknown';

  // Guard: MUST be superadmin
  if (userRole !== 'superadmin') {
    // Log attempt for security monitoring
    console.warn(`[RBAC] ❌ Unauthorized admin access attempt`, {
      timestamp: new Date().toISOString(),
      userId,
      userRole,
      method: req.method,
      path: req.path,
      ip: req.ip
    });

    // Return 403 Forbidden
    return res.status(403).json({
      error: 'Forbidden',
      message: 'This endpoint requires superadmin privileges'
    });
  }

  // ✅ Authorized: Log for audit trail
  console.log(`[RBAC] ✅ Admin action authorized`, {
    timestamp: new Date().toISOString(),
    userId,
    method: req.method,
    path: req.path
  });

  // Proceed to next middleware/route handler
  next();
};

module.exports = adminOnly;
