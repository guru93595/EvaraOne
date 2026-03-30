const { db, admin } = require("./src/config/firebase.js");

async function fixHimalayaDevice() {
    console.log("=== Fixing HIMALAYA Device Categorization ===");
    
    try {
        const deviceId = "HIMALAYA";
        
        // 1. Check current registry state
        const deviceDoc = await db.collection("devices").doc(deviceId).get();
        if (!deviceDoc.exists) {
            console.log(`[ERROR] Device ${deviceId} not found in registry`);
            return;
        }
        
        const registry = deviceDoc.data();
        console.log(`Current registry type: ${registry.device_type}`);
        console.log(`Current registry template: ${registry.analytics_template}`);
        
        // 2. Check where metadata currently exists
        const collections = ['evaratank', 'evaraflow', 'evaradeep'];
        let currentCollection = null;
        let currentMetadata = null;
        
        for (const coll of collections) {
            const metaDoc = await db.collection(coll).doc(deviceId).get();
            if (metaDoc.exists) {
                currentCollection = coll;
                currentMetadata = metaDoc.data();
                console.log(`Found metadata in collection: ${coll}`);
                break;
            }
        }
        
        if (!currentMetadata) {
            console.log(`[ERROR] No metadata found for device ${deviceId}`);
            return;
        }
        
        // 3. Prepare correct flow metadata
        const flowMetadata = {
            ...currentMetadata,
            // Ensure flow-specific fields
            flow_rate_field: currentMetadata.flow_rate_field || "field4",
            meter_reading_field: currentMetadata.meter_reading_field || "field5",
            thingspeak_channel_id: currentMetadata.thingspeak_channel_id || "3275001",
            thingspeak_read_api_key: currentMetadata.thingspeak_read_api_key || "KF4EBSLE9D1ZXTWJ",
            // Remove tank-specific fields
            water_level_field: undefined,
            depth_field: undefined,
            tank_size: undefined,
            capacity: undefined,
            length_m: undefined,
            breadth_m: undefined,
            height_m: undefined,
            radius_m: undefined,
            tank_shape: undefined,
        };
        
        // Clean up undefined fields
        Object.keys(flowMetadata).forEach(key => {
            if (flowMetadata[key] === undefined) {
                delete flowMetadata[key];
            }
        });
        
        // 4. Update registry to correct type
        console.log("Updating registry...");
        await db.collection("devices").doc(deviceId).update({
            device_type: "evaraflow",
            analytics_template: "EvaraFlow",
            asset_type: "EvaraFlow",
            assetType: "EvaraFlow",
            sub_type: "Pump",
            subType: "Pump"
        });
        
        // 5. Move metadata to correct collection
        if (currentCollection !== "evaraflow") {
            console.log(`Moving metadata from ${currentCollection} to evaraflow...`);
            
            // Create in evaraflow
            await db.collection("evaraflow").doc(deviceId).set(flowMetadata);
            
            // Delete from old collection
            await db.collection(currentCollection).doc(deviceId).delete();
            
            console.log(`Successfully moved metadata from ${currentCollection} to evaraflow`);
        } else {
            console.log("Updating metadata in evaraflow...");
            await db.collection("evaraflow").doc(deviceId).set(flowMetadata, { merge: true });
        }
        
        // 6. Verify the fix
        console.log("\n=== Verification ===");
        const updatedRegistry = await db.collection("devices").doc(deviceId).get();
        const updatedMeta = await db.collection("evaraflow").doc(deviceId).get();
        
        console.log(`Registry type: ${updatedRegistry.data().device_type}`);
        console.log(`Registry template: ${updatedRegistry.data().analytics_template}`);
        console.log(`Metadata collection: evaraflow (exists: ${updatedMeta.exists})`);
        
        if (updatedMeta.exists) {
            const meta = updatedMeta.data();
            console.log(`Flow rate field: ${meta.flow_rate_field}`);
            console.log(`Meter reading field: ${meta.meter_reading_field}`);
        }
        
        console.log("\n=== Fix Complete ===");
        console.log("HIMALAYA device is now correctly categorized as EvaraFlow");
        console.log("Please restart any background workers to ensure changes take effect");
        
    } catch (err) {
        console.error("Fix failed:", err.message);
        console.error("Stack:", err.stack);
    }
}

// Run the fix
fixHimalayaDevice().then(() => process.exit(0)).catch(e => { 
    console.error(e); 
    process.exit(1); 
});
