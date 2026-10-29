import type {Router} from 'express';
import {z} from 'zod';
import {allow} from '../../auth.js';
import {rows,pool,execSql,transaction,type DbConn} from '../../db.js';
import {decimal,moneyCents,postJournal} from '../../accounting.js';
import {auditProject} from '../projects/audit.js';
import {wrap,id,openEvent,findEvent,required,today} from './shared.js';
import {closingBlockers,type ClosingCounts} from './closing-rules.js';

const finance=allow('owner','admin','finance');
const manager=allow('owner','admin');
type AmountRow={amount:string};
const totalCents=(value:string)=>moneyCents(value??'0.00');
const signedCents=(value:string)=>String(value).startsWith('-')?-totalCents(String(value).slice(1)):totalCents(String(value));

async function financialSnapshot(conn:DbConn|typeof pool,eventId:number){
  const [[invoice],[bill],[vendor],[ledger]]=await Promise.all([
    rows<any>(`SELECT COALESCE(SUM(i.amount),0) amount,COALESCE(SUM((SELECT COALESCE(SUM(p.amount),0) FROM invoice_payments p
      WHERE p.invoice_id=i.id AND NOT EXISTS(SELECT 1 FROM lifecycle_actions a WHERE a.entity_type='invoice_payments'
      AND a.entity_id=p.id AND a.action='cancel'))),0) paid FROM invoices i WHERE i.event_id=?
      AND NOT EXISTS(SELECT 1 FROM lifecycle_actions a WHERE a.entity_type='invoices' AND a.entity_id=i.id AND a.action='cancel')`,[eventId],conn),
    rows<any>(`SELECT COALESCE(SUM(b.amount),0) amount,COALESCE(SUM((SELECT COALESCE(SUM(p.amount),0) FROM bill_payments p
      WHERE p.bill_id=b.id AND NOT EXISTS(SELECT 1 FROM lifecycle_actions a WHERE a.entity_type='bill_payments'
      AND a.entity_id=p.id AND a.action='cancel'))),0) paid FROM bills b WHERE b.event_id=?
      AND NOT EXISTS(SELECT 1 FROM lifecycle_actions a WHERE a.entity_type='bills' AND a.entity_id=b.id AND a.action='cancel')`,[eventId],conn),
    rows<{missing:number}>(`SELECT COUNT(*) missing FROM event_vendors ev JOIN event_vendor_bookings vb ON vb.assignment_id=ev.id
      WHERE ev.event_id=? AND vb.booking_status='confirmed' AND vb.payment_responsibility='managed_vendor'
      AND ev.agreed_price>(SELECT COALESCE(SUM(b.amount),0) FROM bills b WHERE b.event_id=ev.event_id
        AND b.vendor_id=ev.vendor_id AND NOT EXISTS(SELECT 1 FROM lifecycle_actions a
        WHERE a.entity_type='bills' AND a.entity_id=b.id AND a.action='cancel'))`,[eventId],conn),
    rows<any>(`SELECT COALESCE(SUM(CASE WHEN a.type='revenue' THEN l.credit-l.debit ELSE 0 END),0) revenue,
      COALESCE(SUM(CASE WHEN a.type IN ('cogs','expense') THEN l.debit-l.credit ELSE 0 END),0) cost
      FROM journal_lines l JOIN accounts a ON a.id=l.account_id WHERE l.event_id=?`,[eventId],conn)
  ]);
  return {invoice_total:invoice?.amount??'0.00',invoice_paid:invoice?.paid??'0.00',
    bill_total:bill?.amount??'0.00',bill_paid:bill?.paid??'0.00',
    vendor_missing:Number(vendor?.missing??0),revenue:ledger?.revenue??'0.00',cost:ledger?.cost??'0.00'};
}

