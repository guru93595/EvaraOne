const { db } = require('./backend/src/config/firebase');

async function inspectNode() {
    try {
        console.log('Fetching Node-2 from nodes collection...');
        const nodeDoc = await db.collection('nodes').doc('Node-2').get();
        if (!nodeDoc.exists) {
            console.log('Node-2 not found in nodes collection');
            return;
        }
        const nodeData = nodeDoc.data();
        console.log('Node metadata:', JSON.stringify(nodeData, null, 2));

        const type = nodeData.device_type.toLowerCase();
        console.log(`Fetching Node-2 from ${type} collection...`);
        const metaDoc = await db.collection(type).doc('Node-2').get();
        if (!metaDoc.exists) {
            console.log(`Metadata not found in ${type} collection`);
            return;
        }
        console.log(`${type} metadata:`, JSON.stringify(metaDoc.data(), null, 2));
    } catch (e) {
        console.error('Error during inspection:', e);
    } finally {
        process.exit();
    }
}

inspectNode();
