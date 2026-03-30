const { db } = require("./src/config/firebase.js");

async function repairTanks() {
    console.log("Starting Tank Configuration Repair...");
    
    try {
        const snapshot = await db.collection("devices").get();
        let updatedCount = 0;

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const displayName = (data.displayName || data.label || data.name || "").toLowerCase() || (data.id || "").toLowerCase();
            const deviceId = doc.id;
            const typeRaw = data.device_type || "evaratank";
            const typeLower = typeRaw.toLowerCase();

            // 1. Repair OBH Tank
            if (displayName.includes("obh")) {
                console.log(`>>> Repairing OBH Tank [${deviceId}]...`);
                await db.collection(typeLower).doc(deviceId).update({
                    thingspeak_channel_id: "2613745",
                    thingspeak_read_api_key: "KHJXYW6LEIDQ1TJA",
                    sensor_field_mapping: {
                        "levelField": "field2"
                    },
                    tank_size: 16632, // Based on current value
                    depth: 1.2        // Correct OHT height
                });
                updatedCount++;
            }

            // 2. Repair HIMALAYA
            if (displayName.includes("himalaya")) {
                console.log(`>>> Repairing HIMALAYA [${deviceId}]...`);
                await db.collection(typeLower).doc(deviceId).update({
                    thingspeak_channel_id: "3275001",
                    thingspeak_read_api_key: "KF4EBSLE9D1ZXTWJ",
                    sensor_field_mapping: {
                        "levelField": "field1"
                    },
                    tank_size: 138180, // Example capacity
                    depth: 1.2
                });
                updatedCount++;
            }
        }

        if (updatedCount === 0) {
            console.log("No matching nodes (OBH/HIMALAYA) found to repair.");
        } else {
            console.log(`\nRepair complete! Updated ${updatedCount} nodes.`);
            console.log("Please refresh the dashboard to see the latest telemetry.");
        }

    } catch (err) {
        console.error("Repair failed:", err.message);
    }
}

repairTanks().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
