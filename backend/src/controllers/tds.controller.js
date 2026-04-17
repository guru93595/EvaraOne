/**
 * TDS (Total Dissolved Solids) Controller
 * Handles TDS device telemetry, configuration, and queries
 */

const { db, admin } = require("../config/firebase.js");
const cache = require("../config/cache.js");
const axios = require("axios");
const { fetchLatestData } = require("../services/thingspeakService.js");
const { checkOwnership } = require("../middleware/auth.middleware.js");
const { checkDeviceVisibilityWithAudit } = require("../utils/checkDeviceVisibility.js");
const logger = require("../utils/logger.js");

// ✅ AUDIT FIX L2: Use shared resolveDevice utility (was duplicated in 3 controllers)
const resolveDevice = require("../utils/resolveDevice.js");

/**
 * Helper to resolve TDS metadata document
 * Metadata can be indexed by device DocID OR hardware device_id/node_id
 */
async function resolveMetadata(deviceDoc) {
  if (!deviceDoc) return null;
  const id = deviceDoc.id;
  const registry = deviceDoc.data();

  // 1. Try lookup by device DocID (standard pattern)
  const metaDoc = await db.collection("evaratds").doc(id).get();
  if (metaDoc.exists) return metaDoc;

  // 2. Try lookup by hardware device_id
  if (registry.device_id) {
    const meta2 = await db.collection("evaratds").doc(registry.device_id).get();
    if (meta2.exists) return meta2;
  }

  // 3. Try lookup by hardware node_id
  if (registry.node_id) {
    const meta3 = await db.collection("evaratds").doc(registry.node_id).get();
    if (meta3.exists) return meta3;
  }

  return null;
}

/**
 * Get TDS device telemetry
 * Returns latest TDS value, temperature, and quality status
 */
exports.getTDSTelemetry = async (req, res) => {
  try {
    const { id: paramId } = req.params;
    
    // Get device metadata - using resolveDevice for hardware ID support
    const deviceDoc = await resolveDevice(paramId);
    if (!deviceDoc) {
      return res.status(404).json({ error: "Device not found" });
    }

    const id = deviceDoc.id; // Use the actual Firestore ID for subsequent lookups
    const registry = deviceDoc.data();
    if (registry.device_type !== "evaratds") {
      return res.status(400).json({ error: "Device is not a TDS sensor" });
    }

    // ✅ CRITICAL FIX: Check ownership
    if (req.user.role !== "superadmin") {
      const isOwner = await checkOwnership(
        req.user.customer_id || req.user.uid,
        id,
        req.user.role,
        req.user.community_id
      );
      if (!isOwner) {
        return res.status(403).json({ error: "Unauthorized access" });
      }
    }

    // ✅ CRITICAL FIX: ENFORCE DEVICE VISIBILITY (using shared helper)
    // Defense in depth: check visibility in application layer
    if (!checkDeviceVisibilityWithAudit(registry, id, req.user.uid, req.user.role)) {
      return res.status(403).json({ error: "Device not visible to your account" });
    }

    // Get TDS metadata
    const metaDoc = await resolveMetadata(deviceDoc);
    if (!metaDoc) {
      return res.status(404).json({ error: "TDS metadata not found" });
    }

    const metadata = metaDoc.data();
    const channel = metadata.thingspeak_channel_id?.trim();
    const apiKey = metadata.thingspeak_read_api_key?.trim();

    if (!channel || !apiKey) {
      return res.status(400).json({ error: "ThingSpeak credentials missing" });
    }

    // Fetch latest data from ThingSpeak
    const latestData = await fetchLatestData(channel, apiKey);
    if (!latestData) {
      return res.status(500).json({ error: "Failed to fetch ThingSpeak data" });
    }

    // sensor_field_mapping format: { "field1": "tds_value", "field2": "temperature" }
    // Keys = ThingSpeak field names, Values = what they represent
    // Find which ThingSpeak field holds each sensor value
    const mapping = metadata.sensor_field_mapping || {};
    const tdsField = Object.keys(mapping).find(k => mapping[k] === "tds_value") || "field1";
    const tempField = Object.keys(mapping).find(k => mapping[k] === "temperature") || "field2";

    const tdsValue = parseFloat(latestData[tdsField]) || null;
    const temperature = parseFloat(latestData[tempField]) || null;

    const config = metadata.configuration || {};

    // Determine water quality based on TDS
    let quality = "UNKNOWN";
    if (tdsValue !== null) {
      if (tdsValue < 300) quality = "EXCELLENT";
      else if (tdsValue < 600) quality = "GOOD";
      else if (tdsValue < 1000) quality = "FAIR";
      else if (tdsValue < 1500) quality = "POOR";
      else quality = "VERY_POOR";
    }

    // Determine status based on last update
    const lastUpdated = new Date(latestData.created_at || Date.now());
    const now = new Date();
    const minutesSinceUpdate = (now - lastUpdated) / (1000 * 60);
    let status = "ONLINE";
    if (minutesSinceUpdate > 120) status = "OFFLINE";
    else if (minutesSinceUpdate > 60) status = "OFFLINE_RECENT";

    const response = {
      id,
      label: metadata.label || metadata.device_name,
      type: "TDS",
      tds_value: tdsValue,
      temperature,
      quality,
      status,
      unit: "ppm",
      min_threshold: config.min_threshold || 0,
      max_threshold: config.max_threshold || 2000,
      latitude: metadata.latitude,
      longitude: metadata.longitude,
      last_updated: lastUpdated.toISOString(),
      timestamp: latestData.created_at,
    };

    // Cache for 1 minute
    await cache.set(`tds:telemetry:${id}`, response, 60);

    res.status(200).json(response);
  } catch (error) {
    console.error("[TDSController] Error fetching telemetry:", error);
    res.status(500).json({ error: "Failed to fetch telemetry data" });
  }
};

