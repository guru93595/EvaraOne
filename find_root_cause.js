/**
 * ROOT CAUSE CHECK: Is TDS device in BOTH collections?
 * 
 * The bug: Device exists in "evaratds" collection but NOT in "devices" collection
 * This would cause:
 * 1. Backend queries "devices" collection
 * 2. Doesn't find TDS entry
 * 3. API returns 4 devices (no TDS)
 * 4. Frontend shows EVARATDS = 0
 */

const admin = require("firebase-admin");

try {
    admin.initializeApp();
} catch (e) {
    // Already initialized
}

const db = admin.firestore();

async function findRootCause() {
    console.log("\n🔍 ROOT CAUSE ANALYSIS: Finding Missing TDS Device\n");
    console.log("=" .repeat(70));

    try {
        // Step 1: Get all documents in DEVICES collection (registry)
        console.log("\n1️⃣  Checking DEVICES collection (Registry):");
        console.log("-".repeat(70));
        
        const devicesSnap = await db.collection("devices").get();
        const deviceIds = new Set();
        
        console.log(`   Total entries: ${devicesSnap.size}`);
        devicesSnap.forEach(doc => {
            deviceIds.add(doc.id);
            console.log(`   ✅ ${doc.id} → device_type: "${doc.data().device_type}"`);
        });

        // Step 2: Get all documents in EVARATDS collection (metadata)
        console.log(`\n2️⃣  Checking EVARATDS collection (Metadata):`);
        console.log("-".repeat(70));
        
        const tdsSnap = await db.collection("evaratds").get();
        const tdsIds = [];
        
        console.log(`   Total entries: ${tdsSnap.size}`);
        tdsSnap.forEach(doc => {
            tdsIds.push(doc.id);
            const inRegistry = deviceIds.has(doc.id);
            const status = inRegistry ? "✅ FOUND in registry" : "❌ MISSING from registry";
            console.log(`   ${status} → ${doc.id} (${doc.data().label})`);
        });

        // Step 3: DIAGNOSIS
        console.log(`\n3️⃣  DIAGNOSIS:`);
        console.log("=" .repeat(70));
        
        let orphanedCount = 0;
        for (const tdsId of tdsIds) {
            if (!deviceIds.has(tdsId)) {
                orphanedCount++;
                console.log(`\n   ❌ PROBLEM FOUND:`);
                console.log(`      Document ${tdsId} exists in "evaratds" collection`);
                console.log(`      But NOT in "devices" registry collection!`);
            }
        }

        if (orphanedCount === 0) {
            console.log(`\n   ✅ All TDS metadata has matching registry entries`);
        } else {
            console.log(`\n   ⚠️  Found ${orphanedCount} ORPHANED TDS metadata!`);
            console.log(`\n   WHY THIS HAPPENED:`);
            console.log(`   - Device was created in evaratds collection`);
            console.log(`   - But batch write to "devices" collection FAILED`);
            console.log(`   - Backend queries "devices" so TDS device is invisible`);
        }

        // Step 4: SOLUTION
        console.log(`\n4️⃣  SOLUTION:`);
        console.log("=" .repeat(70));
        
        if (orphanedCount > 0) {
            console.log(`\n   Run this to FIX:`);
            console.log(`   → node fix_orphaned_tds_devices.js`);
        } else {
            console.log(`\n   The database looks correct.`);
            console.log(`   The problem is in the API or frontend filtering.`);
        }

    } catch (error) {
        console.error("❌ Error:", error.message);
    } finally {
        process.exit(0);
    }
}

findRootCause();
