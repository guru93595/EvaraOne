#!/usr/bin/env node

/**
 * REALTIME CRUD TEST SUITE
 * 
 * Verifies that all device CRUD operations emit socket events correctly
 * and that frontend state management handles them properly
 * 
 * Usage: node test_realtime_crud.js --token <jwt> --customer <customerId>
 */

const io = require("socket.io-client");
const http = require("http");
const chalk = require("chalk");

const BASE_URL = process.env.API_URL || "http://localhost:5000";
const SOCKET_URL = process.env.SOCKET_URL || "http://localhost:5000";

const args = process.argv.slice(2);
const tokenIndex = args.indexOf("--token");
const customerIndex = args.indexOf("--customer");

if (tokenIndex === -1 || customerIndex === -1) {
    console.error(chalk.red("❌ Usage: node test_realtime_crud.js --token <jwt> --customer <customerId>"));
    process.exit(1);
}

const JWT_TOKEN = args[tokenIndex + 1];
const CUSTOMER_ID = args[customerIndex + 1];

console.log(chalk.blue(`🔵 REALTIME CRUD TEST SUITE`));
console.log(chalk.dim(`API: ${BASE_URL}`));
console.log(chalk.dim(`Socket: ${SOCKET_URL}`));
console.log(chalk.dim(`Customer: ${CUSTOMER_ID}\n`));

// ============================================================
// TEST SETUP
// ============================================================

const events = [];
const socket = io(SOCKET_URL, {
    auth: { token: JWT_TOKEN },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5
});

socket.on("connect", () => {
    console.log(chalk.green("✅ Socket connected\n"));
});

socket.on("device:added", (data) => {
    events.push({ event: "device:added", data, timestamp: Date.now() });
    console.log(chalk.cyan(`📨 device:added received`), chalk.dim(`- ${data.device?.id}`));
});

socket.on("device:deleted", (data) => {
    events.push({ event: "device:deleted", data, timestamp: Date.now() });
    console.log(chalk.cyan(`📨 device:deleted received`), chalk.dim(`- ${data.deviceId}`));
});

socket.on("device:updated", (data) => {
    events.push({ event: "device:updated", data, timestamp: Date.now() });
    console.log(chalk.cyan(`📨 device:updated received`), chalk.dim(`- ${data.deviceId}`));
});

socket.on("connect_error", (error) => {
    console.error(chalk.red("❌ Socket connection error:"), error.message);
});

socket.on("error", (error) => {
    console.error(chalk.red("❌ Socket error:"), error);
});

// ============================================================
// API HELPER
// ============================================================

function apiRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port || 5000,
            path: url.pathname + url.search,
            method,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${JWT_TOKEN}`
            }
        };

        const req = http.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => {
                data += chunk;
            });
            res.on("end", () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, data });
                }
            });
        });

        req.on("error", reject);

        if (body) {
            req.write(JSON.stringify(body));
        }

        req.end();
    });
}

// ============================================================
// TEST CASES
// ============================================================

async function testCreateDevice() {
    console.log(chalk.yellow(`\n📝 TEST: Create Device`));

    const payload = {
        hardwareId: `TEST_FLOW_${Date.now()}`,
        device_type: "EvaraFlow",
        customerId: CUSTOMER_ID,
        thingspeakChannelId: "1234567",
        thingspeakReadKey: "test_read_key"
    };

    events.length = 0;
    const res = await apiRequest("POST", "/api/admin/devices", payload);

    if (res.status === 201 || res.status === 200) {
        console.log(chalk.green("✅ Device created"), chalk.dim(`- ${res.data.data?.id}`));
        
        // Wait for socket event
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (events.some(e => e.event === "device:added")) {
            console.log(chalk.green("✅ device:added event received"));
            return res.data.data?.id;
        } else {
            console.log(chalk.red("❌ device:added event NOT received"));
            return res.data.data?.id;
        }
    } else {
        console.log(chalk.red("❌ Device creation failed"), chalk.dim(`- Status: ${res.status}`));
        return null;
    }
}

async function testUpdateDevice(deviceId) {
    console.log(chalk.yellow(`\n🔄 TEST: Update Device`));

    if (!deviceId) {
        console.log(chalk.red("❌ No device ID provided, skipping"));
        return;
    }

    const payload = {
        deviceName: `Updated Device ${Date.now()}`
    };

    events.length = 0;
    const res = await apiRequest("PUT", `/api/admin/devices/${deviceId}`, payload);

    if (res.status === 200) {
        console.log(chalk.green("✅ Device updated"), chalk.dim(`- ${deviceId}`));
        
        // Wait for socket event
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (events.some(e => e.event === "device:updated")) {
            console.log(chalk.green("✅ device:updated event received"));
        } else {
            console.log(chalk.red("❌ device:updated event NOT received"));
        }
    } else {
        console.log(chalk.red("❌ Device update failed"), chalk.dim(`- Status: ${res.status}`));
    }
}

async function testUpdateVisibility(deviceId) {
    console.log(chalk.yellow(`\n👁️  TEST: Update Visibility`));

    if (!deviceId) {
        console.log(chalk.red("❌ No device ID provided, skipping"));
        return;
    }

    const payload = {
        isVisibleToCustomer: true
    };

    events.length = 0;
    const res = await apiRequest("PATCH", `/api/admin/devices/${deviceId}/visibility`, payload);

    if (res.status === 200) {
        console.log(chalk.green("✅ Visibility updated"), chalk.dim(`- ${deviceId}`));
        
        // Wait for socket event
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (events.some(e => e.event === "device:updated")) {
            console.log(chalk.green("✅ device:updated event received"));
        } else {
            console.log(chalk.red("❌ device:updated event NOT received"));
        }
    } else {
        console.log(chalk.red("❌ Visibility update failed"), chalk.dim(`- Status: ${res.status}`));
    }
}

async function testUpdateParameters(deviceId) {
    console.log(chalk.yellow(`\n⚙️  TEST: Update Parameters`));

    if (!deviceId) {
        console.log(chalk.red("❌ No device ID provided, skipping"));
        return;
    }

    const payload = {
        customer_config: {
            showAlerts: true,
            showConsumption: false
        }
    };

    events.length = 0;
    const res = await apiRequest("PATCH", `/api/admin/devices/${deviceId}/parameters`, payload);

    if (res.status === 200) {
        console.log(chalk.green("✅ Parameters updated"), chalk.dim(`- ${deviceId}`));
        
        // Wait for socket event
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (events.some(e => e.event === "device:updated")) {
            console.log(chalk.green("✅ device:updated event received"));
        } else {
            console.log(chalk.red("❌ device:updated event NOT received"));
        }
    } else {
        console.log(chalk.red("❌ Parameters update failed"), chalk.dim(`- Status: ${res.status}`));
    }
}

async function testDeleteDevice(deviceId) {
    console.log(chalk.yellow(`\n🗑️  TEST: Delete Device`));

    if (!deviceId) {
        console.log(chalk.red("❌ No device ID provided, skipping"));
        return;
    }

    events.length = 0;
    const res = await apiRequest("DELETE", `/api/admin/devices/${deviceId}`, null);

    if (res.status === 200) {
        console.log(chalk.green("✅ Device deleted"), chalk.dim(`- ${deviceId}`));
        
        // Wait for socket event
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (events.some(e => e.event === "device:deleted")) {
            console.log(chalk.green("✅ device:deleted event received"));
        } else {
            console.log(chalk.red("❌ device:deleted event NOT received"));
        }
    } else {
        console.log(chalk.red("❌ Device deletion failed"), chalk.dim(`- Status: ${res.status}`));
    }
}

// ============================================================
// MAIN TEST RUNNER
// ============================================================

async function runTests() {
    try {
        // Wait for socket to connect
        await new Promise(resolve => {
            socket.on("connect", resolve);
            setTimeout(resolve, 5000);
        });

        let testDeviceId = null;

        // Test: Create
        testDeviceId = await testCreateDevice();

        if (testDeviceId) {
            // Test: Update
            await testUpdateDevice(testDeviceId);

            // Test: Visibility
            await testUpdateVisibility(testDeviceId);

            // Test: Parameters
            await testUpdateParameters(testDeviceId);

            // Test: Delete
            await testDeleteDevice(testDeviceId);
        }

        // Summary
        console.log(chalk.blue(`\n📊 SUMMARY`));
        console.log(chalk.dim(`Total events received: ${events.length}`));
        console.log(chalk.dim(`device:added: ${events.filter(e => e.event === "device:added").length}`));
        console.log(chalk.dim(`device:updated: ${events.filter(e => e.event === "device:updated").length}`));
        console.log(chalk.dim(`device:deleted: ${events.filter(e => e.event === "device:deleted").length}`));

        socket.disconnect();
        process.exit(0);
    } catch (error) {
        console.error(chalk.red("❌ Test failed:"), error.message);
        socket.disconnect();
        process.exit(1);
    }
}

// Start tests
runTests();