/**
 * Get TDS device historical data (last N readings)
 */
exports.getTDSHistory = async (req, res) => {
  try {
    const { id: paramId } = req.params;
    const { hours = 24, limit = 288 } = req.query;

    // Get device metadata - using resolveDevice for hardware ID support
    const deviceDoc = await resolveDevice(paramId);
    if (!deviceDoc) {
      return res.status(404).json({ error: "Device not found" });
    }

    const id = deviceDoc.id; // Use the actual Firestore ID for subsequent lookups
    const registry = deviceDoc.data();
    if (registry.device_type !== "evaratds") {
      return res.status(400).json({ error: "Device is not a TDS sensor" });
    }

    // Check ownership
    if (req.user.role !== "superadmin") {
      const isOwner = await checkOwnership(
        req.user.customer_id || req.user.uid,
        id,
        req.user.role,
        req.user.community_id
      );
      if (!isOwner) {
        return res.status(403).json({ error: "Unauthorized access" });
      }
    }

    // ✅ CRITICAL FIX: ENFORCE DEVICE VISIBILITY (using shared helper)
    if (!checkDeviceVisibilityWithAudit(registry, id, req.user.uid, req.user.role)) {
      return res.status(403).json({ error: "Device not visible to your account" });
    }

    // Get TDS metadata
    const metaDoc = await resolveMetadata(deviceDoc);
    if (!metaDoc) {
      return res.status(404).json({ error: "TDS metadata not found" });
    }

    const metadata = metaDoc.data();
    const channel = metadata.thingspeak_channel_id?.trim();
    const apiKey = metadata.thingspeak_read_api_key?.trim();

    if (!channel || !apiKey) {
      return res.status(400).json({ error: "ThingSpeak credentials missing" });
    }

    // Fetch historical data from ThingSpeak
    const url = `https://api.thingspeak.com/channels/${channel}/feeds.json?api_key=${apiKey}&results=${Math.min(limit, 288)}&timezone=UTC`;
    const response = await axios.get(url, { timeout: 10000 });

    if (!response.data.feeds) {
      return res.status(200).json({ data: [], count: 0 });
    }

    // sensor_field_mapping: { "field1": "tds_value", "field2": "temperature" }
    const mapping = metadata.sensor_field_mapping || {};
    const tdsField = Object.keys(mapping).find(k => mapping[k] === "tds_value") || "field1";
    const tempField = Object.keys(mapping).find(k => mapping[k] === "temperature") || "field2";


    const data = response.data.feeds.map((feed) => {
      const tdsValue = parseFloat(feed[tdsField]) || null;
      const temperature = parseFloat(feed[tempField]) || null;

      let quality = "UNKNOWN";
      if (tdsValue !== null) {
        if (tdsValue < 300) quality = "EXCELLENT";
        else if (tdsValue < 600) quality = "GOOD";
        else if (tdsValue < 1000) quality = "FAIR";
        else if (tdsValue < 1500) quality = "POOR";
        else quality = "VERY_POOR";
      }

      return {
        timestamp: feed.created_at,
        tds_value: tdsValue,
        temperature,
        quality,
      };
    });

    res.status(200).json({
      id,
      label: metadata.label,
      data,
      count: data.length,
      period_hours: parseInt(hours),
    });
  } catch (error) {
    console.error("[TDSController] Error fetching history:", error);
    res.status(500).json({ error: "Failed to fetch historical data" });
  }
};

