import {Router,type Request,type Response,type NextFunction} from 'express';
import bcrypt from 'bcryptjs';
import {z} from 'zod';
import {rows,execSql} from './db.js';
import {allow} from './auth.js';

export const settingsRouter=Router();
const wrap=(fn:(req:Request,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{
  Promise.resolve(fn(req,res)).catch(next);
};
const id=(value:unknown)=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<1)throw new Error('ID tidak valid.');return n;};
const account=z.object({code:z.string().trim().regex(/^[0-9A-Za-z-]{2,16}$/),
  name:z.string().trim().min(2).max(120),type:z.enum(['asset','liability','equity','revenue','cogs','expense']),
  is_cash:z.boolean().default(false),active:z.boolean().default(true)});
const user=z.object({name:z.string().trim().min(2).max(120),email:z.string().trim().email().max(190),
  role:z.enum(['owner','admin','finance','planner','sales']),password:z.string().min(10).max(128)});
const manager=allow('owner','admin');

settingsRouter.get('/accounts',allow('owner','admin','finance'),wrap(async(_req,res)=>{
  res.json({data:await rows('SELECT id,code,name,type,is_cash,active FROM accounts ORDER BY code')});
}));
settingsRouter.post('/accounts',manager,wrap(async(req,res)=>{
  const input=account.parse(req.body);
  if(input.is_cash&&input.type!=='asset')throw new Error('Hanya akun aset yang bisa menjadi kas/bank.');
  const result=await execSql('INSERT INTO accounts(code,name,type,is_cash,active) VALUES (?,?,?,?,?)',
    [input.code,input.name,input.type,input.is_cash?1:0,input.active?1:0]);
  res.status(201).json({id:result.insertId});
}));
settingsRouter.patch('/accounts/:id',manager,wrap(async(req,res)=>{
  const entryId=id(req.params.id),input=account.partial().parse(req.body);
  const [existing]=await rows<any>('SELECT * FROM accounts WHERE id=?',[entryId]);
  if(!existing)throw new Error('Akun tidak ditemukan.');
  const nextType=input.type??existing.type,nextCash=input.is_cash??Boolean(existing.is_cash);
  if(nextCash&&nextType!=='asset')throw new Error('Hanya akun aset yang bisa menjadi kas/bank.');
  const [used]=await rows<{count:number}>('SELECT COUNT(*) count FROM journal_lines WHERE account_id=?',[entryId]);
  if(Number(used.count)>0&&((input.code&&input.code!==existing.code)||(input.type&&input.type!==existing.type)))
    throw new Error('Kode dan tipe akun yang sudah memiliki jurnal tidak boleh diubah.');
  const updates=Object.entries(input);
  if(!updates.length)throw new Error('Tidak ada informasi yang diubah.');
  await execSql(`UPDATE accounts SET ${updates.map(([key])=>`${key}=?`).join(',')} WHERE id=?`,
    [...updates.map(([_,val])=>typeof val==='boolean'?(val?1:0):val),entryId]);
  res.json({ok:true});
}));

settingsRouter.get('/users',manager,wrap(async(_req,res)=>{
  res.json({data:await rows('SELECT id,name,email,role,active,created_at FROM users ORDER BY id DESC')});
}));
settingsRouter.post('/users',manager,wrap(async(req,res)=>{
  const input=user.parse(req.body);
  if(input.role==='owner'&&req.identity!.role!=='owner')throw new Error('Hanya owner dapat memberikan hak owner.');
  const hash=await bcrypt.hash(input.password,12);
  const result=await execSql('INSERT INTO users(name,email,role,password_hash,active) VALUES (?,?,?,?,1)',
    [input.name,input.email.toLowerCase(),input.role,hash]);
  res.status(201).json({id:result.insertId});
}));
settingsRouter.patch('/users/:id',manager,wrap(async(req,res)=>{
  const entryId=id(req.params.id),input=user.extend({active:z.boolean()}).partial().parse(req.body);
  const [existing]=await rows<{role:string;active:number}>('SELECT role,active FROM users WHERE id=?',[entryId]);
  if(!existing)throw new Error('Pengguna tidak ditemukan.');
  if((existing.role==='owner'||input.role==='owner')&&req.identity!.role!=='owner')
    throw new Error('Hanya owner dapat mengubah akun owner.');
  if(entryId===req.identity!.id&&(input.active===false||(input.role&&input.role!==existing.role)))
    throw new Error('Anda tidak dapat menonaktifkan atau mengganti peran akun sendiri.');
  if(existing.role==='owner'&&(input.active===false||(input.role&&input.role!=='owner'))){
    const [total]=await rows<{count:number}>("SELECT COUNT(*) count FROM users WHERE role='owner' AND active=1");
    if(Number(total.count)<=1)throw new Error('Owner aktif terakhir tidak dapat dinonaktifkan.');
  }
  const updates=Object.entries(input).filter(([key])=>key!=='password');
  if(input.password)updates.push(['password_hash',await bcrypt.hash(input.password,12)]);
  if(!updates.length)throw new Error('Tidak ada informasi yang diubah.');
  await execSql(`UPDATE users SET ${updates.map(([key])=>`${key}=?`).join(',')} WHERE id=?`,
    [...updates.map(([key,val])=>key==='email'?String(val).toLowerCase():typeof val==='boolean'?(val?1:0):val),entryId]);
  res.json({ok:true});
}));
