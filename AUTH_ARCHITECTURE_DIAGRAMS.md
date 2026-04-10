# Authentication & Authorization Architecture Diagram

## 1. Overall System Architecture

```
┌─────────────────┐
│   Browser/App   │
│  (React SPA)    │
└────────┬────────┘
         │
         │ 1. User logs in
         │
         ↓
┌─────────────────────────────────┐
│   Firebase Authentication       │
│  (Email/Password in this case)  │ ← Signs user in, returns JWT
└────────┬────────────────────────┘
         │ 2. JWT + UID returned
         │
         ├─────────────────────────────────────────────┐
         │                                             │
         ↓                                             ↓
┌─────────────────────────┐              ┌──────────────────────────┐
│ Frontend AuthContext    │              │ Backend requireAuth      │
│  - Queries Firestore    │              │  - Verifies JWT          │
│  - Gets user profile    │              │  - Queries Firestore     │
│  - Sets user state      │              │  - Resolves user role    │
│  - Does NOT make API    │              │  - Attaches to req.user  │
│    call for role data   │              │  - Caches role 180s      │
└──────────┬──────────────┘              └──────────┬───────────────┘
           │                                        │
           │ 3. Sets user.role                      │ 4. Sets req.user.role
           │    in React state                      │    on request context
           │                                        │
           ↓                                        ↓
    ┌──────────────┐                         ┌──────────────┐
    │ ProtectedRoute            tenantCheck middleware
    │  Checks:                  Checks:
    │  - user.role in           - req.user.role
    │    allowedRoles?          - Enforces
    │  - If NO: redirect        tenancy
    │    to /dashboard          isolation
    │  - If YES: load page
    └──────────────┘                         └──────────────┘
           │                                        │
           ↓                                        ↓
    ┌──────────────┐                         ┌──────────────┐
    │ Page loads   │                         │ rbac()
    │ (e.g.,       │                         │ Middleware
    │ Admin.tsx)   │                         │ Checks:
    │              │                         │ - req.user.role
    │              │                         │ - Superadmin
    │              │                         │   allows all
    │              │                         │ - Others checked
    │              │                         │   against
    │              │                         │   allowedRoles
    └──────────────┘                         └──────────────┘
```

---

## 2. Frontend Authentication Flow (Detailed)

```
User Logs In
    │
    ├─ Email: admin@example.com
    ├─ Password: ••••••••
    └─ Role Selected: "superadmin"
         │
         ↓
Firebase Auth.signInWithEmailAndPassword(email, password)
         │
         ├─ Email/Password verified ✓
         ├─ User found in Firebase Auth DB ✓
         └─ JWT generated
         │
         ↓
AuthContext.onAuthStateChanged() triggered
    Receives: firebaseUser { uid, email, ... }
         │
         ├─ uid = "google-oauth2|1234567890"
         ├─ email = "admin@example.com"
         └─ name = "Ritik"
         │
         ↓
fetchProfile(firebaseUser) called
    [Makes Firestore queries]
         │
         ├─ Query 1: Check "superadmins" collection
         │   doc(db, "superadmins", "google-oauth2|1234567890")
         │
         ├─ IF EXISTS: ✓
         │   profileData = {
         │      role: "superadmin",
         │      display_name: "Ritik Admin",
         │      email: "admin@example.com",
         │      community_id: "comm_123"
         │   }
         │
         ├─ IF NOT EXISTS: ✗
         │   Query 2: Check "customers" collection
         │   doc(db, "customers", "google-oauth2|1234567890")
         │
         ├─── IF EXISTS: profileData from customers
         ├─── IF NOT EXISTS: profileData = null
         │
         ↓
extractUser(firebaseUser, profileData) called
    │
    ├─ Extract displayName from profile
    ├─ Extract role, NORMALIZE:
    │   role = "super admin"  (or "SUPERADMIN" or "Super Admin")
    │                  ↓
    │         role = role.trim()            → " super admin "
    │                        ↓
    │         role = role.toLowerCase()     → "super admin"
    │                        ↓
    │         role = role.replace(/\s+/g, "") → "superadmin"
    │
    ├─ Extract plan from profile
    └─ Extract community_id from profile
         │
         ↓
User object created:
    {
      id: "google-oauth2|1234567890",
      email: "admin@example.com",
      displayName: "Ritik Admin",
      role: "superadmin",          ← KEY FIELD
      plan: "pro",
      community_id: "comm_123"
    }
         │
         ↓
setUser(userObject) called
    [Sets React state]
         │
         ├─ user context updated
         ├─ All components using useAuth() re-render
         └─ Login page redirects based on role:
            if (role === "superadmin") → Navigate to "/superadmin/dashboard"
            else → Navigate to "/dashboard"
         │
         ↓
App.tsx Routes component receives new user state
    │
    ├─ <Route element={<ProtectedRoute allowedRoles={['superadmin']} />}>
    │      ├─ ProtectedRoute checks: user.role in allowedRoles?
    │      ├─ YES: "superadmin" in ['superadmin'] ✓
    │      └─ Renders: <AdminLayout /> with nested routes
    │         ├─ /superadmin → Dashboard
    │         ├─ /superadmin/customers → Admin page
    │         ├─ /superadmin/zones → Zones page
    │         └─ etc.
    │
    └─ SUCCESS: Admin dashboard loads ✓
```