/**
 * Get TDS device configuration
 */
exports.getTDSConfig = async (req, res) => {
  try {
    const { id: paramId } = req.params;

    const deviceDoc = await resolveDevice(paramId);
    if (!deviceDoc) {
      return res.status(404).json({ error: "TDS configuration not found" });
    }

    const id = deviceDoc.id;
    const registry = deviceDoc.data();

    // ✅ CRITICAL FIX: Check ownership
    if (req.user.role !== "superadmin") {
      const isOwner = await checkOwnership(
        req.user.customer_id || req.user.uid,
        id,
        req.user.role,
        req.user.community_id
      );
      if (!isOwner) {
        return res.status(403).json({ error: "Unauthorized access" });
      }
    }

    // ✅ CRITICAL FIX: ENFORCE DEVICE VISIBILITY (using shared helper)
    if (!checkDeviceVisibilityWithAudit(registry, id, req.user.uid, req.user.role)) {
      return res.status(403).json({ error: "Device not visible to your account" });
    }

    const metaDoc = await resolveMetadata(deviceDoc);
    if (!metaDoc) {
      return res.status(404).json({ error: "TDS configuration not found" });
    }

    const metadata = metaDoc.data();
    const config = metadata.configuration || {};

    res.status(200).json({
      id,
      label: metadata.label,
      type: "TDS",
      configuration: {
        unit: config.unit || "ppm",
        min_threshold: config.min_threshold || 0,
        max_threshold: config.max_threshold || 2000,
        latitude: metadata.latitude,
        longitude: metadata.longitude,
      },
      sensor_field_mapping: metadata.sensor_field_mapping || {},
    });
  } catch (error) {
    console.error("[TDSController] Error fetching config:", error);
    res.status(500).json({ error: "Failed to fetch configuration" });
  }
};

/**
 * Update TDS device configuration
 */
exports.updateTDSConfig = async (req, res) => {
  try {
    const { id: paramId } = req.params;
    const { minThreshold, maxThreshold, latitude, longitude } = req.body;

    // Get device metadata - using resolveDevice for hardware ID support
    const deviceDoc = await resolveDevice(paramId);
    if (!deviceDoc) {
      return res.status(404).json({ error: "TDS configuration not found" });
    }

    const id = deviceDoc.id;

    // Check ownership
    if (req.user.role !== "superadmin") {
      const isOwner = await checkOwnership(
        req.user.customer_id || req.user.uid,
        id,
        req.user.role,
        req.user.community_id
      );
      if (!isOwner) {
        return res.status(403).json({ error: "Unauthorized access" });
      }
    }

    // ✅ CRITICAL FIX: ENFORCE DEVICE VISIBILITY (using shared helper)
    if (!checkDeviceVisibilityWithAudit(registry, id, req.user.uid, req.user.role)) {
      return res.status(403).json({ error: "Device not visible to your account" });
    }

    const metaDoc = await resolveMetadata(deviceDoc);
    if (!metaDoc) {
      return res.status(404).json({ error: "TDS configuration not found" });
    }

    const metadata = metaDoc.data();
    const updated = {
      ...metadata,
      configuration: {
        ...metadata.configuration,
        ...(minThreshold !== undefined && { min_threshold: minThreshold }),
        ...(maxThreshold !== undefined && { max_threshold: maxThreshold }),
      },
      ...(latitude !== undefined && { latitude }),
      ...(longitude !== undefined && { longitude }),
      updated_at: new Date(),
    };

    await db.collection("evaratds").doc(id).update(updated);

    // Invalidate cache
    await cache.del(`tds:telemetry:${id}`);
    await cache.flushPrefix("nodes_");

    // ✅ FIX #16: EMIT SOCKET EVENT FOR TDS CONFIG UPDATE
    const registryData = registry?.data?.();
    const customerId = registryData?.customer_id || registryData?.customerId;
    if (customerId && global.io) {
      global.io.to(`customer:${customerId}`).emit("device:updated", {
        deviceId: id,
        changes: updated,
        success: true,
        timestamp: new Date().toISOString()
      });
      console.log(`[TDSController] ✅ device:updated event emitted for TDS config update: ${id}`);
    }

    res.status(200).json({ success: true, message: "Configuration updated" });
  } catch (error) {
    console.error("[TDSController] Error updating config:", error);
    res.status(500).json({ error: "Failed to update configuration" });
  }
};

