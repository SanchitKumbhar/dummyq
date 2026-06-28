// workers/job.worker.js

const { Worker } = require("bullmq");
const Redis = require("ioredis");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process"); // Added for C++ execution
const util = require("util");              // Added to promisify exec
const db = require("../config/sqlite.config");
require("dotenv").config();

// Promisify exec so we can use async/await cleanly
const execPromise = util.promisify(exec);

// Get the connection URI from environment variables
const redisUrl = process.env.REDIS_URL || "redis://default:a3OMKx4vaS0ZKUdZOppX18VTtKJEmSla@slimline-turbomodern-condition-28818.db.redis.io:14613";

// -------------------- Redis Connection --------------------
const connection = new Redis(redisUrl, {
    maxRetriesPerRequest: null
});
const pubClient = new Redis(redisUrl);

connection.on("connect", () => {
    console.log("Redis Cloud connected for worker");
});

connection.on("error", (err) => {
    console.error("Worker Redis connection error:", err);
});

// -------------------- SQLite Helper --------------------
// Wraps db.run in a Promise for cleaner async/await syntax
const runQuery = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

// -------------------- C++ Page Counter Helper --------------------
const getPageCount = async (filePath, mimeType) => {
    if (mimeType === "application/pdf") {
        try {
            // Ask the OS to run the C++ pdfinfo binary on our file
            // We wrap filePath in quotes just in case there are spaces in the path
            const { stdout } = await execPromise(`pdfinfo "${filePath}"`);
            
            // pdfinfo returns a block of text. We use regex to find "Pages:   [number]"
            const match = stdout.match(/Pages:\s+(\d+)/);
            
            if (match && match[1]) {
                return parseInt(match[1], 10);
            }
            
            return 1; // Fallback if regex fails
        } catch (error) {
            console.error(`C++ pdfinfo failed for ${filePath}. Defaulting to 1.`, error.message);
            return 1; // Fallback so the job doesn't completely fail
        }
    }
    
    // For images or unknown types, default to 1 page
    return 1;
};

// -------------------- Worker --------------------
const worker = new Worker(
    "whatsapp-jobs",
    async (job) => {
        try {
            const data = job.data.payload || job.data;
            console.log("JOB DATA:", data);

            const mediaCount = Number(data.NumMedia || 0);
            const senderPhone = (data.From || "UNKNOWN").replace("whatsapp:", "");
            const jobId = data.MessageSid;
            const storeId = job.data.storeId || 1;

            console.log("Processing job:", jobId);

            // -------------------- Download Media --------------------
            const downloadMedia = async (url, messageSid, ext) => {
                const uploadsDir = path.join(process.cwd(), "uploads");

                if (!fs.existsSync(uploadsDir)) {
                    fs.mkdirSync(uploadsDir, { recursive: true });
                }

                const filePath = path.join(
                    uploadsDir,
                    `${messageSid}_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`
                );
                console.log("skkndf");

                const response = await axios({
                    method: "GET",
                    url,
                    responseType: "stream",
                    auth: {
                        username: process.env.TWILIO_ACCOUNT_SID,
                        password: process.env.TWILIO_AUTH_TOKEN
                    },
                    timeout: 30000
                });

                const writer = fs.createWriteStream(filePath);

                await new Promise((resolve, reject) => {
                    response.data.pipe(writer);
                    writer.on("finish", resolve);
                    writer.on("error", reject);
                });

                return filePath;
            };

            // -------------------- Process Files Concurrently --------------------
            const downloadTasks = [];

            for (let i = 0; i < mediaCount; i++) {
                const url = data[`MediaUrl${i}`];
                const type = data[`MediaContentType${i}`];

                if (!url) continue;

                const ext = type?.split("/")[1] || "bin";

                // Push the async task to the array for parallel execution
                const task = downloadMedia(url, jobId, ext).then(async (localPath) => {
                    const pages = await getPageCount(localPath, type);
                    return {
                        mediaUrl: url,
                        contentType: type,
                        localPath,
                        fileName: path.basename(localPath),
                        pages
                    };
                });

                downloadTasks.push(task);
            }

            // Await all downloads and page counting simultaneously
            const files = await Promise.all(downloadTasks);

            // Calculate aggregate total pages
            const totalPages = files.reduce((sum, file) => sum + file.pages, 0);

            // -------------------- DB Inserts --------------------
            
            // 1. Insert into parent print_jobs table
            await runQuery(
                `INSERT INTO print_jobs 
                (job_id, store_id, sender_phone, source, file_count, total_pages, status)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [jobId, storeId, senderPhone, "whatsapp", files.length, totalPages, "pending"]
            );

            // 2. Insert each file into child print_job_files table
            for (const file of files) {
                await runQuery(
                    `INSERT INTO print_job_files 
                    (job_id, file_name, file_path, file_type, pages)
                    VALUES (?, ?, ?, ?, ?)`,
                    [jobId, file.fileName, file.localPath, file.contentType, file.pages]
                );
            }

            console.log("Job and files saved to database:", jobId);

            // -------------------- Broadcast Event --------------------
            const createdJob = {
                jobId,
                storeId,
                senderPhone,
                source: "whatsapp",
                fileCount: files.length,
                totalPages: totalPages,
                files,
                status: "pending",
                createdAt: new Date().toISOString()
            };

            // Broadcast to store-events channel via Redis Cloud
            await pubClient.publish(
                "store-events",
                JSON.stringify({
                    storeId: storeId,
                    event: "new-job",
                    data: createdJob
                })
            );

            console.log("Emitted job to store channel via Redis Cloud:", storeId);
            
            return {
                jobId,
                storeId,
                senderPhone,
                totalPages,
                files
            };

        } catch (err) {
            console.error("Worker error:", err);
            throw err; 
        }
    },
    { connection }
);

// -------------------- Events --------------------
worker.on("completed", (job) => {
    console.log("Job completed:", job.id);
});

worker.on("failed", (job, err) => {
    console.log("Job failed:", job?.id, err.message);
});