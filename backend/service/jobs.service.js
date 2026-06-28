const db = require("../config/sqlite.config");

async function jobService(store_id) {
    return new Promise((resolve, reject) => {
        db.run(`SELECT job_id,
                    sender_phone,
                    source,
                    file_count,
                    total_pages,
                    status,
                    cost_of_job,
                    created_at
             FROM print_jobs
             WHERE store_id = ?`, [store_id], (error, data) => {
            if (error) {
                console.log(error);
                return reject(error);
            }
            return resolve({ jobs: data });
        });
    })
}

module.exports=jobService;  