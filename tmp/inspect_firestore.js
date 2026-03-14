const { db } = require("./backend/src/config/firebase");

async function inspectData() {
  console.log("--- Inspecting Customers ---");
  const customers = await db.collection("customers").get();
  customers.docs.forEach(doc => {
    console.log(`ID: ${doc.id} | Data: ${JSON.stringify(doc.data())}`);
  });

  console.log("\n--- Inspecting Devices Registry ---");
  const devices = await db.collection("devices").get();
  devices.docs.forEach(doc => {
    console.log(`ID: ${doc.id} | Data: ${JSON.stringify(doc.data())}`);
  });

  console.log("\n--- Inspecting EvaraTank Metadata ---");
  const tanks = await db.collection("evaratank").get();
  tanks.docs.forEach(doc => {
    console.log(`ID: ${doc.id} | Data: ${JSON.stringify(doc.data())}`);
  });

  console.log("\n--- Inspecting EvaraDeep Metadata ---");
  const deeps = await db.collection("evaradeep").get();
  deeps.docs.forEach(doc => {
    console.log(`ID: ${doc.id} | Data: ${JSON.stringify(doc.data())}`);
  });

  console.log("\n--- Inspecting EvaraFlow Metadata ---");
  const flows = await db.collection("evaraflow").get();
  flows.docs.forEach(doc => {
    console.log(`ID: ${doc.id} | Data: ${JSON.stringify(doc.data())}`);
  });
}

inspectData().catch(console.error);
