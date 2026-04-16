/**
 * FIX: Create missing DEVICES registry entries for orphaned evaratds metadata
 * 
 * This script:
 * 1. Finds evaratds documents not in "devices" collection
 * 2. Creates the missing registry entries
 * 3. Sets all required fields including analytics_template
 */

const admin = require("firebase-admin");

try {
    admin.initializeApp();
} catch (e) {
    // Already initialized
}

const db = admin.firestore();

async function fixOrphanedTDS() {
    console.log("\n🔧 FIXING: Creating missing DEVICES registry entries for TDS\n");
    console.log("=" .repeat(70));

    try {
        // Step 1: Get all devices in registry
        const devicesSnap = await db.collection("devices").get();
        const deviceIds = new Set(devicesSnap.docs.map(d => d.id));

        // Step 2: Get all TDS metadata
        const tdsSnap = await db.collection("evaratds").get();
        console.log(`\n   Found ${tdsSnap.size} TDS metadata entries`);

        // Step 3: Find orphaned ones
        const orphaned = [];
        tdsSnap.forEach(doc => {
            if (!deviceIds.has(doc.id)) {
                orphaned.push({ id: doc.id, data: doc.data() });
            }
        });

        if (orphaned.length === 0) {
            console.log(`   ✅ No orphaned TDS entries found!`);
            process.exit(0);
        }

        console.log(`   ❌ Found ${orphaned.length} ORPHANED entries\n`);

        // Step 4: Create registry entries for each orphaned metadata
        console.log(`   Creating registry entries...\n`);
        
        let fixed = 0;
        for (const orphan of orphaned) {
            const meta = orphan.data;
            
            // Create registry entry
            const registryEntry = {
                device_id: meta.device_id || orphan.id,
                device_type: "evaratds",
                node_id: meta.device_id || orphan.id,
                customer_id: meta.customer_id || "",
                api_key_hash: "",
                isVisibleToCustomer: true,
                analytics_template: "EvaraTDS", // ✅ Critical field
                customer_config: {
                    showAlerts: true,
                    showConsumption: true,
                    showDeviceHealth: true,
                    showEstimations: true,
                    showFillRate: true,
                    showMap: true,
                    showTankLevel: true,
                    showVolume: true
                },
                created_at: meta.created_at || new Date()
            };

            try {
                await db.collection("devices").doc(orphan.id).set(registryEntry);
                console.log(`   ✅ Fixed: ${orphan.id} (${meta.label})`);
                fixed++;
            } catch (err) {
                console.log(`   ❌ Failed: ${orphan.id} - ${err.message}`);
            }
        }

        console.log(`\n   📊 FIXED: ${fixed}/${orphaned.length} TDS devices`);

        // Step 5: Verify fix
        console.log(`\n   Verifying fix...`);
        const updatedDevicesSnap = await db.collection("devices").where("device_type", "==", "evaratds").get();
        console.log(`   ✅ Now in registry: ${updatedDevicesSnap.size} TDS devices`);

        console.log(`\n` + "=" .repeat(70));
        console.log(`✅ FIX COMPLETE!`);
        console.log(`\n   Next steps:`);
        console.log(`   1. Restart backend: cd backend && npm start`);
        console.log(`   2. Hard refresh browser: Ctrl+Shift+R`);
        console.log(`   3. Check "EVARATDS" tab - should show ${fixed} device(s)\n`);

    } catch (error) {
        console.error("❌ Error:", error.message);
    } finally {
        process.exit(0);
    }
}

fixOrphanedTDS();
