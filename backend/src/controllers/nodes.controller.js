const { db, admin } = require("../config/firebase.js");
const { Filter } = require("firebase-admin/firestore");
const { startWorker } = require("../workers/telemetryWorker.js");
const { checkOwnership } = require("../middleware/auth.middleware.js");
const axios = require("axios");
const telemetryCache = require("../services/cacheService.js");
const cache = require("../config/cache.js");

/**
 * Helper to resolve device by document ID OR device_id/node_id
 */
async function resolveDevice(id) {
    if (!id) return null;

    // 1. Try direct document lookup
    const directDoc = await db.collection("devices").doc(id).get();
    if (directDoc.exists) return directDoc;

    // 2. Query by device_id field (human-readable hardware ID)
    const q1 = await db.collection("devices").where("device_id", "==", id).limit(1).get();
    if (!q1.empty) return q1.docs[0];

    // 3. Fallback to node_id
    const q2 = await db.collection("devices").where("node_id", "==", id).limit(1).get();
    if (!q2.empty) return q2.docs[0];

    return null;
}

/**
 * Persist ThingSpeak timestamp back to Firestore to keep Dashboard/Map synchronized
 */
async function syncNodeStatus(id, type, lastSeen) {
    if (!lastSeen) return;
    try {
        await db.collection(type).doc(id).update({
            last_seen: lastSeen,
            last_online_at: admin.firestore.FieldValue.serverTimestamp(),
            last_telemetry_fetch: new Date().toISOString()
        });
    } catch (err) {
        console.error(`Status sync failed for ${id}:`, err);
    }
}

