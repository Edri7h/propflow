export const ok=(res,data,status=200)=>res.status(status).json({success:true,data});
export const fail=(res,message,status=400)=>res.status(status).json({success:false,message});
export const safeUser=({passwordHash,...user})=>user;
