#!/usr/bin/env node

/**
 * TDS System Testing Guide
 * Quick verification that TDS is properly integrated
 */

const fs = require('fs');
const path = require('path');

console.log(`
╔════════════════════════════════════════════════════════════════╗
║         TDS (Total Dissolved Solids) System VerificationTest    ║
║                    EvaraTech Platform                           ║
╚════════════════════════════════════════════════════════════════╝
`);

// Check 1: Frontend files
console.log('\n✓ Checking Frontend Files...');
const frontendChecks = [
  'client/src/components/admin/forms/AddDeviceForm.tsx',
  'client/src/types/database.ts',
  'client/src/types/database.types.ts',
  'client/src/types/entities.ts'
];

frontendChecks.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`  ✅ ${file}`);
  } else {
    console.log(`  ❌ ${file} - NOT FOUND`);
  }
});

// Check 2: Backend files
console.log('\n✓ Checking Backend Files...');
const backendChecks = [
  'backend/src/schemas/tds.schema.js',
  'backend/src/controllers/tds.controller.js',
  'backend/src/routes/tds.routes.js',
  'backend/src/controllers/admin.controller.js',
  'backend/src/server.js'
];

backendChecks.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`  ✅ ${file}`);
  } else {
    console.log(`  ❌ ${file} - NOT FOUND`);
  }
});

// Check 3: Content verification
console.log('\n✓ Verifying TDS Support in Code...');

// Check frontend AddDeviceForm.tsx
const addDeviceForm = fs.readFileSync('client/src/components/admin/forms/AddDeviceForm.tsx', 'utf8');
if (addDeviceForm.includes('TDS Sensor') && addDeviceForm.includes('EvaraTDS')) {
  console.log('  ✅ AddDeviceForm.tsx has TDS device type');
} else {
  console.log('  ❌ AddDeviceForm.tsx missing TDS support');
}

// Check database.ts for AnalyticsType
const databaseTs = fs.readFileSync('client/src/types/database.ts', 'utf8');
if (databaseTs.includes('EvaraTDS')) {
  console.log('  ✅ database.ts includes EvaraTDS in AnalyticsType');
} else {
  console.log('  ❌ database.ts missing EvaraTDS');
}

// Check admin controller for TDS support
const adminController = fs.readFileSync('backend/src/controllers/admin.controller.js', 'utf8');
if (adminController.includes('evaratds') && adminController.includes('TDS')) {
  console.log('  ✅ admin.controller.js has TDS device creation');
} else {
  console.log('  ❌ admin.controller.js missing TDS support');
}

// Check server.js for TDS routes
const server = fs.readFileSync('backend/src/server.js', 'utf8');
if (server.includes('tds.routes.js') && server.includes('/api/v1/devices/tds')) {
  console.log('  ✅ server.js has TDS routes mounted');
} else {
  console.log('  ❌ server.js missing TDS routes');
}

console.log(`
╔════════════════════════════════════════════════════════════════╗
║                    MANUAL TESTING STEPS                        ║
╚════════════════════════════════════════════════════════════════╝

1. START DEV SERVER
   $ npm run dev
   
   Expected: Backend running on http://localhost:8000
            Frontend running on http://localhost:8080

2. PROVISION TDS DEVICE (Frontend)
   - Go to Super Admin → Devices → Add Device
   - Select "TDS Sensor" type
   - Fill in device name, ThingSpeak Channel ID, Read API Key
   - Click "Provision"
   
   Expected: Device appears in device list

3. VERIFY DATABASE (Firebase Console)
   - Check devices collection for new device with device_type: "evaratds"
   - Check evaratds collection for metadata entry
   - Verify sensor_field_mapping:
     - field1 → tds_value
     - field2 → temperature

4. TEST TDS TELEMETRY API
   curl -X GET 'http://localhost:8000/api/v1/devices/tds/{device_id}/telemetry' \\
     -H 'Authorization: Bearer {firebase_token}'
   
   Expected Response:
   {
     "tds_value": 425,
     "temperature": 28.5,
     "quality": "GOOD",
     "status": "ONLINE",
     "unit": "ppm"
   }

5. TEST TDS HISTORY API
   curl -X GET 'http://localhost:8000/api/v1/devices/tds/{device_id}/history?hours=24' \\
     -H 'Authorization: Bearer {firebase_token}'
   
   Expected: Array of readings with timestamps and quality levels

6. TEST TDS ANALYTICS API
   curl -X GET 'http://localhost:8000/api/v1/devices/tds/{device_id}/analytics' \\
     -H 'Authorization: Bearer {firebase_token}'
   
   Expected Response:
   {
     "avg_tds": "412.50",
     "min_tds": 380,
     "max_tds": 450,
     "avg_temp": "27.80",
     "readings_count": 24
   }

7. VERIFY DASHBOARD DISPLAY
   - Open main dashboard
   - Look for TDS devices showing water quality badge
   - Check status updates every 60 seconds from telemetry worker

8. VERIFY ACCESS CONTROL
   - Test with customer role (should see only own devices)
   - Test with superadmin role (should see all devices)
   - Test without auth (should get 401 error)

╔════════════════════════════════════════════════════════════════╗
║                    QUALITY LEVELS REFERENCE                    ║
╚════════════════════════════════════════════════════════════════╝

TDS Value (ppm)     Quality Level       Recommendation
───────────────────────────────────────────────────────────────
< 300               EXCELLENT           ✅ Distilled water
300-600             GOOD                ✅ Safe for drinking
600-1000            FAIR                ⚠️  Acceptable, treatment optional
1000-1500           POOR                ❌ High minerals, uncomfortable
> 1500              VERY_POOR           ❌ Unsuitable for drinking

╔════════════════════════════════════════════════════════════════╗
║                    TROUBLESHOOTING                              ║
╚════════════════════════════════════════════════════════════════╝

Issue: TDS device not appearing in device list
Fix: Check admin.controller.js - ensure evaratds is in targetCol mapping

Issue: Telemetry API returns "Device not found"
Fix: Verify device exists in devices collection with device_type: "evaratds"

Issue: "Cannot read property 'field1' of undefined"
Fix: Ensure ThingSpeak channel has data in field1 and field2

Issue: Temperature showing as null
Fix: If no temperature sensor, leave field2 unmapped or set to 0

Issue: Quality classification showing UNKNOWN
Fix: Verify tds_value is being parsed correctly from ThingSpeak data

Missing Authorization header?
$ npm install @firebase/auth  # Make sure Firebase auth is available

❌ Integration Incomplete?
Review TDS_IMPLEMENTATION.md for complete setup guide

✅ EVERYTHING WORKING? 
The TDS system is ready for production!
`);

console.log('\n' + '='.repeat(64));
console.log('END OF VERIFICATION');
console.log('='.repeat(64) + '\n');
