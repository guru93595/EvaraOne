const { db, admin } = require("./src/config/firebase.js");

async function diagnoseAndRepair() {
    console.log("=== Node Metadata Diagnosis & Repair ===");
    
    try {
        const snapshot = await db.collection("devices").get();
        
        for (const doc of snapshot.docs) {
            const registry = doc.data();
            const id = doc.id;
            const displayName = (registry.displayName || registry.label || registry.name || id).toLowerCase();
            
            console.log(`\nChecking Node: ${registry.label || id} [${id}]`);
            
            // 1. Determine Correct Collection/Type
            let targetType = registry.device_type || 'evaratank';
            let targetTemplate = registry.analytics_template || 'EvaraTank';
            
            if (displayName.includes('himalaya') || displayName.includes('flow') || displayName.includes('pump')) {
                targetType = 'evaraflow';
                targetTemplate = 'EvaraFlow';
            } else if (displayName.includes('obh') || displayName.includes('krb') || displayName.includes('tank') || displayName.includes('sump')) {
                targetType = 'evaratank';
                targetTemplate = 'EvaraTank';
            }
            
            console.log(`   Registry Type: ${registry.device_type} -> Target: ${targetType}`);
            console.log(`   Registry Template: ${registry.analytics_template} -> Target: ${targetTemplate}`);

            // 2. Fetch Metadata from ALL possible collections to find where it is
            const collections = ['evaratank', 'evaraflow', 'evaradeep', 'nodes'];
            let currentMeta = null;
            let currentCollection = null;
            
            for (const coll of collections) {
                const metaDoc = await db.collection(coll).doc(id).get();
                if (metaDoc.exists) {
                    currentMeta = metaDoc.data();
                    currentCollection = coll;
                    break;
                }
            }

            if (!currentMeta) {
                console.log(`   [!] Metadata NOT FOUND in any collection. Creating default...`);
                currentMeta = {};
            } else {
                console.log(`   [OK] Metadata found in collection: ${currentCollection}`);
            }

            // 3. Prepare Correct Payload
            const updatePayload = {
                ...currentMeta,
                thingspeak_channel_id: registry.thingspeak_channel_id || currentMeta.thingspeak_channel_id,
                thingspeak_read_api_key: registry.thingspeak_read_api_key || currentMeta.thingspeak_read_api_key,
            };

            // Specific Fixes
            if (displayName.includes('himalaya')) {
                updatePayload.thingspeak_channel_id = "3275001";
                updatePayload.thingspeak_read_api_key = "KF4EBSLE9D1ZXTWJ";
                updatePayload.flow_rate_field = "field4";
                updatePayload.meter_reading_field = "field5";
                // Ensure it has flow meter specific fields
                updatePayload.device_type = "evaraflow";
            } else if (displayName.includes('obh')) {
                updatePayload.thingspeak_channel_id = "2613745";
                updatePayload.thingspeak_read_api_key = "KHJXYW6LEIDQ1TJA";
                updatePayload.sensor_field_mapping = { "levelField": "field2" };
                updatePayload.depth = 1.2;
                updatePayload.tank_size = 16632;
                updatePayload.device_type = "evaratank";
            }

            // 4. Update Registry (in 'devices')
            await db.collection("devices").doc(id).update({
                device_type: targetType,
                analytics_template: targetTemplate,
                thingspeak_channel_id: updatePayload.thingspeak_channel_id,
                thingspeak_read_api_key: updatePayload.thingspeak_read_api_key
            });

            // 5. Update/Move Metadata
            if (currentCollection && currentCollection !== targetType) {
                console.log(`   [->] Moving metadata from ${currentCollection} to ${targetType}`);
                await db.collection(targetType).doc(id).set(updatePayload);
                await db.collection(currentCollection).doc(id).delete();
            } else {
                console.log(`   [*] Updating metadata in ${targetType}`);
                await db.collection(targetType).doc(id).set(updatePayload, { merge: true });
            }
        }
        
        console.log("\n=== Repair Complete ===");
        console.log("Please restart the background workers to pick up changes.");

    } catch (err) {
        console.error("Diagnosis failed:", err.message);
    }
}

diagnoseAndRepair().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
