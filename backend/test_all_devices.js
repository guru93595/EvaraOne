require('dotenv').config({ path: __dirname + '/.env' });
const { db } = require('./src/config/firebase-secure');

async function run() {
  const snap = await db.collection('devices').get();
  const devices = snap.docs.map(d => ({id: d.id, ...d.data()}));
  console.log("Total devices:", devices.length);
  const himalaya = devices.filter(d => JSON.stringify(d).toLowerCase().includes('himalaya') || JSON.stringify(d).toLowerCase().includes('him'));
  console.log("Matches:", JSON.stringify(himalaya, null, 2));
  process.exit(0);
}
run().catch(console.error);
