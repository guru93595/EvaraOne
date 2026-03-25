const { db } = require('../src/config/firebase-secure');

async function inspectCustomers() {
  try {
    console.log("--- Inspecting Customers ---");
    const snapshot = await db.collection("customers").limit(10).get();
    if (snapshot.empty) {
      console.log("No customers found in DB.");
      return;
    }
    snapshot.forEach(doc => {
      console.log(`Document ID: ${doc.id}`);
      const data = doc.data();
      console.log("Values:", {
        zone_id: data.zone_id,
        zoneId: data.zoneId,
        regionFilter: data.regionFilter,
        display_name: data.display_name,
        full_name: data.full_name
      });
      console.log("------------------------");
    });
  } catch (error) {
    console.error("Error inspecting customers:", error.message);
  } finally {
    process.exit(0);
  }
}

inspectCustomers();
