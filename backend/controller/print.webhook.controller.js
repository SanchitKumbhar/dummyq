const { create } = require("node:domain");
const {
    processIncomingMessage
} = require("../service/print.webhook.service.js");
const jobService = require("../service/jobs.service.js");

const receiveWebhook = async (req, res) => {
    try {
        const payload = req.body;
        const jobId = payload.MessageSid;

        // Pull the message queue out of your express app state
        const messageQueue = req.app.get("messageQueue");
        console.log("checked")
        // Fast Hand-off to the Redis Queue
        await messageQueue.add('process-message', { payload }, { jobId: jobId });

        // Tell Twilio everything is OK right away
        return res.status(200).json({ success: true, message: "Webhook accepted and queued." });
    } catch (error) {
        console.error("Webhook processing failure:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};

const printJobsController = (async (req, res) => {
    try {
        const { store_id } = req.storeId;
        const jobs = await jobService(store_id);
        return res.status(200).json({ data: data });
    }
    catch (error) {
        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
})




module.exports = {
    receiveWebhook,
    printJobsController
};