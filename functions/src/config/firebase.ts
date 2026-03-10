import * as admin from 'firebase-admin';

// Secure Firebase initialization using environment variables
const serviceAccountConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountConfig),
  });
}

export const db = admin.firestore();
export const auth = admin.auth();
export { admin };

// Secure configuration
export const config = {
  thingspeak: {
    apiKey: process.env.THINGSPEAK_API_KEY,
    baseUrl: "https://api.thingspeak.com",
  },
  encryption: {
    key: process.env.ENCRYPTION_KEY,
  },
};