exports.getNodes = async (req, res) => {
    try {
        // Cache the full result per user (user:{id}:devices)
        const nodesCacheKey = req.user.role === "superadmin"
            ? "user:admin:devices"
            : `user:${req.user.uid}:devices`;

        const cachedNodes = await cache.get(nodesCacheKey);
        if (cachedNodes) {
            return res.status(200).json(cachedNodes);
        }

        // Cache zones and communities maps (15 min TTL)
        let zoneMap = await cache.get("zone_map");
        if (!zoneMap) {
            const zonesSnap = await db.collection("zones").get();
            zoneMap = Object.fromEntries(zonesSnap.docs.map(doc => [doc.id, doc.data().zoneName || doc.data().name]));
            await cache.set("zone_map", zoneMap, 900);
        }

        let communityMap = await cache.get("community_map");
        if (!communityMap) {
            const communitiesSnap = await db.collection("communities").get();
            communityMap = Object.fromEntries(communitiesSnap.docs.map(doc => [doc.id, doc.data().name || doc.data().communityName]));
            await cache.set("community_map", communityMap, 900);
        }

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
                query = query.where("customer_id", "==", req.user.customer_id);
            }
        }

        const snapshot = await query.get();

        // Batched Metadata Fetching
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

        const nodes = [];
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
                const { id, meta, type } = item;
                // Filter by customer if not superadmin (Allow direct ownership OR community-based access)
                const isOwner = meta.customer_id === req.user.customer_id || (req.user.community_id && meta.community_id === req.user.community_id);
                if (req.user.role !== "superadmin" && !isOwner) continue;

                let lastSeen = meta.last_seen;
                const statusCacheKey = `device:${id}:status`;
                const cachedLastSeen = telemetryCache.get(statusCacheKey);

                if (cachedLastSeen) {
                    lastSeen = cachedLastSeen;
                } else if (!lastSeen || (new Date() - new Date(meta.last_telemetry_fetch || 0) > 15 * 60 * 1000)) {
                    const channelId = meta.thingspeak_channel_id?.trim();
                    const apiKey = meta.thingspeak_read_api_key?.trim();
                    if (channelId && apiKey) {
                        try {
                            const tsUrl = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&results=1`;
                            const tsRes = await axios.get(tsUrl, { timeout: 3000 });
                            const feed = tsRes.data.feeds?.[0];
                            if (feed) {
                                lastSeen = feed.created_at;
                                telemetryCache.set(statusCacheKey, lastSeen, 300);
                                syncNodeStatus(id, type, lastSeen);
                            }
                        } catch (err) { }
                    }
                }

                // Strip sensitive keys
                const { thingspeak_read_api_key, ...safeMeta } = meta;

                nodes.push({
                    id,
                    ...registryDataMap[id],
                    ...safeMeta,
                    last_seen: lastSeen,
                    last_online_at: meta.last_online_at || lastSeen,
                    zone_name: zoneMap[meta.zone_id] || null,
                    community_name: communityMap[meta.community_id] || null
                });
            }
        }

        // Cache the result for 3 minutes
        await cache.set(nodesCacheKey, nodes, 180);
        res.status(200).json(nodes);
    } catch (error) {
        console.error(`[NodesController] Error in getNodes:`, error);
        res.status(500).json({ error: "Failed to fetch nodes", details: error.message });
    }
};


exports.getNodeById = async (req, res) => {
    try {
        const doc = await resolveDevice(req.params.id);
        if (!doc || !doc.exists) return res.status(404).json({ error: "Node not found" });

        const registry = doc.data();
        const metaDoc = await db.collection(registry.device_type.toLowerCase()).doc(doc.id).get();
        if (!metaDoc.exists) return res.status(404).json({ error: "Metadata missing" });

        if (req.user.role !== "superadmin") {
            const isOwner = await checkOwnership(req.user.customer_id || req.user.uid, doc.id, req.user.role, req.user.community_id);
            if (!isOwner) return res.status(403).json({ error: "Unauthorized access" });
        }

        const { thingspeak_read_api_key, ...safeMeta } = metaDoc.data();
        const result = { id: doc.id, ...registry, ...safeMeta };
        await cache.set(`device:${doc.id}:metadata`, result, 3600);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch node" });
    }
};

exports.getNodeTelemetry = async (req, res) => {
    try {
        const deviceDoc = await resolveDevice(req.params.id);
        if (!deviceDoc || !deviceDoc.exists) return res.status(404).json({ error: "Device not found" });

        const type = (deviceDoc.data().device_type || "").toLowerCase();
        if (!type) return res.status(400).json({ error: "Device type not specified" });

        const metaDoc = await db.collection(type).doc(deviceDoc.id).get();
        if (!metaDoc.exists) return res.status(404).json({ error: "Metadata not found" });

        if (req.user.role !== "superadmin") {
            const isOwner = await checkOwnership(req.user.customer_id || req.user.uid, deviceDoc.id, req.user.role, req.user.community_id);
            if (!isOwner) return res.status(403).json({ error: "Unauthorized access" });
        }

        const metadata = metaDoc.data();
        const channelId = metadata.thingspeak_channel_id?.trim();
        const apiKey = metadata.thingspeak_read_api_key?.trim();
        const fieldMapping = metadata.sensor_field_mapping || {};
        const depth = metadata.configuration?.depth || metadata.configuration?.total_depth || metadata.tank_size || 1.2;
        const capacity = metadata.tank_size || 0;

        if (!channelId || !apiKey) return res.status(400).json({ error: "Telemetry configuration missing" });

        const cacheKey = `device:${req.params.id}:telemetry`;
        const cachedData = telemetryCache.get(cacheKey);
        if (cachedData) return res.status(200).json(cachedData);

        const url = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&results=1`;
        const response = await axios.get(url);
        const lastFeed = response.data.feeds?.[0];

        if (!lastFeed) return res.status(200).json({ distance: 0, level_percentage: 0, last_seen: new Date() });

        // Resolve field with prioritized fallback: mapping -> field1 (common for tanks) -> field2 (legacy)
        const fieldKey = Object.keys(fieldMapping).find(k => fieldMapping[k].includes("water_level")) ||
            (lastFeed.field1 !== undefined ? "field1" : "field2");

        const distance = parseFloat(lastFeed[fieldKey]) || 0;

        const validDistance = Math.min(distance / 100, depth);
        const waterHeight = Math.max(0, depth - validDistance);
        const levelPercent = Math.min(100, (waterHeight / depth) * 100);
        const volume = (capacity * levelPercent) / 100;

        const result = {
            distance,
            level_percentage: levelPercent,
            volume,
            last_seen: lastFeed.created_at,
            raw_data: lastFeed
        };

        // Fire-and-forget sync to Firestore
        syncNodeStatus(deviceDoc.id, type, lastFeed.created_at).catch(e => console.error("Background sync error:", e));

        telemetryCache.set(cacheKey, result);
        res.status(200).json(result);
    } catch (error) {
        console.error("Telemetry error:", error);
        res.status(500).json({ error: "Telemetry fetch failure" });
    }
};

exports.getNodeAnalytics = async (req, res) => {
    try {
        const deviceDoc = await resolveDevice(req.params.id);
        if (!deviceDoc || !deviceDoc.exists) return res.status(404).json({ error: "Device not found" });

        const type = (deviceDoc.data().device_type || "").toLowerCase();
        if (!type) return res.status(400).json({ error: "Device type not specified" });

        const metaDoc = await db.collection(type).doc(deviceDoc.id).get();
        if (!metaDoc.exists) return res.status(404).json({ error: "Metadata not found" });

        const isOwner = await checkOwnership(req.user.customer_id || req.user.uid, deviceDoc.id, req.user.role, req.user.community_id);
        if (!isOwner) return res.status(403).json({ error: "Unauthorized" });

        const metadata = metaDoc.data();
        const channelId = metadata.thingspeak_channel_id?.trim();
        const apiKey = metadata.thingspeak_read_api_key?.trim();
        const fieldMapping = metadata.sensor_field_mapping || {};
        const depth = metadata.configuration?.depth || metadata.configuration?.total_depth || metadata.tank_size || 1.2;
        const capacity = metadata.tank_size || 0;

        if (!channelId || !apiKey) return res.status(400).json({ error: "Telemetry configuration missing" });

        // Fetch enough results to cover at least 3 days for trend analysis
        const url = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&results=1000`;
        const response = await axios.get(url);
        const feeds = response.data.feeds || [];

        const sampleFeed = feeds[0] || {};
        const fieldKey = Object.keys(fieldMapping).find(k => fieldMapping[k].includes("water_level")) ||
            (sampleFeed.field1 !== undefined ? "field1" : "field2");

        const history = feeds.map(feed => {
            const distance = parseFloat(feed[fieldKey]);
            if (isNaN(distance)) return null;

            const validDistance = Math.min(distance / 100, depth);
            const waterHeight = Math.max(0, depth - validDistance);
            const levelPercent = Math.min(100, (waterHeight / depth) * 100);
            const volume = (capacity * levelPercent) / 100;

            return {
                timestamp: feed.created_at,
                level: levelPercent,
                volume
            };
        }).filter(Boolean);

        // --- Tank Behavior Analytics Implementation ---
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfYesterday = new Date(startOfToday);
        startOfYesterday.setDate(startOfYesterday.getDate() - 1);
        const startOf2DaysAgo = new Date(startOfYesterday);
        startOf2DaysAgo.setDate(startOf2DaysAgo.getDate() - 1);

        const todayReadings = history.filter(h => new Date(h.timestamp) >= startOfToday);
        const yesterdayReadings = history.filter(h => new Date(h.timestamp) >= startOfYesterday && new Date(h.timestamp) < startOfToday);
        const prevReadings = history.filter(h => new Date(h.timestamp) >= startOf2DaysAgo && new Date(h.timestamp) < startOfYesterday);

        // 1. Refill Cycle Detection
        let refillsToday = 0;
        let lastRefillTime = "--";
        let totalRefillDuration = 0;
        let refillCount = 0;
        let activeRefillStart = null;
        let refillTimeline = []; // For visualization
        const REFILL_THRESHOLD = capacity * 0.02; // 2% increase to trigger detection

        for (let i = 1; i < history.length; i++) {
            const prev = history[i - 1];
            const curr = history[i];
            const volChange = curr.volume - prev.volume;
            const isToday = new Date(curr.timestamp) >= startOfToday;

            if (volChange > REFILL_THRESHOLD && !activeRefillStart) {
                activeRefillStart = new Date(curr.timestamp);
            } else if (volChange <= 0 && activeRefillStart) {
                const end = new Date(curr.timestamp);
                const duration = (end - activeRefillStart) / 60000;
                if (duration > 1) { // Min 1 minute to count
                    refillCount++;
                    totalRefillDuration += duration;
                    if (isToday) {
                        refillsToday++;
                        const d = activeRefillStart;
                        lastRefillTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                    }
                }
                activeRefillStart = null;
            }
            
            // Refill Timeline (normalized for UI)
            if (isToday && i % 20 === 0) { // Sample points for visualization
                 refillTimeline.push(volChange > REFILL_THRESHOLD ? 1 : 0);
            }
        }

        // 2. Consumption Analytics
        const calculateConsumption = (readings) => {
            if (readings.length < 2) return 0;
            let total = 0;
            for (let i = 1; i < readings.length; i++) {
                const diff = readings[i - 1].volume - readings[i].volume;
                if (diff > 0) total += diff;
            }
            return total;
        };

        const todayConsumption = calculateConsumption(todayReadings);
        const yesterdayConsumption = calculateConsumption(yesterdayReadings);
        const prevConsumption = calculateConsumption(prevReadings);
        const avgDailyConsumption = (todayConsumption + yesterdayConsumption + prevConsumption) / ( (todayConsumption?1:0) + (yesterdayConsumption?1:0) + (prevConsumption?1:0) || 1);

        // 3. Peak Usage
        let peakDrainRate = 0;
        let peakTime = "--";
        for (let i = 1; i < todayReadings.length; i++) {
            const prev = todayReadings[i - 1];
            const curr = todayReadings[i];
            const volDrop = prev.volume - curr.volume;
            const timeDiff = (new Date(curr.timestamp) - new Date(prev.timestamp)) / 60000;
            
            if (volDrop > 0 && timeDiff > 0) {
                const rate = volDrop / timeDiff;
                if (rate > peakDrainRate) {
                    peakDrainRate = rate;
                    const d = new Date(curr.timestamp);
                    peakTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
                }
            }
        }

        if (feeds.length > 0) {
            const latestFeed = feeds[feeds.length - 1];
            syncNodeStatus(deviceDoc.id, type, latestFeed.created_at).catch(e => console.error("Background sync error:", e));
        }

        res.status(200).json({ 
            node_id: req.params.id, 
            history,
            tankBehavior: {
                refillAnalytics: {
                    refillsToday,
                    lastRefillTime,
                    averageRefillDuration: refillCount > 0 ? Math.round(totalRefillDuration / refillCount) : 0,
                    refillTimeline: refillTimeline.slice(-10) // Map to 10 points for the UI bar
                },
                consumptionAnalytics: {
                    todayConsumption: Math.round(todayConsumption),
                    yesterdayConsumption: Math.round(yesterdayConsumption),
                    averageDailyConsumption: Math.round(avgDailyConsumption)
                },
                peakUsage: {
                    peakTime,
                    peakDrainRate: Math.round(peakDrainRate)
                }
            }
        });
    } catch (error) {
        console.error("Analytics error:", error);
        res.status(500).json({ error: "Analytics fetch failure" });
    }
};