---

## 3. Backend Authentication Flow (Detailed)

```
Frontend makes API request (with Bearer token)
    │
    ├─ GET /api/v1/admin/zones
    ├─ Header: Authorization: Bearer eyJhbGc...
    └─ Body: {...}
         │
         ↓
Express middleware chain (in order):
    app.use("/api/v1/admin", globalSaaSAuth, adminRoutes)
         │
         ├─ globalSaaSAuth = [requireAuth, tenantCheck, rbac()]
         │
         ↓ 1. requireAuth middleware
    │
    ├─ Extract Bearer token from header
    │   Authorization = "Bearer eyJhbGc..."
    │   token = "eyJhbGc..."
    │
    ├─ Verify JWT with Firebase Admin SDK
    │   admin.auth().verifyIdToken(token)
    │
    ├─ IF valid: decodedToken = {
    │      uid: "google-oauth2|1234567890",
    │      email: "admin@example.com",
    │      name: "Ritik",
    │      ...
    │   }
    │
    ├─ IF invalid: Return 401 "Invalid token"
    │
    ├─ Check cache for role
    │   cache.get("auth_role_google-oauth2|1234567890")
    │
    ├─ IF cached: userData = {role: "superadmin", ...}
    │   AND skip Firestore lookup
    │
    ├─ IF NOT cached: Query Firestore
    │   │
    │   ├─ Priority 1: superadmins collection
    │   │   const userDoc = await db
    │   │     .collection("superadmins")
    │   │     .doc("google-oauth2|1234567890")
    │   │     .get();
    │   │
    │   ├─ IF found: userData = userDoc.data()
    │   │   userData = {
    │   │     role: "superadmin",
    │   │     display_name: "Ritik",
    │   │     ...
    │   │   }
    │   │
    │   ├─ IF NOT found: Priority 2: customers collection
    │   │   │
    │   │   ├─ IF found: userData from customers
    │   │   ├─ IF NOT found: Priority 3: search by email
    │   │   └─ IF all fail: userData = { role: "customer" }
    │   │
    │   └─ Cache result for 180 seconds (3 min)
    │
    ├─ Normalize role
    │   role = (userData.role || "customer")
    │            .trim()
    │            .toLowerCase()
    │            .replace(/\s+/g, "")
    │   Result: "superadmin"
    │
    ├─ Attach to request
    │   req.user = {
    │     uid: decodedToken.uid,
    │     role: "superadmin",
    │     display_name: "Ritik",
    │     community_id: "comm_123",
    │     customer_id: "cust_456"
    │   }
    │
    └─ Call next() → Continue to next middleware
         │
         ↓ 2. tenantCheck middleware
    │
    ├─ Check: Is user a superadmin?
    │   if (req.user.role === "superadmin") → next() [BYPASS]
    │
    ├─ If NOT superadmin: Resolve tenant ID
    │   req.tenant_id = req.user.community_id || req.user.customer_id || req.user.uid
    │
    ├─ For POST/PUT requests: Validate payload
    │   if (req.body.tenant_id !== req.tenant_id) → Error 403
    │
    └─ Call next() → Continue to RBAC
         │
         ↓ 3. rbac() middleware
    │
    ├─ Check: Is user a superadmin?
    ├─ if (req.user.role === "superadmin") {
    │      return next();  // ALLOW ALL REQUEST
    │   }
    │
    ├─ Check: Is user's role in allowedRoles?
    │   if (allowedRoles && !allowedRoles.includes(req.user.role))
    │      return 403 "Access Denied"
    │
    ├─ Check: Is user a viewer trying to modify?
    │   if (req.user.role === "viewer" && ["POST","PUT","DELETE","PATCH"])
    │      return 403 "Viewers cannot modify data"
    │
    └─ Call next() → Continue to actual route handler
         │
         ↓ Route Handler (e.g., getZones)
    │
    ├─ req.user is available with all role info
    ├─ Can make Firestore queries for zones
    ├─ Role-based filtering can be applied
    └─ Return response with zones
         │
         ↓
Response sent to frontend with zones data
```

