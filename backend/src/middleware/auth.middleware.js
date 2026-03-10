const { admin, db } = require("../config/firebase.js");
const cache = require("../config/cache.js");

const AUTH_CACHE_TTL = 180; // 3 minutes

const requireAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing auth token" });
    }

    const idToken = authHeader.split(" ")[1];

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        
        // Check cache first for user role data
        const cacheKey = `auth_role_${decodedToken.uid}`;
        let userData = await cache.get(cacheKey);

        if (!userData) {
            // Not cached — fetch from Firestore with timeout
            try {
                const firestoreTimeout = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error("Firestore lookup timed out")), 3000)
                );

                const lookupTask = (async () => {
                    let userDoc = await db.collection("superadmins").doc(decodedToken.uid).get();
                    if (!userDoc.exists) {
                        userDoc = await db.collection("customers").doc(decodedToken.uid).get();
                    }
                    return userDoc.exists ? userDoc.data() : { role: "customer" };
                })();

                userData = await Promise.race([lookupTask, firestoreTimeout]);
                // Cache the result for 10 minutes
                await cache.set(cacheKey, userData, AUTH_CACHE_TTL);
            } catch (dbError) {
                console.error("[Auth Middleware] Firestore lookup failed:", dbError.message);
                userData = { role: "customer" };
            }
        }
        
        const role = (userData.role || "customer").trim().toLowerCase().replace(/\s+/g, "");
        console.log(`[Auth] Resolved user ${decodedToken.uid} => role: '${role}'`);
        
        req.user = {
            ...decodedToken,
            role: role,
            display_name: userData.display_name || userData.full_name || decodedToken.name
        };

        next();
    } catch (error) {
        console.error("[Auth Middleware] Token verification failed:", error.message);
        return res.status(401).json({ error: "Invalid token", details: error.message });
    }
};

/**
 * SaaS Architecture: Securing Device Access
 * Efficiently verifies if a user owns a device using tiered collection lookups.
 */
async function checkOwnership(uid, deviceId, role = "customer") {
    if (role === "superadmin") return true;
    if (!uid || !deviceId) return false;

    try {
        const cacheKey = `owner_${deviceId}`;
        const cachedOwner = await cache.get(cacheKey);
        if (cachedOwner === uid) return true;

        // 1. Get registry to find collection type
        const registry = await db.collection("devices").doc(deviceId).get();
        if (!registry.exists) return false;

        const type = registry.data().device_type;
        if (!type) return false;

        // 2. Check customer_id in metadata
        const meta = await db.collection(type).doc(deviceId).get();
        if (!meta.exists) return false;

        const ownerId = meta.data().customer_id;
        if (ownerId === uid) {
            await cache.set(cacheKey, ownerId, 3600); // 1 hour
            return true;
        }
        return false;
    } catch (err) {
        console.error("[Auth] Ownership check failed:", err.message);
        return false;
    }
}

module.exports = { requireAuth, checkOwnership };

