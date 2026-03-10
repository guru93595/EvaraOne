const axios = require("axios");
const { db } = require("../config/firebase.js");
const cacheService = require("../services/cacheService.js"); 
const cache = require("../config/cache.js");

// SaaS Architecture: Redis Pub/Sub Support
const pubSub = cache.getPubSub();
const pub = pubSub ? pubSub.pub : null;

// Local fallback for dev/single-instance
const EventEmitter = require('events');
const telemetryEvents = new EventEmitter();
telemetryEvents.setMaxListeners(0);

const POLL_INTERVAL = process.env.TELEMETRY_POLL_INTERVAL || 5000; // Default 5 seconds
const BATCH_SIZE = 5; // How many concurrent requests to ThingSpeak to avoid ban

async function getActiveDevices() {
    try {
        // SaaS Architecture: Security & Performance
        // 1. Check Cache first (invalidated automatically on admin updates via prefix 'nodes_')
        const cachedList = await cache.get("nodes:polling:list");
        if (cachedList) return cachedList;

        console.log("[TelemetryWorker] Cache miss: Loading active device list from Firestore...");
        
        const snapshot = await db.collection("devices").get();
        const typedGroups = {};
        const registryDataMap = {};

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const type = data.device_type;
            if (!type) continue;
            
            if (!typedGroups[type]) typedGroups[type] = [];
            typedGroups[type].push(doc.id);
            registryDataMap[doc.id] = data;
        }

        const devices = [];
        const typeBatches = await Promise.all(
            Object.keys(typedGroups).map(async (type) => {
                const ids = typedGroups[type];
                const refs = ids.map(id => db.collection(type).doc(id));
                const metas = await db.getAll(...refs);
                return metas.map(m => m.exists ? { id: m.id, meta: m.data() } : null).filter(Boolean);
            })
        );

        for (const batch of typeBatches) {
            for (const item of batch) {
                const { id, meta } = item;
                if (meta.thingspeak_channel_id && meta.thingspeak_read_api_key) {
                    devices.push({
                        id: id,
                        type: registryDataMap[id].device_type,
                        channel: meta.thingspeak_channel_id.trim(),
                        key: meta.thingspeak_read_api_key.trim(),
                        mapping: meta.sensor_field_mapping || {},
                        depth: meta.configuration?.depth || meta.configuration?.total_depth || meta.tank_size || 1.2,
                        capacity: meta.tank_size || 0,
                        last_seen: meta.last_seen
                    });
                }
            }
        }
        
        // Store in cache for 1 hour (auto-busted on update via prefix 'nodes_')
        await cache.set("nodes:polling:list", devices, 3600);
        return devices;
    } catch (err) {
        console.error("[TelemetryWorker] Error fetching devices:", err.message);
        return [];
    }
}

async function processDevice(device) {
    try {
        const url = `https://api.thingspeak.com/channels/${device.channel}/feeds.json?api_key=${device.key}&results=1`;
        const res = await axios.get(url, { timeout: 3000 });
        const latestFeed = res.data.feeds?.[0];

        if (!latestFeed) return;

        // Compare timestamps to see if it's NEW data
        const cacheKey = `status_${device.id}`;
        const cachedLastSeen = cacheService.get(cacheKey);
        
        const lastKnownTime = cachedLastSeen || device.last_seen || 0;
        const newTime = latestFeed.created_at;

        // Skip if we already broadcasted this exact timestamp recently
        if (new Date(newTime).getTime() <= new Date(lastKnownTime).getTime()) {
            return;
        }

        // --- Process Payload ---
        const fieldKey = Object.keys(device.mapping).find(k => device.mapping[k].includes("water_level")) || 
                         (latestFeed.field1 !== undefined ? "field1" : "field2");
        
        const distance = parseFloat(latestFeed[fieldKey]) || 0;
        const validDistance = Math.min(distance / 100, device.depth); 
        const waterHeight = Math.max(0, device.depth - validDistance); 
        const levelPercent = Math.min(100, (waterHeight / device.depth) * 100);
        const volume = (device.capacity * levelPercent) / 100;

        const payload = {
            device_id: device.id,
            timestamp: newTime,
            distance,
            level_percentage: levelPercent,
            volume,
            raw_data: latestFeed
        };

        // Update local cache
        cacheService.set(cacheKey, newTime, 300);

        // SYNC to Firebase (SaaS Architecture: Throttled Writes to save cost)
        const lastSyncKey = `last_sync_${device.id}`;
        const lastSync = cacheService.get(lastSyncKey);
        const shouldSync = !lastSync || (new Date() - new Date(lastSync) > 10 * 60 * 1000); 

        if (shouldSync) {
            db.collection(device.type).doc(device.id).update({
                last_seen: newTime,
                last_telemetry_fetch: new Date().toISOString()
            }).then(() => {
                cacheService.set(lastSyncKey, new Date().toISOString(), 3600);
            }).catch(e => console.error("Worker Sync Error:", e.message));
        }

        // BROADCAST to Socket.io via Redis Pub/Sub (SaaS Architecture: Distributed Scaling)
        if (pub) {
            pub.publish(`telemetry:${device.id}`, JSON.stringify(payload));
        } else {
            // Local fallback for dev/single-instance — matches server.js listener
            telemetryEvents.emit("telemetry_broadcast", payload);
        }

    } catch (err) {
        // Silently skip if ThingSpeak blocks us
    }
}

async function runPoll() {
    const devices = await getActiveDevices();
    if (devices.length === 0) return;

    // Process in batches so we don't accidentally Ddos Thingspeak
    for (let i = 0; i < devices.length; i += BATCH_SIZE) {
        const batch = devices.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(d => processDevice(d)));
        // Tiny 50ms sleep between batches
        await new Promise(resolve => setTimeout(resolve, 50));
    }
}

// Start the worker
function startWorker() {
    console.log(`[TelemetryWorker] Initialized polling every ${POLL_INTERVAL}ms...`);
    // Run immediately once
    runPoll();
    // Then loop
    setInterval(runPoll, POLL_INTERVAL);
}

// Standalone execution support (for Render Background Worker)
if (require.main === module) {
    startWorker();
}

module.exports = { startWorker, telemetryEvents };
