# PHASE 2 DEPLOYMENT GUIDE: Device Visibility Enforcement

## Overview

This guide walks through deploying the Phase 2 critical fix: universal device visibility enforcement across all device endpoints.

**Deployment Time**: ~30 minutes
**Downtime**: None (rolling update compatible)
**Testing Required**: Yes (automated + manual)

## Files to Deploy

### New Files (2)
```
backend/src/utils/checkDeviceVisibility.js       (110 lines) - Reusable utility
backend/test_device_visibility.js                 (400+ lines) - Integration test
```

### Modified Files (3)
```
backend/src/controllers/tds.controller.js         (5 functions updated)
backend/src/controllers/nodes.controller.js       (5 functions updated + 1 import added)
backend/src/middleware/checkDeviceVisibility.js   (OPTIONAL - already in Phase 1)
```

## Pre-Deployment Verification

### 1. Code Review Checklist

- [ ] Review `checkDeviceVisibility.js` - verify superadmin bypass logic
- [ ] Review tds.controller.js - verify all 5 functions have visibility check
- [ ] Review nodes.controller.js - verify all 5 functions have visibility check
- [ ] Verify import statement added in nodes.controller.js
- [ ] Check that all 403 error messages are consistent

### 2. Local Testing

```bash
# Start local backend
cd backend
npm start

# Create test devices (visible + hidden)
# Use Firestore console or run setup script

# Run integration test
node test_device_visibility.js

# Expected: All 12 tests pass
```

### 3. Lint & Format Check

```bash
# Check for syntax errors
npm run lint

# Verify no import errors
npm test
```

## Deployment Steps

### Step 1: Backup Current Code

```bash
# Create backup branch
git checkout -b pre-phase2-backup
git push origin pre-phase2-backup

# Switch to main branch
git checkout main
```

### Step 2: Deploy Files

```bash
# Copy new files
cp backend/src/utils/checkDeviceVisibility.js ./backend/src/utils/
cp backend/test_device_visibility.js ./backend/

# Update controller files
cp backend/src/controllers/tds.controller.js ./backend/src/controllers/
cp backend/src/controllers/nodes.controller.js ./backend/src/controllers/

# Commit changes
git add .
git commit -m "Phase 2: Universal device visibility enforcement

- Add checkDeviceVisibility reusable utility
- Update getTDS* endpoints with visibility checks
- Update getNode* endpoints with visibility checks
- Add comprehensive integration test
- Fixes multi-tenant data leakage vulnerability"
```

### Step 3: Deploy to Staging

```bash
# Push to staging branch
git push origin main

# In Railway/deployment environment:
# 1. Pull latest code
# 2. Restart backend service
# 3. Check logs for startup errors
```

### Step 4: Verify Staging Deployment

```bash
# SSH into staging
ssh staging-server

# Run integration test against staging
API_BASE_URL=https://staging-api.example.com node test_device_visibility.js

# Check logs for any "Device not visible" entries
tail -f /var/log/backend/error.log

# Should see entries like:
# [WARN] Unauthorized device access | deviceId: xxx | userId: yyy
```

### Step 5: Manual Smoke Tests

#### Test 1: Hidden Device Access (should fail)

```bash
# Get test token for customer
CUSTOMER_TOKEN="<customer-jwt-token>"

# Try to access hidden device
curl -i -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  https://staging-api.example.com/api/v1/devices/hidden_test_device/telemetry

# Expected Response:
# HTTP/1.1 403 Forbidden
# {
#   "error": "Device not visible to your account"
# }
```

#### Test 2: Visible Device Access (should succeed)

```bash
# Try to access visible device
curl -i -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  https://staging-api.example.com/api/v1/devices/visible_test_device/telemetry

# Expected Response:
# HTTP/1.1 200 OK
# {
#   "id": "visible_test_device",
#   "tds_value": 400,
#   "temperature": 28,
#   ...
# }
```

#### Test 3: Superadmin Bypass (should succeed with logging)

```bash
# Get superadmin token
SUPERADMIN_TOKEN="<superadmin-jwt-token>"

# Try to access hidden device as superadmin
curl -i -H "Authorization: Bearer $SUPERADMIN_TOKEN" \
  https://staging-api.example.com/api/v1/devices/hidden_test_device/telemetry

# Expected Response:
# HTTP/1.1 200 OK (superadmin can access)
# Check logs for audit entry:
# [WARN] Unauthorized device access attempt (superadmin override)
```

### Step 6: Monitor for Issues (1 hour)

```bash
# Watch logs for any errors
tail -f staging.log

# Check error rate
curl https://staging-api.example.com/metrics | grep http_requests_error

# Dashboard: Monitor latency (visibility check adds ~1ms per request)
# Expected: p99 < 200ms (normal TDS query: 100ms + check: 1ms + overhead: 50ms)
```

### Step 7: Production Deployment

Once staging verification passes:

```bash
# Tag release
git tag -a v1.2.0-phase2 -m "Phase 2: Device visibility enforcement"
git push origin v1.2.0-phase2

# In production environment:
# 1. Verify backup created
# 2. Deploy code (blue-green or rolling update)
# 3. Wait for all instances to be healthy
# 4. Monitor logs and metrics for 2 hours
```

## Post-Deployment Verification

### 1. Production Tests

Run the same smoke tests against production:

```bash
API_BASE_URL=https://api.example.com node test_device_visibility.js

# OR run individual curl commands against production endpoints
```

### 2. Monitor Key Metrics

