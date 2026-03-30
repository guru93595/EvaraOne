const { db } = require("./backend/src/config/firebase.js");

async function syncDeviceNames() {
    console.log("Starting Device Name Synchronization...");
    
    const collections = ["evaratank", "evaradeep", "evaraflow"];
    let totalUpdated = 0;

    for (const colName of collections) {
        console.log(`Processing collection: ${colName}...`);
        const snapshot = await db.collection(colName).get();
        console.log(`Found ${snapshot.size} documents in ${colName}`);

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const friendlyName = data.device_name || data.label || data.displayName;
            
            if (friendlyName) {
                const deviceRef = db.collection("devices").doc(doc.id);
                const deviceDoc = await deviceRef.get();
                
                if (deviceDoc.exists) {
                    await deviceRef.update({
                        label: friendlyName,
                        device_name: friendlyName
                    });
                    console.log(`Updated Device ${doc.id} (Hardware: ${data.device_id || 'N/A'}) -> ${friendlyName}`);
                    totalUpdated++;
                } else {
                    console.warn(`Device registry doc ${doc.id} not found for ${colName} meta`);
                }
            }
        }
    }

    console.log(`Sync complete. Total devices updated: ${totalUpdated}`);
    process.exit(0);
}

syncDeviceNames().catch(err => {
    console.error("Sync failed:", err);
    process.exit(1);
});
