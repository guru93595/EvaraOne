const admin = require("firebase-admin");
const path = require("path");
const { db } = require("d:/MAIN/backend/src/config/firebase.js");

async function checkOBH() {
    const snapshot = await db.collection("devices").get();
    for (const doc of snapshot.docs) {
        const data = doc.data();
        console.log("Device:", doc.id, "Name:", data.name, "Label:", data.label, "DisplayName:", data.displayName);
        if (data.name && data.name.includes("OBH") || data.displayName && data.displayName.includes("OBH")) {
            console.log(">>> FOUND OBH:", doc.id);
            const type = data.device_type.toLowerCase();
            const metaDoc = await db.collection(type).doc(doc.id).get();
            if (metaDoc.exists) {
                console.log("Metadata:", metaDoc.data());
            } else {
                console.log("No metadata!");
            }
        }
    }
}
checkOBH().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
