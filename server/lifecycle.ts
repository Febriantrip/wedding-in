import {z} from 'zod';
import {execSql,rows,type DbConn} from './db.js';
import {postJournal} from './accounting.js';

export const cancellationInput=z.object({reason:z.string().trim().min(5,'Alasan pembatalan wajib diisi minimal 5 karakter.').max(2000)});
export async function logAction(conn:DbConn,entityType:string,entityId:number,action:string,reason:string,userId:number){
  await execSql('INSERT INTO lifecycle_actions(entity_type,entity_id,action,reason,created_by) VALUES (?,?,?,?,?)',
    [entityType,entityId,action,reason,userId],conn);
}
export async function alreadyCancelled(conn:DbConn,entityType:string,entityId:number){
  const [row]=await rows('SELECT id FROM lifecycle_actions WHERE entity_type=? AND entity_id=? AND action=?',
    [entityType,entityId,'cancel'],conn);
  return Boolean(row);
}
export async function reverseJournal(conn:DbConn,journalId:number,reason:string,userId:number){
  const [journal]=await rows<{id:number;cash_flow:'operating'|'investing'|'financing'|'opening'|'none';description:string}>(
    'SELECT id,cash_flow,description FROM journals WHERE id=?',[journalId],conn);
  if(!journal)throw new Error('Jurnal asal tidak ditemukan.');
  const lines=await rows<{code:string;debit:string;credit:string;event_id:number|null}>(
    'SELECT a.code,l.debit,l.credit,l.event_id FROM journal_lines l JOIN accounts a ON a.id=l.account_id WHERE l.journal_id=? ORDER BY l.id',[journalId],conn);
  if(!lines.length)throw new Error('Baris jurnal asal tidak ditemukan.');
  return postJournal(conn,{date:new Date().toISOString().slice(0,10),description:`Pembatalan: ${journal.description} — ${reason.slice(0,80)}`,
    reference_type:'reversal',reference_id:journalId,cash_flow:journal.cash_flow,user_id:userId,
    lines:lines.map(x=>({code:x.code,debit:Number(x.credit),credit:Number(x.debit),event_id:x.event_id}))});
}
