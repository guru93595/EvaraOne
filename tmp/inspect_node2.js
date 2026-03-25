const admin = require('firebase-admin');
const serviceAccount = require('./backend/serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function inspectNode() {
    try {
        const nodeDoc = await db.collection('nodes').doc('Node-2').get();
        if (!nodeDoc.exists) {
            console.log('Node-2 not found in nodes collection');
            return;
        }
        const nodeData = nodeDoc.data();
        console.log('Node metadata:', JSON.stringify(nodeData, null, 2));

        const type = nodeData.device_type.toLowerCase();
        const metaDoc = await db.collection(type).doc('Node-2').get();
        if (!metaDoc.exists) {
            console.log(`Metadata not found in ${type} collection`);
            return;
        }
        console.log(`${type} metadata:`, JSON.stringify(metaDoc.data(), null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

inspectNode();
