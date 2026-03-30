const { db, admin } = require("../config/firebase.js");
const FieldValue = admin.firestore.FieldValue;
const { Filter } = require("firebase-admin/firestore");
const cache = require("../config/cache.js");
const telemetryCache = require("../services/cacheService.js");

exports.createZone = async (req, res) => {
    try {

        const {
            zoneName,
            state,
            country,
            zone_code,
            description
        } = req.body;

        if (!zoneName || !state || !country) {
            return res.status(400).json({
                error: "Missing required fields"
            });
        }

        const zoneData = {
            zoneName,
            state,
            country,
            zone_code: zone_code || "",
            description: description || "",
            created_at: new Date()
        };

        const docRef = await db.collection("zones").add(zoneData);
        await cache.flushPrefix("zones_list_");
        await cache.flushPrefix("admin_hierarchy");
        await cache.flushPrefix("dashboard_summary_");

        return res.status(201).json({
            success: true,
            id: docRef.id,
            message: "Zone created successfully"
        });

    } catch (error) {
        console.error("Create zone error:", error);

        return res.status(500).json({
            error: "Failed to create zone",
            details: error.message
        });
    }
};

exports.getZones = async (req, res) => {
    try {
        const cacheKey = `zones_list_${req.query.limit || 50}_${req.query.cursor || ''}`;
        const cached = await cache.get(cacheKey);
        if (cached) return res.status(200).json(cached);

        const limitStr = parseInt(req.query.limit) || 50;
        let query = db.collection("zones").orderBy("created_at").limit(limitStr);
        
        if (req.query.cursor) {
            const cursorDoc = await db.collection("zones").doc(req.query.cursor).get();
            if(cursorDoc.exists) {
                query = query.startAfter(cursorDoc);
            }
        }
        
        const snapshot = await query.get();
        const zones = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        await cache.set(cacheKey, zones, 600); // 10 min
        res.status(200).json(zones);
    } catch (error) {
        console.error("Failed to get zones", error);
        res.status(500).json({ error: "Failed to get zones" });
    }
};

exports.getZoneById = async (req, res) => {
    try {
        const doc = await db.collection("zones").doc(req.params.id).get();
        if (!doc.exists) return res.status(404).json({ error: "Zone not found" });
        res.status(200).json({ id: doc.id, ...doc.data() });
    } catch (error) {
        res.status(500).json({ error: "Failed to get zone" });
    }
};

exports.updateZone = async (req, res) => {
    try {
        await db.collection("zones").doc(req.params.id).update(req.body);
        await cache.flushPrefix("zones_list_");
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to update zone" });
    }
};

exports.deleteZone = async (req, res) => {
    try {
        await db.collection("zones").doc(req.params.id).delete();
        await cache.flushPrefix("zones_list_");
        await cache.flushPrefix("dashboard_summary_");
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete zone" });
    }
};

// Customers
exports.createCustomer = async (req, res) => {
    try {
        const { confirmPassword, email, password, display_name, full_name, role, ...customerData } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        // 🎯 FIX: Check email uniqueness in Firestore BEFORE Auth creation to avoid orphaned Auth users
        const existing = await db.collection("customers").where("email", "==", email.trim()).get();
        if (!existing.empty) {
            return res.status(400).json({ error: "Customer documentation already exists with this email" });
        }

        // 1. Create Firebase Auth User
        console.log(`[AdminController] Creating Auth user for: ${email}`);
        const authUser = await admin.auth().createUser({
            email: email.trim(),
            password: password,
            displayName: display_name || full_name || "New Customer",
        });

        const uid = authUser.uid;
        console.log(`[AdminController] Auth user created. UID: ${uid}`);

        // 2. Create Firestore Document using UID as Doc ID
        // 🎯 CRITICAL: This ensures Dashboard queries (based on UID) match the record
        const customer = { 
            ...customerData, 
            display_name: display_name || full_name || "New Customer",
            full_name: full_name || display_name || "",
            email: email.trim(),
            role: role || "customer",
            uid: uid, // Explicitly store for redundancy
            created_at: new Date() 
        };

        await db.collection("customers").doc(uid).set(customer);
        
        await cache.flushPrefix("customers_");
        await cache.flushPrefix("admin_hierarchy");
        await cache.flushPrefix("dashboard_summary_");
        
        res.status(201).json({ success: true, id: uid });
    } catch (error) {
        console.error("[AdminController] createCustomer CRITICAL ERROR:", error);
        
        // Handle Firebase Auth errors (e.g. email-already-exists)
        if (error.code === 'auth/email-already-exists') {
            return res.status(400).json({ error: "Auth account already exists with this email" });
        }
        
        res.status(500).json({ error: "Failed to create customer", details: error.message });
    }
};

