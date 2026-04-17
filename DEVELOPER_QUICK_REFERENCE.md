# Developer Quick Reference: Real-Time CRUD Patterns

**Purpose**: Quick lookup for implementing real-time CRUD patterns  
**Audience**: Backend and Frontend developers  
**Status**: ✅ READY

---

## Pattern 1: Backend Socket Event Emission

### When to Use
After a successful write operation (create, update, delete) that affects device state.

### Implementation

```js
// Backend: src/controllers/[controller].js

async function someDeviceOperation(req, res) {
    try {
        // 1. Perform the operation
        const device = await db.collection("devices").doc(id).get();
        // ... do something ...
        await db.collection("type").doc(id).update(updateData);
        
        // 2. Flush caches
        await cache.flushPrefix("nodes_");
        await cache.flushPrefix("user:");
        
        // 3. GET CUSTOMER_ID (before emitting!)
        const deviceData = device.data();
        const customerId = deviceData.customer_id || deviceData.customerId;
        
        // 4. EMIT SOCKET EVENT
        if (customerId && global.io) {
            global.io.to(`customer:${customerId}`).emit("device:event", {
                deviceId: id,
                changes: updateData,
                success: true,
                timestamp: new Date().toISOString()
            });
            console.log(`✅ device:event emitted for ${id}`);
        }
        
        // 5. Return response
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error("[Controller] Error:", error);
        return res.status(500).json({ error: "Operation failed" });
    }
}
```

### Key Points
- ✅ Emit AFTER successful DB write
- ✅ Emit AFTER cache flush
- ✅ Always extract customerId before emitting
- ✅ Use customer-scoped room: `customer:${customerId}`
- ✅ Include timestamp for ordering
- ✅ Log emission for debugging

### Common Events
```js
// Device creation
global.io.to(`customer:${customerId}`).emit("device:added", {
    device: fullDeviceObject,
    timestamp: new Date().toISOString()
});

// Device deletion
global.io.to(`customer:${customerId}`).emit("device:deleted", {
    deviceId: id,
    timestamp: new Date().toISOString()
});

// Device update
global.io.to(`customer:${customerId}`).emit("device:updated", {
    deviceId: id,
    changes: updatedFields,
    timestamp: new Date().toISOString()
});

// Telemetry update
global.io.to(`room:${id}`).emit("telemetry_update", {
    deviceId: id,
    telemetry: telemetryData,
    status: "ONLINE",
    timestamp: new Date().toISOString()
});
```

---

## Pattern 2: Frontend Socket Handler

### When to Use
In React hooks that display real-time data (like useNodes).

### Implementation

```js
// Frontend: src/hooks/useCustom.ts

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { socket } from "../services/api";

export const useCustomData = () => {
    const queryClient = useQueryClient();
    
    useEffect(() => {
        // 1. HANDLER: New item added
        const handleItemAdded = (data: any) => {
            queryClient.setQueryData(["items"], (oldData: any) => {
                if (!oldData || !Array.isArray(oldData)) return oldData;
                
                // Prevent duplicates
                if (oldData.some(n => n.id === data.item?.id)) {
                    return oldData;
                }
                
                console.log(`[useCustom] 📝 Adding item: ${data.item?.id}`);
                return [...oldData, data.item];
            });
        };
        
        // 2. HANDLER: Item deleted
        const handleItemDeleted = (data: any) => {
            queryClient.setQueryData(["items"], (oldData: any) => {
                if (!oldData || !Array.isArray(oldData)) return oldData;
                console.log(`[useCustom] 🗑️  Removing item: ${data.itemId}`);
                return oldData.filter((n: any) => n.id !== data.itemId);
            });
        };
        
        // 3. HANDLER: Item updated
        const handleItemUpdated = (data: any) => {
            queryClient.setQueryData(["items"], (oldData: any) => {
                if (!oldData || !Array.isArray(oldData)) return oldData;
                
                return oldData.map((n: any) => {
                    if (n.id === data.itemId) {
                        console.log(`[useCustom] 📞 Item updated: ${data.itemId}`);
                        return {
                            ...n,
                            ...data.changes  // Merge changes immutably
                        };
                    }
                    return n;
                });
            });
        };
        
        // 4. REGISTER LISTENERS
        socket.on("item:added", handleItemAdded);
        socket.on("item:deleted", handleItemDeleted);
        socket.on("item:updated", handleItemUpdated);
        
        // 5. CLEANUP ON UNMOUNT
        return () => {
            socket.off("item:added", handleItemAdded);
            socket.off("item:deleted", handleItemDeleted);
            socket.off("item:updated", handleItemUpdated);
        };
    }, [queryClient]);
    
    // ... rest of hook ...
};
```

### Key Points
- ❌ DON'T use: `queryClient.invalidateQueries()`
- ✅ DO use: `queryClient.setQueryData()` with immutable merge
- ✅ Check for duplicates before adding
- ✅ Always return immutable copies
- ✅ Clean up listeners on unmount
- ✅ Add logging for debugging

### Anti-Patterns

