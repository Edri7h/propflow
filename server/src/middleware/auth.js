import jwt from 'jsonwebtoken'; import { fail } from '../utils/http.js';
export function authenticate(req,res,next){ const token=req.cookies.token; if(!token)return fail(res,'Authentication required',401); try{req.user=jwt.verify(token,process.env.JWT_SECRET);next()}catch{return fail(res,'Invalid or expired session',401)} }
export const requireAnyRole=(...roles)=>(req,res,next)=>roles.includes(req.user.role)?next():fail(res,'Insufficient permissions',403);
