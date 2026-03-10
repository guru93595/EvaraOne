const mqtt = require("mqtt");
const { db } = require("../config/firebase.js");

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";

const mqttClient = mqtt.connect(MQTT_BROKER_URL);

mqttClient.on("connect", () => {
    
    // Subscribe to all device telemetry topics
    mqttClient.subscribe("devices/+/telemetry", (err) => {
        if (!err) {
        }
    });
});

const lastUpdateMap = new Map();
const UPDATE_THROTTLE_MS = 30000; // 30 seconds

mqttClient.on("message", async (topic, message) => {
    try {
        const payload = JSON.parse(message.toString());
        const deviceId = topic.split("/")[1];

        
        // Push IMMEDIATE realtime update to frontend via WebSockets
        if (global.io) {
            global.io.emit("telemetry_update", {
                node_id: deviceId,
                ...payload,
                timestamp: new Date()
            });
        }

        // THROTTLED Update to Firestore snapshot (Latest State)
        const now = Date.now();
        const lastUpdate = lastUpdateMap.get(deviceId) || 0;

        if (now - lastUpdate > UPDATE_THROTTLE_MS) {
            await db.collection("nodes").doc(deviceId).update({
                telemetry_snapshot: {
                    ...payload,
                    last_updated: new Date()
                }
            });
            lastUpdateMap.set(deviceId, now);
        }
       
    } catch (err) {
        console.error("[MQTT] Telemetry ingestion error:", err);
    }
});

module.exports = mqttClient;