exports.getCustomers = async (req, res) => {
    try {
        const { zone_id, community_id, regionFilter, limit, cursor } = req.query;
        
        const cacheParams = [
            req.user.role,
            zone_id || 'all',
            community_id || 'all',
            regionFilter || 'all',
            limit || '50',
            cursor || 'none'
        ].join(':');
        
        const cacheKey = req.user.role === "superadmin" ? `user:admin:customers:${cacheParams}` : `user:${req.user.uid}:customers:${cacheParams}`;
        const cached = await cache.get(cacheKey);
        if (cached) return res.status(200).json(cached);

        const limitStr = parseInt(limit) || 50;
        let query = db.collection("customers");
        
        console.log(`[AdminController] getCustomers query:`, { zone_id, community_id, role: req.user.role });

        if (req.user.role !== "superadmin") {
            query = query.where("id", "==", req.user.customer_id || req.user.uid);
        } else {
            // REMOVED orderBy("created_at") to avoid complex index requirements that cause silent failures
            
            if (zone_id && zone_id.trim() !== '') {
                // Primary Filter
                query = query.where("zone_id", "==", zone_id.trim());
            } else if (regionFilter && regionFilter.trim() !== '') {
                query = query.where("regionFilter", "==", regionFilter.trim());
            } else if (community_id && community_id.trim() !== '') {
                query = query.where("community_id", "==", community_id.trim());
            }
        }
        
        query = query.limit(limitStr);

        if (cursor) {
            const cursorDoc = await db.collection("customers").doc(cursor).get();
            if(cursorDoc.exists) {
                query = query.startAfter(cursorDoc);
            }
        }

        const snapshot = await query.get();
        let customers = snapshot.docs.map(doc => {
            const data = doc.data();
            return { 
                id: doc.id, 
                customerId: doc.id, 
                deviceCount: data.deviceCount || data.device_count || 0, // 🎯 NORMALIZE
                ...data 
            };
        });

        // COMPREHENSIVE FALLBACK: Check alternative field names (zoneId, regionFilter) if no results for zone_id
        if (req.user.role === "superadmin" && zone_id && customers.length === 0) {
            console.log(`[AdminController] No customers found for zone_id: ${zone_id}, trying fallbacks...`);
            
            // Try zoneId (camelCase)
            const zoneIdSnapshot = await db.collection("customers").where("zoneId", "==", zone_id.trim()).limit(limitStr).get();
            if (!zoneIdSnapshot.empty) {
                console.log(`[AdminController] Found ${zoneIdSnapshot.size} customers via zoneId fallback`);
                customers = [...customers, ...zoneIdSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))];
            }

            // Try regionFilter (legacy)
            const regionSnapshot = await db.collection("customers").where("regionFilter", "==", zone_id.trim()).limit(limitStr).get();
            if (!regionSnapshot.empty) {
                console.log(`[AdminController] Found ${regionSnapshot.size} customers via regionFilter fallback`);
                // Deduplicate by ID
                const existingIds = new Set(customers.map(c => c.id));
                regionSnapshot.docs.forEach(doc => {
                    if (!existingIds.has(doc.id)) {
                        customers.push({ id: doc.id, ...doc.data() });
                        existingIds.add(doc.id);
                    }
                });
            }
        }

        console.log(`[AdminController] Successfully fetched ${customers.length} customers`);
        await cache.set(cacheKey, customers, 600); // 10 min
        res.status(200).json(customers);
    } catch (error) {
        console.error("[AdminController] getCustomers CRITICAL ERROR:", error);
        res.status(500).json({ error: "Failed to get customers", details: error.message });
    }
};

