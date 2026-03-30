/**
 * SaaS Architecture: Tenant Isolation Middleware
 * Ensures that the user operates within their designated tenant namespace.
 * In a fully migrated schema, this ensures req.tenant_id matches the requested resource.
 */
const tenantCheck = (req, res, next) => {
    if (!req.user || req.user.role === "superadmin") {
        return next(); // Superadmins bypass tenant isolation
    }

    // Resolve the virtual tenant ID for the current user session
    // Standardize to use both variants for robustness
    const tenantId = req.user.community_id || req.user.communityId || req.user.customer_id || req.user.customerId || req.user.uid;
    req.tenant_id = tenantId;

    // Secure payload injection prevention:
    // If a request tries to create/update data for a tenant they don't belong to, reject it.
    if (["POST", "PUT"].includes(req.method) && req.body) {
         if (req.body.tenant_id && req.body.tenant_id !== req.tenant_id) {
             return res.status(403).json({ error: "Tenant Isolation Violation: Cannot mutate data outside your tenant namespace." });
         }
    }

    next();
};

module.exports = tenantCheck;