export async function closingState(conn:DbConn|typeof pool,eventId:number,contract:string){
  const [[tasks],[changes],[expenses],[reversed],[pending],[terms],[rundown],[incidents],financial]=await Promise.all([
    rows<{total:number}>(`SELECT COUNT(*) total FROM tasks WHERE event_id=? AND status<>'done'`,[eventId],conn),
    rows<{total:number}>(`SELECT COUNT(*) total FROM event_change_orders WHERE event_id=? AND status='submitted'`,[eventId],conn),
    rows<{total:number}>(`SELECT COUNT(*) total FROM project_expense_requests WHERE event_id=? AND status IN ('submitted','approved')`,[eventId],conn),
    rows<{total:number}>(`SELECT COUNT(*) total FROM project_expense_requests r JOIN finance_transactions t ON t.id=r.finance_transaction_id
      WHERE r.event_id=? AND r.status='fulfilled' AND t.status<>'posted'`,[eventId],conn),
    rows<{total:number}>(`SELECT COUNT(*) total FROM finance_transactions WHERE event_id=?
      AND status IN ('draft','submitted','approved')`,[eventId],conn),
    rows<{total:number}>(`SELECT COUNT(*) total FROM event_payment_schedules s LEFT JOIN invoices i ON i.id=s.invoice_id
      WHERE s.event_id=? AND s.status='planned' AND (s.invoice_id IS NULL OR EXISTS(
        SELECT 1 FROM lifecycle_actions a WHERE a.entity_type='invoices' AND a.entity_id=s.invoice_id AND a.action='cancel'))`,[eventId],conn),
    rows<{total:number}>("SELECT COUNT(*) total FROM event_rundown_items WHERE event_id=? AND status IN ('scheduled','ongoing')",[eventId],conn),
    rows<{total:number}>("SELECT COUNT(*) total FROM event_incidents WHERE event_id=? AND status='open'",[eventId],conn),
    financialSnapshot(conn,eventId)
  ]);
  const counts:ClosingCounts={openTasks:Number(tasks?.total??0),pendingChanges:Number(changes?.total??0),
    pendingExpenses:Number(expenses?.total??0),reversedExpenses:Number(reversed?.total??0),
    pendingBackoffice:Number(pending?.total??0),unissuedTerms:Number(terms?.total??0),
    invoiceGap:Math.max(0,totalCents(contract)-totalCents(financial.invoice_total)),
    invoiceOutstanding:Math.max(0,totalCents(financial.invoice_total)-totalCents(financial.invoice_paid)),
    billOutstanding:Math.max(0,totalCents(financial.bill_total)-totalCents(financial.bill_paid)),
    unbilledVendors:financial.vendor_missing,unfinishedRundown:Number(rundown?.total??0),openIncidents:Number(incidents?.total??0)};
  return {counts,blockers:closingBlockers(counts),financial};
}

