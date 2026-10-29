import {Router,type Request,type Response,type NextFunction} from 'express';
import {z} from 'zod';
import {rows,execSql,transaction} from './db.js';
import {allow} from './auth.js';
import {moneyCents} from './accounting.js';
import {cancellationInput,logAction,alreadyCancelled,reverseJournal} from './lifecycle.js';
import {openEvent} from './modules/operations/shared.js';

export const financeActionsRouter=Router();
financeActionsRouter.use(allow('owner','admin','finance'));
const wrap=(fn:(req:Request,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>Promise.resolve(fn(req,res)).catch(next);
const id=(text:string)=>{const value=Number(text);if(!Number.isSafeInteger(value)||value<1)throw new Error('ID tidak valid.');return value;};
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
async function checkDocumentProject(conn:import('./db.js').DbConn,kind:'invoices'|'bills',entryId:number){
  const [document]=await rows<{event_id:number|null}>(`SELECT event_id FROM ${kind} WHERE id=?`,[entryId],conn);
  if(!document)throw new Error('Dokumen tidak ditemukan.');
  if(document.event_id)await openEvent(conn,document.event_id);
}

for(const kind of ['invoices','bills'] as const){
  const label=kind==='invoices'?'Invoice':'Tagihan vendor';
  financeActionsRouter.patch(`/${kind}/:id`,wrap(async(req,res)=>{
    const entryId=id(req.params.id);
    const data=(kind==='invoices'?z.object({description:z.string().trim().max(255),due_date:date}):
      z.object({description:z.string().trim().min(1).max(255),due_date:date})).partial().parse(req.body);
    const keys=Object.keys(data);if(!keys.length)throw new Error('Tidak ada data untuk diperbarui.');
    const result=await transaction(async conn=>{
      await checkDocumentProject(conn,kind,entryId);
      if(await alreadyCancelled(conn,kind,entryId))throw new Error(`${label} sudah dibatalkan.`);
      return execSql(`UPDATE ${kind} SET ${keys.map(k=>`${k}=?`).join(',')} WHERE id=?`,[...keys.map(k=>(data as any)[k]),entryId],conn);
    });
    if(!result.affectedRows){res.status(404).json({message:`${label} tidak ditemukan.`});return;}res.json({ok:true});
  }));
  financeActionsRouter.post(`/${kind}/:id/cancel`,wrap(async(req,res)=>{
    const entryId=id(req.params.id),{reason}=cancellationInput.parse(req.body);
    await transaction(async conn=>{
      await checkDocumentProject(conn,kind,entryId);
      const [entry]=await rows<{id:number;number:string}>(`SELECT id,number FROM ${kind} WHERE id=? FOR UPDATE`,[entryId],conn);
      if(!entry)throw new Error(`${label} tidak ditemukan.`);
      if(await alreadyCancelled(conn,kind,entryId))throw new Error(`${label} sudah dibatalkan.`);
      const paymentTable=kind==='invoices'?'invoice_payments':'bill_payments';
      const fk=kind==='invoices'?'invoice_id':'bill_id';
      const [payment]=await rows<{paid:string}>(`SELECT COALESCE(SUM(p.amount),0) paid FROM ${paymentTable} p WHERE p.${fk}=?
        AND NOT EXISTS(SELECT 1 FROM lifecycle_actions a WHERE a.entity_type=? AND a.entity_id=p.id AND a.action='cancel')`,[entryId,paymentTable],conn);
      if(moneyCents(payment.paid)>0)throw new Error(`${label} sudah dibayar. Selesaikan proses refund/koreksi pembayaran sebelum membatalkan.`);
      const [journal]=await rows<{id:number}>('SELECT id FROM journals WHERE reference_type=? AND reference_id=? ORDER BY id LIMIT 1',
        [kind==='invoices'?'invoice':'bill',entryId],conn);
      if(!journal)throw new Error('Jurnal asal tidak ditemukan.');
      await reverseJournal(conn,journal.id,reason,req.identity!.id);
      await logAction(conn,kind,entryId,'cancel',reason,req.identity!.id);
    });res.json({ok:true});
  }));
}

// Financial payments remain in the audit trail; a cancellation posts a balanced reversal.
for(const kind of ['invoices','bills'] as const){
  const table=kind==='invoices'?'invoice_payments':'bill_payments',fk=kind==='invoices'?'invoice_id':'bill_id';
  financeActionsRouter.get(`/${kind}/:id/payments`,wrap(async(req,res)=>{
    const documentId=id(req.params.id);
    const [doc]=await rows(`SELECT id FROM ${kind} WHERE id=?`,[documentId]);
    if(!doc){res.status(404).json({message:'Dokumen tidak ditemukan.'});return;}
    res.json({data:await rows(`SELECT p.id,p.amount,p.method,p.paid_at,p.reference,
      (SELECT a.reason FROM lifecycle_actions a WHERE a.entity_type=? AND a.entity_id=p.id AND a.action='cancel' LIMIT 1) cancel_reason
      FROM ${table} p WHERE p.${fk}=? ORDER BY p.id`,[table,documentId])});
  }));
  financeActionsRouter.post(`/${kind}/:id/payments/:paymentId/cancel`,wrap(async(req,res)=>{
    const documentId=id(req.params.id),paymentId=id(req.params.paymentId),{reason}=cancellationInput.parse(req.body);
    await transaction(async conn=>{
      await checkDocumentProject(conn,kind,documentId);
      const [payment]=await rows<{id:number;journal_id:number}>(`SELECT id,journal_id FROM ${table} WHERE id=? AND ${fk}=? FOR UPDATE`,[paymentId,documentId],conn);
      if(!payment)throw new Error('Pembayaran tidak ditemukan.');
      if(await alreadyCancelled(conn,table,paymentId))throw new Error('Pembayaran sudah dibatalkan.');
      if(await alreadyCancelled(conn,kind,documentId))throw new Error('Dokumen asal sudah dibatalkan.');
      await reverseJournal(conn,payment.journal_id,reason,req.identity!.id);
      await logAction(conn,table,paymentId,'cancel',reason,req.identity!.id);
    });res.json({ok:true});
  }));
}

financeActionsRouter.post('/journals/:id/cancel',wrap(async(req,res)=>{
  const entryId=id(req.params.id),{reason}=cancellationInput.parse(req.body);
  await transaction(async conn=>{
    const events=await rows<{event_id:number}>(`SELECT DISTINCT event_id FROM journal_lines WHERE journal_id=? AND event_id IS NOT NULL`,[entryId],conn);
    for(const event of events)await openEvent(conn,event.event_id);
    const [journal]=await rows<{id:number;reference_type:string}>('SELECT id,reference_type FROM journals WHERE id=? FOR UPDATE',[entryId],conn);
    if(!journal)throw new Error('Jurnal tidak ditemukan.');
    if(journal.reference_type!=='manual')throw new Error('Jurnal otomatis tidak dapat dibatalkan langsung. Batalkan dokumen asalnya.');
    if(await alreadyCancelled(conn,'journals',entryId))throw new Error('Jurnal sudah dibatalkan.');
    await reverseJournal(conn,entryId,reason,req.identity!.id);
    await logAction(conn,'journals',entryId,'cancel',reason,req.identity!.id);
  });res.json({ok:true});
}));
