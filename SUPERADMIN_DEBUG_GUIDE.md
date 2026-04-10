# Superadmin Access Issue - Debugging Guide

## Quick Diagnosis Flow

```
Is superadmin silently redirected to /dashboard?
    ↓
YES → Navigate to /dashboard instead of /superadmin/dashboard
    ↓
Problem 1: User role is "customer" instead of "superadmin"
    ↓
Check: AuthContext extracting role correctly?
    → Open DevTools Console on login
    → Look for user object role value
    ↓
If role = "customer": User record missing from "superadmins" collection
    ↓
SOLUTION: Create superadmin document in Firestore
```

---

## Real Examples

### ✓ WORKING: Correct Superadmin Setup

**Firestore Structure**:
```
superadmins (collection)
├── "google-oauth2|1234567890" (document ID = user's uid)
│   ├── role: "superadmin"
│   ├── display_name: "Ritik Admin"
│   ├── email: "ritik@evaratech.com"
│   ├── community_id: ""
│   └── created_at: 2024-03-15T10:30:00Z
```

**Expected Flow**:
1. User logs in with email: `ritik@evaratech.com`
2. Firebase Auth returns uid: `google-oauth2|1234567890`
3. Frontend queries Firestore: `doc(db, "superadmins", "google-oauth2|1234567890")`
4. Document exists! → `profileData = { role: "superadmin", ... }`
5. `extractUser()` normalizes role → `"superadmin"`
6. `user.role === "superadmin"` ✓
7. ProtectedRoute allows access → `/superadmin/dashboard` loads ✓

---

### ✗ BROKEN: Missing Superadmin Document

**Firestore Structure**:
```
superadmins (collection)
    [EMPTY - no documents!]

customers (collection)
├── "google-oauth2|1234567890" (falls back here)
│   ├── role: "customer"
│   ├── display_name: "Ritik Admin"
│   └── email: "ritik@evaratech.com"
```

**Actual Flow**:
1. User logs in with email: `ritik@evaratech.com`
2. Firebase Auth returns uid: `google-oauth2|1234567890`
3. Frontend queries Firestore: `doc(db, "superadmins", "google-oauth2|1234567890")`
4. Document NOT found! → `superadminSnap.exists() = false`
5. Falls back to: `doc(db, "customers", "google-oauth2|1234567890")`
6. Customer document exists → `profileData = { role: "customer", ... }`
7. `extractUser()` normalizes role → `"customer"`
8. `user.role === "customer"` ✗
9. ProtectedRoute check fails → redirects to `/dashboard` silently ✗

---

## Debug Logging

### Method 1: Browser Console Logging

**Add to `client/src/context/AuthContext.tsx`** (around line 60-80):

```typescript
const extractUser = useCallback(
    (firebaseUser: FirebaseUser, profile?: any): User => {
        const displayName = profile?.display_name || profile?.full_name || firebaseUser.displayName || "User";
        
        let rawRole = (profile?.role as string) || "customer";
        const role: UserRole = rawRole
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "") as UserRole;

        // ADD THIS DEBUG LOG
        console.log("[AuthContext] Profile Data:", {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            raw_role_from_firestore: profile?.role,
            normalized_role: role,
            profile_data: profile
        });

        return {
            id: firebaseUser.uid,
            email: firebaseUser.email || "",
            displayName,
            role,
            plan: (profile?.plan as UserPlan) || "pro",
            community_id: profile?.community_id,
        };
    },
    [],
);
```

**To read the log**:
1. Open DevTools (F12)
2. Go to Console tab
3. Log in as superadmin
4. Look for: `[AuthContext] Profile Data:`
5. Check the `normalized_role` value

---

### Method 2: Firestore Query Test

**Run in browser console**:
```javascript
import { doc, getDoc } from "firebase/firestore";
import { db } from "./lib/firebase";

// Replace with actual uid
const uid = "google-oauth2|YOUR_UID_HERE";

async function debugRole() {
    console.log("Checking superadmins collection...");
    const superRef = doc(db, "superadmins", uid);
    const superSnap = await getDoc(superRef);
    
    if (superSnap.exists()) {
        console.log("✓ Found in superadmins:", superSnap.data());
    } else {
        console.log("✗ Not found in superadmins");
        
        console.log("Checking customers collection...");
        const custRef = doc(db, "customers", uid);
        const custSnap = await getDoc(custRef);
        
        if (custSnap.exists()) {
            console.log("✓ Found in customers:", custSnap.data());
        } else {
            console.log("✗ Not found in customers either");
        }
    }
}

debugRole();
```