```js
// ❌ BAD: Causes race conditions
socket.on("update", () => {
    queryClient.invalidateQueries(["items"]);  // Full re-fetch!
});

// ❌ BAD: Mutates original object
socket.on("update", (data) => {
    oldData[0].name = data.newName;  // Direct mutation
});

// ❌ BAD: Doesn't handle async state
queryClient.setQueryData(["items"], newData);  // Sync only!

// ✅ GOOD: Immutable merge
queryClient.setQueryData(["items"], (oldData) => {
    return oldData.map(item => 
        item.id === data.itemId 
            ? { ...item, ...data.changes }  // Immutable merge
            : item
    );
});
```

---

## Pattern 3: Field Mapping Priority

### When to Use
When extracting device telemetry from multiple possible field sources.

### Implementation

```js
// Backend: src/services/deviceStateService.js

function extractWaterLevel(device, thingspeakData) {
    // Priority 1: New semantic schema
    if (device.fields?.water_level) {
        const fieldNumber = device.fields.water_level;
        const value = thingspeakData[fieldNumber];
        console.log(`[FieldMapping] ✅ Using device.fields: ${fieldNumber}`);
        return parseFloat(value);
    }
    
    // Priority 2: Old sensor_field_mapping (reverse lookup)
    const mappingKey = Object.keys(device.sensor_field_mapping || {}).find(
        k => device.sensor_field_mapping[k] === "water_level_raw_sensor_reading"
    );
    if (mappingKey) {
        const value = thingspeakData[mappingKey];
        console.log(`[FieldMapping] ✅ Using sensor_field_mapping: ${mappingKey}`);
        return parseFloat(value);
    }
    
    // Priority 3: Device configuration
    if (device.configuration?.water_level_field) {
        const fieldNumber = device.configuration.water_level_field;
        const value = thingspeakData[fieldNumber];
        console.log(`[FieldMapping] ✅ Using configuration: ${fieldNumber}`);
        return parseFloat(value);
    }
    
    // Priority 4: FAIL - Don't use fake data!
    console.error(`[FieldMapping] ❌ NO FIELD MAPPING for device ${device.id}`);
    return null;
}
```

### Key Points
- ✅ Order matters: prioritize new schema first
- ✅ Add detailed logging for debugging
- ✅ Return null if no mapping found (no silent failures)
- ✅ Don't use hardcoded defaults
- ✅ Document why each priority level exists

### Usage Pattern

```js
const waterLevel = extractWaterLevel(device, thingspeakData);
if (waterLevel === null) {
    console.error(`Can't extract water_level for ${device.id}`);
    // Handle error: don't use fake data
} else {
    // Use waterLevel safely
}
```

---

## Pattern 4: Metadata Schema Structure

### When to Use
When creating or updating device metadata with field mappings.

### Implementation

```js
// Backend: Store new metadata structure

const metadata = {
    // === NEW: Semantic field mapping (user-defined names)
    fields: {
        water_level: "field2",      // Maps semantic name to ThingSpeak field
        tank_temperature: "field3",
        flow_rate: "field4"
    },
    
    // === OLD: Kept for backward compatibility
    sensor_field_mapping: {
        "field2": "water_level_raw_sensor_reading"
    },
    
    // === DEVICE CONFIG
    configuration: {
        tank_size: 1000,       // Liters
        max_flow_rate: 50,     // LPM
        tank_length: 5,        // Meters
        tank_breadth: 3,
        tank_height: 2.5,
        min_threshold: 10,     // For alerts
        max_threshold: 90
    },
    
    // === CUSTOMER CONFIG
    customer_config: {
        showAlerts: true,
        showConsumption: true,
        showTrends: false
    },
    
    // === LOCATION & VISIBILITY
    latitude: 40.7128,
    longitude: -74.0060,
    isVisibleToCustomer: true,
    
    // === TIMESTAMPS
    created_at: firebaseTimestamp,
    updated_at: firebaseTimestamp
};
```

### Reading Metadata

```js
// Priority-based field lookup
function getFieldMapping(device, semanticName) {
    // 1. Try new fields object
    if (device.fields?.[semanticName]) {
        return device.fields[semanticName];
    }
    
    // 2. Try reverse lookup of old mapping
    const foundKey = Object.keys(device.sensor_field_mapping || {}).find(
        k => device.sensor_field_mapping[k] === semanticName
    );
    if (foundKey) return foundKey;
    
    // 3. Try configuration
    if (device.configuration?.[`${semanticName}_field`]) {
        return device.configuration[`${semanticName}_field`];
    }
    
    // 4. Fail explicitly
    throw new Error(`No mapping for ${semanticName}`);
}
```

---

## Pattern 5: Error Handling for Socket Events

### When to Use
To handle errors that occur during socket event emission gracefully.

### Implementation

```js
// Backend: Safe socket emission

