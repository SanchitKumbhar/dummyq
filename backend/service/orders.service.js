const db = require("../config/sqlite.config");
const { v4: uuidv4 } = require("uuid");

// FIX: was hardcoded [1] — now uses dynamic store_id
function ordersService(store_id) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT job_id,
                    customer_name,
                    sender_phone,
                    source,
                    file_count,
                    total_pages,
                    status,
                    cost_of_job,
                    created_at,
                    updated_at
             FROM print_jobs
             WHERE store_id = ?
             ORDER BY created_at DESC`,
            [store_id],
            (err, rows) => {
                if (err) {
                    console.error("ordersService error:", err);
                    return reject(err);
                }
                return resolve({ status: 200, order: rows || [] });
            }
        );
    });
}

async function costService(jobId, cost) {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE print_jobs SET cost_of_job = ?, updated_at = CURRENT_TIMESTAMP WHERE job_id = ?`,
            [cost, jobId],
            (err) => {
                if (err) {
                    console.error("costService error:", err);
                    return reject(err);
                }
                return resolve({ status: 200 });
            }
        );
    });
}

async function updateStatusService(jobId, status) {
    const validStatuses = ["pending", "printing", "paused", "completed", "cancelled"];
    if (!validStatuses.includes(status)) {
        return { status: 400, message: "Invalid status value" };
    }
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE print_jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE job_id = ?`,
            [status, jobId],
            function (err) {
                if (err) {
                    console.error("updateStatusService error:", err);
                    return reject(err);
                }
                if (this.changes === 0) {
                    return resolve({ status: 404, message: "Job not found" });
                }
                return resolve({ status: 200 });
            }
        );
    });
}

async function getJobFilesService(jobId) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT id, job_id, file_name, file_path, file_type, pages
             FROM print_job_files
             WHERE job_id = ?`,
            [jobId],
            (err, rows) => {
                if (err) {
                    console.error("getJobFilesService error:", err);
                    return reject(err);
                }
                return resolve({ status: 200, files: rows || [] });
            }
        );
    });
}

async function createManualJobService(storeId, jobData) {
    const { customer_name, sender_phone, pages, source, notes } = jobData;
    const jobId = `MAN-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO print_jobs
                (job_id, store_id, customer_name, sender_phone, source, file_count, total_pages, status, cost_of_job)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0)`,
            [
                jobId,
                storeId,
                customer_name || "Walk-in Customer",
                sender_phone || "manual",
                source || "manual",
                0,
                parseInt(pages) || 1
            ],
            function (err) {
                if (err) {
                    console.error("createManualJobService error:", err);
                    return reject(err);
                }
                return resolve({
                    status: 201,
                    job: {
                        job_id: jobId,
                        store_id: storeId,
                        customer_name: customer_name || "Walk-in Customer",
                        sender_phone: sender_phone || "manual",
                        source: source || "manual",
                        file_count: 0,
                        total_pages: parseInt(pages) || 1,
                        status: "pending",
                        cost_of_job: 0,
                        created_at: new Date().toISOString()
                    }
                });
            }
        );
    });
}

module.exports = {
    ordersService,
    costService,
    updateStatusService,
    getJobFilesService,
    createManualJobService
};
