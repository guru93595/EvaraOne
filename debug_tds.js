const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, 'backend', '.env') });
const privateKey = process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined;

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey,
        })
    });
}

const db = admin.firestore();

async function checkTDS() {
    console.log("--- Checking Devices ---");
    const devices = await db.collection("devices").where("device_type", "==", "evaratds").get();
    for (const doc of devices.docs) {
        const data = doc.data();
        console.log(`DEVICE DocID: ${doc.id}`);
        console.log(`  device_id: ${data.device_id}`);
        console.log(`  node_id:   ${data.node_id}`);
        console.log(`  label:     ${data.label || data.displayName}`);
        
        const meta = await db.collection("evaratds").doc(doc.id).get();
        if (meta.exists) {
            console.log(`  METADATA FOUND for DocID: ${doc.id}`);
            const mData = meta.data();
            console.log(`    ThingSpeak Channel: ${mData.thingspeak_channel_id}`);
        } else {
            console.log(`  METADATA MISSING for DocID: ${doc.id}`);
        }
    }
    process.exit(0);
}

checkTDS();
