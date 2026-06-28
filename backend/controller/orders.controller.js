const { ordersService } = require("../service/orders.service");
const { costService } = require("../service/orders.service");

const orderController = async (req, res) => {
    try {
        const store_id = req.storeId;
        // console.log(store_id)
        const result = await ordersService(store_id);
        console.log(result.order)
        if (result.status == 200) {
            return res.status(200).json({ data: result.order });
        }


    } catch (error) {
        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
}

const costController = async (req, res) => {
    try {
        const { jobId, cost } = req.body;
        console.log({ jobId, cost })
        const result = await costService(jobId, cost);
        console.log(result.status)
        if (result.status == 200) {

            return res.status(200).json({message:"updated cost"});
        }
    } catch (error) {
        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }

}
module.exports = {orderController,costController};