---

## 4. Role Resolution Decision Tree

```
User logs in with email: admin@example.com
                    │
                    ↓
            Get UID from Firebase
            uid = "google-oauth2|1234567890"
                    │
                    ├─────────────────────────────────────┐
                    │                                     │
           FRONTEND                              BACKEND
           (ReactContext)                  (requireAuth middleware)
                    │                                     │
                    ↓                                     ↓
    Query: superadmins/{uid}            Query: superadmins/{uid}
            │                                   │
    ┌───────┴───────┐                  ┌───────┴───────┐
    │               │                  │               │
  FOUND           NOT FOUND          FOUND           NOT FOUND
    │               │                  │               │
    ↓               ↓                  ↓               ↓
  Use data      Fall back        Use data        Fall back
  from          to customers     from            to customers
  superadmins   collection       superadmins     collection
    │               │                  │               │
    │       ┌───────┴──────┐           │       ┌───────┴──────┐
    │       │              │           │       │              │
    │     FOUND          NOT FOUND     │     FOUND          NOT FOUND
    │       │              │           │       │              │
    │       ↓              ↓           │       ↓              ↓
    │     Use data     Fall back       │     Use data     Cache
    │ from customers  to email         │ from customers  as customer
    │       │         search           │       │
    │       │          │               │       │
    │   ┌───┴──────┐   │               │   ┌───┴──────┐
    │   │          │   │               │   │          │
    │ FOUND      NOT   │               │ FOUND      NOT
    │   │        FOUND │               │   │        FOUND
    │   │          │   │               │   │          │
    │   │          ├───┘               │   │          ├───┐
    │   │          │                   │   │          │   │
    │   ↓          ↓                   │   ↓          ↓   │
    │ Extract    Default              │ Extract    Default
    │ role:      to:                  │ role:      to:
    │ "superadmin" role: "customer"   │ (varies)   role: "customer"
    │   │          │                  │   │          │
    └───┼──────────┼──────────────────┴───┼──────────┼──────┐
        │          │                      │          │      │
        └──────────┴──────────────────────┴──────────┘      │
                      │                                     │
                      ↓                                     │
            Normalize role:                                │
    Input: "super admin", "SUPERADMIN", "Superadmin"     │
           ↓                                               │
    1. .trim() → remove leading/trailing spaces          │
           ↓                                               │
    2. .toLowerCase() → all lowercase                     │
           ↓                                               │
    3. /\s+/g → remove ALL spaces                         │
           ↓                                               │
    Output: "superadmin" ✓                                 │
                      │                                     │
        ┌─────────────┴─────────────┐                      │
        │                           │                      │
    FRONTEND                     BACKEND                   │
    setUser({                  req.user = {                │
      role: "superadmin"         role: "superadmin"        │
    })                         })                          │
        │                           │                      │
        ↓                           ├──────────────────────┤
    ProtectedRoute            Store in Redis cache        │
    checks:                   for 180 seconds             │
    user.role in              │                           │
    allowedRoles['superadmin'] rbac() allows all ops      │
        │                           │                      │
        ├─ YES ✓ → Load page       ├─ YES ✓ → Return data │
        └─ NO ✗ → Redirect         └─ NO ✗ → Return 403   │
          to /dashboard              error                  │
                                                            │
        ┌────────────────────────────────────────────────────┘
        │
        ↓
    RESULT: User can access superadmin features
    
    
ALTERNATE FLOW (IF superadmin/{uid} NOT FOUND):
    
    Both frontend and backend default to "customer" role
        │
        ↓
    Frontend: user.role = "customer"
        │
        ├─ ProtectedRoute checks: "customer" in ['superadmin']?
        ├─ NO ✗
        └─ Silent redirect to /dashboard
        
    Backend: req.user.role = "customer"
        │
        ├─ rbac checks: "customer" allowed?
        ├─ NO ✗
        └─ Return 403 "Access Denied: Requires [superadmin]"
```

