const { db, admin } = require("../config/firebase.js");
const cache = require("../config/cache.js");
const { fetchChannelFeeds, getLatestFeed } = require("./thingspeakService.js");

const OFFLINE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Calculate device status based on STRICT date + time validation
 * This is the SINGLE SOURCE OF TRUTH for status calculation
 * 
 * CRITICAL LOGIC:
 * - Device is ONLINE ONLY if: same day AND within 20 minutes
 * - Device is OFFLINE if: different day OR > 20 minutes OR no data
 */
/**
 * Calculate device status based on STRICT date + time validation
 * 3-Tier Logic:
 * - ONLINE: same day && diff <= 20 mins
 * - OFFLINE_RECENT: same day && diff > 20 mins
 * - OFFLINE_STOPPED: different day (last data not from today)
 */
const calculateDeviceStatus = (lastUpdatedAt) => {
  if (!lastUpdatedAt) return "OFFLINE_STOPPED";
  
  try {
    const now = new Date();
    const lastUpdate = new Date(lastUpdatedAt);
    
    // Convert to local timezone (IST for India)
    const tzOffset = 5.5 * 60 * 60 * 1000; // IST = UTC+5:30
    const nowIST = new Date(now.getTime() + tzOffset);
    const lastUpdateIST = new Date(lastUpdate.getTime() + tzOffset);
    
    // Extract date components (YYYY-MM-DD)
    const currentDate = nowIST.toISOString().split('T')[0];
    const lastDataDate = lastUpdateIST.toISOString().split('T')[0];
    
    // Calculate difference in minutes
    const timeDiffMinutes = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);
    
    // 1. Check if same day
    const isSameDay = lastDataDate === currentDate;
    
    if (isSameDay) {
      if (timeDiffMinutes <= 30) {
        return "ONLINE";
      } else {
        return "OFFLINE_RECENT";
      }
    } else {
      return "OFFLINE_STOPPED";
    }
  } catch (err) {
    console.error("[DeviceStatus] Status calculation error:", err.message);
    return "OFFLINE_STOPPED";
  }
};

/**
 * Process ThingSpeak data and transform to standardized format
 */
const processThingSpeakData = (device, feeds) => {
  if (!feeds || feeds.length === 0) return null;
  
  const latestFeed = getLatestFeed(feeds);
  const lastUpdatedAt = latestFeed.created_at;
  const status = calculateDeviceStatus(lastUpdatedAt);
  
  // Find the correct field(s)
  const isFlowMeter = ['flow_meter', 'evaraflow'].includes(device.type?.toLowerCase()) || 
                      ['flow_meter', 'evaraflow'].includes(device.device_type?.toLowerCase());
  
  if (isFlowMeter) {
    const mapping = device.mapping || {};
    
    // Explicit field mapping from device document or nested mapping
    const fieldFlow = 
        device.flow_rate_field || mapping.flow_rate_field || mapping.flowField || 
        (latestFeed.field4 !== undefined ? "field4" : "field3");

    const fieldTotal = 
        device.meter_reading_field || mapping.meter_reading_field || mapping.volumeField || 
        (latestFeed.field5 !== undefined ? "field5" : "field1");

    const flow_rate = parseFloat(latestFeed[fieldFlow]) || 0;
    const total_liters = parseFloat(latestFeed[fieldTotal]) || 0;

    return {
      deviceId: device.id,
      flow_rate,
      total_liters,
      lastUpdatedAt,
      status,
      raw_data: latestFeed
    };
  }

  // Tank logic (water level)
  const mapping = device.mapping || {};
  const definedField = device.secondary_field || device.water_level_field || device.fieldKey || device.configuration?.water_level_field || device.configuration?.fieldKey;
  const fieldKey = mapping.levelField || definedField || 
      Object.keys(mapping).find(k => mapping[k] && mapping[k].includes("water_level")) ||
      (latestFeed.field1 !== undefined ? "field1" : "field2");
  
  const rawDistance = parseFloat(latestFeed[fieldKey]) || 0;
  const validDistance = Math.min(rawDistance / 100, device.depth);
  const processedLevel = Math.max(0, device.depth - validDistance);
  const percentage = device.depth > 0 
    ? Math.min(100, (processedLevel / device.depth) * 100) 
    : 0;
  const volume = (device.capacity * percentage) / 100;
  
  return {
    device_id: device.id,
    rawDistance,
    processedLevel,
    level_percentage: percentage,
    percentage, // Keep for legacy
    volume,
    lastUpdatedAt,
    status,
    raw_data: latestFeed
  };
};

