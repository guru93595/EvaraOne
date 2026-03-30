const { db } = require("d:/MAIN/backend/src/config/firebase.js");

async function dumpEvaraTanks() {
    const tanks = await db.collection("evaratank").get();
    for (const doc of tanks.docs) {
        const data = doc.data();
        const name = data.displayName || data.label || data.name || data.node_key;
        console.log("Tank:", name);
        console.log("Metadata:", JSON.stringify({
            channel: data.thingspeak_channel_id,
            key: data.thingspeak_read_api_key,
            mapping: data.sensor_field_mapping
        }, null, 2));
    }
}
dumpEvaraTanks().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