```bash
# Check error rate (should be normal)
SELECT sum(rate[5m]) FROM http_errors WHERE status=403

# Check latency (should be +1-5ms over baseline)
SELECT avg(request_duration) FROM http_requests

# Check visib ility check audit logs
grep "Device not visible" production.log | tail -20

# Sample expected log entries:
# [WARN] Unauthorized device access | deviceId: tank_001 | userId: cust_123 | role: customer
# (indicates hidden device access attempt - expected and logged)
```

### 3. Customer Impact Assessment

```bash
# Check for support tickets mentioning:
# - "Can't see device"
# - "Device disappeared"
# - "403 Device not visible"

# These would indicate incorrect device visibility configuration
# Solution: Set isVisibleToCustomer: true for devices customer should see
```

### 4. 24-Hour Post-Deployment Report

After 24 hours, review:

- ✅ All devices visible to correct customers (customer support confirms)
- ✅ No increase in 403 errors from legitimate requests
- ✅ Superadmin audit logs show minimal hidden device access (< 5 per day)
- ✅ Latency impact < 5% (visibility check adds ~1ms per request)
- ✅ No unhandled exceptions in logs

## Rollback Procedure

If critical issues discovered:

```bash
# Immediate rollback
git revert HEAD
git push origin main

# In Railway/production:
# 1. Stop current deployment
# 2. Redeploy previous version
# 3. Verify services healthy
# 4. Investigate issue

# Expected rollback time: 5-10 minutes
# No data loss (read-only operation)
```

### Rollback Decision Criteria

Rollback immediately if:
- ❌ > 5% increase in error rate
- ❌ Multiple customers report "unable to access devices"
- ❌ Performance degradation > 20%
- ❌ Visibility check fails consistently (infinite 403 errors)

Do NOT rollback if:
- ✅ Some customers can't see hidden devices (expected behavior)
- ✅ Audit logs show visibility checks working (expected)
- ✅ Latency increase < 10% (normal for security check)

## Configuration Changes

### Firestore Document Requirements

Each device document must have:

```javascript
{
  device_id: "device_123",
  device_type: "evaratank",
  customer_id: "customer_abc",
  isVisibleToCustomer: true,  // ← CRITICAL FIELD
  // ... other fields
}
```

**Action Required**: Audit existing devices in production

```javascript
// Firestore script to check
db.collection('devices')
  .where('isVisibleToCustomer', '==', null)
  .limit(10)
  .get()
  .then(snap => console.log(`Found ${snap.size} devices without visibility flag`))
```

If found, set all to `true`:
```javascript
db.collection('devices')
  .where('isVisibleToCustomer', '==', null)
  .get()
  .then(snap => {
    const batch = db.batch();
    snap.docs.forEach(doc => batch.update(doc.ref, { isVisibleToCustomer: true }));
    return batch.commit();
  })
```

## Environment Variables (No Changes Required)

The visibility check doesn't require new env vars:
- Uses existing Firebase config
- Uses existing logging setup
- Uses existing Redis for audit logging

## Known Issues & Workarounds

### Issue 1: Backward Compatibility

**Problem**: Devices created before Phase 2 may not have `isVisibleToCustomer` field

**Solution**: Set default to `true` in visibility check
```javascript
return device?.isVisibleToCustomer !== false; // true if missing
```

**Action**: Monitor logs for devices without field, update them

### Issue 2: TDS Historical Data

**Problem**: Customers may have queries to `/tds/:id/history` still in cache (showing 200)

**Solution**: TTL on cache is 5 minutes max, all old responses will expire

**Action**: No manual action needed, wait 5 minutes

### Issue 3: WebSocket Real-Time (Out of Scope)

**Problem**: WebSocket connections may still receive hidden device telemetry

**Solution**: Defer to Phase 2b: Add visibility check to WebSocket message handlers

**Action**: Document as known limitation, plan separate sprint

## Success Criteria Checklist

- [ ] All 12 integration tests pass in production
- [ ] Zero customer complaints about 403 errors (expected device access)
- [ ] Audit logs show < 10 visibility violations per day (legitimate)
- [ ] Error rate steady (no spike)
- [ ] Latency increase < 5% (normal security overhead)
- [ ] No rollbacks required after 48 hours
- [ ] Superadmin access to hidden devices working with audit

## Support & Escalation

### If customers report "Device disappeared"

1. Check if device has `isVisibleToCustomer: false` in Firestore
2. Set to `true` if needed
3. Verify through GET `/devices/:id` endpoint (should now return 200)

### If seeing > 5% 403 errors in metrics

1. Check logs for pattern:
   - If `/devices/:id` endpoints: Expected (hidden devices)
   - If `/devices` (list): Unexpected (investigate)
2. Verify Firestore has correct isVisibleToCustomer values
3. Check customer_id ownership matches

### If latency spike observed

1. Monitor query time to Firestore (visibility check adds ~1ms)
2. Check if added load (batch operations)
3. Verify Redis cache working (reduces repeated queries)

## Contact & References

- **Phase 1 Summary**: [Phase 1 Fix Summary](./PHASE_1_SUMMARY.md)
- **Security Audit**: [Backend Audit Report](./BACKEND_SECURITY_AUDIT_REPORT.md)
- **Integration Test**: [Device Visibility Test](./backend/test_device_visibility.js)
- **Implementation**: [Visibility Utility](./backend/src/utils/checkDeviceVisibility.js)

---

**Deployment Status**: Ready
**Last Updated**: 2024
**Owner**: Security & Backend Team
