const pendingJobsSyncService = require("../service/pending.job.service");
const pendingJobsSync = async (req, res) => {
    try {
        const { storeId } = req.storeId;
        const jobs = await pendingJobsSyncService(storeId);

        console.log(jobs);
        return res.status(200).json({ jobs: jobs });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }

}

module.exports=pendingJobsSync;