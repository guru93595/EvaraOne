const { db } = require("../config/firebase.js");
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
        const customer = { ...req.body, created_at: new Date() };
        const doc = await db.collection("customers").add(customer);
        await cache.flushPrefix("customers_");
        await cache.flushPrefix("admin_hierarchy");
        await cache.flushPrefix("dashboard_summary_");
        res.status(201).json({ success: true, id: doc.id });
    } catch (error) {
        console.error("Failed to create customer", error);
        res.status(500).json({ error: "Failed to create customer" });
    }
};

exports.getCustomers = async (req, res) => {
    try {
        const cacheKey = req.user.role === "superadmin" ? "user:admin:customers" : `user:${req.user.uid}:customers`;
        const cached = await cache.get(cacheKey);
        if (cached) return res.status(200).json(cached);

        const limitStr = parseInt(req.query.limit) || 50;
        let query = db.collection("customers");
        
        if (req.user.role !== "superadmin") {
            query = query.where("id", "==", req.user.customer_id || req.user.uid);
        } else if (req.query.community_id) {
            query = query.where("community_id", "==", req.query.community_id);
        } else {
            query = query.orderBy("created_at");
        }
        
        query = query.limit(limitStr);

        if (req.query.cursor) {
            const cursorDoc = await db.collection("customers").doc(req.query.cursor).get();
            if(cursorDoc.exists) {
                query = query.startAfter(cursorDoc);
            }
        }

        const snapshot = await query.get();
        const customers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        await cache.set(cacheKey, customers, 600); // 10 min
        res.status(200).json(customers);
    } catch (error) {
        console.error("Failed to get customers", error);
        res.status(500).json({ error: "Failed to get customers" });
    }
};