exports.getCustomerById = async (req, res) => {
    try {
        const doc = await db.collection("customers").doc(req.params.id).get();
        if (!doc.exists) return res.status(404).json({ error: "Customer not found" });
        
        const data = doc.data();
        res.status(200).json({ 
            id: doc.id, 
            customerId: doc.id, 
            deviceCount: data.deviceCount || data.device_count || 0, // 🎯 NORMALIZE
            ...data 
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to get customer" });
    }
};

exports.updateCustomer = async (req, res) => {
    try {
        await db.collection("customers").doc(req.params.id).update(req.body);
        await cache.flushPrefix("user:");
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to update customer" });
    }
};

exports.deleteCustomer = async (req, res) => {
    try {
        await db.collection("customers").doc(req.params.id).delete();
        await cache.flushPrefix("user:");
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete customer" });
    }
};

// Nodes (Registry + Metadata Architecture)
exports.createNode = async (req, res) => {
    try {
        const {
            displayName,
            deviceName,
            assetType,
            zoneId,
            customerId,
            thingspeakChannelId,
            thingspeakReadKey,
            waterLevelField,
            borewellDepthField,
            meterReadingField,
            flowRateField,
            capacity,
            depth,
            tankLength,
            tankBreadth,
            staticDepth,
            dynamicDepth,
            rechargeThreshold,
            latitude,
            longitude,
            hardwareId,
            id: fallbackIdRef
        } = req.body;

        if (!customerId) return res.status(400).json({ error: "customerId is required for device assignment" });
        if (!zoneId) return res.status(400).json({ error: "zoneId is required for location context" });

        const timestamp = new Date();
        const idForDevice = hardwareId || fallbackIdRef || `DEV-${Date.now()}`;
        const typeNormalized = (assetType || "evaratank").toLowerCase();
        
        let targetCol = "";
        if (typeNormalized === "evaratank" || typeNormalized === "tank" || assetType === "EvaraTank") targetCol = "evaratank";
        else if (typeNormalized === "evaradeep" || typeNormalized === "deep" || assetType === "EvaraDeep") targetCol = "evaradeep";
        else if (typeNormalized === "evaraflow" || typeNormalized === "flow" || assetType === "EvaraFlow") targetCol = "evaraflow";

        if (!targetCol) return res.status(400).json({ error: "Invalid assetType" });

        // 🎯 ATOMIC TRANSACTION: Ensuring consistency across Devices -> Customers -> Zones
        const resultId = await db.runTransaction(async (transaction) => {
            const customerRef = db.collection("customers").doc(customerId);
            const zoneRef = db.collection("zones").doc(zoneId);
            
            // 1. Verify Parents Exist
            const [custSnap, zoneSnap] = await Promise.all([
                transaction.get(customerRef),
                transaction.get(zoneRef)
            ]);

            if (!custSnap.exists) throw new Error("Customer not found - linking failed");
            if (!zoneSnap.exists) throw new Error("Zone not found - mapping failed");

            // 2. Prepare Registry and Metadata
            const deviceRef = db.collection("devices").doc(); // Use auto-ID but within transaction
            const deviceId = deviceRef.id;

            const registryData = {
                device_id: idForDevice,
                device_type: typeNormalized,
                node_id: idForDevice,
                customer_id: customerId,
                zone_id: zoneId,
                label: displayName || deviceName || idForDevice,
                device_name: deviceName || displayName || idForDevice,
                firestore_id: deviceId, // Cross-link
                is_assigned: true, // 🎯 DEFAULT: Hardware assigned to customer
                is_active: false,  // 🎯 DEFAULT: Inactive until Admin toggles ON
                created_at: timestamp
            };

            const metadata = {
                device_id: idForDevice,
                node_id: idForDevice,
                label: displayName || deviceName || "Unnamed",
                device_name: deviceName || displayName || "Unknown Device",
                thingspeak_read_api_key: thingspeakReadKey || "",
                thingspeak_channel_id: thingspeakChannelId || "",
                customer_id: customerId,
                zone_id: zoneId,
                latitude: parseFloat(latitude) || null,
                longitude: parseFloat(longitude) || null,
                created_at: timestamp,
                updated_at: timestamp
            };

            // Asset-specific metadata configuration
            if (targetCol === "evaratank") {
                metadata.tank_size = capacity || 0;
                metadata.configuration = { tank_length: tankLength || 0, tank_breadth: tankBreadth || 0, depth: depth || 0 };
                metadata.sensor_field_mapping = { [waterLevelField || "field2"]: "water_level_raw_sensor_reading" };
            } else if (targetCol === "evaradeep") {
                metadata.configuration = { total_depth: depth || 0, static_water_level: staticDepth || 0, dynamic_water_level: dynamicDepth || 0, recharge_threshold: rechargeThreshold || 0 };
                metadata.sensor_field_mapping = { [borewellDepthField || "field2"]: "water_level_in_cm" };
            } else if (targetCol === "evaraflow") {
                metadata.sensor_field_mapping = { [flowRateField || "field2"]: "flow_rate", [meterReadingField || "field1"]: "current_reading" };
            }

            // 3. Commit All Writes Automically
            transaction.set(deviceRef, registryData);
            transaction.set(db.collection(targetCol).doc(deviceId), metadata);
            
            // 🎯 LINK TO CUSTOMER: push ID and conditionally increment count
            const customerUpdate = {
                device_ids: FieldValue.arrayUnion(deviceId),
                updated_at: timestamp
            };
            if (registryData.is_active) {
                customerUpdate.deviceCount = FieldValue.increment(1);
            }
            transaction.update(customerRef, customerUpdate);

            // 🎯 LINK TO ZONE: push ID and increment count
            transaction.update(zoneRef, {
                device_ids: FieldValue.arrayUnion(deviceId),
                device_count: FieldValue.increment(1),
                updated_at: timestamp
            });

            return deviceId;
        });

        // SaaS Invalidation
        await Promise.all([
            cache.flushPrefix("nodes_"),
            cache.flushPrefix("user:"),
            cache.flushPrefix("dashboard_init_"),
            cache.flushPrefix("dashboard_summary_"),
            cache.flushPrefix("admin_hierarchy")
        ]);

        res.status(201).json({ 
            success: true, 
            id: resultId, 
            message: "Device provisioned and bidirectional links established" 
        });
    } catch (error) {
        console.error("Failed to create device (transaction aborted):", error);
        res.status(500).json({ error: error.message || "Failed to create device" });
    }
};

exports.getNodes = async (req, res) => {
    try {
        console.log(`[AdminController] getNodes for user:`, req.user.uid, "role:", req.user.role);
        const nodesCacheKey = req.user.role === "superadmin" 
            ? "user:admin:devices" 
            : `user:${req.user.customer_id || req.user.uid}:devices`;
        console.log(`[AdminController] Cache Key:`, nodesCacheKey);
        const cachedNodes = await cache.get(nodesCacheKey);
        if (cachedNodes) return res.status(200).json(cachedNodes);

        const limitStr = parseInt(req.query.limit) || 100;
        let query = db.collection("devices");
        
        if (req.user.role !== "superadmin") {
            query = query.where("customer_id", "==", req.user.customer_id || req.user.uid)
                         .where("is_active", "==", true); // 🎯 VISIBILITY RULE: Only active for customers
        }
        
        const snapshot = await query.limit(limitStr).get();
        
        // Batched Metadata Fetching (Eliminates N+1 reads)
        const typedGroups = {};
        const registryDataMap = {};

        for (const doc of snapshot.docs) {
            const registry = doc.data();
            const type = registry.device_type;
            if (!type) continue;

            if (!typedGroups[type]) typedGroups[type] = [];
            typedGroups[type].push(doc.id);
            registryDataMap[doc.id] = registry;
        }

        const devices = [];
        const typeBatches = await Promise.all(
            Object.keys(typedGroups).map(async (type) => {
                const ids = typedGroups[type];
                const refs = ids.map(id => db.collection(type.toLowerCase()).doc(id));
                const metas = await db.getAll(...refs);
                return metas.map(m => m.exists ? { id: m.id, meta: m.data(), type } : null).filter(Boolean);
            })
        );

        for (const batch of typeBatches) {
            for (const item of batch) {
                const { id, meta } = item;
                if (req.user.role !== "superadmin" && meta.customer_id !== req.user.uid) continue;

                const { thingspeak_read_api_key, ...safeMeta } = meta;
                
                // 🎯 NORMALIZE: Elevate customer_id to customerId
                const registry = registryDataMap[id] || {};
                const customerId = registry.customer_id || safeMeta.customer_id || safeMeta.customerId || "";

                devices.push({ 
                    id,
                    customerId, // Canonical
                    customer_id: customerId, // Fallback
                    ...registry, 
                    ...safeMeta 
                });
            }
        }
        
        await cache.set(nodesCacheKey, devices, 300); // 5 min
        res.status(200).json(devices);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch devices" });
    }
};

/**
 * Helper to resolve device by document ID OR device_id
 */
async function resolveDevice(id) {
    if (!id) return null;
    const directDoc = await db.collection("devices").doc(id).get();
    if (directDoc.exists) return directDoc;

    const q1 = await db.collection("devices").where("device_id", "==", id).limit(1).get();
    if (!q1.empty) return q1.docs[0];

    const q2 = await db.collection("devices").where("node_id", "==", id).limit(1).get();
    if (!q2.empty) return q2.docs[0];

    return null;
}

exports.updateNode = async (req, res) => {
    try {
        const deviceDoc = await resolveDevice(req.params.id);
        if (!deviceDoc || !deviceDoc.exists) return res.status(404).json({ error: "Device not found" });
        
        const type = (deviceDoc.data().device_type || "").toLowerCase();
        if (!type) return res.status(400).json({ error: "Device type not specified" });
        const metaRef = db.collection(type).doc(deviceDoc.id);

        // Sanitize and support both naming conventions
        const body = req.body;
        const trimmed = (val) => (typeof val === "string" ? val.trim() : val);

        const metaUpdate = { updated_at: new Date() };
        
        const registryUpdate = {};
        if (body.displayName || body.label) {
            const val = trimmed(body.displayName || body.label);
            metaUpdate.label = val;
            registryUpdate.label = val;
        }
        if (body.deviceName || body.device_name) {
            const val = trimmed(body.deviceName || body.device_name);
            metaUpdate.device_name = val;
            registryUpdate.device_name = val;
        }
        
        // ThingSpeak credentials (flexible naming)
        const readKey = body.thingspeakReadKey || body.thingspeak_read_key || body.thingspeak_read_api_key;
        if (readKey) metaUpdate.thingspeak_read_api_key = trimmed(readKey);
        
        const channelId = body.thingspeakChannelId || body.thingspeak_channel_id;
        if (channelId) metaUpdate.thingspeak_channel_id = trimmed(channelId);
        
        if (body.customerId || body.customer_id) {
            const cid = trimmed(body.customerId || body.customer_id);
            metaUpdate.customer_id = cid;
            // Also sync to registry
            registryUpdate.customer_id = cid;
        }
        
        if (Object.keys(registryUpdate).length > 0) {
            await db.collection("devices").doc(deviceDoc.id).update(registryUpdate);
        }
        
        if (body.latitude !== undefined) metaUpdate.latitude = parseFloat(body.latitude);
        if (body.longitude !== undefined) metaUpdate.longitude = parseFloat(body.longitude);

        // Type-specific updates (flexible naming)
        if (type === "evaratank" || type === "tank") {
            const cap = body.capacity || body.tank_size || body.capacity_liters || body.capacity_liters_override;
            if (cap !== undefined) metaUpdate.tank_size = parseFloat(cap) || 0;
            
            const config = {};
            const depthVal = body.depth || body.height_m || body.max_depth || body.tank_height;
            if (depthVal !== undefined) config.depth = parseFloat(depthVal) || 0;
            
            const len = body.tankLength || body.length_m || body.tank_length;
            if (len !== undefined) config.tank_length = parseFloat(len) || 0;
            
            const br = body.tankBreadth || body.breadth_m || body.tank_breadth;
            if (br !== undefined) config.tank_breadth = parseFloat(br) || 0;
            
            const rad = body.radius || body.radius_m || body.tank_radius;
            if (rad !== undefined) config.tank_radius = parseFloat(rad) || 0;

            if (Object.keys(config).length > 0) metaUpdate.configuration = config;
            
            const field = body.waterLevelField || body.water_level_field;
            if (field) {
                metaUpdate.sensor_field_mapping = { [trimmed(field)]: "water_level_raw_sensor_reading" };
            }
        } else if (type === "evaradeep") {
            const config = {};
            const depthVal = body.depth || body.total_bore_depth || body.total_depth;
            if (depthVal !== undefined) config.total_depth = parseFloat(depthVal) || 0;
            
            const stat = body.staticDepth || body.static_water_level || body.static_depth;
            if (stat !== undefined) config.static_water_level = parseFloat(stat) || 0;
            
            const dyn = body.dynamicDepth || body.dynamic_water_level || body.dynamic_depth;
            if (dyn !== undefined) config.dynamic_water_level = parseFloat(dyn) || 0;
            
            const thres = body.rechargeThreshold || body.recharge_threshold;
            if (thres !== undefined) config.recharge_threshold = parseFloat(thres) || 0;

            if (Object.keys(config).length > 0) metaUpdate.configuration = config;

            const field = body.borewellDepthField || body.water_level_field || body.depth_field;
            if (field) {
                metaUpdate.sensor_field_mapping = { [trimmed(field)]: "water_level_in_cm" };
            }
        } else if (type === "evaraflow") {
            const config = {};
            if (body.maxFlowRate || body.max_flow_rate) config.max_flow_rate = parseFloat(body.maxFlowRate || body.max_flow_rate) || 0;
            if (Object.keys(config).length > 0) metaUpdate.configuration = config;

            if (body.flowRateField || body.meterReadingField || body.flow_rate_field || body.meter_reading_field) {
                const docData = (await metaRef.get()).data();
                const currentMap = docData.sensor_field_mapping || {};
                
                let rateField = body.flowRateField || body.flow_rate_field;
                if (!rateField) rateField = Object.keys(currentMap).find(k => currentMap[k] === "flow_rate") || "field2";
                
                let readingField = body.meterReadingField || body.meter_reading_field;
                if (!readingField) readingField = Object.keys(currentMap).find(k => currentMap[k] === "current_reading") || "field1";

                metaUpdate.sensor_field_mapping = { 
                    [trimmed(rateField)]: "flow_rate", 
                    [trimmed(readingField)]: "current_reading" 
                };
            }
        }

        // 🎯 Feature Configurations (Product Configurations in UI)
        if (body.features && typeof body.features === "object") {
            metaUpdate.features = {
                ...((await metaRef.get()).data()?.features || {}),
                ...body.features
            };
        }

        await metaRef.set(metaUpdate, { merge: true });
        
        // SaaS Invalidation
        await Promise.all([
            cache.flushPrefix("nodes_"),
            cache.flushPrefix("user:"),
            cache.flushPrefix("dashboard_init_"),
            cache.flushPrefix("dashboard_summary_")
        ]);
        if (typeof telemetryCache !== 'undefined') {
             telemetryCache.del(`telemetry_${deviceDoc.id}`); 
             telemetryCache.del(`status_${deviceDoc.id}`);
        }

        // 🚀 Real-time Synchronization (Socket.io)
        const io = req.app.get("io");
        if (io) {
            io.to(id).emit("config_updated", {
                hardware_id: id,
                features: metaUpdate.features || {}
            });
            console.log(`[Socket] Config update emitted for ${id}`);
        }

        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to update metadata" });
    }
};

exports.deleteNode = async (req, res) => {
    try {
        const rawId = req.params.id;
        console.log(`[AdminController] deleteNode called for id: ${rawId}, user role: ${req.user?.role}`);

        // ✅ FIX: Resolve Firestore doc from hardware ID OR doc ID
        const deviceDoc = await resolveDevice(rawId);
        if (!deviceDoc || !deviceDoc.exists) {
            console.warn(`[AdminController] deleteNode: Device not found for id: ${rawId}`);
            return res.status(404).json({ error: "Device not found" });
        }

        const docId = deviceDoc.id; // Firestore document ID (auto-generated)
        console.log(`[AdminController] deleteNode: Resolved Firestore docId: ${docId}`);

        // ✅ RBAC: Only superadmin can delete nodes
        if (req.user?.role !== "superadmin") {
            console.warn(`[AdminController] deleteNode: Forbidden - user ${req.user?.uid} is not superadmin`);
            return res.status(403).json({ error: "Forbidden: Only superadmin can delete nodes" });
        }

        // Normalize device_type → Firestore collection name (handles legacy values)
        const normalizeTypeToCollection = (rawType) => {
            const t = (rawType || "").toLowerCase().trim();
            if (["evaratank", "evara", "tank", "water_tank", "evarawatertank"].includes(t)) return "evaratank";
            if (["evaradeep", "deep", "borewell", "deep_well", "evaradeepwell"].includes(t)) return "evaradeep";
            if (["evaraflow", "flow", "flow_meter", "evaraflowmeter"].includes(t)) return "evaraflow";
            return t;
        };

        // Pre-resolve all collection + customer + zone refs OUTSIDE transaction (for ID lookup only)
        const registrySnap = await db.collection("devices").doc(docId).get();
        if (!registrySnap.exists) throw new Error("Device not found before transaction");
        const { customer_id, zone_id, device_type } = registrySnap.data();
        const resolvedCollection = normalizeTypeToCollection(device_type);
        console.log(`[AdminController] deleteNode: device_type="${device_type}" → collection="${resolvedCollection}"`);

        // All possible metadata refs (we'll read all 3 to find the right one)
        const allMetaCollections = ["evaratank", "evaradeep", "evaraflow"];

        // 🎯 ATOMIC DELETION — ALL reads FIRST, then ALL writes
        await db.runTransaction(async (transaction) => {
            // ── PHASE 1: READ EVERYTHING ──────────────────────────────────
            const deviceRef = db.collection("devices").doc(docId);
            const metaRefs = allMetaCollections.map(col => db.collection(col).doc(docId));
            const customerRef = customer_id ? db.collection("customers").doc(customer_id) : null;
            const zoneRef = zone_id ? db.collection("zones").doc(zone_id) : null;

            // Parallel read of ALL documents we might need
            const refsToRead = [deviceRef, ...metaRefs];
            if (customerRef) refsToRead.push(customerRef);
            if (zoneRef) refsToRead.push(zoneRef);

            const snaps = await Promise.all(refsToRead.map(ref => transaction.get(ref)));

            const [deviceSnap, ...rest] = snaps;
            const metaSnaps = rest.slice(0, 3);  // evaratank, evaradeep, evaraflow
            const custSnap = customerRef ? rest[3] : null;
            const zoneSnap = zoneRef ? rest[customerRef ? 4 : 3] : null;

            if (!deviceSnap.exists) throw new Error("Device not found in transaction");

            // Find which metadata doc exists
            let metaRefToDelete = null;
            for (let i = 0; i < allMetaCollections.length; i++) {
                if (metaSnaps[i].exists) {
                    metaRefToDelete = metaRefs[i];
                    console.log(`[AdminController] deleteNode: Metadata found in "${allMetaCollections[i]}"`);
                    break;
                }
            }
            if (!metaRefToDelete) {
                console.warn(`[AdminController] deleteNode: No metadata doc found for ${docId} — deleting registry only`);
            }

            // ── PHASE 2: WRITE EVERYTHING ─────────────────────────────────
            if (custSnap && custSnap.exists) {
                transaction.update(customerRef, {
                    device_ids: FieldValue.arrayRemove(docId),
                    deviceCount: FieldValue.increment(-1),
                    updated_at: new Date()
                });
            }
            if (zoneSnap && zoneSnap.exists) {
                transaction.update(zoneRef, {
                    device_ids: FieldValue.arrayRemove(docId),
                    device_count: FieldValue.increment(-1),
                    updated_at: new Date()
                });
            }
            transaction.delete(deviceRef);
            if (metaRefToDelete) transaction.delete(metaRefToDelete);
        });

        // SaaS Cache Invalidation
        await Promise.all([
            cache.flushPrefix("nodes_"),
            cache.flushPrefix("user:"),
            cache.flushPrefix("dashboard_init_"),
            cache.flushPrefix("dashboard_summary_"),
            cache.flushPrefix("admin_hierarchy")
        ]);

        if (typeof telemetryCache !== 'undefined') {
            telemetryCache.del(`telemetry_${docId}`);
            telemetryCache.del(`status_${docId}`);
            telemetryCache.del(`analytics_${docId}`);
        }

        try { await cache.del("nodes:polling:list"); } catch (err) {}

        console.log(`[AdminController] deleteNode: Successfully deleted device ${docId} (hardware id: ${rawId})`);
        res.status(200).json({ success: true, message: "Device and relationships purged" });
    } catch (error) {
        console.error("[AdminController] deleteNode error:", error);
        res.status(500).json({ error: error.message || "Failed to delete device" });
    }
};

exports.getDashboardSummary = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Unauthorized: Missing user information" });
        }
        const isSuperAdmin = req.user.role === "superadmin";
        
        // Disable cache for real-time accuracy
        // const cacheKey = `user:${isSuperAdmin ? 'admin' : req.user.customer_id || req.user.uid}:summary`;
        // const cached = await cache.get(cacheKey);
        // if (cached) return res.status(200).json(cached);
        
        let nodesQuery = db.collection("devices");
        let customersQuery = db.collection("customers");
        let zonesQuery = db.collection("zones");
 
        if (!isSuperAdmin) {
            if (req.user.community_id && req.user.customer_id) {
                nodesQuery = nodesQuery.where(
                    Filter.where("customer_id", "==", req.user.customer_id)
                );
            } else {
                nodesQuery = nodesQuery.where("customer_id", "==", req.user.customer_id || req.user.uid);
            }
            // Search customers by id (uid) instead of email for precision
            customersQuery = customersQuery.where("id", "==", req.user.customer_id || req.user.uid); 
        }

        // Get actual device count directly from DB
        const devicesSnapshot = await nodesQuery.get();
        const actualNodeCount = devicesSnapshot.size;
        
        console.log(`[Dashboard] Real-time node count: ${actualNodeCount}`);

        const [customersSnap, zonesSnap] = await Promise.all([
            customersQuery.count().get(),
            zonesQuery.count().get()
        ]);

        const totalCustomers = customersSnap.data().count;

        // Calculate online nodes from actual devices
        const onlineNodes = devicesSnapshot.docs.filter(doc => {
            const device = doc.data();
            return device.status === 'ONLINE' || device.status === 'Online';
        }).length;

        const totalZones = zonesSnap.data().count;

        const result = {
            total_nodes: actualNodeCount,
            total_customers: totalCustomers,
            total_zones: totalZones,
            online_nodes: onlineNodes,
            alerts_active: 0,
            system_health: actualNodeCount > 0 ? 92 : 0
        };

        console.log(`[Dashboard] Returning stats:`, result);

        // Cache disabled for real-time accuracy
        // await cache.set(cacheKey, result, 180);
        res.status(200).json(result);
    } catch (error) {
        console.error("[Dashboard] Failed to get summary:", error.message);
        res.status(500).json({ error: "Failed to get dashboard summary", details: error.message });
    }
};

