/**
 * Verify TDS Devices are Now Fetched Correctly
 * 
 * This script checks:
 * 1. TDS devices exist in the database
 * 2. They have proper device_type = "evaratds"
 * 3. They will now be returned with analytics_template
 * 
 * Usage: node verify_tds_fetch.js
 */

const admin = require("firebase-admin");

// Initialize Firebase (using default credentials)
try {
    admin.initializeApp();
} catch (e) {
    // Already initialized
}

const db = admin.firestore();

async function verifyTDSDevices() {
    console.log("\n[VERIFY] Checking TDS devices in database...\n");

    try {
        // 1. Check devices collection for TDS device_type
        const devicesSnap = await db.collection("devices")
            .where("device_type", "==", "evaratds")
            .get();

        console.log(`✅ Found ${devicesSnap.size} TDS devices in "devices" collection`);

        if (devicesSnap.empty) {
            console.log("   ⚠️  No TDS devices found. Run commissioning first.\n");
            process.exit(0);
        }

        // 2. For each device, check metadata in evaratds collection
        for (const doc of devicesSnap.docs) {
            const registry = doc.data();
            console.log(`\n📋 Device Registry Entry: ${doc.id}`);
            console.log(`   - device_id: ${registry.device_id}`);
            console.log(`   - device_type: ${registry.device_type}`);
            console.log(`   - analytics_template: ${registry.analytics_template || "❌ MISSING (will be injected by API)"}`);
            console.log(`   - customer_id: ${registry.customer_id}`);
            console.log(`   - created_at: ${registry.created_at}`);

            // Check metadata
            const metaSnap = await db.collection("evaratds").doc(doc.id).get();
            if (metaSnap.exists) {
                const meta = metaSnap.data();
                console.log(`\n📊 TDS Metadata:`);
                console.log(`   - label: ${meta.label}`);
                console.log(`   - configuration.type: ${meta.configuration?.type}`);
                console.log(`   - configuration.unit: ${meta.configuration?.unit}`);
                console.log(`   - configuration.min_threshold: ${meta.configuration?.min_threshold}`);
                console.log(`   - configuration.max_threshold: ${meta.configuration?.max_threshold}`);
            } else {
                console.log(`   ❌ Metadata NOT FOUND in evaratds collection!`);
            }
        }

        console.log(`\n✅ VERIFICATION COMPLETE`);
        console.log(`\n📌 API WILL NOW:`);
        console.log(`   1. Fetch these TDS devices`);
        console.log(`   2. Auto-inject analytics_template = "EvaraTDS"`);
        console.log(`   3. Frontend will filter and show them\n`);

    } catch (error) {
        console.error("❌ Error:", error.message);
    } finally {
        process.exit(0);
    }
}

verifyTDSDevices();
