require("dotenv").config();
const express = require("express");
const cors = require("cors");
const adminRoutes = require("./routes/admin.routes.js");
const { getDashboardSummary, getHierarchy, getAuditLogs } = require("./controllers/admin.controller.js");
const { requireAuth, checkOwnership } = require("./middleware/auth.middleware.js");
const { startWorker, telemetryEvents } = require("./workers/telemetryWorker.js");
const cache = require("./config/cache.js");
const apiLimiter = require("./middleware/rateLimit.js");
const http = require("http");
const { Server } = require("socket.io");
const morgan = require("morgan");
const Sentry = require("@sentry/node");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const validateEnv = require("./utils/validateEnv.js");

// Validate environment before starting
validateEnv();

Sentry.init({
  dsn: process.env.SENTRY_DSN || "",
  integrations: [
    Sentry.expressIntegration(),
  ],
});

const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(",") 
  : [
      "https://app.evaratech.com",
      "http://localhost:8080",
      "http://localhost:5173"
    ];

// Pre-flight CORS and Security
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

// Relax Helmet for development/local communication if needed
// Helmet temporarily disabled for debugging Network Error
/*
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
*/

app.use(express.json());
app.use(morgan("combined"));

// Consolidate Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000, 
  message: { error: "Too many requests, please try again later." }
});
app.use("/api/", limiter);

const server = http.createServer(app);

const io = new Server(server, { 
    cors: { 
        origin: allowedOrigins,
        credentials: true
    } 
});

global.io = io;

const { admin, db } = require("./config/firebase.js");

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Authentication error: Missing token"));
    
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // SaaS Architecture: Resolve role from Firestore (same as API auth middleware)
    let role = "customer";
    try {
        const superDoc = await db.collection("superadmins").doc(decodedToken.uid).get();
        if (superDoc.exists) {
            role = (superDoc.data().role || "customer").trim().toLowerCase().replace(/\s+/g, "");
        }
    } catch (e) {
        console.warn("[Socket.io] Role lookup failed, defaulting to customer");
    }
    
    socket.user = { uid: decodedToken.uid, role };
    next();
  } catch (err) {
    next(new Error("Authentication error: Invalid token"));
  }
});

io.on("connection", (socket) => {
    console.log(`[Socket.io] Client connected: ${socket.user?.uid || 'Unknown'}`);

    socket.on("subscribe_device", async (deviceId) => {
        // SaaS Architecture: Security Guard (Zero Trust)
        const isOwner = await checkOwnership(socket.user.uid, deviceId, socket.user.role);
        if (isOwner) {
            console.log(`[Socket.io] Client ${socket.user?.uid} subscribed to device ${deviceId}`);
            socket.join(`room:${deviceId}`);
        } else {
            console.warn(`[Socket.io] Forbidden subscription attempt by ${socket.user.uid} for ${deviceId}`);
        }
    });

    socket.on("unsubscribe_device", (deviceId) => {
        socket.leave(`room:${deviceId}`);
    });

    socket.on("disconnect", () => {
        console.log(`[Socket.io] Client disconnected`);
    });
});

// SaaS Architecture: Distributed Telemetry (Redis Pub/Sub)
const pubSub = cache.getPubSub();
if (pubSub) {
    const sub = pubSub.sub;
    sub.psubscribe("telemetry:*");
    sub.on("pmessage", (pattern, channel, message) => {
        try {
            const payload = JSON.parse(message);
            const deviceId = channel.split(":")[1];
            if (deviceId) {
                io.to(`room:${deviceId}`).emit("telemetry_update", payload);
            }
        } catch (err) {}
    });
}

// Local bridge for telemetryWorker (Dev/Single-instance fallback)
// Node.js EventEmitter doesn't support regex patterns — use explicit wildcard
telemetryEvents.on("telemetry_broadcast", (payload) => {
    if (payload && payload.device_id) {
        io.to(`room:${payload.device_id}`).emit("telemetry_update", payload);
    }
});

app.use((req, res, next) => {
  console.log(`[Router] Incoming ${req.method} ${req.url}`);
  next();
});

// Sentry Handlers

// Main admin routes
app.use("/api/v1/admin", requireAuth, adminRoutes);

// Node telemetry and analytics routes
const nodesRoutes = require("./routes/nodes.routes.js");
app.use("/api/v1/nodes", requireAuth, nodesRoutes);

// Other routes that frontend service calls
app.get("/api/v1/admin/hierarchy", requireAuth, getHierarchy);
app.get("/api/v1/admin/audit-logs", requireAuth, getAuditLogs);
app.get("/api/v1/stats/dashboard/summary", requireAuth, getDashboardSummary);
// Stats route fallback
app.get("/api/v1/stats/zones", requireAuth, (req, res) => res.json([]));

// Sentry error handler must be before any other error middleware and after all controllers
Sentry.setupExpressErrorHandler(app);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal Server Error" });
});

const PORT = process.env.PORT || 8000;

server.listen(PORT, () => {
    console.log(`[Server] Running on port ${PORT}`);
    // Initialize our background worker
    startWorker();
});

// Robust error guards for unexpected crashes
process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
    Sentry.captureException(reason);
});

process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception thrown:", err);
    Sentry.captureException(err);
    // Give Sentry some time to send the error before exiting
    setTimeout(() => {
        process.exit(1);
    }, 2000);
});
