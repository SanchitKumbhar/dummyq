const userlogincontroller=require("../controller/user.login");
const signupController=require("../controller/user.signup");

const express=require("express")

const router=express.Router();

router.post("/v1/login",userlogincontroller);
router.post("/v1/signup",signupController);

module.exports=router;