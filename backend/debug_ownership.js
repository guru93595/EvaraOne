const { db } = require('./src/config/firebase');

async function debugCustomerOwnership() {
    const customerEmail = "cos@evaratech.com";
    console.log(`Debugging ownership for customer: ${customerEmail}`);

    try {
        // 1. Get Customer Doc
        const custSnapshot = await db.collection('customers').where('email', '==', customerEmail).get();
        if (custSnapshot.empty) {
            console.log("Customer not found in collection.");
            return;
        }
        const customer = custSnapshot.docs[0].data();
        const customerIdFromDoc = customer.customer_id || customer.customerId || custSnapshot.docs[0].id;
        console.log("Customer Data:", {
            id: custSnapshot.docs[0].id,
            customer_id: customer.customer_id,
            customerId: customer.customerId,
            resolved_id: customerIdFromDoc
        });

        // 2. Get Node Docs
        const nodeIds = ["EV-FLW-002", "EV-TNK-002"];
        for (const nodeId of nodeIds) {
            const nodeDoc = await db.collection('devices').doc(nodeId).get();
            if (!nodeDoc.exists) {
                console.log(`Node ${nodeId} not found in 'devices' collection.`);
                continue;
            }
            const node = nodeDoc.data();
            const type = node.device_type;
            
            console.log(`\nNode: ${nodeId} (Type: ${type})`);
            console.log(`- Registry: customer_id=${node.customer_id}, customerId=${node.customerId}`);

            if (type) {
                const metaDoc = await db.collection(type.toLowerCase()).doc(nodeId).get();
                if (metaDoc.exists) {
                    const meta = metaDoc.data();
                    console.log(`- Metadata (${type.toLowerCase()}): customer_id=${meta.customer_id}, customerId=${meta.customerId}`);
                    const metaOwnerId = meta.customer_id || meta.customerId;
                    if (metaOwnerId !== customerIdFromDoc) {
                        console.log(`[!] MISMATCH OR MISSING: Metadata ownership (${metaOwnerId}) does not match customer resolved_id (${customerIdFromDoc}).`);
                    } else {
                        console.log(`[*] MATCH: Metadata ownership matches customer.`);
                    }
                } else {
                    console.log(`- Metadata (${type.toLowerCase()}): NOT FOUND`);
                }
            }
        }
    } catch (err) {
        console.error("Debug script failed:", err.message);
    }
}

debugCustomerOwnership().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
