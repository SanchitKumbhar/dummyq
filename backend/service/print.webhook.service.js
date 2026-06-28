const axios = require("axios");
const fs = require("fs");
const path = require("path");
const db = require("../config/sqlite.config");

/**
 * Download media from Twilio protected URL
 */
const downloadMedia = async (url, messageSid, extension) => {
    const uploadsDir = path.join(process.cwd(), "uploads");

    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const fileName = `${messageSid}_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 8)}.${extension}`;

    const filePath = path.join(uploadsDir, fileName);

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

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on("finish", () => resolve(filePath));
        writer.on("error", reject);
    });
};

/**
 * Insert file record
 */
const insertFileRecord = (jobId, file) => {
    return new Promise((resolve, reject) => {
        db.run(
            `
            INSERT INTO print_job_files
            (
                job_id,
                file_name,
                file_path,
                file_type,
                pages
            )
            VALUES (?, ?, ?, ?, ?)
            `,
            [
                jobId,
                path.basename(file.localPath),
                file.localPath,
                file.contentType,
                0
            ],
            (err) => {
                if (err) return reject(err);
                resolve();
            }
        );
    });
};

/**
 * Main processor
 */
const processIncomingMessage = async (payload, io) => {
    try {
        const mediaCount = parseInt(payload.NumMedia || "0");

        const senderPhone = payload.From.replace(
            "whatsapp:",
            ""
        );

        const jobId = payload.MessageSid;
        const storeId = 1;

        /**
         * Download all files concurrently
         */
        const downloadPromises = [];

        for (let i = 0; i < mediaCount; i++) {
            const mediaUrl = payload[`MediaUrl${i}`];
            const contentType =
                payload[`MediaContentType${i}`];

            const extension =
                contentType?.split("/")[1] || "bin";

            downloadPromises.push(
                downloadMedia(
                    mediaUrl,
                    jobId,
                    extension
                ).then((localPath) => ({
                    mediaUrl,
                    contentType,
                    localPath
                }))
            );
        }

        const files = await Promise.all(downloadPromises);

        /**
         * Begin Transaction
         */
        await new Promise((resolve, reject) => {
            db.run("BEGIN TRANSACTION", (err) => {
                if (err) return reject(err);
                resolve();
            });
        });

        try {
            /**
             * Insert Job
             */
            await new Promise((resolve, reject) => {
                db.run(
                    `
                    INSERT INTO print_jobs
                    (
                        job_id,
                        store_id,
                        sender_phone,
                        source,
                        file_count,
                        total_pages,
                        status
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    `,
                    [
                        jobId,
                        storeId,
                        senderPhone,
                        "whatsapp",
                        files.length,
                        0,
                        "pending"
                    ],
                    function (err) {
                        if (err) return reject(err);
                        resolve();
                    }
                );
            });

            /**
             * Insert all file records
             */
            await Promise.all(
                files.map(file =>
                    insertFileRecord(jobId, file)
                )
            );

            /**
             * Commit
             */
            await new Promise((resolve, reject) => {
                db.run("COMMIT", (err) => {
                    if (err) return reject(err);
                    resolve();
                });
            });

        } catch (err) {

            await new Promise((resolve) => {
                db.run("ROLLBACK", () => resolve());
            });

            throw err;
        }

        /**
         * Response Object
         */
        const createdJob = {
            jobId,
            storeId,
            senderPhone,
            source: "whatsapp",
            status: "pending",
            fileCount: files.length,
            totalPages: 0,
            files,
            createdAt: new Date().toISOString()
        };


        /**
         * Notify desktop clients
         */
        io.to(`store-${storeId}`).emit(
            "new-job",
            createdJob
        );



        return createdJob;

    } catch (error) {
        console.error(
            "processIncomingMessage error:",
            error
        );
        throw error;
    }
};





module.exports = {
    processIncomingMessage
};