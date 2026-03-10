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

async function diagnostic() {
  console.log("--- Firebase Database Diagnostic ---");
  const collections = await db.listCollections();
  console.log(`Available collections: ${collections.map(c => c.id).join(", ")}`);

  for (const collection of collections) {
    console.log(`\nCollection: ${collection.id}`);
    const snapshot = await collection.limit(1).get();
    if (snapshot.empty) {
      console.log("  (Empty)");
      continue;
    }
    const doc = snapshot.docs[0];
    console.log(`  Sample Document ID: ${doc.id}`);
    console.log(`  Fields: ${Object.keys(doc.data()).join(", ")}`);
    if (collection.id === 'node' || collection.id === 'nodes') {
       console.log(`  Data: ${JSON.stringify(doc.data(), null, 2)}`);
    }
  }
}

diagnostic().catch(console.error);