exports.getHierarchy = async (req, res) => {
    try {
        const cacheKey = "admin_hierarchy";
        const cached = await cache.get(cacheKey);
        if (cached) return res.status(200).json(cached);

        const [zonesSnap, customersSnap] = await Promise.all([
            db.collection("zones").get(),
            db.collection("customers").get()
        ]);

        const zones = zonesSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), customers: [] }));
        const customers = customersSnap.docs.map(doc => ({ 
            id: doc.id, 
            customerId: doc.id, // 🎯 NORMALIZE
            ...doc.data() 
        }));

        // Link customers directly to zones (skipping communities)
        const zoneMap = {};
        zones.forEach(z => zoneMap[z.id] = z);
        customers.forEach(cust => {
            if (cust.zone_id && zoneMap[cust.zone_id]) {
                zoneMap[cust.zone_id].customers.push(cust);
            } else if (cust.regionFilter && zoneMap[cust.regionFilter]) {
                // Support legacy field if present
                zoneMap[cust.regionFilter].customers.push(cust);
            }
        });

        await cache.set(cacheKey, zones, 600); // 10 min
        res.status(200).json(zones);
    } catch (error) {
        console.error("Hierarchy fetch error:", error);
        res.status(500).json({ error: "Failed to get hierarchy" });
    }
};

