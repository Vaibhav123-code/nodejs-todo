const accessModel = require("../models/accessModel");

const rateLimiting = async (req,res,next) => {
     const sessionId = req.session.id;

     //check if this req for the first time or not 
     try {
        const accessDb = await accessModel.findOne({sessionId: sessionId});
        //first entry
        if(!accessDb){
           
             const accessObj = new accessModel({
                sessionId: sessionId,
                time: Date.now()
        })
        await accessObj.save();
        next();
        return;
         }
       
         // 2-nth req 
         // time compare

         const diff = ((Date.now() - accessDb.time)/ 1000);
          console.log(diff);
         if (diff < 2 ){
            return res.send({
                status: 400,
                message: "Too many requests"
            })
         }
         //update time
         await accessModel.findOneAndUpdate({sessionId: sessionId},{time: Date.now()});
         next();

     } catch (error) {
        return res.send({
            status: 500,
            message: "database error",
            error: error
        })
     }
}
module.exports = rateLimiting;