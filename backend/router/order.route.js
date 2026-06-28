const {orderController}=require("../controller/orders.controller");
const {costController}=require("../controller/orders.controller");
const express=require("express");
const middleware=require("../middleware/auth.middleware")
const router=express.Router();

router.get("/v1/get-order",middleware,orderController);
router.patch("/v1/cost-order",costController);

module.exports=router;