exports.getAuditLogs = async (req, res) => {
    try {
        res.status(200).json([]);
    } catch (error) {
        res.status(500).json({ error: "Failed to get audit logs" });
    }
};

/**
 * SaaS Architecture: Aggregate Init Endpoint
 * Combines Summary, Zones, and Nodes into ONE cached response.
 * Drastically reduces frontend network overhead.
 */
exports.getDashboardInit = async (req, res) => {
    try {
        const isSuperAdmin = req.user.role === "superadmin";
        const cacheKey = `dashboard_init_${isSuperAdmin ? 'admin' : req.user.customer_id || req.user.uid}`;
        const cached = await cache.get(cacheKey);
        if (cached) return res.status(200).json(cached);

        // Fetch everything in parallel
        const [zonesRes, nodesRes, summaryRes] = await Promise.all([
            new Promise(resolve => exports.getZones(req, { status: () => ({ json: resolve }) })),
            new Promise(resolve => exports.getNodes(req, { status: () => ({ json: resolve }) })),
            new Promise(resolve => exports.getDashboardSummary(req, { status: () => ({ json: resolve }) }))
        ]);

        const result = {
            summary: summaryRes,
            zones: zonesRes,
            nodes: nodesRes,
            timestamp: new Date().toISOString()
        };

        await cache.set(cacheKey, result, 180); // 3 min
        res.status(200).json(result);
    } catch (error) {
        console.error("[Init] Aggregate failure:", error.message);
        res.status(500).json({ error: "Aggregate fetch failed" });
    }
};

exports.getZoneStats = async (req, res) => {
    try {
        const zonesSnap = await db.collection("zones").get();
        const stats = zonesSnap.docs.map(doc => {
            const data = doc.data();
            return {
                zone_id: doc.id,
                region_name: data.zoneName || "Unnamed Zone",
                state: data.state || "",
                customer_count: data.customer_count || 0,
                device_count: data.device_count || 0,
                online_devices: data.device_count || 0, // Simplified for now
                offline_devices: 0
            };
        });
        res.status(200).json(stats);
    } catch (error) {
        console.error("[Stats] Failed to get zone stats:", error);
        res.status(500).json({ error: "Failed to get zone stats" });
    }
};
