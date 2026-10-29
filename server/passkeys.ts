import {Router,type Request,type Response,type NextFunction} from 'express';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import bcrypt from 'bcryptjs';
import {generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse} from '@simplewebauthn/server';
import {rows,execSql} from './db.js';
import {authenticate,issueToken,setSession} from './auth.js';

export const passkeyPublicRouter=Router(),passkeyPrivateRouter=Router();
const wrap=(fn:(req:Request,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{Promise.resolve(fn(req,res)).catch(next);};
const ttl=5*60_000,cookieName='wo_passkey_flow';
type Challenge={value:string;purpose:'register'|'login';userId?:number;expires:number};
const flows=new Map<string,Challenge>();
const attempts=new Map<string,{count:number;expires:number}>();

function environment(){
  const raw=process.env.PASSKEY_ORIGIN||((process.env.NODE_ENV==='production')?'':'http://localhost:5173');
  if(!raw)throw new Error('Atur PASSKEY_ORIGIN=https://domain-anda sebelum menggunakan passkey.');
  const origin=new URL(raw);
  if(origin.origin!==raw.replace(/\/$/,'')||(origin.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(origin.hostname)))
    throw new Error('PASSKEY_ORIGIN harus URL HTTPS atau localhost.');
  const rpID=process.env.PASSKEY_RP_ID||origin.hostname;
  if(!(origin.hostname===rpID||origin.hostname.endsWith(`.${rpID}`)))throw new Error('PASSKEY_RP_ID tidak sesuai dengan origin.');
  return {origin:origin.origin,rpID};
}
function saveFlow(res:Response,req:Request,flow:Omit<Challenge,'expires'>){
  if(flows.size>3000)for(const [key,val] of flows)if(val.expires<Date.now())flows.delete(key);
  const token=randomUUID();
  flows.set(token,{...flow,expires:Date.now()+ttl});
  res.cookie(cookieName,token,{httpOnly:true,sameSite:'strict',secure:environment().origin.startsWith('https:'),path:'/api',maxAge:ttl});
}
function consumeFlow(req:Request,res:Response,purpose:Challenge['purpose']){
  const token=req.cookies?.[cookieName];
  res.clearCookie(cookieName,{httpOnly:true,sameSite:'strict',secure:environment().origin.startsWith('https:'),path:'/api'});
  const flow=flows.get(token);flows.delete(token);
  if(!flow||flow.purpose!==purpose||flow.expires<Date.now())throw new Error('Verifikasi kedaluwarsa. Ulangi proses passkey.');
  return flow;
}
function guardAttempt(req:Request){
  const key=req.ip||'unknown',now=Date.now();
  const current=attempts.get(key);
  if(current&&current.expires>now&&current.count>=10)throw new Error('Terlalu banyak percobaan passkey. Coba lagi dalam 15 menit.');
  attempts.set(key,{count:(current&&current.expires>now?current.count:0)+1,expires:now+15*60_000});
}
type Stored={id:number;user_id:number;credential_id:string;public_key:Buffer;sign_count:number;transports:string};
const credential=(row:Stored)=>({
  id:row.credential_id,publicKey:new Uint8Array(row.public_key),counter:Number(row.sign_count),
  transports:JSON.parse(row.transports||'[]')
});

passkeyPublicRouter.post('/options',wrap(async(req,res)=>{
  guardAttempt(req);
  const {rpID}=environment();
  const options=await generateAuthenticationOptions({rpID,allowCredentials:[],userVerification:'required'});
  saveFlow(res,req,{value:options.challenge,purpose:'login'});
  res.json(options);
}));
passkeyPublicRouter.post('/verify',wrap(async(req,res)=>{
  guardAttempt(req);
  const flow=consumeFlow(req,res,'login'),payload=z.object({id:z.string().min(10)}).passthrough().parse(req.body);
  const [key]=await rows<Stored>('SELECT * FROM user_passkeys WHERE credential_id=?',[payload.id]);
  if(!key){res.status(401).json({message:'Passkey tidak dikenal.'});return;}
  const [user]=await rows<{id:number;name:string;email:string;role:any;active:number}>(
    'SELECT id,name,email,role,active FROM users WHERE id=?',[key.user_id]);
  if(!user?.active){res.status(401).json({message:'Akun tidak aktif atau tidak ditemukan.'});return;}
  const {rpID,origin}=environment();
  let check;
  try{check=await verifyAuthenticationResponse({response:req.body,expectedChallenge:flow.value,expectedOrigin:origin,
    expectedRPID:rpID,credential:credential(key),requireUserVerification:true});}
  catch{res.status(401).json({message:'Tanda tangan passkey tidak valid. Silakan coba lagi.'});return;}
  if(!check.verified){res.status(401).json({message:'Verifikasi passkey gagal.'});return;}
  await execSql('UPDATE user_passkeys SET sign_count=?,last_used_at=NOW() WHERE id=?',
    [check.authenticationInfo.newCounter,key.id]);
  attempts.delete(req.ip||'unknown');
  const identity={id:user.id,name:user.name,email:user.email,role:user.role};
  setSession(res,issueToken(identity));res.json({user:identity});
}));

passkeyPrivateRouter.use(authenticate);
passkeyPrivateRouter.get('/',wrap(async(req,res)=>{
  res.json({data:await rows('SELECT id,label,created_at,last_used_at FROM user_passkeys WHERE user_id=? ORDER BY id DESC',[req.identity!.id])});
}));
passkeyPrivateRouter.post('/register-options',wrap(async(req,res)=>{
  const input=z.object({password:z.string().min(1)}).parse(req.body);
  const [owner]=await rows<{password_hash:string}>('SELECT password_hash FROM users WHERE id=?',[req.identity!.id]);
  if(!owner||!await bcrypt.compare(input.password,owner.password_hash)){
    res.status(401).json({message:'Password akun diperlukan untuk mendaftarkan passkey.'});return;
  }
  const {rpID}=environment();
  const keys=await rows<Stored>('SELECT * FROM user_passkeys WHERE user_id=?',[req.identity!.id]);
  const options=await generateRegistrationOptions({rpName:'Wedding-In',rpID,userName:req.identity!.email,
    userDisplayName:req.identity!.name,userID:new TextEncoder().encode(String(req.identity!.id)),
    attestationType:'none',excludeCredentials:keys.map(key=>({id:key.credential_id,transports:credential(key).transports})),
    authenticatorSelection:{residentKey:'required',userVerification:'required'}});
  saveFlow(res,req,{value:options.challenge,purpose:'register',userId:req.identity!.id});
  res.json(options);
}));
passkeyPrivateRouter.post('/register-verify',wrap(async(req,res)=>{
  const flow=consumeFlow(req,res,'register');
  if(flow.userId!==req.identity!.id)throw new Error('Sesi pendaftaran passkey tidak sesuai.');
  const {rpID,origin}=environment();
  let check;
  try{check=await verifyRegistrationResponse({response:req.body,expectedChallenge:flow.value,
    expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true});}
  catch{res.status(422).json({message:'Passkey gagal diverifikasi oleh server.'});return;}
  if(!check.verified||!check.registrationInfo){res.status(422).json({message:'Passkey gagal diverifikasi.'});return;}
  const {credential:key}=check.registrationInfo;
  const input=z.object({label:z.string().trim().min(1).max(100).default('Passkey')}).safeParse(req.query);
  const label=input.success?input.data.label:'Passkey';
  await execSql('INSERT INTO user_passkeys(user_id,credential_id,public_key,sign_count,transports,label) VALUES (?,?,?,?,?,?)',
    [req.identity!.id,key.id,Buffer.from(key.publicKey),key.counter,JSON.stringify(key.transports||[]),label]);
  res.status(201).json({ok:true});
}));
passkeyPrivateRouter.delete('/:id',wrap(async(req,res)=>{
  const key=Number(req.params.id);
  if(!Number.isSafeInteger(key)||key<1)throw new Error('ID passkey tidak valid.');
  const result=await execSql('DELETE FROM user_passkeys WHERE id=? AND user_id=?',[key,req.identity!.id]);
  if(!result.affectedRows){res.status(404).json({message:'Passkey tidak ditemukan.'});return;}
  res.json({ok:true});
}));