/**
 * Get TDS analytics summary
 */
exports.getTDSAnalytics = async (req, res) => {
  try {
    const { id: paramId } = req.params;
    const { hours = 24 } = req.query;

    const deviceDoc = await resolveDevice(paramId);
    if (!deviceDoc) {
      return res.status(404).json({ error: "TDS device not found" });
    }

    const id = deviceDoc.id;
    const registry = deviceDoc.data();

    // ✅ CRITICAL FIX: Check ownership
    if (req.user.role !== "superadmin") {
      const isOwner = await checkOwnership(
        req.user.customer_id || req.user.uid,
        id,
        req.user.role,
        req.user.community_id
      );
      if (!isOwner) {
        return res.status(403).json({ error: "Unauthorized access" });
      }
    }

    // ✅ CRITICAL FIX: ENFORCE DEVICE VISIBILITY (using shared helper)
    if (!checkDeviceVisibilityWithAudit(registry, id, req.user.uid, req.user.role)) {
      return res.status(403).json({ error: "Device not visible to your account" });
    }

    const metaDoc = await resolveMetadata(deviceDoc);
    if (!metaDoc) {
      return res.status(404).json({ error: "TDS device not found" });
    }

    const metadata = metaDoc.data();
    const channel = metadata.thingspeak_channel_id?.trim();
    const apiKey = metadata.thingspeak_read_api_key?.trim();

    if (!channel || !apiKey) {
      return res.status(400).json({ error: "ThingSpeak credentials missing" });
    }

    // Fetch data from ThingSpeak
    const url = `https://api.thingspeak.com/channels/${channel}/feeds.json?api_key=${apiKey}&results=288&timezone=UTC`;
    const response = await axios.get(url, { timeout: 10000 });

    if (!response.data.feeds) {
      return res.status(200).json({
        avg_tds: null,
        min_tds: null,
        max_tds: null,
        avg_temp: null,
        readings_count: 0,
      });
    }

    // sensor_field_mapping: { "field1": "tds_value", "field2": "temperature" }
    const mapping = metadata.sensor_field_mapping || {};
    const tdsField = Object.keys(mapping).find(k => mapping[k] === "tds_value") || "field1";
    const tempField = Object.keys(mapping).find(k => mapping[k] === "temperature") || "field2";


    const tdsValues = response.data.feeds
      .map((feed) => parseFloat(feed[tdsField]))
      .filter((v) => !isNaN(v));
    const tempValues = response.data.feeds
      .map((feed) => parseFloat(feed[tempField]))
      .filter((v) => !isNaN(v));

    const analytics = {
      avg_tds:
        tdsValues.length > 0
          ? (tdsValues.reduce((a, b) => a + b, 0) / tdsValues.length).toFixed(2)
          : null,
      min_tds: tdsValues.length > 0 ? Math.min(...tdsValues) : null,
      max_tds: tdsValues.length > 0 ? Math.max(...tdsValues) : null,
      avg_temp:
        tempValues.length > 0
          ? (tempValues.reduce((a, b) => a + b, 0) / tempValues.length).toFixed(2)
          : null,
      readings_count: tdsValues.length,
    };

    res.status(200).json(analytics);
  } catch (error) {
    console.error("[TDSController] Error fetching analytics:", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
};
