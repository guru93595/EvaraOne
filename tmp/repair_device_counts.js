const { db } = require("../backend/src/config/firebase.js");

async function repairCounts() {
    console.log("Starting Device Count Repair...");
    
    const customersSnap = await db.collection("customers").get();
    console.log(`Found ${customersSnap.size} customers to check.`);
    
    for (const doc of customersSnap.docs) {
        const customerId = doc.id;
        const data = doc.data();
        
        // Find actual devices
        const devicesSnap = await db.collection("devices").where("customer_id", "==", customerId).get();
        const actualCount = devicesSnap.size;
        
        console.log(`Customer ${customerId}: Real count = ${actualCount} (Stored: ${data.deviceCount || data.device_count || 0})`);
        
        if (data.deviceCount !== actualCount || data.device_count !== undefined) {
            await db.collection("customers").doc(customerId).update({
                deviceCount: actualCount,
                device_count: null // Remove legacy field
            });
            console.log(`  -> UPDATED`);
        }
    }
    
    console.log("Repair Completed.");
    process.exit(0);
}

repairCounts().catch(err => {
    console.error("Repair failed:", err);
    process.exit(1);
});
