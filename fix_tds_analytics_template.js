/**
 * Fix: Add analytics_template to existing TDS devices
 * 
 * Why: TDS devices created before the fix don't have the analytics_template field,
 * so they don't show up on the dashboard when filtered by type.
 * 
 * Usage: node fix_tds_analytics_template.js
 */

const admin = require("firebase-admin");
const serviceAccount = require("./firebase-key.json"); // Add your firebase key

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://your-project.firebaseio.com"
});

const db = admin.firestore();

async function fixTDSDevices() {
    console.log("[FIX] Finding all TDS devices without analytics_template...");

    try {
        const devicesRef = db.collection("devices");
        const tdsDevices = await devicesRef
            .where("device_type", "==", "evaratds")
            .where("analytics_template", "==", "") // Missing or empty
            .get();

        if (tdsDevices.empty) {
            const allTDS = await devicesRef.where("device_type", "==", "evaratds").get();
            console.log(`[INFO] Found ${allTDS.size} TDS devices total`);
            
            // Check which ones are missing analytics_template
            let missingCount = 0;
            for (const doc of allTDS.docs) {
                if (!doc.data().analytics_template) {
                    missingCount++;
                    console.log(`  ❌ Device ${doc.id} missing analytics_template`);
                    
                    // Update it
                    await devicesRef.doc(doc.id).update({
                        analytics_template: "EvaraTDS"
                    });
                    console.log(`  ✅ Updated ${doc.id}`);
                }
            }
            
            console.log(`\n[DONE] Fixed ${missingCount} TDS devices`);
        } else {
            console.log(`[INFO] Found ${tdsDevices.size} TDS devices missing analytics_template`);
            
            // Update all of them
            const batch = db.batch();
            for (const doc of tdsDevices.docs) {
                batch.update(doc.ref, { analytics_template: "EvaraTDS" });
                console.log(`  ⚙️  Queued update for ${doc.id}`);
            }
            
            await batch.commit();
            console.log(`\n[DONE] Updated ${tdsDevices.size} TDS devices`);
        }

    } catch (error) {
        console.error("[ERROR]", error);
    } finally {
        process.exit(0);
    }
}

// Run the fix
fixTDSDevices();
