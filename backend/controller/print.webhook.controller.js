const { processIncomingMessage } = require("../service/print.webhook.service.js");
const jobService = require("../service/jobs.service.js");

/**
 * Webhook receiver — fast hand-off to BullMQ queue
 */
const receiveWebhook = async (req, res) => {
    try {
        const payload = req.body;
        const jobId = payload.MessageSid;

        const messageQueue = req.app.get("messageQueue");

        // messageQueue is null when Redis is unavailable (standalone mode)
        if (!messageQueue) {
            console.warn("Webhook received but BullMQ unavailable — processing synchronously skipped.");
            return res.status(200).json({ success: true, message: "Webhook received. Queue unavailable — configure Redis for async processing." });
        }

        await messageQueue.add("process-message", { payload }, { jobId });

        return res.status(200).json({ success: true, message: "Webhook accepted and queued." });
    } catch (error) {
        console.error("receiveWebhook error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};

/**
 * Get print jobs for authenticated store
 * FIX: was const { store_id } = req.storeId (wrong destructure) and used undefined `data`
 */
const printJobsController = async (req, res) => {
    try {
        const store_id = req.storeId;
        const result = await jobService(store_id);
        return res.status(200).json({ data: result.jobs });
    } catch (error) {
        console.error("printJobsController error:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

module.exports = {
    receiveWebhook,
    printJobsController
};
