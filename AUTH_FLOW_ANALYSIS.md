# Authentication Flow Analysis & Root Cause of Superadmin Access Issues

## Executive Summary

This analysis reveals the complete authentication and authorization flow in the EvaraTech application. The **root cause of superadmin access failures** is almost certainly that **the superadmin user record does not exist in the Firestore `superadmins` collection**.

---

## 1. Backend Authentication Flow

### File: [`backend/src/middleware/auth.middleware.js`](backend/src/middleware/auth.middleware.js)

**Responsibility**: Verifies JWT tokens and resolves user role

#### Authentication Steps:
1. **Extract Token**: Gets Bearer token from `Authorization` header
2. **Verify JWT**: Uses Firebase Admin SDK to verify ID token
3. **Resolve User Data**: Queries Firestore using **priority-based lookup**:
   ```
   Priority 1: superadmins/{uid}        [Superadmin collection]
   Priority 2: customers/{uid}          [Customer collection by ID]
   Priority 3: customers[email]         [Customer collection by email]
   Fallback:   { role: "customer" }     [Default if not found]
   ```
4. **Normalize Role**: Trim whitespace, lowercase, remove spaces
   ```javascript
   const role = (userData.role || "customer").trim().toLowerCase().replace(/\s+/g, "");
   // Examples: "Super Admin" → "superadmin" ✓
   ```
5. **Cache Result**: Store resolved role in Redis cache for 180 seconds (3 min)

#### Output (req.user object):
```javascript
req.user = {
  uid: "google-oauth2|1234567890",
  role: "superadmin",              // Normalized
  display_name: "Admin Name",
  community_id: "comm123",
  customer_id: "cust456"
}
```

---

## 2. Frontend Authentication Flow

### File: [`client/src/context/AuthContext.tsx`](client/src/context/AuthContext.tsx)

**Responsibility**: Manages user authentication state in React

#### Authentication Steps:
1. **Listen for Auth State**: `onAuthStateChanged()` from Firebase Auth
2. **Fetch Profile**: When user logs in, call `fetchProfile(firebaseUser)`
3. **Firestore Lookup** (same priority order as backend):
   ```typescript
   // First check superadmins collection
   const superadminRef = doc(db, "superadmins", firebaseUser.uid);
   const superadminSnap = await getDoc(superadminRef);
   
   if (superadminSnap.exists()) {
       profileData = superadminSnap.data();
   } else {
       // Fall back to customers collection
       const customerRef = doc(db, "customers", firebaseUser.uid);
       const customerSnap = await getDoc(customerRef);
       if (customerSnap.exists()) {
           profileData = customerSnap.data();
       }
   }
   ```
4. **Normalize Role** (identical to backend):
   ```typescript
   const role: UserRole = rawRole
       .trim()
       .toLowerCase()
       .replace(/\s+/g, "") as UserRole;
   ```
5. **Set User State**:
   ```typescript
   return {
       id: firebaseUser.uid,
       email: firebaseUser.email,
       displayName: displayName,
       role: role,           // "superadmin" | "customer" | "community_admin"
       plan: plan,
       community_id: profile?.community_id
   }
   ```

#### Type Definition:
```typescript
export type UserRole = "superadmin" | "community_admin" | "customer";

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  plan: UserPlan;
  community_id?: string;
}
```

---

## 3. RBAC (Role-Based Access Control) Middleware

### File: [`backend/src/middleware/rbac.middleware.js`](backend/src/middleware/rbac.middleware.js)

**Responsibility**: Enforces role-based authorization on API endpoints

#### Rules:
```javascript
const rbac = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(403).json({ error: "Access denied: No role assigned." });
        }

        const userRole = req.user.role;

        // SUPERADMIN ALWAYS HAS FULL ACCESS
        if (userRole === "superadmin") {
            return next();  // ← Bypass all other checks
        }

        // Check if role is in allowedRoles
        if (allowedRoles && allowedRoles.length > 0) {
            if (!allowedRoles.includes(userRole)) {
                return res.status(403).json({ 
                    error: `Access denied: Requires one of [${allowedRoles.join(", ")}]` 
                });
            }
        }

        // Viewers cannot modify data
        if (userRole === "viewer" && ["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
            return res.status(403).json({ error: "Access denied: Viewers cannot modify data." });
        }

        next();
    };
};
```

#### Applied Globally:
```javascript
// backend/src/server.js
const globalSaaSAuth = [requireAuth, tenantCheck, rbac()];

app.use("/api/v1/admin", globalSaaSAuth, adminRoutes);
app.use("/api/v1/nodes", globalSaaSAuth, nodesRoutes);
app.get("/api/v1/admin/hierarchy", globalSaaSAuth, getHierarchy);
```

---

## 4. Tenant Check Middleware

### File: [`backend/src/middleware/tenantCheck.middleware.js`](backend/src/middleware/tenantCheck.middleware.js)

**Responsibility**: Enforces data isolation between tenants

