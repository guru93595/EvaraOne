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
                    try {
                        // Priority 1: Superadmins by ID
                        let userDoc = await db.collection("superadmins").doc(decodedToken.uid).get();
                        if (userDoc.exists) return userDoc.data();

                        // Priority 2: Customers by ID
                        userDoc = await db.collection("customers").doc(decodedToken.uid).get();
                        if (userDoc.exists) return { ...userDoc.data(), id: userDoc.id };

                        // Priority 3: Customers by Email (Fallback for pre-provisioned SaaS users)
                        if (decodedToken.email) {
                            const emailMatches = await db.collection("customers")
                                .where("email", "==", decodedToken.email)
                                .limit(1)
                                .get();
                            
                            if (!emailMatches.empty) {
                                const match = emailMatches.docs[0];
                                return { ...match.data(), id: match.id };
                            }
                        }

                        // Default: Generic customer role
                        return { role: "customer" };
                    } catch (e) {
                        console.error("Auth lookup failed:", e);
                        return { role: "customer" };
                    }
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
            display_name: userData.display_name || userData.full_name || decodedToken.name,
            community_id: userData.community_id || userData.communityId || "",
            customer_id: userData.customer_id || userData.customerId || userData.id || "" // Robust fallback to doc.id
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
async function checkOwnership(uid, deviceId, role = "customer", communityId = "") {
    if (role === "superadmin") return true;
    if (!uid || !deviceId) return false;

    try {
        const cacheKey = `owner_${deviceId}`;
        // 1. Check Redis Cache first (O(1) lookup, zero Firestore cost)
        const cachedOwner = await cache.get(cacheKey);
        
        // If cached owner matches user or their community, allow instantly
        if (cachedOwner === uid || (communityId && cachedOwner === communityId)) return true;

        // 2. Fetch Registry (1 read per cache miss)
        const registryDoc = await db.collection("devices").doc(deviceId).get();
        if (!registryDoc.exists) return false;

        const registryData = registryDoc.data();
        const type = registryData.device_type;
        if (!type) return false;

        // 3. Check Metadata Collection (1 read per cache miss)
        const metaDoc = await db.collection(type.toLowerCase()).doc(deviceId).get();
        const metaData = metaDoc.exists ? metaDoc.data() : {};

        // 4. Consolidate Ownership Info (handle both snake_case and camelCase)
        const ownerId = registryData.customer_id || registryData.customerId || 
                        metaData.customer_id || metaData.customerId;
        const deviceCommunityId = registryData.community_id || registryData.communityId || 
                                  metaData.community_id || metaData.communityId;
        
        // Caching: Store the primary ownerId or communityId in Redis for 4 hours
        if (ownerId || deviceCommunityId) {
             await cache.set(cacheKey, ownerId || deviceCommunityId, 14400); 
        }

        if (ownerId === uid || (communityId && (ownerId === communityId || deviceCommunityId === communityId))) {
            return true;
        }
        return false;
    } catch (err) {
        console.error("[Auth] Ownership check failed:", err.message);
        return false;
    }
}

module.exports = { requireAuth, checkOwnership };

