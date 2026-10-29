import {z} from 'zod';
import type {Request,Response,NextFunction} from 'express';
import {rows,pool,type DbConn} from '../../db.js';
import {moneyCents} from '../../accounting.js';

export const wrap=(handler:(req:Request,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{
  Promise.resolve(handler(req,res)).catch(next);
};
export const id=(value:unknown)=>z.coerce.number().int().positive().parse(value);
export const required=z.string().trim().min(1);
export const day=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/);
export const amount=z.union([z.number(),z.string()]).transform(String).refine(value=>{
  try {return moneyCents(value)>0;}catch{return false;}
},'Nominal wajib positif dengan maksimal 2 digit desimal.');
export const canFinance=(role:string)=>['owner','admin','finance'].includes(role);
export const canManage=(role:string)=>['owner','admin'].includes(role);
export const canEdit=(role:string)=>['owner','admin','finance','planner','sales'].includes(role);
export async function findEvent(conn:DbConn|typeof pool,eventId:number,forUpdate=false){
  const [event]=await rows<any>(`SELECT id,title,status,contract_amount,estimated_cost FROM events WHERE id=? ${forUpdate?'FOR UPDATE':''}`,[eventId],conn);
  if(!event)throw new Error('Wedding tidak ditemukan.');
  return event;
}
export async function openEvent(conn:DbConn,eventId:number){
  const event=await findEvent(conn,eventId,true);
  if(['completed','cancelled'].includes(event.status))throw new Error('Wedding selesai/dibatalkan; tidak dapat menambah transaksi atau mengubah persiapan.');
  return event;
}
export const today=()=>new Date().toISOString().slice(0,10);
