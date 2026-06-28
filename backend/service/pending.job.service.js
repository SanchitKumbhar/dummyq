const { resolve } = require("node:dns");
const db = require("../config/sqlite.config");

async function pendingJobsSyncService(storeId) {
    return new Promise((resolve, reject) => {
        db.run(`SELECT file_url, sender_phonenumber FROM print_jobs WHERE store_id =?
            AND status=pending
        `, [storeId], (err,row) => {
            if (err) {
                return reject(err);
                resolve(row);
            }
        });
    });
}

module.exports=pendingJobsSyncService;