const express = require("express");
const dotenv = require("dotenv");
const http = require("http");
const path = require("path");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");
const { Queue } = require("bullmq");

const pendingJobsSync = require("./router/pending.sync.route");
const printwebhook = require("./router/print.webhook.route");
const userRoutes = require("./router/user.auth");
const orderRoute = require("./router/order.route");

const {
    createstoretable,
    createjobtable,
    createjobfilestable,
    createcustomertable,
    migrations
} = require("./model/store.init.model");

const db = require("./config/sqlite.config");

dotenv.config();

const app = express();
const server = http.createServer(app);

// ---- Socket.IO (CORS open for Electron localhost) ----
const io = require("socket.io")(server, {
    cors: { origin: "*" }
});

// Expose io on app for controllers to use
app.set("io", io);

// ---- MIDDLEWARE ----
app.use(cors({ origin: "*", credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---- STATIC FILE SERVING (for uploaded print files) ----
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/worker-uploads", express.static(path.join(__dirname, "workers", "uploads")));

// ---- SOCKET.IO CONNECTION ----
io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    socket.on("register-store", ({ storeId }) => {
        socket.join(`store-${storeId}`);
        console.log(`Socket ${socket.id} joined room store-${storeId}`);
    });

    socket.on("disconnect", (reason) => {
        console.log("Socket disconnected:", socket.id, reason);
    });
});

// ---- REDIS CONFIG ----
const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const pubClient = createClient({ url: redisUrl });
const subClient = createClient({ url: redisUrl });
const eventSubscriber = createClient({ url: redisUrl });

pubClient.on("error", (err) => console.error("pubClient Redis Error:", err.message));
subClient.on("error", (err) => console.error("subClient Redis Error:", err.message));
eventSubscriber.on("error", (err) => console.error("eventSubscriber Redis Error:", err.message));

// ---- BULLMQ ----
const messageQueue = new Queue("whatsapp-jobs", {
    connection: { url: redisUrl, maxRetriesPerRequest: null }
});

app.set("messageQueue", messageQueue);

// ---- DATABASE INIT ----
function runDbStatement(sql) {
    return new Promise((resolve) => {
        db.run(sql, (err) => {
            if (err && !err.message.includes("duplicate column")) {
                console.warn("DB statement warning:", err.message.substring(0, 80));
            }
            resolve(); // Always resolve — schema already exists is fine
        });
    });
}

async function initDatabase() {
    await runDbStatement(createstoretable);
    await runDbStatement(createjobtable);
    await runDbStatement(createjobfilestable);
    await runDbStatement(createcustomertable);

    // Run column migrations (ALTER TABLE — SQLite ignores duplicate column errors)
    for (const migration of migrations) {
        await runDbStatement(migration);
    }

    console.log("Database schema initialized.");
}

// ---- ROUTES ----
app.use("/api/printwebhook", printwebhook);
app.use("/api/pending-job", pendingJobsSync);
app.use("/api/user-auth", userRoutes);
app.use("/api/orders", orderRoute);
app.use("/api/print-job", printwebhook);

// ---- WHATSAPP WEBHOOK VERIFICATION (Meta / Cloud API) ----
app.get("/webhook", (req, res) => {
    const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || "inkspool";
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("Meta webhook verified.");
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// ---- WHATSAPP WEBHOOK (Meta / Cloud API) ----
app.post("/webhook", async (req, res) => {
    try {
        const body = req.body;
        if (body.object === "whatsapp_business_account") {
            for (const entry of body.entry || []) {
                const changes = entry.changes?.[0]?.value;
                if (changes?.messages?.length > 0) {
                    const message = changes.messages[0];
                    const senderPhone = changes.contacts?.[0]?.wa_id;
                    console.log(`WhatsApp message type=${message.type} from ${senderPhone}`);
                    // Route to BullMQ for async processing
                    // await messageQueue.add("process-meta-message", { payload: changes, storeId: 1 });
                }
            }
            res.sendStatus(200);
        } else {
            res.sendStatus(404);
        }
    } catch (error) {
        console.error("Webhook error:", error);
        res.sendStatus(500);
    }
});

// ---- HEALTH CHECK ----
app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ---- START SERVER ----
const PORT = process.env.PORT || 5000;

async function startServer() {
    // 1. Init DB schema first
    await initDatabase();

    // 2. Try Redis — degrade gracefully if unavailable
    let redisAvailable = false;
    try {
        await Promise.all([
            pubClient.connect(),
            subClient.connect(),
            eventSubscriber.connect()
        ]);
        console.log("Redis connected successfully.");

        // Enable Redis adapter for Socket.IO (multi-instance support)
        io.adapter(createAdapter(pubClient, subClient));
        console.log("Socket.IO Redis adapter ready.");

        // Bridge Redis pub/sub → Socket.IO room events
        await eventSubscriber.subscribe("store-events", (message) => {
            try {
                const { storeId, event, data } = JSON.parse(message);
                console.log(`Emitting '${event}' to room store-${storeId}`);
                io.to(`store-${storeId}`).emit(event, data);
            } catch (err) {
                console.error("Redis bridge parse error:", err);
            }
        });

        redisAvailable = true;
    } catch (err) {
        console.warn("Redis unavailable — running Socket.IO in standalone mode:", err.message);
    }

    // 3. Start HTTP server
    server.listen(PORT, () => {
        console.log(`PrintFlow backend running on http://localhost:${PORT}`);
        console.log(`Redis: ${redisAvailable ? "connected" : "offline (standalone mode)"}`);
    });
}

startServer().catch((err) => {
    console.error("Fatal startup error:", err);
    process.exit(1);
});
