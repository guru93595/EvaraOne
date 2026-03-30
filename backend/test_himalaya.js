const { db } = require("./src/config/firebase.js");
const axios = require("axios");

async function testHimalaya() {
    const hardwareId = "HIMALAYA";
    console.log(`Testing Node: ${hardwareId}`);

    try {
        // 1. Get Registry
        const deviceDoc = await db.collection("devices").doc(hardwareId).get();
        if (!deviceDoc.exists) throw new Error("Device not found in registry");
        const registry = deviceDoc.data();
        console.log("Registry Type:", registry.device_type);
        console.log("Channel ID:", registry.thingspeak_channel_id);

        // 2. Get Metadata
        const metaDoc = await db.collection("evaraflow").doc(hardwareId).get();
        if (!metaDoc.exists) throw new Error("Metadata not found in evaraflow collection");
        const metadata = metaDoc.data();
        console.log("Metadata Fields:", {
            total: metadata.meter_reading_field,
            flow: metadata.flow_rate_field
        });

        // 3. Fetch from ThingSpeak
        const url = `https://api.thingspeak.com/channels/${metadata.thingspeak_channel_id}/feeds.json?api_key=${metadata.thingspeak_read_api_key}&results=1`;
        console.log("Fetching from ThingSpeak:", url.replace(metadata.thingspeak_read_api_key, '***'));
        const response = await axios.get(url);
        const feeds = response.data.feeds || [];
        const latestFeed = feeds[0] || {};
        console.log("Raw Feed:", latestFeed);

        // 4. Manual Smart-Scan logic
        let totalReadingFieldKey = metadata.meter_reading_field;
        if (!totalReadingFieldKey || !latestFeed[totalReadingFieldKey]) {
            let maxVal = 100;
            for (let i = 1; i <= 8; i++) {
                const val = parseFloat(latestFeed[`field${i}`]);
                if (!isNaN(val) && val > maxVal) {
                    maxVal = val;
                    totalReadingFieldKey = `field${i}`;
                }
            }
        }
        console.log("Identified Total Field:", totalReadingFieldKey);
        console.log("Total Value:", latestFeed[totalReadingFieldKey]);

    } catch (err) {
        console.error("Test failed:", err.message);
    }
}

testHimalaya().then(() => process.exit(0));