export function registerClosings(router:Router){
  router.get('/:id/closing',finance,wrap(async(req,res)=>{
    const eventId=id(req.params.id);
    const event=await findEvent(pool,eventId);
    const [closing]=await rows<any>('SELECT * FROM project_closings WHERE event_id=?',[eventId]);
    const state=event.status==='completed'?null:await closingState(pool,eventId,event.contract_amount);
    res.json({event,closing:closing??null,blockers:state?.blockers??[],counts:state?.counts??null,financial:state?.financial??null});
  }));

  router.post('/:id/closing/request',finance,wrap(async(req,res)=>{
    const eventId=id(req.params.id),input=z.object({note:required.min(8).max(600)}).parse(req.body);
    await transaction(async conn=>{
      const event=await openEvent(conn,eventId);
      const {blockers}=await closingState(conn,eventId,event.contract_amount);
      if(blockers.length)throw new Error(`Project belum siap ditutup: ${blockers.join(' ')}`);
      const [old]=await rows<any>('SELECT * FROM project_closings WHERE event_id=? FOR UPDATE',[eventId],conn);
      if(old?.status==='requested')throw new Error('Permintaan penutupan masih menunggu persetujuan.');
      if(old?.status==='completed')throw new Error('Project sudah ditutup.');
      let targetId:number;
      if(old){targetId=old.id;await execSql(`UPDATE project_closings SET status='requested',request_note=?,requested_by=?,
        reviewed_by=NULL,reviewed_at=NULL,decision_note=NULL WHERE id=?`,[input.note,req.identity!.id,targetId],conn);}
      else{const added=await execSql(`INSERT INTO project_closings(event_id,request_note,requested_by) VALUES (?,?,?)`,
        [eventId,input.note,req.identity!.id],conn);targetId=added.insertId;}
      await auditProject(conn,eventId,'closing_request','project_closings',targetId,req.identity!.id,input.note);
    });res.json({ok:true});
  }));

  router.post('/:id/closing/reject',manager,wrap(async(req,res)=>{
    const eventId=id(req.params.id),input=z.object({reason:required.min(8).max(600)}).parse(req.body);
    await transaction(async conn=>{
      await openEvent(conn,eventId);
      const [record]=await rows<any>('SELECT * FROM project_closings WHERE event_id=? FOR UPDATE',[eventId],conn);
      if(!record||record.status!=='requested')throw new Error('Belum ada permintaan penutupan aktif.');
      await execSql(`UPDATE project_closings SET status='rejected',decision_note=?,reviewed_by=?,reviewed_at=NOW() WHERE id=?`,
        [input.reason,req.identity!.id,record.id],conn);
      await auditProject(conn,eventId,'closing_reject','project_closings',record.id,req.identity!.id,input.reason);
    });res.json({ok:true});
  }));

  router.post('/:id/closing/approve',manager,wrap(async(req,res)=>{
    const eventId=id(req.params.id),input=z.object({note:required.min(8).max(600)}).parse(req.body);
    await transaction(async conn=>{
      const event=await openEvent(conn,eventId);
      const [record]=await rows<any>('SELECT * FROM project_closings WHERE event_id=? FOR UPDATE',[eventId],conn);
      if(!record||record.status!=='requested')throw new Error('Belum ada permintaan penutupan aktif.');
      const {blockers}=await closingState(conn,eventId,event.contract_amount);
      if(blockers.length)throw new Error(`Project belum siap ditutup: ${blockers.join(' ')}`);
      const [advance]=await rows<AmountRow>(`SELECT COALESCE(SUM(l.credit-l.debit),0) amount FROM journal_lines l
        JOIN accounts a ON a.id=l.account_id AND a.code='2100' WHERE l.event_id=?`,[eventId],conn);
      const advanceCents=signedCents(advance?.amount??'0.00');
      if(advanceCents>0){await postJournal(conn,{date:today(),description:`Pengakuan pendapatan - ${event.title}`,
        reference_type:'event_completion',reference_id:eventId,cash_flow:'none',user_id:req.identity!.id,
        lines:[{code:'2100',debit:Number(decimal(advanceCents)),event_id:eventId},
          {code:'4000',credit:Number(decimal(advanceCents)),event_id:eventId}]});}
      const latest=await financialSnapshot(conn,eventId);
      const snapshot={contract_amount:event.contract_amount,estimated_cost:event.estimated_cost,
        invoice_total:latest.invoice_total,bill_total:latest.bill_total,revenue:latest.revenue,cost:latest.cost,
        profit:decimal(signedCents(latest.revenue)-signedCents(latest.cost)),closed_on:today()};
      await execSql(`UPDATE project_closings SET status='completed',decision_note=?,reviewed_by=?,reviewed_at=NOW(),summary_json=?
        WHERE id=?`,[input.note,req.identity!.id,JSON.stringify(snapshot),record.id],conn);
      await execSql("UPDATE events SET status='completed' WHERE id=?",[eventId],conn);
      await auditProject(conn,eventId,'closing_approve','project_closings',record.id,req.identity!.id,input.note);
    });res.json({ok:true});
  }));
}