exports.getCustomerById = async (req, res) => {
    try {
        const doc = await db.collection("customers").doc(req.params.id).get();
        if (!doc.exists) return res.status(404).json({ error: "Customer not found" });
        res.status(200).json({ id: doc.id, ...doc.data() });
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

// Communities
exports.createCommunity = async (req, res) => {
    try {
        const community = { ...req.body, created_at: new Date() };
        const doc = await db.collection("communities").add(community);
        await cache.flushPrefix("communities_");
        await cache.flushPrefix("admin_hierarchy");
        await cache.flushPrefix("dashboard_summary_");
        res.status(201).json({ success: true, id: doc.id, message: "Community created successfully" });
    } catch (error) {
        console.error("Failed to create community", error);
        res.status(500).json({ error: "Failed to create community", details: error.message });
    }
};

exports.getCommunities = async (req, res) => {
    try {
        const cacheKey = `communities_${req.query.zone_id || req.query.region_id || 'all'}`;
        const cached = await cache.get(cacheKey);
        if (cached) return res.status(200).json(cached);

        const limitStr = parseInt(req.query.limit) || 50;
        let query = db.collection("communities");
        
        const zoneFilterId = req.query.zone_id || req.query.region_id;

        if (zoneFilterId) {
            query = query.where("zone_id", "==", zoneFilterId);
        } else if (req.user.role !== "superadmin") {
        } else {
            query = query.orderBy("created_at");
        }
        
        query = query.limit(limitStr);

        if (req.query.cursor) {
            const cursorDoc = await db.collection("communities").doc(req.query.cursor).get();
            if(cursorDoc.exists) {
                query = query.startAfter(cursorDoc);
            }
        }

        const snapshot = await query.get();
        const communities = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        await cache.set(cacheKey, communities, 600); // 10 min
        res.status(200).json(communities);
    } catch (error) {
        console.error("Failed to get communities", error);
        res.status(500).json({ error: "Failed to get communities" });
    }
};

exports.getCommunityById = async (req, res) => {
    try {
        const doc = await db.collection("communities").doc(req.params.id).get();
        if (!doc.exists) return res.status(404).json({ error: "Community not found" });
        res.status(200).json({ id: doc.id, ...doc.data() });
    } catch (error) {
        res.status(500).json({ error: "Failed to get community" });
    }
};

exports.updateCommunity = async (req, res) => {
    try {
        await db.collection("communities").doc(req.params.id).update(req.body);
        await cache.flushPrefix("communities_");
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to update community" });
    }
};

exports.deleteCommunity = async (req, res) => {
    try {
        await db.collection("communities").doc(req.params.id).delete();
        await cache.flushPrefix("communities_");
        await cache.flushPrefix("dashboard_summary_");
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete community" });
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
            communityId,
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
            id: fallbackId
        } = req.body;

        const timestamp = new Date();
        const idForDevice = hardwareId || `DEV-${Date.now()}`;
        const typeNormalized = (assetType || "evaratank").toLowerCase();
        
        // 1. Registry entry (Minimal + Ownership for efficient filtering)
        const registryData = {
            device_id: idForDevice,
            device_type: typeNormalized,
            node_id: idForDevice,
            customer_id: customerId || "",
            community_id: communityId || ""
        };

        const deviceRef = await db.collection("devices").add(registryData);
        const deviceDocId = deviceRef.id;

        // 2. Metadata entry (Detailed)
        let metadata = {
            device_id: idForDevice,
            node_id: idForDevice,
            label: displayName || deviceName || "Unnamed",
            device_name: deviceName || displayName || "Unknown Device",
            thingspeak_read_api_key: thingspeakReadKey || "",
            thingspeak_channel_id: thingspeakChannelId || "",
            customer_id: customerId || "",
            community_id: communityId || "",
            zone_id: zoneId || "",
            latitude: parseFloat(latitude) || null,
            longitude: parseFloat(longitude) || null,
            created_at: timestamp,
            updated_at: timestamp
        };

        let targetCol = "";
        if (typeNormalized === "evaratank" || typeNormalized === "tank" || assetType === "EvaraTank") {
            targetCol = "evaratank";
            metadata.tank_size = capacity || 0;
            metadata.configuration = {
                tank_length: tankLength || 0,
                tank_breadth: tankBreadth || 0,
                depth: depth || 0
            };
            const field = waterLevelField || "field2";
            metadata.sensor_field_mapping = { [field]: "water_level_raw_sensor_reading" };
        } else if (typeNormalized === "evaradeep" || typeNormalized === "deep" || assetType === "EvaraDeep") {
            targetCol = "evaradeep";
            metadata.configuration = {
                total_depth: depth || 0,
                static_water_level: staticDepth || 0,
                dynamic_water_level: dynamicDepth || 0,
                recharge_threshold: rechargeThreshold || 0
            };
            const field = borewellDepthField || "field2";
            metadata.sensor_field_mapping = { [field]: "water_level_in_cm" };
        } else if (typeNormalized === "evaraflow" || typeNormalized === "flow" || assetType === "EvaraFlow") {
            targetCol = "evaraflow";
            metadata.configuration = {}; // No physical dimensions needed
            const rateField = flowRateField || "field2";
            const readingField = meterReadingField || "field1";
            metadata.sensor_field_mapping = { 
                [rateField]: "flow_rate", 
                [readingField]: "current_reading" 
            };
        }

        if (targetCol) {
            await db.collection(targetCol).doc(deviceDocId).set(metadata);
        }

        // SaaS Invalidation: Flush all user-specific and aggregate dashboard caches
        await Promise.all([
            cache.flushPrefix("nodes_"),
            cache.flushPrefix("user:"),
            cache.flushPrefix("dashboard_init_"),
            cache.flushPrefix("dashboard_summary_")
        ]);

        res.status(201).json({ 
            success: true, 
            id: deviceDocId, 
            message: "Device registered and metadata stored" 
        });
    } catch (error) {
        console.error("Failed to create device:", error);
        res.status(500).json({ error: "Failed to create device" });
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
            if (req.user.community_id && req.user.customer_id) {
                query = query.where(
                    Filter.or(
                        Filter.where("customer_id", "==", req.user.customer_id),
                        Filter.where("community_id", "==", req.user.community_id)
                    )
                );
            } else {
                query = query.where("customer_id", "==", req.user.customer_id || req.user.uid);
            }
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
                // Filter by customer if not superadmin (Allow direct ownership OR community-based access)
                const isOwner = meta.customer_id === req.user.uid || (req.user.community_id && meta.community_id === req.user.community_id);
                if (req.user.role !== "superadmin" && !isOwner) continue;

                const { thingspeak_read_api_key, ...safeMeta } = meta;
                devices.push({ 
                    id, 
                    ...registryDataMap[id], 
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
        
        // General fields
        if (body.displayName || body.label) metaUpdate.label = trimmed(body.displayName || body.label);
        if (body.deviceName || body.device_name) metaUpdate.device_name = trimmed(body.deviceName || body.device_name);
        
        // ThingSpeak credentials (flexible naming)
        const readKey = body.thingspeakReadKey || body.thingspeak_read_key || body.thingspeak_read_api_key;
        if (readKey) metaUpdate.thingspeak_read_api_key = trimmed(readKey);
        
        const channelId = body.thingspeakChannelId || body.thingspeak_channel_id;
        if (channelId) metaUpdate.thingspeak_channel_id = trimmed(channelId);
        
        if (body.customerId || body.customer_id) {
            const cid = trimmed(body.customerId || body.customer_id);
            metaUpdate.customer_id = cid;
            // Also sync to registry
            await db.collection("devices").doc(deviceDoc.id).update({ customer_id: cid });
        }

        if (body.communityId || body.community_id) {
            const commId = trimmed(body.communityId || body.community_id);
            metaUpdate.community_id = commId;
            // Also sync to registry
            await db.collection("devices").doc(deviceDoc.id).update({ community_id: commId });
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

        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to update metadata" });
    }
};

exports.deleteNode = async (req, res) => {
    try {
        const deviceDoc = await db.collection("devices").doc(req.params.id).get();
        if (!deviceDoc.exists) return res.status(404).json({ error: "Device not found" });
        
        const type = (deviceDoc.data().device_type || "").toLowerCase();
        const batch = db.batch();
        batch.delete(db.collection("devices").doc(req.params.id));
        if (type) {
            batch.delete(db.collection(type).doc(req.params.id));
        }

        await batch.commit();

        // SaaS Invalidation
        await Promise.all([
            cache.flushPrefix("nodes_"),
            cache.flushPrefix("user:"),
            cache.flushPrefix("dashboard_init_"),
            cache.flushPrefix("dashboard_summary_")
        ]);
        if (typeof telemetryCache !== 'undefined') {
             telemetryCache.del(`telemetry_${req.params.id}`); 
             telemetryCache.del(`status_${req.params.id}`);
        }

        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete device" });
    }
};

exports.getDashboardSummary = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Unauthorized: Missing user information" });
        }
        const isSuperAdmin = req.user.role === "superadmin";
        const cacheKey = `user:${isSuperAdmin ? 'admin' : req.user.customer_id || req.user.uid}:summary`;
        const cached = await cache.get(cacheKey);
        if (cached) return res.status(200).json(cached);
        
        let nodesQuery = db.collection("devices");
        let customersQuery = db.collection("customers");
        let communitiesQuery = db.collection("communities");
        let zonesQuery = db.collection("zones");
 
        if (!isSuperAdmin) {
            if (req.user.community_id && req.user.customer_id) {
                nodesQuery = nodesQuery.where(
                    Filter.or(
                        Filter.where("customer_id", "==", req.user.customer_id),
                        Filter.where("community_id", "==", req.user.community_id)
                    )
                );
            } else {
                nodesQuery = nodesQuery.where("customer_id", "==", req.user.customer_id || req.user.uid);
            }
            // Search customers by id (uid) instead of email for precision
            customersQuery = customersQuery.where("id", "==", req.user.customer_id || req.user.uid); 
        }

        const [nodesSnap, customersSnap, communitiesSnap, zonesSnap] = await Promise.all([
            nodesQuery.count().get(),
            customersQuery.count().get(),
            communitiesQuery.count().get(),
            zonesQuery.count().get()
        ]);

        const totalNodes = nodesSnap.data().count;
        const totalCustomers = customersSnap.data().count;

        const result = {
            total_nodes: totalNodes,
            total_communities: isSuperAdmin ? communitiesSnap.data().count : 1,
            total_customers: totalCustomers,
            total_zones: isSuperAdmin ? zonesSnap.data().count : 1,
            online_nodes: totalNodes,
            alerts_active: 0,
            system_health: 100
        };

        await cache.set(cacheKey, result, 180); // 3 min
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

        const [zonesSnap, communitiesSnap, customersSnap] = await Promise.all([
            db.collection("zones").get(),
            db.collection("communities").get(),
            db.collection("customers").get()
        ]);

        const zones = zonesSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), communities: [] }));
        const communities = communitiesSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), customers: [] }));
        const customers = customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Map customers to communities
        const communityMap = {};
        communities.forEach(c => communityMap[c.id] = c);
        customers.forEach(cust => {
            if (cust.community_id && communityMap[cust.community_id]) {
                communityMap[cust.community_id].customers.push(cust);
            }
        });

        // Map communities to zones
        const zoneMap = {};
        zones.forEach(z => zoneMap[z.id] = z);
        communities.forEach(c => {
            if (c.zone_id && zoneMap[c.zone_id]) {
                zoneMap[c.zone_id].communities.push(c);
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
