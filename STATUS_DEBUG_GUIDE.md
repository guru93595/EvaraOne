# Online/Offline Status Debugging Guide

## Current Issue
Online devices are not showing as "Online" and offline devices are not showing as "Offline" correctly on both dashboard and map.

## Debug Steps to Identify Root Cause

### 1. Enable Debug Mode
In browser console, run:
```javascript
window.DEBUG = true;
```

### 2. Check Console Logs for Status Calculation

**Expected Output for Online Device:**
```
[AllNodes STATUS] OBH Tank: {
  effectiveLastSeen: "2026-03-27T09:45:00.000Z",
  currentStatus: "Online",
  isOnline: true,
  nodeId: "OBH_TANK",
  timestampSources: {
    realtimeSnapshot: "2026-03-27T09:45:00.000Z",
    realtimeCreated: "2026-03-27T09:45:00.000Z", 
    nodeLastSeen: "2026-03-27T09:45:00.000Z",
    nodeLastOnline: "2026-03-27T09:45:00.000Z",
    nodeUpdated: "2026-03-27T09:45:00.000Z"
  }
}
```

**Expected Output for Offline Device:**
```
[AllNodes STATUS] KRB Tank: {
  effectiveLastSeen: "2026-03-26T14:30:00.000Z",
  currentStatus: "Offline", 
  isOnline: false,
  nodeId: "KRB_TANK",
  timestampSources: {
    realtimeSnapshot: undefined,
    realtimeCreated: undefined,
    nodeLastSeen: "2026-03-26T14:30:00.000Z",
    nodeLastOnline: "2026-03-26T14:30:00.000Z",
    nodeUpdated: "2026-03-26T14:30:00.000Z"
  }
}
```

### 3. Common Status Issues & Solutions

**Issue 1: Timestamp Format Mismatch**
- Backend sends: `"2026-03-27T09:45:00.000Z"`
- Frontend expects: Date object or timestamp string
- Check: `computeDeviceStatus()` parsing correctly?

**Issue 2: 30-Minute Threshold Too Strict**
- Device goes offline immediately if data is 31+ minutes old
- Should be more lenient for stable connections

**Issue 3: Socket Data Not Arriving**
- Console shows no `[AllNodes SOCKET]` messages
- Backend not emitting telemetry updates

**Issue 4: Wrong Field Names**
- Backend sends: `last_seen` but frontend looks for `timestamp`
- Field name mismatch in data mapping

### 4. Quick Fixes to Try

**Fix Timestamp Parsing:**
```javascript
// In DeviceService.ts, try more lenient parsing
if (typeof lastTimestamp === 'string') {
  // Handle ISO strings and timestamps
  date = new Date(lastTimestamp);
}
```

**Increase Threshold:**
```javascript
// Change from 30 minutes to 2 hours
if (ageMs < 7200000) { // 2 hours instead of 30 minutes
    return "Online";
}
```

**Check Socket Connection:**
```javascript
// In AllNodes.tsx, add connection check
useEffect(() => {
  console.log('Socket connected:', socket.connected);
  // ... rest of socket setup
}, []);
```

### 5. Test Commands

Run these in console to test specific scenarios:

```javascript
// Test 1: Force online status
window.FORCE_TEST_VALUE = 75.5;
// Check if device shows as online

// Test 2: Check socket connection
console.log('Socket status:', socket.connected);
console.log('Socket listeners:', socket._callbacks);

// Test 3: Manual status calculation
const testTimestamp = new Date();
console.log('Test status:', computeDeviceStatus(testTimestamp));
```

### 6. What to Look For

1. **Are console logs showing status calculations?**
2. **Are socket data messages arriving?**
3. **Are timestamps in correct format?**
4. **Is the 30-minute threshold causing issues?**

This systematic approach will identify exactly why online/offline status is not working correctly.
