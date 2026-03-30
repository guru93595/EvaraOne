require('dotenv').config({ path: './.env' });
const { db, admin } = require("./src/config/firebase.js");

async function repairCustomer(email) {
    console.log(`Searching for customer: ${email}`);
    
    try {
        // 1. Find the Firestore document by email
        const customerSnap = await db.collection("customers").where("email", "==", email).get();
        if (customerSnap.empty) {
            console.log("No customer found in Firestore with that email.");
            return;
        }
        
        const customerDoc = customerSnap.docs[0];
        const customerData = customerDoc.data();
        const oldId = customerDoc.id;
        
        console.log(`Found legacy document: ${oldId}`);
        
        // 2. Find the Auth user by email
        let uid;
        try {
            const authUser = await admin.auth().getUserByEmail(email);
            uid = authUser.uid;
            console.log(`Found Auth UID: ${uid}`);
        } catch (e) {
            console.log(`Auth user not found for ${email}. Creating one...`);
            const newUser = await admin.auth().createUser({
                email: email,
                password: "Password123!", // Temporary
                displayName: customerData.display_name || customerData.full_name
            });
            uid = newUser.uid;
            console.log(`Created Auth UID: ${uid}`);
        }
        
        // 3. Move document if needed (Random ID -> UID)
        if (oldId !== uid) {
            console.log(`Aligning document ID: ${oldId} -> ${uid}`);
            await db.collection("customers").doc(uid).set({
                ...customerData,
                uid: uid,
                id: uid,
                customerId: uid
            });
            await db.collection("customers").doc(oldId).delete();
        } else {
            console.log("Document ID already matches UID.");
            await db.collection("customers").doc(uid).update({ uid: uid });
        }
        
        // 4. Update all associated devices
        console.log("Searching for associated devices...");
        const devicesSnap = await db.collection("devices").where("customer_id", "==", oldId).get();
        const deviceIds = customerData.device_ids || [];
        
        const allDeviceIds = new Set([...deviceIds]);
        devicesSnap.docs.forEach(d => allDeviceIds.add(d.id));
        
        console.log(`Found ${allDeviceIds.size} total devices to repair.`);
        
        for (const deviceId of allDeviceIds) {
            console.log(`Updating device ${deviceId} -> customer_id: ${uid}`);
            await db.collection("devices").doc(deviceId).update({
                customer_id: uid,
                is_active: true
            });
        }
        
        console.log("Repair complete!");
        
    } catch (err) {
        console.error("Repair failed:", err);
    }
}

repairCustomer("cos@evaratech.com");