/**
 * Update Firestore with processed telemetry data
 */
const updateFirestoreTelemetry = async (deviceType, deviceId, telemetryData, feeds) => {
  try {
    // Standardized snapshot for both collections
    const snapshot = {
      flow_rate: telemetryData.flow_rate || 0,
      total_liters: telemetryData.total_liters || 0,
      level_percentage: telemetryData.percentage || 0,
      timestamp: telemetryData.lastUpdatedAt,
      status: telemetryData.status
    };

    const updatePayload = {
      lastUpdatedAt: telemetryData.lastUpdatedAt,
      status: telemetryData.status,
      lastTelemetryFetch: new Date().toISOString(),
      raw_data: telemetryData.raw_data,
      telemetry_snapshot: snapshot
    };

    if (telemetryData.rawDistance !== undefined) updatePayload.lastValue = telemetryData.rawDistance;
    if (telemetryData.processedLevel !== undefined) updatePayload.processedLevel = telemetryData.processedLevel;
    if (telemetryData.percentage !== undefined) {
      updatePayload.level_percentage = telemetryData.percentage;
      updatePayload.percentage = telemetryData.percentage; // Keep for legacy
    }
    if (telemetryData.flow_rate !== undefined) updatePayload.flow_rate = telemetryData.flow_rate;
    if (telemetryData.total_liters !== undefined) updatePayload.total_liters = telemetryData.total_liters;
    
    // Store telemetry history (last 20 readings)
    if (feeds && feeds.length > 0) {
      updatePayload.telemetryHistory = feeds.map((f) => ({
        created_at: f.created_at,
        raw: f
      }));
    }
    
    // 1. Update Specific Metadata Collection (evaratank/evaraflow/...)
    await db.collection(deviceType.toLowerCase()).doc(deviceId).update(updatePayload);

    // 2. SaaS DUAL-SYNC: Update Global Registry ('devices' collection)
    const registryUpdate = {
        status: telemetryData.status,
        last_seen: telemetryData.lastUpdatedAt,
        last_online_at: admin.firestore.FieldValue.serverTimestamp(),
        telemetry_snapshot: snapshot
    };

    // If it's HIMALAYA or any himalaya device, ensure its type is corrected to evaraflow during sync
    if (deviceId === 'HIMALAYA' || deviceId === 'HIMALAYA 2' || 
        deviceId.toLowerCase().includes('himalaya')) {
        registryUpdate.device_type = 'evaraflow';
        registryUpdate.analytics_template = 'EvaraFlow';
    }

    await db.collection("devices").doc(deviceId).update(registryUpdate);

  } catch (err) {
    console.error(`[DeviceState] Firestore update failed for ${deviceId}:`, err.message);
    throw err;
  }
};

/**
 * Recalculate status for ALL devices (Cron job logic)
 * This ensures status is always accurate even without new data
 */
const recalculateAllDevicesStatus = async () => {
  try {
    const devicesSnapshot = await db.collection("devices").get();
    const now = new Date();
    const updates = [];
    
    for (const doc of devicesSnapshot.docs) {
      const device = doc.data();
      const lastUpdatedAt = device.lastUpdatedAt || device.last_updated_at || device.last_seen;
      
      if (!lastUpdatedAt) {
        // No timestamp - mark as OFFLINE
        if (device.status !== 'OFFLINE') {
          updates.push(
            db.collection(device.device_type.toLowerCase()).doc(doc.id).update({
              status: 'OFFLINE'
            })
          );
        }
        continue;
      }
      
      const desiredStatus = calculateDeviceStatus(lastUpdatedAt);
      const currentStatus = device.status;
      
      // Only update if status changed
      if (currentStatus !== desiredStatus) {
        updates.push(
          db.collection(device.device_type.toLowerCase()).doc(doc.id).update({
            status: desiredStatus,
            statusLastChecked: now.toISOString()
          })
        );
      }
    }
    
    if (updates.length > 0) {
      await Promise.all(updates);
      console.log(`[DeviceState] Status recalculation complete: ${updates.length} updates`);
    } else {
      console.log('[DeviceState] Status recalculation complete: No changes needed');
    }
  } catch (err) {
    console.error("[DeviceState] Status recalculation failed:", err.message);
  }
};

module.exports = {
  calculateDeviceStatus,
  processThingSpeakData,
  updateFirestoreTelemetry,
  recalculateAllDevicesStatus,
  OFFLINE_THRESHOLD_MS
};
