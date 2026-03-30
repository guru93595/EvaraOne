# Water Level Display Debugging Guide

## Quick Test Steps

### 1. Open Browser Console
Run the commands from `debug_test.js` to identify the exact issue:

```javascript
// Copy and paste these commands in browser console:

// Force test value to verify display works
window.FORCE_TEST_VALUE = 78.5;
// Refresh page - you should see 78.5% on OBH Tank if display logic works

// Check what backend is actually sending
fetch('/api/nodes').then(r=>r.json()).then(d=>console.log('NODES:',d));
fetch('/api/nodes/OBH_TANK/analytics').then(r=>r.json()).then(d=>console.log('ANALYTICS:',d));
```

### 2. What to Look For

**If forced value shows** → Display logic works, data source is the problem
**If forced value doesn't show** → Display logic has issues

**Console logs will show:**
- Are we getting socket data?
- What field names is backend using?
- Is analytics endpoint returning correct data?

### 3. Expected Debug Output

**Working Display Logic:**
```
[AllNodes FINAL] OBH Tank - Display Value: {originalPct: 0, testPct: 78.5, isTank: true, willDisplay: "78.5"}
```

**Socket Data Should Show:**
```
[AllNodes SOCKET] Raw data for OBH_TANK: {
  "device_id": "OBH_TANK",
  "currentLevel": 78.5,
  "timestamp": "..."
}
```

**Analytics Should Show:**
```
ANALYTICS: {
  "currentLevel": 78.5,
  "currentVolume": 7850,
  "status": "Online"
}
```

### 4. Common Issues & Solutions

**Issue 1: No Socket Data**
- Console shows no `[AllNodes SOCKET]` messages
- Fix: Check backend socket emission

**Issue 2: Wrong Field Names**
- Socket shows `level` instead of `currentLevel`
- Fix: Update field mapping in useTelemetry.ts

**Issue 3: Analytics Endpoint Wrong**
- Analytics returns empty or wrong structure
- Fix: Check backend analytics controller

**Issue 4: Display Logic Bug**
- Forced 78.5% doesn't show
- Fix: Check React rendering, CSS, or state updates

### 5. Quick Fixes to Try

If you identify the specific issue, apply these targeted fixes:

**No Socket Data:**
```javascript
// In AllNodes.tsx socket handler, add:
console.log('Socket connected:', socket.connected);
```

**Wrong Field Names:**
```javascript
// In useTelemetry.ts, update mapping:
level_percentage: payload.level || payload.currentLevel || null
```

**Analytics Not Working:**
```javascript
// In TelemetryService.ts, try different endpoint:
const response = await api.get(`/nodes/${deviceId}/telemetry`);
```

This systematic approach will pinpoint exactly where the data flow breaks.
