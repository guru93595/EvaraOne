# Deployment & Verification Guide

**Last Updated**: 2024  
**Version**: 1.0  
**Status**: ✅ READY FOR STAGING  

---

## Pre-Deployment Checklist

### Code Review
- [ ] All socket event emissions point to correct customer room
- [ ] Field mapping logic has fallbacks for old devices
- [ ] Frontend handlers don't invalidate queries
- [ ] TypeScript compilation passes without errors
- [ ] No console.error() calls left in debug code

### Testing
- [ ] Unit tests pass for device CRUD operations
- [ ] Integration tests pass for socket events
- [ ] Manual smoke test with test_realtime_crud.js passes
- [ ] Network interruption scenarios tested
- [ ] Multi-user concurrent operations tested

### Documentation
- [ ] REALTIME_CRUD_FIXES.md reviewed
- [ ] SYSTEM_REPAIR_COMPLETE.md reviewed
- [ ] Code comments added for socket emissions
- [ ] Team notified of changes

---

## Deployment Steps

### Step 1: Backend Deployment

```bash
# 1. Pull latest changes
git pull origin main

# 2. Install dependencies (if needed)
cd backend && npm install

# 3. Run tests
npm run test

# 4. Build Docker image (if containerized)
docker build -t evara-backend:latest .

# 5. Deploy to Railway/production
# Via Railway dashboard or:
railway up

# 6. Verify backend is running
curl -H "Authorization: Bearer <test-token>" \
  http://<backend-url>/api/admin/devices

# 7. Check logs for errors
railway logs --follow
```

### Step 2: Frontend Deployment

```bash
# 1. Pull latest changes
git pull origin main

# 2. Install dependencies
cd client && npm install

# 3. Type check
npm run type-check

# 4. Run tests
npm run test

# 5. Build
npm run build

# 6. Deploy to Railway/Vercel
# Via Railway dashboard or:
railway up

# 7. Verify frontend is running
curl http://<frontend-url>

# 8. Check browser console for errors
# Open DevTools → Console
```

### Step 3: Health Check

Run health check script to verify all components:

```bash
# Create health_check.sh
#!/bin/bash

BACKEND_URL="${BACKEND_URL:-http://localhost:5000}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
JWT_TOKEN="$1"

echo "🔍 Health Check Starting..."

# 1. Check backend
echo "1️⃣ Checking backend..."
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  "$BACKEND_URL/api/admin/devices" | grep 200 && echo "✅ Backend OK" || echo "❌ Backend Failed"

# 2. Check frontend
echo "2️⃣ Checking frontend..."
curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL" | grep 200 && echo "✅ Frontend OK" || echo "❌ Frontend Failed"

# 3. Check socket connection
echo "3️⃣ Checking socket server..."
# This would require a node script, see test_realtime_crud.js

echo "✅ Health Check Complete"
```

---

## Live Verification

### Verification Test 1: Device Creation

```bash
# In browser console:

// 1. Connect to socket
const socket = io('http://localhost:5000', {
  auth: { token: localStorage.getItem('token') }
});

// 2. Listen for events
socket.on('device:added', (data) => {
  console.log('✅ device:added received:', data);
});

// 3. Create a test device via API or UI
// Watch console for event
```

### Verification Test 2: Field Mapping

```bash
# Check backend logs:
grep "device:created" /var/log/backend.log

# Or test via API:
curl -X POST http://localhost:5000/api/admin/devices \
  -H "Authorization: Bearer <token>" \
  -d '{"hardwareId":"TEST_001","device_type":"EvaraFlow"}'

# Check response contains fields mapping
```

### Verification Test 3: Frontend State

```bash
# In browser console:
// 1. Create new device
// 2. Watch socket events
// 3. Check React Query cache

import { queryClient } from '@tanstack/react-query';
queryClient.getQueryData(['nodes']);  // Should show new device

// 4. Check no full cache invalidation happened
// Look for: "invalidateQueries" - should NOT appear in logs
```

### Verification Test 4: Automated Suite

```bash
# Run full test suite
node test_realtime_crud.js \
  --token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... \
  --customer customer-123

# Expected output:
# ✅ Socket connected
# ✅ Device created
# ✅ device:added event received
# ✅ Device updated
# ✅ device:updated event received
# ✅ Device deleted
# ✅ device:deleted event received
```

---

## Common Issues & Quick Fixes

### Issue: "device:added event NOT received"

**Diagnosis:**
```bash
# 1. Check customer_id in token
jwt_decode(token).customer_id  # Should not be empty

# 2. Check socket connection
socket.rooms  # Should include "customer:..."

# 3. Check server logs
grep "device:added" backend.log
```

**Fix:**
```js
// Ensure global.io exists
if (!global.io) {
    console.error("❌ Socket.io not initialized");
    return res.status(500).json({ error: "Socket server not available" });
}

// Ensure customerId is extracted
const customerId = deviceData.customer_id || deviceData.customerId;
if (!customerId) {
    console.error("❌ No customer_id in device data");
    return;
}
```

### Issue: "Device appears then disappears"

**Diagnosis:**
```js
// In browser console, check for race conditions:
// Look for multiple invalidateQueries calls

// Check socket event received timestamp
socket.on('device:added', (data) => console.log(Date.now(), data));
```

