import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { z, ZodError } from 'zod';
import { rows, pool } from './db.js';
import { authenticate, issueToken, setSession, clearSession } from './auth.js';
import { routes } from './routes.js';
import {passkeyPublicRouter,passkeyPrivateRouter} from './passkeys.js';
import { resolve } from 'node:path';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('Isi JWT_SECRET minimal 32 karakter di .env');
const app=express();
app.disable('x-powered-by');
app.use(express.json({limit:'5mb'}));
app.use(cookieParser());
app.use(cors({origin:process.env.NODE_ENV==='production'?false:['http://localhost:5173','http://127.0.0.1:5173'],credentials:true}));
const loginAttempts=new Map<string,{count:number;until:number}>();
app.get('/api/health',async(_req,res)=>{
  try {await pool.query('SELECT 1');res.json({status:'ok',database:'connected'});}
  catch {res.status(503).json({status:'degraded',database:'unavailable'});}
});
app.post('/api/auth/login',async(req,res,next)=>{
  try {
    const ip=req.ip||'unknown', now=Date.now(); const current=loginAttempts.get(ip);
    if(current && current.until>now && current.count>=8){res.status(429).json({message:'Terlalu banyak percobaan. Coba lagi dalam 15 menit.'});return;}
    const data=z.object({email:z.string().email(),password:z.string().min(1)}).parse(req.body);
    const [user]=await rows<{id:number;name:string;email:string;role:any;active:number;password_hash:string}>('SELECT * FROM users WHERE email=?',[data.email.toLowerCase()]);
    const matches=user && user.active && await bcrypt.compare(data.password,user.password_hash);
    if(!matches){const old=current&&current.until>now?current.count:0;loginAttempts.set(ip,{count:old+1,until:now+15*60_000});res.status(401).json({message:'Email atau password tidak sesuai.'});return;}
    loginAttempts.delete(ip);
    const identity={id:user.id,name:user.name,email:user.email,role:user.role};
    setSession(res,issueToken(identity));res.json({user:identity});
  }catch(e){next(e);}
});
app.post('/api/auth/logout',(_req,res)=>{clearSession(res);res.json({ok:true});});
app.get('/api/auth/me',authenticate,(req,res)=>res.json({user:req.identity}));
app.use('/api/auth/passkey',passkeyPublicRouter);
app.use('/api/passkeys',passkeyPrivateRouter);
app.use('/api',authenticate,routes);
app.use('/api',(_req,res)=>res.status(404).json({message:'Endpoint tidak ditemukan.'}));
if(process.env.NODE_ENV==='production'){
  app.use(express.static(resolve('dist')));
  app.get('*',(_req,res)=>res.sendFile(resolve('dist','index.html')));
}
app.use((error:Error,req:Request,res:Response,_next:NextFunction)=>{
  if(error instanceof ZodError){res.status(422).json({message:'Periksa data form.',details:error.issues});return;}
  if(error.message.startsWith('ER_') || (error as any).code?.startsWith('ER_')){
    const code=(error as any).code;
    res.status(code==='ER_DUP_ENTRY'?409:400).json({message:code==='ER_DUP_ENTRY'?'Data sudah ada.':'Data tidak dapat disimpan. Periksa referensi dan kelengkapan.'});return;
  }
  if(/tidak valid|tidak seimbang|tidak ditemukan|tidak boleh|melebihi|sudah|wajib|harus|maksimal|belum|terkunci|ditolak|dibatalkan|tidak dapat|hanya/i.test(error.message)){
    res.status(422).json({message:error.message});return;
  }
  console.error(`API ${req.method} ${req.path}`,error);
  res.status(500).json({message:'Terjadi kesalahan server.'});
});
app.listen(Number(process.env.PORT||4000),()=>console.log(`Wedding-In API listening on ${process.env.PORT||4000}`));
