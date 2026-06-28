const db = require("../config/sqlite.config");

function ordersService(store_id = 1) {
    return new Promise((resolve, reject) => {

        db.all(
            `SELECT job_id,
                    sender_phone,
                    source,
                    file_count,
                    total_pages,
                    status,
                    cost_of_job,
                    created_at
             FROM print_jobs
             WHERE store_id = ?`,
            [1],
            (err, rows) => {
                if (err) {
                    console.error(err);
                    return reject(err);
                }
                // console.log(rows)

                return resolve({
                    status: 200,
                    order: rows
                });
            }
        );
    });
}

async function costService(jobId, cost) {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE print_jobs
        SET cost_of_job = ?
        WHERE job_id = ?`,
            [cost, jobId],
            (err) => {
                if (err) {
                    console.error(err);
                    return reject(err);
                }

                return resolve({status:200});
            }
        );
    })
}

module.exports = {ordersService,costService};