/**
 * Debug script: Check what's ACTUALLY stored in Firestore for Flow devices
 * Run: node check_flow_device_config.js
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

// Initialize Firebase
const serviceAccount = require('./backend/src/config/firebase-key.json');
initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();

async function checkFlowDevices() {
    console.log('\n🔍 Checking Flow Devices in Firestore...\n');

    // Get all devices with device_type = evaraflow
    const devicesRef = db.collection('devices');
    const flowDevices = await devicesRef.where('device_type', '==', 'evaraflow').limit(5).get();

    console.log(`Found ${flowDevices.docs.length} Flow devices in registry\n`);

    for (const doc of flowDevices.docs) {
        const registry = doc.data();
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Device ID: ${doc.id}`);
        console.log(`Device Type: ${registry.device_type}`);
        console.log(`${'='.repeat(60)}`);

        // Get metadata from evaraflow collection
        const metaRef = db.collection('evaraflow').doc(doc.id);
        const metaDoc = await metaRef.get();

        if (!metaDoc.exists) {
            console.log('❌ Metadata NOT FOUND');
            continue;
        }

        const metadata = metaDoc.data();
        console.log('\n📋 METADATA FIELDS:');
        console.log('   All keys:', Object.keys(metadata).sort());
        
        console.log('\n🔌 THINGSPEAK CONFIG:');
        console.log('   thingspeak_channel_id:', metadata.thingspeak_channel_id || '❌NOT_FOUND');
        console.log('   thingspeak_read_api_key:', metadata.thingspeak_read_api_key ? '✅ PRESENT' : '❌NOT_FOUND');
        console.log('   fields:', metadata.fields);
        console.log('   sensor_field_mapping:', metadata.sensor_field_mapping);

        console.log('\n📊 FULL METADATA:');
        console.log(JSON.stringify(metadata, null, 2));
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Debug complete');
    process.exit(0);
}

checkFlowDevices().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