---

### Method 3: Backend API Test

**Using curl**:
```bash
# 1. Get Firebase ID token (from browser console after login)
# Open DevTools → Application → Cookies → Copy the "firebase_token" value

TOKEN="eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMyIsInR5cCI6IkpXVCJ9..."

# 2. Make authenticated API request
curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:3000/api/v1/admin/zones

# 3. Check backend console for log:
#    [Auth] Resolved user {uid} => role: 'superadmin'
#    If it shows 'customer' instead, the problem is confirmed
```

---

### Method 4: Backend Console Logging

**Add to `backend/src/middleware/auth.middleware.js`** (around line 50):

```javascript
const requireAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing auth token" });
    }

    const idToken = authHeader.split(" ")[1];

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        
        // DEBUG: Log decoded token
        console.log("[Auth] Decoded Token UID:", decodedToken.uid);
        
        // ... Firestore lookup ...
        
        let userData = await cache.get(cacheKey);

        if (!userData) {
            console.log("[Auth] Cache MISS for", decodedToken.uid, "- querying Firestore...");
            
            // Priority 1: Superadmins by ID
            let userDoc = await db.collection("superadmins").doc(decodedToken.uid).get();
            console.log("[Auth] Superadmins lookup:", userDoc.exists ? "FOUND" : "NOT FOUND");
            
            if (userDoc.exists) {
                userData = userDoc.data();
                console.log("[Auth] Superadmin data:", userData);
            } else {
                // Priority 2: Customers by ID
                userDoc = await db.collection("customers").doc(decodedToken.uid).get();
                console.log("[Auth] Customers lookup:", userDoc.exists ? "FOUND" : "NOT FOUND");
                
                if (userDoc.exists) {
                    userData = { ...userDoc.data(), id: userDoc.id };
                    console.log("[Auth] Customer data:", userData);
                } else {
                    console.log("[Auth] No user data found - defaulting to customer");
                    userData = { role: "customer" };
                }
            }
        } else {
            console.log("[Auth] Cache HIT for", decodedToken.uid);
        }
        
        const role = (userData.role || "customer").trim().toLowerCase().replace(/\s+/g, "");
        console.log(`[Auth] Resolved user ${decodedToken.uid} => role: '${role}'`);
        
        req.user = { ...decodedToken, role, ... };
        next();
    } catch (error) {
        console.error("[Auth Middleware] Error:", error.message);
        return res.status(401).json({ error: "Invalid token" });
    }
};
```

**To read the log**:
1. Start backend server: `npm start` or `npm run dev`
2. Make authenticated API request (from browser or curl)
3. Check terminal where backend is running
4. Look for: `[Auth]` logs

---

## Step-by-Step Fix

### Step 1: Verify Current State

**Check what role the user currently has**:
```javascript
// In browser console after login:
const user = window.localStorage.getItem("user");
console.log(JSON.parse(user).role);
// Should show: "superadmin" or "customer"
```

### Step 2: Get User's UID

**From Firebase Console**:
1. Go to Firebase Console
2. Authentication → Users
3. Find the superadmin user
4. Copy the UID value (looks like: `google-oauth2|1234567890` or `abc123xyz`)

**Or from browser console**:
```javascript
// After login, run in console:
const auth = firebase.auth();
console.log(auth.currentUser.uid);
```

### Step 3: Create Superadmin Document

**Via Firebase Console UI**:
1. Go to Firestore Database
2. Click Collections
3. If "superadmins" collection doesn't exist:
   - Click "Start collection"
   - Name: `superadmins`
   - Click Continue
4. First document:
   - Document ID: **{paste the UID from Step 2}**
   - Fields:
     ```
     Field Name    Type        Value
     role          String      superadmin
     display_name  String      {Admin Name}
     email         String      {admin@example.com}
     ```
5. Click Save

