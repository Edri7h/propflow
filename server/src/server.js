import 'dotenv/config'; import app from './app.js';
if(!process.env.JWT_SECRET)throw new Error('JWT_SECRET is required'); app.listen(process.env.PORT||5000,()=>console.log(`PROPFlow API listening on ${process.env.PORT||5000}`));
