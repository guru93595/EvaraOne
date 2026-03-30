require('dotenv').config();
const { db } = require('./src/config/firebase.js');

async function resolveDevice(id) {
    const directDoc = await db.collection('devices').doc(id).get();
    if (directDoc.exists) return directDoc;
    const q1 = await db.collection('devices').where('device_id', '==', id).limit(1).get();
    if (!q1.empty) return q1.docs[0];
    const q2 = await db.collection('devices').where('node_id', '==', id).limit(1).get();
    if (!q2.empty) return q2.docs[0];
    return null;
}

async function run() {
    const id = process.argv[2] || 'EV-TNK-002';
    console.log('\n=== DIAGNOSING DELETE FOR:', id, '===\n');
    
    const deviceDoc = await resolveDevice(id);
    if (!deviceDoc) { console.log('NOT FOUND via resolveDevice'); process.exit(1); }
    
    const data = deviceDoc.data();
    const docId = deviceDoc.id;
    console.log('Firestore docId:', docId);
    console.log('device_type:', data.device_type);
    console.log('customer_id:', data.customer_id);
    console.log('zone_id:', data.zone_id);
    
    const allCols = ['evaratank', 'evaradeep', 'evaraflow'];
    console.log('\nMetadata search:');
    for (const col of allCols) {
        const m = await db.collection(col).doc(docId).get();
        console.log(' ', col + '/' + docId + ':', m.exists ? 'EXISTS ✅' : 'NOT FOUND ❌');
    }
    
    if (data.customer_id) {
        const c = await db.collection('customers').doc(data.customer_id).get();
        console.log('\n  customers/' + data.customer_id + ':', c.exists ? 'EXISTS ✅' : 'NOT FOUND ❌');
    }
    if (data.zone_id) {
        const z = await db.collection('zones').doc(data.zone_id).get();
        console.log('  zones/' + data.zone_id + ':', z.exists ? 'EXISTS ✅' : 'NOT FOUND ❌');
    }
    
    // Now try the full transaction to find the exact error
    console.log('\nAttempting read-only transaction to simulate deleteNode...');
    try {
        await db.runTransaction(async (t) => {
            const devRef = db.collection('devices').doc(docId);
            const devSnap = await t.get(devRef);
            console.log('  t.get(devices/' + docId + '):', devSnap.exists ? 'OK ✅' : 'MISSING ❌');
            
            for (const col of allCols) {
                const ref = db.collection(col).doc(docId);
                const s = await t.get(ref);
                console.log('  t.get(' + col + '/' + docId + '):', s.exists ? 'EXISTS ✅' : 'NOT FOUND');
            }
            throw new Error('ROLLBACK_OK');
        });
    } catch(e) {
        if (e.message === 'ROLLBACK_OK') {
            console.log('\n✅ Transaction reads all succeeded — issue is elsewhere');
        } else {
            console.error('\n❌ REAL TRANSACTION ERROR:');
            console.error('  code:', e.code);
            console.error('  message:', e.message);
        }
    }
    
    process.exit(0);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
