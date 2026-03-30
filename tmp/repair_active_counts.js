const { db } = require("../backend/src/config/firebase.js");

async function repairActiveCounts() {
    console.log("Starting Active Device Count Repair...");
    
    const customersSnap = await db.collection("customers").get();
    console.log(`Found ${customersSnap.size} customers to check.`);
    
    for (const doc of customersSnap.docs) {
        const customerId = doc.id;
        const data = doc.data();
        
        // Find actual ACTIVE devices
        const devicesSnap = await db.collection("devices")
            .where("customer_id", "==", customerId)
            .where("is_active", "==", true)
            .get();
        
        const activeCount = devicesSnap.size;
        
        console.log(`Customer ${customerId}: Active count = ${activeCount}`);
        
        await db.collection("customers").doc(customerId).update({
            deviceCount: activeCount,
            device_count: null // Clean up legacy
        });
    }
    
    console.log("Repair Completed.");
    process.exit(0);
}

repairActiveCounts().catch(err => {
    console.error("Repair failed:", err);
    process.exit(1);
});
