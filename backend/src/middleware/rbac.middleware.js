const rbac = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(403).json({ error: "Access denied: No role assigned." });
        }

        const userRole = req.user.role;

        // Superadmin always has full access
        if (userRole === "superadmin") {
            return next();
        }

        // If the route specifies exact roles needed
        if (allowedRoles && allowedRoles.length > 0) {
             if (!allowedRoles.includes(userRole)) {
                  return res.status(403).json({ 
                      error: `Access denied: Requires one of [${allowedRoles.join(", ")}]` 
                  });
             }
        }

        // Global safeguard for 'viewer' role - deny all mutating requests permanently
        if (userRole === "viewer" && ["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
             return res.status(403).json({ error: "Access denied: Viewers cannot modify data." });
        }

        next();
    };
};

module.exports = rbac;
