const customerController=async(req,res)=>{
    try {
        const {store_id}=req.storeId;
        const result=await customerService(store_id);
        
    } catch (error) {
        
    }
}