---

## 5. Data Flow: Single Request Journey

```
SCENARIO: Superadmin clicks "Get Zones" button

┌──────────────────────────────────────────────────────────────┐
│ 1. FRONTEND (React Component)                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  const { user } = useAuth();                                │
│  // user.role = "superadmin" ✓                             │
│                                                              │
│  const fetchZones = async () => {                          │
│    const token = await user.getIdToken();                  │
│    // token = JWT signed by Firebase                       │
│                                                              │
│    const response = await fetch(                           │
│      '/api/v1/admin/zones',                               │
│      {                                                     │
│        headers: {                                         │
│          'Authorization': `Bearer ${token}`  ← KEY         │
│        }                                                   │
│      }                                                     │
│    );                                                      │
│  }                                                          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                         │
                         │ HTTP Request
                         │ GET /api/v1/admin/zones
                         │ Authorization: Bearer eyJhbGc...
                         │
                         ↓
┌──────────────────────────────────────────────────────────────┐
│ 2. BACKEND (Express Server)                                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Route: app.use("/api/v1/admin", globalSaaSAuth, adminRoutes)
│  Middleware chain: [requireAuth, tenantCheck, rbac()]       │
│                                                              │
│  Step 1: requireAuth middleware                            │
│  ├─ Extract token from header                              │
│  ├─ Verify with Firebase: JWT valid?                      │
│  ├─ Decode: uid = "google-oauth2|1234567890"             │
│  ├─ Query Firestore "superadmins/{uid}"                   │
│  ├─ Found! userData = {role: "superadmin", ...}            │
│  ├─ Normalize: role = "superadmin"                        │
│  ├─ Attach to request: req.user = {role: "superadmin"...} │
│  └─ next() → Continue                                      │
│                                                              │
│  Step 2: tenantCheck middleware                            │
│  ├─ Check: user.role === "superadmin"?                    │
│  ├─ YES! → Bypass all tenant checks                       │
│  └─ next() → Continue                                      │
│                                                              │
│  Step 3: rbac() middleware                                 │
│  ├─ Check: user.role === "superadmin"?                    │
│  ├─ YES! → Allow all operations                           │
│  └─ next() → Continue                                      │
│                                                              │
│  Step 4: Route handler (getZones)                          │
│  ├─ req.user available with role = "superadmin"           │
│  ├─ Query Firestore for zones (all zones visible)          │
│  ├─ No filtering applied (superadmin sees everything)      │
│  └─ Send response                                          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                         │
                         │ HTTP Response
                         │ [
                         │   {id: "zone1", name: "North", ...},
                         │   {id: "zone2", name: "South", ...},
                         │   ...
                         │ ]
                         │
                         ↓
┌──────────────────────────────────────────────────────────────┐
│ 3. FRONTEND (React Component)                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  response.json() returns zones array                       │
│                                                              │
│  Render zones on page:                                    │
│  ├─ Admin Dashboard loads                                  │
│  ├─ Shows all zones                                        │
│  ├─ All CRUD buttons visible (superadmin can delete, etc)  │
│  └─ SUCCESS ✓                                              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 6. Error Scenarios

### Scenario A: User is "customer" instead of "superadmin"

```
User navigates to /superadmin/dashboard
    │
    ↓
