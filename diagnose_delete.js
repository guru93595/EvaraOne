// Run: node diagnose_delete.js EV-TNK-002
// This simulates exactly what deleteNode does for a tank node
require('dotenv').config({ path: './backend/.env' });

const { db } = require('./backend/src/config/firebase.js');

async function resolveDevice(id) {
    if (!id) return null;
    const directDoc = await db.collection("devices").doc(id).get();
    if (directDoc.exists) return directDoc;
    
    const q1 = await db.collection("devices").where("device_id", "==", id).limit(1).get();
    if (!q1.empty) return q1.docs[0];
    
    const q2 = await db.collection("devices").where("node_id", "==", id).limit(1).get();
    if (!q2.empty) return q2.docs[0];
    
    return null;
}

async function diagnose(hardwareId) {
    console.log(`\n🔍 Diagnosing delete for: "${hardwareId}"\n`);

    // Step 1: resolveDevice
    const deviceDoc = await resolveDevice(hardwareId);
    if (!deviceDoc || !deviceDoc.exists) {
        console.error('❌ resolveDevice returned null — device not found!');
        return;
    }
    const docId = deviceDoc.id;
    const data = deviceDoc.data();
    console.log('✅ Found device:');
    console.log('  Firestore docId:', docId);
    console.log('  device_type:', data.device_type);
    console.log('  customer_id:', data.customer_id);
    console.log('  zone_id:', data.zone_id);

    // Step 2: Check metadata in all collections
    const allCols = ['evaratank', 'evaradeep', 'evaraflow'];
    for (const col of allCols) {
        const metaDoc = await db.collection(col).doc(docId).get();
        console.log(`  Collection "${col}/${docId}":`, metaDoc.exists ? '✅ EXISTS' : '❌ NOT FOUND');
    }

    // Step 3: Check customer doc
    if (data.customer_id) {
        const custDoc = await db.collection('customers').doc(data.customer_id).get();
        console.log('  Customer doc:', custDoc.exists ? '✅ EXISTS' : '❌ NOT FOUND');
    }

    // Step 4: Check zone doc
    if (data.zone_id) {
        const zoneDoc = await db.collection('zones').doc(data.zone_id).get();
        console.log('  Zone doc:', zoneDoc.exists ? '✅ EXISTS' : '❌ NOT FOUND');
    }

    // Step 5: Try the FULL transaction (READ ONLY — won't delete)
    console.log('\n🔁 Simulating transaction (reads only)...');
    try {
        await db.runTransaction(async (transaction) => {
            const deviceRef = db.collection("devices").doc(docId);
            const snap = await transaction.get(deviceRef);
            console.log('  transaction.get(devices):', snap.exists ? '✅' : '❌');
            
            for (const col of allCols) {
                const ref = db.collection(col).doc(docId);
                const s = await transaction.get(ref);
                console.log(`  transaction.get(${col}):`, s.exists ? '✅ EXISTS' : '❌ NOT FOUND');
            }

            if (data.customer_id) {
                const custRef = db.collection("customers").doc(data.customer_id);
                const custSnap = await transaction.get(custRef);
                console.log('  transaction.get(customers):', custSnap.exists ? '✅' : '❌');
            }
            if (data.zone_id) {
                const zoneRef = db.collection("zones").doc(data.zone_id);
                const zoneSnap = await transaction.get(zoneRef);
                console.log('  transaction.get(zones):', zoneSnap.exists ? '✅' : '❌');
            }
            
            // Abort the transaction without writing (throw to rollback)
            throw new Error('DIAGNOSTIC_ABORT — not a real error, just rolling back reads');
        });
    } catch (err) {
        if (err.message.startsWith('DIAGNOSTIC_ABORT')) {
            console.log('\n✅ Transaction reads succeeded (rolled back intentionally)');
        } else {
            console.error('\n❌ TRANSACTION FAILED WITH REAL ERROR:');
            console.error('  Code:', err.code);
            console.error('  Message:', err.message);
        }
    }

    process.exit(0);
}

const id = process.argv[2];
if (!id) {
    console.error('Usage: node diagnose_delete.js <hardware-id>');
    console.error('Example: node diagnose_delete.js EV-TNK-002');
    process.exit(1);
}

diagnose(id).catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
});
