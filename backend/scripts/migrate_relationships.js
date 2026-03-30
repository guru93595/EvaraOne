require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const { db, admin } = require("../src/config/firebase");
const FieldValue = admin.firestore.FieldValue;

async function migrate() {
    console.log("🚀 Starting Relationship Migration...");
    
    try {
        const devicesSnap = await db.collection("devices").get();
        console.log(`Found ${devicesSnap.size} devices to process.`);

        const customerMap = {}; // customerId -> [deviceDocIds]
        const zoneMap = {};     // zoneId -> [deviceDocIds]
        const zoneCustMap = {}; // zoneId -> Set(customerIds)

        for (const doc of devicesSnap.docs) {
            const data = doc.data();
            const customerId = data.customer_id;
            const zoneId = data.zone_id;

            if (customerId) {
                if (!customerMap[customerId]) customerMap[customerId] = [];
                customerMap[customerId].push(doc.id);
            }

            if (zoneId) {
                if (!zoneMap[zoneId]) zoneMap[zoneId] = [];
                zoneMap[zoneId].push(doc.id);

                if (customerId) {
                    if (!zoneCustMap[zoneId]) zoneCustMap[zoneId] = new Set();
                    zoneCustMap[zoneId].add(customerId);
                }
            }
        }

        const batch = db.batch();
        let ops = 0;

        // 1. Update Customers
        console.log("Mapping Customers...");
        for (const [cid, deviceIds] of Object.entries(customerMap)) {
            const ref = db.collection("customers").doc(cid);
            batch.set(ref, {
                device_ids: deviceIds,
                device_count: deviceIds.length,
                updated_at: FieldValue.serverTimestamp()
            }, { merge: true });
            ops++;
        }

        // 2. Update Zones
        console.log("Mapping Zones...");
        for (const [zid, deviceIds] of Object.entries(zoneMap)) {
            const ref = db.collection("zones").doc(zid);
            const customerCount = zoneCustMap[zid] ? zoneCustMap[zid].size : 0;
            
            batch.set(ref, {
                device_ids: deviceIds,
                device_count: deviceIds.length,
                customer_count: customerCount,
                updated_at: FieldValue.serverTimestamp()
            }, { merge: true });
            ops++;
        }

        if (ops > 0) {
            await batch.commit();
            console.log(`✅ Success! Synchronized ${ops} parent records.`);
        } else {
            console.log("No records required synchronization.");
        }

    } catch (error) {
        console.error("❌ Migration Failed:", error);
    }
}

migrate().then(() => process.exit(0));
