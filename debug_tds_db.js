/**
 * Debug: Check exactly what's in the database for TDS devices
 * This shows the actual values and identifies the exact problem
 */

const admin = require("firebase-admin");

try {
    admin.initializeApp();
} catch (e) {
    // Already initialized
}

const db = admin.firestore();

async function debugTDS() {
    console.log("\n🔍 [DEBUG] Comprehensive TDS Device Check\n");
    console.log("=" .repeat(60));

    try {
        // Step 1: Check DEVICES collection (registry)
        console.log("\n1️⃣  DEVICES COLLECTION (Registry):");
        console.log("-".repeat(60));
        
        const allDevices = await db.collection("devices").get();
        console.log(`   Total devices in registry: ${allDevices.size}`);
        
        const tdsItems = [];
        allDevices.forEach(doc => {
            const data = doc.data();
            const deviceType = data.device_type || "UNDEFINED";
            const assetType = data.assetType || "UNDEFINED";
            
            console.log(`\n   📄 Doc ID: ${doc.id}`);
            console.log(`      device_type: "${deviceType}"`);
            console.log(`      assetType: "${assetType}"`);
            console.log(`      analytics_template: "${data.analytics_template || 'MISSING'}"`);
            console.log(`      device_id: "${data.device_id}"`);
            console.log(`      customer_id: "${data.customer_id}"`);
            
            if (deviceType === "evaratds" || assetType === "EvaraTDS" || assetType === "evaratds") {
                tdsItems.push({ id: doc.id, ...data });
            }
        });

        console.log(`\n   ✅ Found ${tdsItems.length} TDS items in registry`);

        // Step 2: Check EVARATDS collection (metadata)
        console.log("\n2️⃣  EVARATDS COLLECTION (Metadata):");
        console.log("-".repeat(60));
        
        const tdsMetadata = await db.collection("evaratds").get();
        console.log(`   Total documents: ${tdsMetadata.size}`);
        
        tdsMetadata.forEach(doc => {
            console.log(`\n   📊 Metadata Doc ID: ${doc.id}`);
            const data = doc.data();
            console.log(`      label: "${data.label}"`);
            console.log(`      device_name: "${data.device_name}"`);
            console.log(`      device_id: "${data.device_id}"`);
            console.log(`      configuration.type: "${data.configuration?.type}"`);
            console.log(`      created_at: "${data.created_at}"`);
        });

        // Step 3: Check if registry matches metadata
        console.log("\n3️⃣  CROSS-CHECK (Registry vs Metadata):");
        console.log("-".repeat(60));
        
        if (tdsItems.length > 0) {
            for (const regItem of tdsItems) {
                const metaDoc = await db.collection("evaratds").doc(regItem.id).get();
                if (metaDoc.exists) {
                    console.log(`\n   ✅ ${regItem.id}: Both registry AND metadata exist`);
                } else {
                    console.log(`\n   ❌ ${regItem.id}: Registry exists but METADATA IS MISSING!`);
                }
            }
        }

        // Step 4: Show what API would return
        console.log("\n4️⃣  SIMULATED API RESPONSE:");
        console.log("-".repeat(60));
        
        if (tdsItems.length > 0) {
            console.log(`\n   The getNodes API would inject analytics_template:`);
            for (const item of tdsItems) {
                let template = item.analytics_template;
                if (!template) {
                    const dt = (item.device_type || "").toLowerCase();
                    if (dt === "evaratds") template = "EvaraTDS";
                    else template = "COMPUTED: " + template;
                }
                console.log(`\n   📤 Device ${item.id}:`);
                console.log(`      analytics_template: "${template}"`);
            }
        } else {
            console.log(`\n   ⚠️  NO TDS DEVICES FOUND IN REGISTRY!`);
        }

        // Step 5: Summary
        console.log("\n" + "=".repeat(60));
        console.log("📋 SUMMARY:");
        console.log("=".repeat(60));
        
        if (tdsItems.length === 0) {
            console.log("❌ PROBLEM: TDS device is NOT in 'devices' registry collection");
            console.log("📌 ACTION: Check if device was created in 'evaratds' but not in 'devices'");
        } else if (tdsItems.length > 0) {
            let allHaveTemplate = tdsItems.every(t => t.analytics_template);
            if (allHaveTemplate) {
                console.log("✅ All TDS devices have analytics_template set - DATABASE IS CORRECT");
            } else {
                console.log("⚠️  Some TDS devices missing analytics_template - API WILL INJECT IT");
            }
        }

    } catch (error) {
        console.error("❌ Error:", error.message);
    } finally {
        process.exit(0);
    }
}

debugTDS();
