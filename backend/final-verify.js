const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const serviceAccountPath = path.join(__dirname, "serviceAccount.json");
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function finalVerification() {
  console.log("--- Final Database Verification ---");
  const collections = await db.listCollections();
  const ids = collections.map(c => c.id);
  console.log(`Collections: ${ids.join(", ")}`);

  const coreFields = ['device_id', 'device_type', 'label', 'node_id', 'zone_id', 'community_id', 'customer_id'];
  const devSnap = await db.collection("devices").limit(1).get();
  if (!devSnap.empty) {
    const data = devSnap.docs[0].data();
    console.log(`\n'devices' Sample Fields: ${Object.keys(data).join(", ")}`);
    const missing = coreFields.filter(f => !Object.keys(data).includes(f));
    const extra = Object.keys(data).filter(f => ['status', 'online', 'offline', 'active', 'inactive'].includes(f));
    console.log(`  Missing Required Fields: ${missing.length ? missing.join(", ") : "None"}`);
    console.log(`  Prohibited Fields Present: ${extra.length ? extra.join(", ") : "None"}`);
  }

  const tankSnap = await db.collection("evaratank").limit(1).get();
  if (!tankSnap.empty) {
    const data = tankSnap.docs[0].data();
    console.log(`\n'evaratank' Sample Fields: ${Object.keys(data).join(", ")}`);
  }
}

finalVerification().catch(console.error);