function emitSafeEvent(customerId, eventName, data) {
    try {
        // 1. Validate inputs
        if (!customerId) {
            console.error("[Socket] Missing customerId");
            return false;  // Don't crash
        }
        
        if (!global.io) {
            console.error("[Socket] io not initialized");
            return false;
        }
        
        // 2. Emit event
        const room = `customer:${customerId}`;
        global.io.to(room).emit(eventName, {
            ...data,
            timestamp: new Date().toISOString()
        });
        
        console.log(`[Socket] ✅ Event ${eventName} emitted to ${room}`);
        return true;
    } catch (error) {
        console.error("[Socket] Event emission failed:", error);
        return false;  // Don't crash, just log
    }
}

// Usage
if (!emitSafeEvent(customerId, "device:added", { device: deviceData })) {
    console.warn("[Operation] Socket event failed, but operation succeeded");
    // DB write successful, socket failed - client will eventually refresh
}
```

---

## Pattern 6: Logging Best Practices

### What to Log

```js
// When operation STARTS
console.log(`[Controller] 📍 Creating device:`, {
    hardwareId: req.body.hardwareId,
    userId: req.user.uid,
    customerId: req.user.customer_id
});

// When database WRITES
console.log(`[DB] ✅ Device created: ${deviceId}`);

// When cache FLUSHES
console.log(`[Cache] 🧹 Flushed: nodes_${customerId}`);

// When socket EVENT EMITS
console.log(`[Socket] 📤 device:added emitted to customer:${customerId}`);

// When operation SUCCEEDS
console.log(`[Controller] ✅ Device creation complete: ${deviceId}`);

// When ERRORS occur
console.error(`[Controller] ❌ Device creation failed:`, error.message);
```

### Log Levels

```js
// DEBUG: Development only
console.debug(`[Debug] Field mapping selected: ${fieldNumber}`);

// INFO: Important operations
console.info(`[Info] Device ${deviceId} created by ${userId}`);

// WARN: Should investigate but not critical
console.warn(`[Warn] Customer ${customerId} not found in cache`);

// ERROR: Critical issues
console.error(`[Error] Failed to emit socket event`);
```

---

## Pattern 7: Testing Socket Events

### Unit Test Example

```js
// test_socket_events.js

describe("Device Creation", () => {
    it("should emit device:added event", async () => {
        // 1. Setup
        const mockIo = {
            to: jest.fn().mockReturnValue({
                emit: jest.fn()
            })
        };
        global.io = mockIo;
        
        // 2. Create device
        const response = await createDevice({
            body: { hardwareId: "TEST_001" },
            user: { customer_id: "cust-123" }
        });
        
        // 3. Verify socket event
        expect(mockIo.to).toHaveBeenCalledWith("customer:cust-123");
        expect(mockIo.to().emit).toHaveBeenCalledWith(
            "device:added",
            expect.objectContaining({
                device: expect.objectContaining({ id: expect.any(String) }),
                timestamp: expect.any(String)
            })
        );
        
        // 4. Verify response
        expect(response.status).toBe(200);
    });
});
```

---

## Quick Troubleshooting

| Issue | Check | Solution |
|-------|-------|----------|
| Socket event not received | Customer room subscription | Verify `socket.rooms` includes `customer:*` |
| Race condition on updates | Query cache invalidation | Use `setQueryData()` instead of `invalidateQueries()` |
| Wrong field extracted | Field mapping priority | Check all 4 priority levels, add logging |
| Metadata not persisted | Schema structure | Verify metadata.fields object created |
| Socket not emitted | customerId | Check device has customer_id, not null/undefined |
| UI doesn't update | React Query cache key | Verify hook uses same query key |

---

## Common Code Templates

### Full CRUD with Socket Events

```js
// CREATE
async function createDevice(req, res) {
    const device = { /* new device */ };
    await db.collection("devices").doc(id).set(device);
    await cache.flushPrefix("nodes_");
    
    if (device.customerId && global.io) {
        global.io.to(`customer:${device.customerId}`).emit("device:added", {
            device,
            timestamp: new Date().toISOString()
        });
    }
    res.json({ success: true });
}

// UPDATE
async function updateDevice(req, res) {
    const updates = req.body;
    await db.collection("devices").doc(id).update(updates);
    await cache.flushPrefix("nodes_");
    
    if (customerId && global.io) {
        global.io.to(`customer:${customerId}`).emit("device:updated", {
            deviceId: id,
            changes: updates,
            timestamp: new Date().toISOString()
        });
    }
    res.json({ success: true });
}

// DELETE
async function deleteDevice(req, res) {
    await db.collection("devices").doc(id).delete();
    await cache.flushPrefix("nodes_");
    
    if (customerId && global.io) {
        global.io.to(`customer:${customerId}`).emit("device:deleted", {
            deviceId: id,
            timestamp: new Date().toISOString()
        });
    }
    res.json({ success: true });
}
```

---

## References

- **Socket.io Documentation**: https://socket.io/docs/
- **React Query Documentation**: https://tanstack.com/query/latest
- **Firestore Transactions**: https://firebase.google.com/docs/firestore/transactions
- **Best Practices**: SYSTEM_REPAIR_COMPLETE.md

---

**Ready to Implement** ✅
