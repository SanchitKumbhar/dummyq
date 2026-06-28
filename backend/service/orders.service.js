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

// storeId is always required to prevent cross-tenant access (IDOR)
async function costService(jobId, cost, storeId) {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE print_jobs
             SET cost_of_job = ?, updated_at = CURRENT_TIMESTAMP
             WHERE job_id = ? AND store_id = ?`,
            [cost, jobId, storeId],
            function (err) {
                if (err) {
                    console.error("costService error:", err);
                    return reject(err);
                }
                if (this.changes === 0) {
                    return resolve({ status: 404, message: "Job not found or access denied" });
                }
                return resolve({ status: 200 });
            }
        );
    });
}

async function updateStatusService(jobId, status, storeId) {
    const validStatuses = ["pending", "printing", "paused", "completed", "cancelled"];
    if (!validStatuses.includes(status)) {
        return { status: 400, message: "Invalid status value" };
    }
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE print_jobs
             SET status = ?, updated_at = CURRENT_TIMESTAMP
             WHERE job_id = ? AND store_id = ?`,
            [status, jobId, storeId],
            function (err) {
                if (err) {
                    console.error("updateStatusService error:", err);
                    return reject(err);
                }
                if (this.changes === 0) {
                    return resolve({ status: 404, message: "Job not found or access denied" });
                }
                return resolve({ status: 200 });
            }
        );
    });
}

async function getJobFilesService(jobId, storeId) {
    return new Promise((resolve, reject) => {
        // JOIN with print_jobs to enforce tenant ownership
        db.all(
            `SELECT f.id, f.job_id, f.file_name, f.file_path, f.file_type, f.pages
             FROM print_job_files f
             INNER JOIN print_jobs j ON j.job_id = f.job_id
             WHERE f.job_id = ? AND j.store_id = ?`,
            [jobId, storeId],
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
