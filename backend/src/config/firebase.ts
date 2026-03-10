const admin = require('firebase-admin');

// Ensure we don't initialize twice if hot-reloading
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

module.exports = { db, admin };
