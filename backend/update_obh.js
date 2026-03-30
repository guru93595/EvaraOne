const admin = require("firebase-admin");
const { db } = require("d:/MAIN/backend/src/config/firebase.js");

async function fixOBH() {
    console.log("Updating OBH Tank config...");
    const obhId = "UxSim3VQh2qI232wDgHo";
    // Using KRB Tank's channel just so it has some data to show
    await db.collection("evaratank").doc(obhId).update({
        thingspeak_channel_id: "2613745",
        thingspeak_read_api_key: "KHJXYW6LEIDQ1TJA",
        sensor_field_mapping: {
            "field2": "water_level_raw_sensor_reading"
        }
    });

    console.log("Successfully updated OBH Tank ThingSpeak configuration.");
}
fixOBH().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