**Fix:**
- Ensure frontend doesn't call invalidateQueries
- Check setQueryData merges correctly
- Verify no duplicate socket listeners

### Issue: "Field mapping returns wrong values"

**Diagnosis:**
```bash
# Check device metadata
db.collection("evaratank").doc(deviceId).get()
  # Should have: fields: { water_level: "field2" }

# Check ThingSpeak data has values
curl https://api.thingspeak.com/channels/123456/feeds.json?api_key=xxx
```

**Fix:**
```js
// Add debug logging
console.log("[DEBUG] Device fields:", device.fields);
console.log("[DEBUG] Sensor mapping:", device.sensor_field_mapping);
console.log("[DEBUG] Latest feed:", latestFeed);

// Verify field extraction order
1. Check device.fields.water_level - Priority 1
2. Check sensor_field_mapping reverse lookup - Priority 2
3. Check configuration settings - Priority 3
4. Return null if none found - Priority 4 (no fake data!)
```

---

## Rollback Plan

If critical issues occur post-deployment:

### Option 1: Disable socket events (5 minutes)

```bash
# SSH into backend server
ssh backend-server

# Comment out all global.io.to(...) lines
sed -i 's/global\.io\.to/\/\/ global.io.to/g' src/controllers/admin.controller.js

# Restart backend
systemctl restart backend
```

### Option 2: Revert to previous version (10 minutes)

```bash
# In Railway or Git
git checkout <previous-commit>
git push origin main
# Railway auto-deploys

# Or manually restart previous Docker image
docker run -d evara-backend:previous
```

### Option 3: Disable frontend socket listeners (5 minutes)

```bash
# Comment out socket listeners in useNodes.ts
# Rebuild and deploy frontend

# Or disable via feature flag:
const ENABLE_SOCKET_UPDATES = false;
if (ENABLE_SOCKET_UPDATES) {
    socket.on("device:added", handleDeviceAdded);
}
```

---

## Post-Deployment Monitoring

### Metrics to Track

```bash
# Log queries to monitor
1. Check error rate: No increase in socket errors
2. Check latency: Device appears within 500ms
3. Check reliability: 99.9% event delivery
4. Check isolation: No cross-customer data

# Query logs:
grep "device:added\|device:updated\|device:deleted" backend.log | wc -l

# Check for errors:
grep "❌ device:" backend.log
```

### Alert Thresholds

Set up alerts for:
- Socket connection errors > 5% of connections
- Device creation latency > 1000ms
- Missing customer_id in device data > 1% of operations
- Field mapping failures > 0.1% of telemetry

---

## Staging Verification Checklist

Before pushing to production:

- [ ] **Functional Tests**
  - [ ] Create device → appears instantly
  - [ ] Update device → updates instantly
  - [ ] Delete device → disappears instantly
  - [ ] Toggle visibility → UI updates instantly
  - [ ] Change parameters → UI updates instantly

- [ ] **Integration Tests**
  - [ ] Multiple devices created simultaneously
  - [ ] Socket events received for all operations
  - [ ] Field mappings work for all device types
  - [ ] Customer isolation maintained

- [ ] **Performance Tests**
  - [ ] Device creation latency < 500ms
  - [ ] No UI flicker on updates
  - [ ] Memory usage stable over 1 hour
  - [ ] CPU usage normal (< 50%)

- [ ] **Security Tests**
  - [ ] Cross-customer data isolation verified
  - [ ] JWT validation working
  - [ ] Socket auth blocked unauthorized users
  - [ ] Request validation preventing injection

- [ ] **Error Handling**
  - [ ] Network interruption handled gracefully
  - [ ] Invalid JWT rejected
  - [ ] Malformed requests rejected
  - [ ] Database errors logged properly

---

## Communication Plan

### Before Deployment
- [ ] Notify team 24 hours in advance
- [ ] Confirm no user-facing impact
- [ ] Schedule deployment during low-traffic window

### During Deployment
- [ ] Monitor logs continuously
- [ ] Have rollback plan ready
- [ ] Notify support team of ETA

### After Deployment
- [ ] Run verification tests
- [ ] Monitor metrics for 1 hour
- [ ] Update status page
- [ ] Notify team of completion

---

## Success Criteria

Deployment is successful when:

✅ All socket events emitted and received  
✅ Devices appear/disappear instantly in UI  
✅ Field mappings respected for all devices  
✅ No data corruption or loss  
✅ No cross-customer data leaks  
✅ Performance metrics nominal  
✅ Zero critical errors in logs  

---

## References

- **Deployment Guide**: [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
- **System Architecture**: [SYSTEM_REPAIR_COMPLETE.md](SYSTEM_REPAIR_COMPLETE.md)
- **Test Suite**: [test_realtime_crud.js](test_realtime_crud.js)
- **Fix Documentation**: [REALTIME_CRUD_FIXES.md](REALTIME_CRUD_FIXES.md)

---

## Support Information

**On-Call Support**: [contact info]  
**Escalation**: [escalation procedure]  
**Documentation Wiki**: [internal wiki link]  

For questions or issues:
1. Check troubleshooting section above
2. Review REALTIME_CRUD_FIXES.md
3. Run test_realtime_crud.js for diagnostics
4. Contact on-call engineer
