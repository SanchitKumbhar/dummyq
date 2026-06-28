const express = require("express");
const dotenv = require("dotenv");
const http = require("http");
const cookieParser = require("cookie-parser");

const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");
const { Queue } = require("bullmq");

const pendingJobsSync = require("./router/pending.sync.route");
const printwebhook = require("./router/print.webhook.route");
const userRoutes = require("./router/user.auth");
const orderRoute = require("./router/order.route");

const { createstoretable, createjobtable, createjobfilestable,createcustomertable } = require("./model/store.init.model");
const db = require("./config/sqlite.config");
const { printJobsController } = require("./controller/print.webhook.controller");

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = require("socket.io")(server, {
    cors: { origin: "*" }
});

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------- SOCKET.IO ----------------
io.on("connection", (socket) => {
    console.log("CONNECTED:", socket.id);

    socket.on("register-store", ({ storeId }) => {
        socket.join(`store-${storeId}`);
        console.log(`Socket joined store-${storeId}`);
    });

    socket.on("disconnect", (reason) => {
        console.log("DISCONNECTED:", socket.id, reason);
    });
});

// ---------------- REDIS CLIENTS (Redis Cloud Config) ----------------
const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const pubClient = createClient({ url: redisUrl });
const subClient = createClient({ url: redisUrl });
const eventSubscriber = createClient({ url: redisUrl });

// Handle potential Redis Cloud errors gracefully
pubClient.on('error', (err) => console.error('pubClient Redis Error', err));
subClient.on('error', (err) => console.error('subClient Redis Error', err));
eventSubscriber.on('error', (err) => console.error('eventSubscriber Redis Error', err));

// ---------------- BULLMQ ----------------
// BullMQ internally parses the connection string when passed via connection config object
const messageQueue = new Queue("whatsapp-jobs", {
    connection: {
        url: redisUrl,
        maxRetriesPerRequest: null
    }
});

app.set("messageQueue", messageQueue);

// ---------------- DB INIT ----------------
db.run(createstoretable);
db.run(createjobtable);
db.run(createjobfilestable);
// db.run(createcustomertable);

// ---------------- ROUTES ----------------
app.use("/api/printwebhook", printwebhook);
app.use("/api/pending-job", pendingJobsSync);
app.use("/api/user-auth", userRoutes);
app.use("/api/orders", orderRoute);
app.use("/api/print-job",printwebhook);


// app.get("/webhook", (req, res) => {
//     // You define this token in your Meta App Dashboard
//     const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || "inkspool";

//     const mode = req.query["hub.mode"];
//     const token = req.query["hub.verify_token"];
//     const challenge = req.query["hub.challenge"];

//     if (mode && token) {
//         if (mode === "subscribe" && token === VERIFY_TOKEN) {
//             console.log("WEBHOOK_VERIFIED");
//             // Meta requires you to return ONLY the challenge string with a 200 status
//             res.status(200).send(challenge);
//         } else {
//             // Responds with '403 Forbidden' if verify tokens do not match
//             res.sendStatus(403);
//         }
//     } else {
//         res.sendStatus(400);
//     }
// });
app.post("/webhook", async (req, res) => {
    try {
        const body = req.body;

        // Check if this is an event from a WhatsApp API account
        if (body.object === "whatsapp_business_account") {
            
            // Iterate over each entry (there may be multiple if batched)
            for (const entry of body.entry) {
                const changes = entry.changes[0].value;

                // Check if the change contains a message (and isn't just a status update like "read" or "delivered")
                if (changes.messages && changes.messages.length > 0) {
                    const message = changes.messages[0];
                    const contact = changes.contacts[0];
                    
                    const senderPhone = contact.wa_id;
                    const messageId = message.id;
                    const messageType = message.type; // e.g., 'text', 'image', 'document'

                    console.log(`Received ${messageType} from ${senderPhone}`);

                    // Push the raw Meta payload to your BullMQ worker for background processing
                    // await whatsappQueue.add("process-meta-message", {
                    //     payload: changes,
                    //     storeId: 1 // Example store routing
                    // });
                }
            }
            
            // Return a 200 OK to Meta immediately. 
            // If you don't return 200 quickly, Meta will assume the webhook failed and retry.
            res.sendStatus(200);
        } else {
            // Return a 404 if the event is not from a WhatsApp API
            res.sendStatus(404);
        }
    } catch (error) {
        console.error("Error processing webhook:", error);
        res.sendStatus(500);
    }
});


// ---------------- START SERVER ----------------
const PORT = process.env.PORT || 5000;

(async () => {
    try {
        // Connect to Redis Cloud instance
        await Promise.all([
            pubClient.connect(),
            subClient.connect(),
            eventSubscriber.connect()
        ]);

        console.log("Redis Cloud connected successfully!");

        // Socket.IO Redis Adapter linked via Cloud Redis
        io.adapter(createAdapter(pubClient, subClient));
        console.log("Socket.IO Redis adapter ready");

        // Redis → Socket bridge
        await eventSubscriber.subscribe("store-events", (message) => {
            try {
                const { storeId, event, data } = JSON.parse(message);

                console.log("📡 EMITTING TO ROOM:", `store-${storeId}`, event);

                io.to(`store-${storeId}`).emit(event, data);

            } catch (err) {
                console.error("Redis message error:", err);
            }
        });

        // Start server only after Redis Cloud is ready
        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });

    } catch (err) {
        console.error("Startup error:", err);
        process.exit(1);
    }
})();