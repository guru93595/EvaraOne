/**
 * validateArchitectureFix.js
 * 
 * Quick validation script to verify the architecture fix is working correctly.
 * Run this after deployment to ensure all components are functioning.
 */

const assert = require('assert');

// Mock test data
const mockDevice = {
  id: 'test-device-001',
  type: 'EvaraTank',
  depth: 1.2,
  capacity: 1000,
  mapping: { field1: 'water_level' }
};

const mockFeeds = [
  { created_at: '2026-03-18 20:30:00', field1: '50' },
  { created_at: '2026-03-18 20:32:00', field1: '48' },
  { created_at: '2026-03-18 20:34:00', field1: '45' },
  { created_at: '2026-03-18 20:36:00', field1: '42' } // Latest
];

console.log('🔍 Validating Architecture Fix...\n');

// Test 1: ThingSpeak Service
console.log('Test 1: ThingSpeak Feed Processing');
try {
  const { getLatestFeed } = require('./backend/src/services/thingspeakService.js');
  const latest = getLatestFeed(mockFeeds);
  
  assert.strictEqual(latest.created_at, '2026-03-18 20:36:00', 'Should return latest feed');
  assert.strictEqual(latest.field1, '42', 'Should have correct value');
  
  console.log('✅ PASS: getLatestFeed returns correct element\n');
} catch (error) {
  console.log('❌ FAIL: ThingSpeak service error:', error.message, '\n');
}

// Test 2: Device State Service - Status Calculation
console.log('Test 2: Device Status Calculation');
try {
  const deviceState = require('./backend/src/services/deviceStateService.js');
  
  // Test ONLINE case (recent timestamp)
  const recentTime = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min ago
  const onlineStatus = deviceState.calculateDeviceStatus(recentTime);
  assert.strictEqual(onlineStatus, 'ONLINE', 'Recent device should be ONLINE');
  
  // Test OFFLINE case (old timestamp)
  const oldTime = new Date(Date.now() - 25 * 60 * 1000).toISOString(); // 25 min ago
  const offlineStatus = deviceState.calculateDeviceStatus(oldTime);
  assert.strictEqual(offlineStatus, 'OFFLINE', 'Old device should be OFFLINE');
  
  console.log('✅ PASS: Status calculation works correctly\n');
} catch (error) {
  console.log('❌ FAIL: Device state service error:', error.message, '\n');
}

// Test 3: Device State Service - Data Processing
console.log('Test 3: ThingSpeak Data Processing');
try {
  const deviceState = require('./backend/src/services/deviceStateService.js');
  const result = deviceState.processThingSpeakData(mockDevice, mockFeeds);
  
  assert.ok(result !== null, 'Should process data successfully');
  assert.strictEqual(typeof result.percentage, 'number', 'Should calculate percentage');
  assert.strictEqual(typeof result.volume, 'number', 'Should calculate volume');
  assert.ok(['ONLINE', 'OFFLINE'].includes(result.status), 'Should have valid status');
  assert.ok(result.lastUpdatedAt, 'Should have timestamp');
  
  console.log(`   Processed: ${result.percentage.toFixed(1)}%, ${result.volume.toFixed(1)}L, ${result.status}`);
  console.log('✅ PASS: Data processing works correctly\n');
} catch (error) {
  console.log('❌ FAIL: Data processing error:', error.message, '\n');
}

// Test 4: Verify Cron Job Exists
console.log('Test 4: Status Cron Job');
try {
  const cron = require('./backend/src/workers/deviceStatusCron.js');
  
  assert.ok(typeof cron.recalculateAllDevicesStatus === 'function', 'Should have recalc function');
  assert.ok(typeof cron.startStatusCron === 'function', 'Should have start function');
  assert.strictEqual(cron.STATUS_CHECK_INTERVAL, 60000, 'Should run every 1 minute');
  
  console.log('✅ PASS: Cron job module exists and configured\n');
} catch (error) {
  console.log('❌ FAIL: Cron job error:', error.message, '\n');
}

// Test 5: Verify Telemetry Worker Integration
console.log('Test 5: Telemetry Worker Integration');
try {
  const worker = require('./backend/src/workers/telemetryWorker.js');
  
  assert.ok(typeof worker.startWorker === 'function', 'Should have start function');
  assert.ok(worker.telemetryEvents, 'Should have event emitter');
  
  console.log('✅ PASS: Telemetry worker exports correctly\n');
} catch (error) {
  console.log('❌ FAIL: Telemetry worker error:', error.message, '\n');
}

console.log('═══════════════════════════════════════════');
console.log('Validation Complete!');
console.log('═══════════════════════════════════════════');
console.log('\nNext Steps:');
console.log('1. Start backend server');
console.log('2. Check logs for [DeviceStatusCron] messages');
console.log('3. Verify devices show correct status in UI');
console.log('4. Monitor ThingSpeak data ingestion');
console.log('5. Test Socket.IO real-time updates\n');
