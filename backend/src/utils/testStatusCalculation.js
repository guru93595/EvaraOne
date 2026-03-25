/**
 * testStatusCalculation.js
 * 
 * Test script to validate strict date + time based status calculation
 * Run with: node backend/src/utils/testStatusCalculation.js
 */

const calculateDeviceStatus = (lastUpdatedAt) => {
  const OFFLINE_THRESHOLD_MS = 20 * 60 * 1000; // 20 minutes
  
  if (!lastUpdatedAt) return "OFFLINE";
  
  try {
    const now = new Date();
    const lastUpdate = new Date(lastUpdatedAt);
    
    // Convert to local timezone (IST for India)
    const tzOffset = 5.5 * 60 * 60 * 1000; // IST = UTC+5:30
    const nowLocal = new Date(now.getTime() + tzOffset);
    const lastUpdateLocal = new Date(lastUpdate.getTime() + tzOffset);
    
    // Extract date components (YYYY-MM-DD)
    const currentDate = nowLocal.toISOString().split('T')[0];
    const lastDataDate = lastUpdateLocal.toISOString().split('T')[0];
    
    console.log(`  Current datetime: ${nowLocal.toISOString()} (${currentDate})`);
    console.log(`  Last data datetime: ${lastUpdateLocal.toISOString()} (${lastDataDate})`);
    
    // CONDITION 1: Check if same day
    if (lastDataDate !== currentDate) {
      console.log(`  ❌ Different dates detected: "${lastDataDate}" vs "${currentDate}"`);
      return "OFFLINE";
    }
    
    // CONDITION 2: Check time difference (must be <= 20 minutes)
    const timeDiffMs = nowLocal.getTime() - lastUpdateLocal.getTime();
    const timeDiffMinutes = timeDiffMs / (1000 * 60); // Use exact value, not rounded
    
    console.log(`  Time difference: ${timeDiffMinutes.toFixed(2)} minutes (${timeDiffMs}ms)`);
    
    if (timeDiffMinutes <= 20) {
      console.log(`  ✅ Within 20 minute threshold`);
      return "ONLINE";
    } else {
      console.log(`  ❌ Exceeds 20 minute threshold`);
      return "OFFLINE";
    }
  } catch (err) {
    console.error("  Error:", err.message);
    return "OFFLINE";
  }
};

// Test cases
console.log("=".repeat(80));
console.log("TEST CASE 1: Data from 10 minutes ago (today)");
console.log("Expected: ONLINE");
const test1 = new Date(Date.now() - (10 * 60 * 1000)).toISOString();
const result1 = calculateDeviceStatus(test1);
console.log(`Result: ${result1}`);
console.log(result1 === "ONLINE" ? "✅ PASS" : "❌ FAIL");
console.log("=".repeat(80));

console.log("\nTEST CASE 2: Data from 25 minutes ago (today)");
console.log("Expected: OFFLINE");
const test2 = new Date(Date.now() - (25 * 60 * 1000)).toISOString();
const result2 = calculateDeviceStatus(test2);
console.log(`Result: ${result2}`);
console.log(result2 === "OFFLINE" ? "✅ PASS" : "❌ FAIL");
console.log("=".repeat(80));

console.log("\nTEST CASE 3: Data from yesterday");
console.log("Expected: OFFLINE");
const test3 = new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString();
const result3 = calculateDeviceStatus(test3);
console.log(`Result: ${result3}`);
console.log(result3 === "OFFLINE" ? "✅ PASS" : "❌ FAIL");
console.log("=".repeat(80));

console.log("\nTEST CASE 4: No data (null)");
console.log("Expected: OFFLINE");
const result4 = calculateDeviceStatus(null);
console.log(`Result: ${result4}`);
console.log(result4 === "OFFLINE" ? "✅ PASS" : "❌ FAIL");
console.log("=".repeat(80));

console.log("\nTEST CASE 5: Data from exactly 20 minutes ago");
console.log("Expected: ONLINE");
const test5 = new Date(Date.now() - (20 * 60 * 1000)).toISOString();
const result5 = calculateDeviceStatus(test5);
console.log(`Result: ${result5}`);
console.log(result5 === "ONLINE" ? "✅ PASS" : "❌ FAIL");
console.log("=".repeat(80));

console.log("\nTEST CASE 6: Data from 20 minutes 1 second ago");
console.log("Expected: OFFLINE");
const test6 = new Date(Date.now() - (20 * 60 * 1000) - 1000).toISOString();
const result6 = calculateDeviceStatus(test6);
console.log(`Result: ${result6}`);
console.log(result6 === "OFFLINE" ? "✅ PASS" : "❌ FAIL");
console.log("=".repeat(80));