App.tsx route: <ProtectedRoute allowedRoles={['superadmin']} />
    │
    ├─ Check: user?.role === "superadmin"?
    ├─ user.role = "customer" (because superadmin record doesn't exist)
    ├─ "customer" in ['superadmin']?
    ├─ NO ✗
    │
    ↓
return <Navigate to="/dashboard" replace />
    │
    ↓
User sees dashboard, NOT admin page
No error message, very confusing!
```

### Scenario B: User has valid superadmin role but tries customer-only feature

```
User role: "superadmin" ✓
Makes API call: DELETE /api/v1/admin/zones/123
    │
    ↓
Backend middleware: globalSaaSAuth = [requireAuth, tenantCheck, rbac()]
    │
    ├─ requireAuth: Verified ✓ (token valid)
    ├─ tenantCheck: Verified ✓ (superadmin bypasses)
    ├─ rbac(): Verified ✓ (superadmin allows all)
    │
    ↓
Route handler executes
    │
    ↓
Zone deleted, response 200 OK ✓

Superadmins always succeed because rbac() returns next() immediately
```

### Scenario C: Invalid token or expired token

```
User's token expired
Makes API call with expired token in header:
Authorization: Bearer eyJhbGc... (EXPIRED)
    │
    ↓
Backend: requireAuth middleware
    │
    ├─ Extract token
    ├─ Try to verify with Firebase: admin.auth().verifyIdToken(token)
    ├─ FAILS! Token expired
    │
    ↓
return res.status(401).json({
  error: "Invalid token",
  details: "Token is expired"
})
    │
    ↓
Frontend receives 401 error
    │
    ├─ React query likely retries
    ├─ Or user is prompted to log back in
    └─ AuthContext might detect and redirect to /login
```

---

## 7. Caching Impact

```
First Request (Cold Cache):
  User makes API call
    │
    ├─ requireAuth checks cache
    ├─ Cache miss: cache.get("auth_role_{uid}") returns null
    ├─ Query Firestore: 1 read operation
    │  (superadmins collection)
    ├─ Resolve role = "superadmin"
    └─ Store in cache with TTL=180s
         │
         ↓
      ttl = 3 minutes ─→ [data stored in Redis] ←─ expires

Second Request (Warm Cache) - within 3 minutes:
  User makes another API call
    │
    ├─ requireAuth checks cache
    ├─ Cache HIT: cache.get("auth_role_{uid}") returns {role: "superadmin"}
    ├─ Skip Firestore query entirely (zero cost)
    └─ Continue with that role data
         │
         ↓
    Firestore cost: 0 reads (saved!)

Third Request - after 3 minutes:
  Cache expired (TTL=180s passed)
    │
    ├─ requireAuth checks cache
    ├─ Cache miss again
    ├─ Query Firestore again: 1 read operation
    └─ Store again in cache
         │
         ↓
    Cycle repeats

Impact:
- First 3 minutes: All requests use cache (0 Firestore reads after first)
- After 180s: New cache entry created
- If wrong role cached: Persist for 180 seconds until restart/FLUSHDB
```

---

## 8. Security Model

```
┌─────────────────────────────────────────┐
│ SUPERADMIN ROLE: Special Privileges     │
├─────────────────────────────────────────┤
│                                         │
│ Authentication:                         │
│  ✓ JWT must be valid                   │
│  ✓ User must exist in "superadmins"    │
│  ✓ Must have field role="superadmin"   │
│                                         │
│ Authorization:                          │
│  ✓ Bypass RBAC checks                   │
│  ✓ Bypass tenant isolation checks       │
│  ✓ Access all collections               │
│  ✓ Perform all operations (CRU​D)       │
│  ✓ View all data                        │
│                                         │
│ Limitations:                            │
│  • Still must have valid JWT (auth)     │
│  • Firestore rules still apply          │
│  • Rate limiting still applies          │
│                                         │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ CUSTOMER ROLE: Limited Privileges       │
├─────────────────────────────────────────┤
│                                         │
│ Authentication:                         │
│  ✓ JWT must be valid                   │
│  ✓ User must exist in "customers"      │
│                                         │
│ Authorization:                          │
│  ✗ Cannot access /api/v1/admin routes  │
│  ✗ Restricted to own tenant data only  │
│  • Can only see/modify own devices      │
│  • Cannot create/delete zones           │
│  • Cannot manage other customers        │
│                                         │
│ Cannot access:                          │
│  ✗ /superadmin routes (redirected)     │
│  ✗ Admin REST API                      │
│  ✗ Zone management                     │
│                                         │
└─────────────────────────────────────────┘

Zero Trust Model:
  Every request must include JWT ✓
  Every request role is verified ✓
  No implicit trust based on IP/session ✓
  Superadmin role verified from Firestore ✓
  (Not just a frontend flag)
```