**Via Firestore Admin SDK** (if you have backend access):
```javascript
// backend/tmp/create_superadmin.js
const admin = require("firebase-admin");
const serviceAccount = require("../config/serviceAccountKey.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const uid = "google-oauth2|1234567890"; // ← Replace with actual UID

async function createSuperadmin() {
    try {
        await db.collection("superadmins").doc(uid).set({
            role: "superadmin",
            display_name: "Admin Name",
            email: "admin@example.com",
            created_at: new Date(),
            community_id: ""
        });
        console.log("✓ Superadmin created");
    } catch (err) {
        console.error("✗ Error creating superadmin:", err);
    }
}

createSuperadmin();
```

### Step 4: Clear Caches

**Frontend**:
1. Open DevTools
2. Storage → Cookies → Delete all
3. Reload page (Ctrl+F5 or Cmd+Shift+R)

**Backend** (if running locally):
1. Restart backend service
2. Or if you have redis-cli: `redis-cli FLUSHDB`

**Or wait**: Cache expires after 180 seconds

### Step 5: Test Access

1. Log in as superadmin
2. Should be redirected to: `/superadmin/dashboard`
3. Check browser DevTools Console for logs
4. If still failing, review the debug logs from Steps 1-3

---

## Common Issues & Fixes

### Issue 1: "I create superadmin document but still get redirected"

**Possible causes**:
- [ ] Cache not cleared (wait 3 minutes or restart backend)
- [ ] Browser cache not cleared (Ctrl+Shift+Delete)
- [ ] Document created in wrong collection (check name is "superadmins")
- [ ] Document ID is wrong (must match user's exact UID)
- [ ] Field name is wrong (must be exactly "role", not "user_role")
- [ ] Field value is wrong (must be "superadmin", not "admin")

**Fix**:
1. Verify document exists in Firestore Console
2. Verify field names and values exactly
3. Clear all caches (browser + backend)
4. Log out and log back in
5. Check browser console for [AuthContext] logs

---

### Issue 2: "Backend shows role: 'superadmin' but frontend shows 'customer'"

**Possible causes**:
- [ ] Frontend is using cached user object
- [ ] Frontend Firestore query is failing (permissions issue)
- [ ] Document exists in backend but not visible to frontend

**Fix**:
1. Clear browser storage completely
2. Close browser completely
3. Reopen and log back in
4. Check if frontend can query Firestore (check browser console for Firestore errors)

---

### Issue 3: "No 'superadmins' collection in Firestore"

**This is expected!** Collections are created lazily when you add the first document.

**Fix**:
1. Go to Firestore Console
2. Click "Add collection"
3. Type: `superadmins`
4. Click Continue
5. Add first document with user's UID

---

### Issue 4: "Error: Cannot read property 'exists' of undefined"

**Cause**: Firestore permissions issue or document reference invalid

**Fix**:
1. Check Firestore security rules allow reads from superadmins collection
2. Verify UID is valid (not null or empty)
3. Check frontend has Firestore initialized: `import { db } from "../lib/firebase"`

---

## Verification Checklist

Before declaring the fix complete, verify all these:

- [ ] Superadmin document exists in `superadmins` collection
- [ ] Document ID = user's UID (exactly)
- [ ] Field `role` exists with value `superadmin`
- [ ] Backend can be started without errors
- [ ] Frontend can be loaded without errors
- [ ] User can log in with superadmin credentials
- [ ] Browser console shows `[AuthContext] Profile Data:` with `normalized_role: "superadmin"`
- [ ] User is NOT redirected to `/dashboard`
- [ ] User can access `/superadmin/dashboard`
- [ ] Admin page loads and displays zones/customers
- [ ] API calls include Bearer token
- [ ] Backend console shows `[Auth] Resolved user ... => role: 'superadmin'`

---

## Additional Resources

### File Locations
- Frontend Auth: [client/src/context/AuthContext.tsx](client/src/context/AuthContext.tsx#L60)
- Backend Auth: [backend/src/middleware/auth.middleware.js](backend/src/middleware/auth.middleware.js#L10)
- Route Protection: [client/src/components/ProtectedRoute.tsx](client/src/components/ProtectedRoute.tsx#L35)
- Superadmin Routes: [client/src/App.tsx](client/src/App.tsx#L110)
- Admin Routes API: [backend/src/routes/admin.routes.js](backend/src/routes/admin.routes.js)

### Firebase Documentation
- [Authentication](https://firebase.google.com/docs/auth)
- [Firestore Database](https://firebase.google.com/docs/firestore)
- [Security Rules](https://firebase.google.com/docs/firestore/security/start)
- [ID Tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens)

