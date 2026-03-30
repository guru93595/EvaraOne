const { db } = require("../config/firebase.js");
const deviceState = require("../services/deviceStateService.js");

/**
 * deviceStatusCron.js
 * 
 * CRITICAL COMPONENT: Runs every 1 minute to recalculate ALL device statuses
 * This ensures status accuracy even when no new data arrives
 * 
 * Architecture:
 * - Independent from telemetry polling
 * - Sweeps all devices in database
 * - Updates status based on timestamp freshness
 * - Uses centralized deviceState.calculateDeviceStatus()
 */

const STATUS_CHECK_INTERVAL = 60 * 1000; // 1 minute

async function recalculateAllDevicesStatus() {
  try {
    console.log('[DeviceStatusCron] Starting status recalculation sweep...');
    
    const devicesSnapshot = await db.collection("devices").get();
    const now = new Date();
    const updates = [];
    let statusChanges = 0;

    // Group by device_type to fetch metadata efficiently
    const typedGroups = {};
    for (const doc of devicesSnapshot.docs) {
        const data = doc.data();
        const type = data.device_type;
        if (type) {
            if (!typedGroups[type]) typedGroups[type] = [];
            typedGroups[type].push(doc.id);
        }
    }

    const typeBatches = await Promise.all(
        Object.keys(typedGroups).map(async (type) => {
            const ids = typedGroups[type];
            const refs = ids.map(id => db.collection(type.toLowerCase()).doc(id));
            const metas = await db.getAll(...refs);
            return metas.map(m => m.exists ? { id: m.id, type, meta: m.data() } : null).filter(Boolean);
        })
    );

    for (const batch of typeBatches) {
      for (const item of batch) {
        const { id: deviceId, type, meta } = item;
        
        // Get last update timestamp from metadata collection
        const lastUpdatedAt = 
          meta.telemetry_snapshot?.timestamp ||
          meta.lastUpdatedAt || 
          meta.last_updated_at || 
          meta.last_seen ||
          meta.lastTelemetryFetch;
        
        const currentStatus = meta.status || "OFFLINE";

        if (!lastUpdatedAt) {
          // No timestamp at all - mark as OFFLINE
          if (currentStatus !== 'OFFLINE') {
            updates.push(
              db.collection(type.toLowerCase()).doc(deviceId).update({
                status: 'OFFLINE'
              })
            );
            statusChanges++;
          }
          continue;
        }
        
        // Use centralized status calculation
        const desiredStatus = deviceState.calculateDeviceStatus(lastUpdatedAt);
        
        // Only update if status changed (reduce DB writes)
        if (currentStatus !== desiredStatus) {
          updates.push(
            db.collection(type.toLowerCase()).doc(deviceId).update({
              status: desiredStatus,
              statusLastChecked: now.toISOString()
            })
          );
          statusChanges++;
        
          console.log(
            `[DeviceStatusCron] ${deviceId}: ${currentStatus} → ${desiredStatus}`
          );
        }
      }
    }
    
    if (updates.length > 0) {
      await Promise.all(updates);
      console.log(
        `[DeviceStatusCron] Complete: ${statusChanges} status changes out of ${devicesSnapshot.size} devices`
      );
    } else {
      console.log('[DeviceStatusCron] Complete: No status changes needed');
    }
    
  } catch (err) {
    console.error("[DeviceStatusCron] Critical error:", err.message);
    throw err;
  }
}

/**
 * Start the cron job
 * Can be run as part of telemetryWorker or standalone
 */
function startStatusCron() {
  console.log(`[DeviceStatusCron] Initialized - running every ${STATUS_CHECK_INTERVAL}ms`);
  
  // Run immediately on startup
  recalculateAllDevicesStatus().catch(console.error);
  
  // Then run on interval
  setInterval(recalculateAllDevicesStatus, STATUS_CHECK_INTERVAL);
}

// Support standalone execution (e.g., Railway background worker)
if (require.main === module) {
  startStatusCron();
}

module.exports = {
  recalculateAllDevicesStatus,
  startStatusCron,
  STATUS_CHECK_INTERVAL
};