#### Logic:
```javascript
const tenantCheck = (req, res, next) => {
    // SUPERADMIN BYPASSES ALL TENANT CHECKS
    if (!req.user || req.user.role === "superadmin") {
        return next();  // ← Full access
    }

    // Other users: locked to their tenant namespace
    const tenantId = req.user.community_id || req.user.customer_id || req.user.uid;
    req.tenant_id = tenantId;

    // Prevent cross-tenant mutations
    if (["POST", "PUT"].includes(req.method) && req.body) {
        if (req.body.tenant_id && req.body.tenant_id !== req.tenant_id) {
            return res.status(403).json({ 
                error: "Tenant Isolation Violation" 
            });
        }
    }

    next();
};
```

---

## 5. Frontend Route Protection

### File: [`client/src/components/ProtectedRoute.tsx`](client/src/components/ProtectedRoute.tsx)

**Responsibility**: Enforces role-based access to frontend routes

#### Logic:
```typescript
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles, allowedPlans }) => {
    const { user, loading, isAuthenticated } = useAuth();

    if (loading) {
        return <div>Loading...</div>;
    }

    if (!isAuthenticated || !user) {
        return <Navigate to="/login" replace />;  // ← Not logged in
    }

    // THIS IS THE KEY CHECK FOR SUPERADMIN ACCESS
    if (allowedRoles && !allowedRoles.includes(user.role)) {
        return <Navigate to="/dashboard" replace />;  // ← SILENT REDIRECT!
    }

    return <Outlet />;
};
```

#### Superadmin Routes (App.tsx):
```javascript
{/* Admin Routes (Super Admin Only) */}
<Route element={<ProtectedRoute allowedRoles={['superadmin']} />}>
    <Route path="/superadmin" element={<AdminLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="customers" element={<AdminCustomers />} />
        <Route path="zones" element={<ZonesOverview />} />
        <Route path="customers/:customerId" element={<CustomerDetails />} />
        <Route path="zones/:regionId/customers" element={<ZoneCustomers />} />
        <Route path="config" element={<AdminConfig />} />
    </Route>
</Route>
```

---

## 6. Admin Routes

### File: [`backend/src/routes/admin.routes.js`](backend/src/routes/admin.routes.js)

**Responsibility**: REST API endpoints for admin functions

#### Endpoints:
```javascript
// Zones
POST   /api/v1/admin/zones
GET    /api/v1/admin/zones
GET    /api/v1/admin/zones/:id
PUT    /api/v1/admin/zones/:id
DELETE /api/v1/admin/zones/:id

// Customers
POST   /api/v1/admin/customers
GET    /api/v1/admin/customers
GET    /api/v1/admin/customers/:id
PUT    /api/v1/admin/customers/:id
DELETE /api/v1/admin/customers/:id

// Nodes
POST   /api/v1/admin/nodes
GET    /api/v1/admin/nodes
PUT    /api/v1/admin/nodes/:id
DELETE /api/v1/admin/nodes/:id

// Device Controls (Superadmin only)
PATCH  /api/v1/admin/devices/:id/visibility
PATCH  /api/v1/admin/devices/:id/parameters

// Aggregate
GET    /api/v1/admin/dashboard/init
```

**All routes protected by**: `[requireAuth, tenantCheck, rbac()]`

---

## 7. Admin Frontend Pages

### Page Hierarchy:
```
client/src/pages/
├── Login.tsx                          ← Role selection & auth
├── Admin.tsx                          ← Customer admin page
└── admin/
    ├── AdminDashboard.tsx            ← Superadmin dashboard
    ├── AdminCustomers.tsx            ← Customer management
    ├── AdminConfig.tsx               ← System config
    └── hierarchy/
        ├── ZonesOverview.tsx         ← Zone management
        ├── ZoneCustomers.tsx         ← Zone customers
        └── CustomerDetails.tsx       ← Customer details
```

#### Role-Based Access Checks (Frontend):
```typescript
// AdminDashboard.tsx
if (user?.role !== "superadmin") {
    return <Navigate to="/dashboard" replace />;
}

// AdminCustomers.tsx
if (user?.role === "superadmin") {
    // Show superadmin-specific buttons
}
```

---

## 🔴 ROOT CAUSE: Why Superadmin Access Fails

### The Critical Problem
The **ProtectedRoute component silently redirects** when role check fails:

```typescript
if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;  // ← NO ERROR MESSAGE!
}
```

### Why It Silently Redirects
When a superadmin user tries to access `/superadmin/dashboard`:

1. **Frontend ProtectedRoute checks**: `allowedRoles=['superadmin']`
2. **Checks user.role**: If role is "customer" instead of "superadmin"
3. **Condition fails**: `!['superadmin'].includes('customer')` = TRUE
4. **Redirects silently**: `<Navigate to="/dashboard" replace />`
5. **User sees**: Dashboard instead of admin page (no error, very confusing)

### Why User Role Is "customer" Instead of "superadmin"

#### Most Likely Cause: Superadmin Document Missing
```
Firestore Structure:
├── superadmins/
│   └── {uid}  <- THIS DOCUMENT DOESN'T EXIST
│       ├── role: "superadmin"
│       ├── display_name: "Admin Name"
│       └── email: "admin@example.com"
├── customers/
│   └── {uid}
│       ├── role: "customer"
│       └── ...
```

