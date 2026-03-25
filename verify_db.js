const { db } = require("./backend/src/config/firebase-secure");

async function verifyCounts() {
    try {
        const devicesSnap = await db.collection("devices").count().get();
        const customersSnap = await db.collection("customers").count().get();
        const zonesSnap = await db.collection("zones").get(); // Smaller, can get all to check content

        console.log("--- Database Counts ---");
        console.log("Total Devices (Registry):", devicesSnap.data().count);
        console.log("Total Customers:", customersSnap.data().count);
        console.log("Total Zones:", zonesSnap.size);

        const nodesList = await db.collection("devices").limit(5).get();
        console.log("\n--- Sample Devices IDs ---");
        nodesList.forEach(doc => console.log(doc.id, "->", doc.data().device_type));

        process.exit(0);
    } catch (error) {
        console.error("Verification failed:", error);
        process.exit(1);
    }
}

verifyCounts();
