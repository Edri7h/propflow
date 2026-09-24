export const notFound=(req,res)=>res.status(404).json({success:false,message:'Endpoint not found'});
export const errorHandler=(err,req,res,next)=>{console.error(err);res.status(err.status||500).json({success:false,message:err.status?err.message:'Internal server error'});};