**Flow when document is missing**:
1. AuthContext calls `getDoc(db, "superadmins", uid)`
2. Document doesn't exist → `superadminSnap.exists() = false`
3. Falls back to checking customers collection
4. If customer record exists with `role: "customer"` → user becomes customer
5. If customer record also missing → defaults to `role: "customer"`
6. User object has `role: "customer"` ← WRONG!

---

## 🎯 Debugging Checklist

### ✅ Step 1: Verify Superadmin Exists in Firestore
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Firestore Database → Collections
4. Look for **"superadmins"** collection
5. Inside, there should be a document with ID = `{user_uid}`
6. Document must have field: `role` with value: `superadmin`

**If it doesn't exist** → This is the problem!

### ✅ Step 2: Check Browser Console on Login
1. Open DevTools (F12)
2. Go to Console tab
3. Log in as superadmin
4. Look for log entries from AuthContext
5. Check the extracted user object's role

### ✅ Step 3: Verify API Calls Include Token
1. Open DevTools → Network tab
2. Make any admin API call
3. Check headers → `Authorization: Bearer {token}`
4. Token must be valid Firebase ID token

### ✅ Step 4: Check Backend Console
1. Look for backend logs during API call
2. Should see: `[Auth] Resolved user {uid} => role: 'superadmin'`
3. If showing `role: 'customer'` → backend is also not finding superadmin

### ✅ Step 5: Clear Caches
- **Backend**: Role cached for 180 seconds → restart service
- **Frontend**: Browser cache might retain old user object → F5 refresh
- **Redis**: If redis cache corrupted → `redis-cli FLUSHDB`

---

## 🛠️ Solutions

### Solution 1: Create Superadmin Document (MOST LIKELY FIX)
1. Go to Firebase Console
2. Firestore Database → Collections
3. Click **"+ Start collection"**
4. **Collection ID**: `superadmins`
5. **First document** → **Document ID**: {user_uid}
   - Get UID from Firebase Auth console (Users tab)
6. Add fields:
   ```
   role: "superadmin"
   display_name: "Admin Name"
   email: "admin@example.com"
   community_id: "" (optional)
   ```
7. Click Save
8. **Restart backend service** to clear role cache
9. **Refresh browser** and log back in

### Solution 2: Fix Role Field if Exists
If superadmin document exists but role isn't working:
1. Check field is named exactly `role` (not `user_role`, `role_type`, etc.)
2. Check value is exactly `superadmin` (lowercase, no spaces)
3. Examples that work: ✓ "superadmin", ✓ "Superadmin", ✓ "SUPERADMIN"
4. Examples that don't work: ✗ "super_admin", ✗ "admin", ✗ "superadmin "

### Solution 3: Fix Firestore Data
If there are typos in stored data:
```javascript
// WRONG (will NOT work)
{
  "role": "Super Admin"     // ← Has space - normalized to "superadmin" ✓
  "role": "admin"           // ← Wrong value ✗
  "user_role": "superadmin" // ← Wrong field name ✗
}

// CORRECT (will work)
{
  "role": "superadmin"      // ← Exact match ✓
}
```

### Solution 4: Check Firebase Auth Setup
1. Ensure the user exists in Firebase Auth (Console → Users tab)
2. Ensure user's email matches in both Auth and Firestore
3. Ensure user can sign in with correct email/password

---

## 📊 Comparison: Backend vs Frontend Role Resolution

| Aspect | Backend | Frontend |
|--------|---------|----------|
| **Location** | `auth.middleware.js` | `AuthContext.tsx` |
| **Firestore Collection 1** | `superadmins/{uid}` | `db.collection("superadmins")` |
| **Firestore Collection 2** | `customers/{uid}` | `db.collection("customers")` |
| **Role Normalization** | Same: trim, lowercase, no-space | Same: trim, lowercase, no-space |
| **Caching** | Redis, 180 seconds | React state (until logout) |
| **Run on** | Every API request | Every login |
| **Failure Mode** | Returns 403 error | Silently redirects |

---

## 🚨 Current Observations

### Working Elements ✓
- JWT verification is working
- Role normalization is consistent
- RBAC logic is correct
- ProtectedRoute component is enforcing role checks
- Backend middleware is protecting API endpoints

### Broken Elements ✗
- Superadmin document likely missing from Firestore
- User defaults to "customer" role when superadmin record not found
- ProtectedRoute silently redirects (very confusing UX)
- No error message tells user what went wrong

---

## 📝 Summary

**The root cause is almost certainly**: "superadmins" collection document doesn't exist in Firestore.

**Quick Fix**: Create a Firestore document in the "superadmins" collection with the superadmin user's UID as the document ID, and include a field `role: "superadmin"`.

**Why it fails so silently**: The authentication system is designed to be defensive and defaults to "customer" role when user record is not found, rather than throwing an error. Combined with the ProtectedRoute's silent redirect, this makes the issue very hard to diagnose.

