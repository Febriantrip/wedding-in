import {randomUUID} from 'node:crypto';
import {Router,type Request,type Response,type NextFunction} from 'express';
import {z} from 'zod';
import {rows,execSql,transaction,type DbConn} from '../../db.js';
import {allow} from '../../auth.js';
import {decimal,moneyCents,incomeStatement} from '../../accounting.js';
import {issueWeddingInvoice} from '../../invoices.js';
import {calculateChange,applyApprovedChange} from './calculations.js';
import {auditProject as audit} from './audit.js';

export const projectRouter=Router();
const wrap=(handler:(req:Request,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{
  Promise.resolve(handler(req,res)).catch(next);
};
const editor=allow('owner','admin','planner','sales');
const finance=allow('owner','admin','finance');
const manager=allow('owner','admin');
const canSeeCost=(role:string)=>['owner','admin','finance'].includes(role);
const positive=z.coerce.number().int().positive();
const date=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/);
const required=z.string().trim().min(1);
const amt=z.union([z.string(),z.number()]).transform(String).refine(value=>{
  try{moneyCents(value);return true;}catch{return false;}
},'Nominal tidak valid (maksimal 2 desimal).');
const toId=(raw:unknown)=>positive.parse(raw);
const today=()=>new Date().toISOString().slice(0,10);
const cents=(raw:unknown)=>moneyCents(raw);
const sumCents=(values:unknown[])=>values.reduce<number>((total,value)=>total+cents(value),0);

async function lockProject(conn:DbConn,eventId:number){
  const [project]=await rows<any>('SELECT * FROM events WHERE id=? FOR UPDATE',[eventId],conn);
  if(!project)throw new Error('Wedding tidak ditemukan.');
  if(['completed','cancelled'].includes(project.status))throw new Error('Wedding selesai/dibatalkan. Perubahan proyek terkunci.');
  return project;
}
const bookingInput=z.object({
  payment_responsibility:z.enum(['managed_vendor','client_direct']),
  booking_status:z.enum(['requested','confirmed','cancelled']),
  contract_reference:z.string().max(150).optional().default(''),
  deposit_amount:amt,
  deposit_due:date.nullable().optional(),
  final_due:date.nullable().optional(),
  terms:z.string().max(3000).optional().default(''),
  cancel_reason:z.string().trim().max(350).optional()
}).strict();

projectRouter.get('/:id/control',wrap(async(req,res)=>{
  const eventId=toId(req.params.id),authorized=canSeeCost(req.identity!.role);
  const [project]=await rows<any>(`SELECT e.*,c.name client_name,c.partner_name,c.phone client_phone
    FROM events e JOIN clients c ON c.id=e.client_id WHERE e.id=?`,[eventId]);
  if(!project){res.sendStatus(404);return;}
  const [vendors,terms,changes,budgetLines,budgetHead,audits]=await Promise.all([
    rows<any>(`SELECT ev.id assignment_id,ev.vendor_id,v.name vendor_name,v.category,v.phone,ev.service_name,ev.agreed_price,
      ev.status assignment_status,ev.notes assignment_notes,b.id booking_id,b.payment_responsibility,b.booking_status,
      b.contract_reference,b.deposit_amount,b.deposit_due,b.final_due,b.terms,b.cancel_reason
      FROM event_vendors ev JOIN vendors v ON v.id=ev.vendor_id
      LEFT JOIN event_vendor_bookings b ON b.assignment_id=ev.id WHERE ev.event_id=? ORDER BY ev.id DESC`,[eventId]),
    authorized?rows<any>(`SELECT s.*,i.number invoice_number,i.amount invoice_amount,
      COALESCE((SELECT SUM(p.amount) FROM invoice_payments p WHERE p.invoice_id=s.invoice_id AND NOT EXISTS
        (SELECT 1 FROM lifecycle_actions a WHERE a.entity_type='invoice_payments' AND a.entity_id=p.id AND a.action='cancel')),0) paid,
      (SELECT a.reason FROM lifecycle_actions a WHERE a.entity_type='invoices' AND a.entity_id=s.invoice_id AND a.action='cancel' LIMIT 1) invoice_cancel_reason
      FROM event_payment_schedules s LEFT JOIN invoices i ON i.id=s.invoice_id
      WHERE s.event_id=? ORDER BY s.due_date,s.id`,[eventId]):Promise.resolve([]),
    authorized?rows<any>('SELECT * FROM event_change_orders WHERE event_id=? ORDER BY id DESC',[eventId]):Promise.resolve([]),
    authorized?rows<any>(`SELECT b.* FROM event_budget_lines b JOIN event_budget_revisions r ON r.id=b.budget_revision_id
      WHERE r.event_id=? AND r.revision_no=(SELECT MAX(r2.revision_no) FROM event_budget_revisions r2 WHERE r2.event_id=?) ORDER BY b.id`,[eventId,eventId]):Promise.resolve([]),
    authorized?rows<any>('SELECT * FROM event_budget_revisions WHERE event_id=? ORDER BY revision_no DESC LIMIT 1',[eventId]):Promise.resolve([]),
    rows<any>(`SELECT a.id,a.action,a.target_type,a.target_id,a.note,a.created_at,u.name actor_name
      FROM event_project_audits a JOIN users u ON u.id=a.actor_id WHERE a.event_id=? ORDER BY a.id DESC LIMIT 30`,[eventId])
  ]);
  const [invoices,bills,actual,changeLines,contractRevisions]=authorized?await Promise.all([
    rows<any>(`SELECT i.*,COALESCE((SELECT SUM(p.amount) FROM invoice_payments p WHERE p.invoice_id=i.id AND NOT EXISTS
      (SELECT 1 FROM lifecycle_actions a WHERE a.entity_type='invoice_payments' AND a.entity_id=p.id AND a.action='cancel')),0) paid,
      (SELECT a.reason FROM lifecycle_actions a WHERE a.entity_type='invoices' AND a.entity_id=i.id AND a.action='cancel' LIMIT 1) cancel_reason
      FROM invoices i WHERE i.event_id=? ORDER BY i.due_date,i.id`,[eventId]),
    rows<any>(`SELECT b.*,v.name vendor_name,
      COALESCE((SELECT SUM(p.amount) FROM bill_payments p WHERE p.bill_id=b.id AND NOT EXISTS
        (SELECT 1 FROM lifecycle_actions a WHERE a.entity_type='bill_payments' AND a.entity_id=p.id AND a.action='cancel')),0) paid,
      (SELECT a.reason FROM lifecycle_actions a WHERE a.entity_type='bills' AND a.entity_id=b.id AND a.action='cancel' LIMIT 1) cancel_reason
      FROM bills b LEFT JOIN vendors v ON v.id=b.vendor_id WHERE b.event_id=? ORDER BY b.id DESC`,[eventId]),
    incomeStatement('2000-01-01',today(),eventId),
    rows<any>(`SELECT l.* FROM event_change_order_lines l JOIN event_change_orders o ON o.id=l.change_order_id
      WHERE o.event_id=? ORDER BY o.id DESC,l.id`,[eventId]),
    rows<any>('SELECT * FROM event_contract_revisions WHERE event_id=? ORDER BY revision_no DESC',[eventId])
  ]):[[],[],null,[],[]];
  const directBase=String(budgetHead[0]?.direct_budget??'0.00');
  const signedCents=(value:string)=>value.startsWith('-')?-cents(value.slice(1)):cents(value);
  const approvedDirect=changes.filter(x=>x.status==='approved').reduce((total,x)=>total+signedCents(String(x.delta_direct)),0);
  const directBudget=decimal(cents(directBase)+approvedDirect);
  const activeInvoices=invoices.filter(x=>!x.cancel_reason);
  const activeBills=bills.filter(x=>!x.cancel_reason);
  const invoiceTotal=sumCents(activeInvoices.map(x=>x.amount));
  const invoicePaid=sumCents(activeInvoices.map(x=>x.paid));
  const billTotal=sumCents(activeBills.map(x=>x.amount));
  const billPaid=sumCents(activeBills.map(x=>x.paid));
  const committedCents=sumCents(vendors.filter(x=>x.booking_status==='confirmed'&&x.payment_responsibility==='managed_vendor').map(x=>x.agreed_price));
  res.json({
    project:authorized?project:{...project,estimated_cost:null},
    vendors:authorized?vendors:vendors.map(x=>({...x,agreed_price:null,deposit_amount:null})),
    terms,changes:changes.map(order=>({...order,lines:changeLines.filter(x=>Number(x.change_order_id)===Number(order.id))})),
    budget_lines:budgetLines,contract_revisions:contractRevisions,audits,
    invoices,bills,
    totals:authorized?{
      contract_amount:project.contract_amount,estimated_cost:project.estimated_cost,
      direct_budget:directBudget,client_budget:decimal(cents(project.contract_amount)+cents(directBudget)),
      estimated_profit:(Number(project.contract_amount)-Number(project.estimated_cost)).toFixed(2),
      invoice_total:decimal(invoiceTotal),invoice_paid:decimal(invoicePaid),invoice_balance:decimal(invoiceTotal-invoicePaid),
      bill_total:decimal(billTotal),bill_paid:decimal(billPaid),bill_balance:decimal(billTotal-billPaid),
      vendor_committed:decimal(committedCents),
      actual_cost:(Number(actual?.cogs??0)+Number(actual?.operating_expense??0)).toFixed(2),
      recognized_revenue:Number(actual?.revenue??0).toFixed(2),
      recognized_profit:Number(actual?.net_profit??0).toFixed(2)
    }:null
  });
}));

projectRouter.put('/:id/bookings/:assignmentId',finance,wrap(async(req,res)=>{
  const eventId=toId(req.params.id),assignmentId=toId(req.params.assignmentId),input=bookingInput.parse(req.body);
  const result=await transaction(async conn=>{
    const project=await lockProject(conn,eventId);
    const [assignment]=await rows<any>(`SELECT ev.*,v.active vendor_active FROM event_vendors ev
      JOIN vendors v ON v.id=ev.vendor_id WHERE ev.id=? AND ev.event_id=? FOR UPDATE`,[assignmentId,eventId],conn);
    if(!assignment||!assignment.vendor_active)throw new Error('Penugasan/vendor tidak tersedia.');
    if(cents(input.deposit_amount)>cents(assignment.agreed_price))throw new Error('DP tidak boleh melebihi harga vendor yang disepakati.');
    if(input.booking_status==='cancelled'&&(!input.cancel_reason||input.cancel_reason.length<5))
      throw new Error('Alasan pembatalan wajib diisi minimal 5 karakter.');
    const bills=await rows<any>(`SELECT b.id FROM bills b WHERE b.event_id=? AND b.vendor_id=? AND NOT EXISTS
      (SELECT 1 FROM lifecycle_actions a WHERE a.entity_type='bills' AND a.entity_id=b.id AND a.action='cancel') LIMIT 1`,[eventId,assignment.vendor_id],conn);
    if(bills.length&&(input.payment_responsibility==='client_direct'||input.booking_status==='cancelled'))
      throw new Error('Vendor memiliki tagihan aktif. Selesaikan/koreksi tagihan sebelum mengubah tanggung jawab pembayaran atau membatalkan booking.');
    if(input.booking_status==='confirmed'){
      await rows('SELECT id FROM vendors WHERE id=? FOR UPDATE',[assignment.vendor_id],conn);
      const collision=await rows<any>(`SELECT e.title FROM event_vendors ev JOIN events e ON e.id=ev.event_id
        WHERE ev.vendor_id=? AND ev.event_id<>? AND e.event_date=? AND e.status NOT IN ('cancelled','completed')
        AND ev.status IN ('booked','confirmed') LIMIT 1`,[assignment.vendor_id,eventId,project.event_date],conn);
      if(collision.length)throw new Error(`Vendor sudah dibooking wedding lain pada tanggal yang sama: ${collision[0].title}.`);
    }
    const existing=await rows<any>('SELECT * FROM event_vendor_bookings WHERE assignment_id=? FOR UPDATE',[assignmentId],conn);
    let bookingId:number;
    if(existing.length){
      bookingId=existing[0].id;
      await execSql(`UPDATE event_vendor_bookings SET payment_responsibility=?,booking_status=?,contract_reference=?,
        deposit_amount=?,deposit_due=?,final_due=?,terms=?,cancel_reason=?,confirmed_by=?,confirmed_at=? WHERE id=?`,[
        input.payment_responsibility,input.booking_status,input.contract_reference,input.deposit_amount,input.deposit_due??null,
        input.final_due??null,input.terms,input.booking_status==='cancelled'?input.cancel_reason:null,
        input.booking_status==='confirmed'?req.identity!.id:null,input.booking_status==='confirmed'?new Date():null,bookingId],conn);
    }else{
      const booking=await execSql(`INSERT INTO event_vendor_bookings(assignment_id,payment_responsibility,booking_status,contract_reference,
        deposit_amount,deposit_due,final_due,terms,cancel_reason,confirmed_by,confirmed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,[
        assignmentId,input.payment_responsibility,input.booking_status,input.contract_reference,input.deposit_amount,input.deposit_due??null,
        input.final_due??null,input.terms,input.booking_status==='cancelled'?input.cancel_reason:null,
        input.booking_status==='confirmed'?req.identity!.id:null,input.booking_status==='confirmed'?new Date():null],conn);
      bookingId=booking.insertId;
    }
    await execSql('UPDATE event_vendors SET status=? WHERE id=?',[
      input.booking_status==='confirmed'?'confirmed':input.booking_status==='cancelled'?'cancelled':'booked',assignmentId],conn);
    await audit(conn,eventId,'vendor_booking', 'event_vendor_bookings',bookingId,req.identity!.id,
      `${input.booking_status} · ${input.payment_responsibility} · ${input.contract_reference}`);
    return bookingId;
  });
  res.json({id:result,ok:true});
}));

const scheduleInput=z.object({label:required.max(140),amount:amt,due_date:date,
  idempotency_key:z.string().uuid().optional()}).strict();
projectRouter.post('/:id/payment-schedules',finance,wrap(async(req,res)=>{
  const eventId=toId(req.params.id),input=scheduleInput.parse(req.body);
  if(cents(input.amount)<=0)throw new Error('Termin harus bernilai positif.');
  const created=await transaction(async conn=>{
    const project=await lockProject(conn,eventId);
    if(input.idempotency_key){
      const [existing]=await rows<any>('SELECT id,event_id FROM event_payment_schedules WHERE idempotency_key=?',
        [input.idempotency_key],conn);
      if(existing){if(Number(existing.event_id)!==eventId)throw new Error('Kunci permintaan digunakan oleh wedding lain.');return existing.id;}
    }
    const [planned]=await rows<{amount:string}>(`SELECT COALESCE(SUM(amount),0) amount FROM event_payment_schedules
      WHERE event_id=? AND status='planned'`,[eventId],conn);
    if(cents(planned.amount)+cents(input.amount)>cents(project.contract_amount))
      throw new Error('Total termin aktif melebihi nilai kontrak WO. Periksa termin atau buat Change Order dahulu.');
    const entry=await execSql(`INSERT INTO event_payment_schedules(event_id,label,amount,due_date,idempotency_key,created_by)
      VALUES (?,?,?,?,?,?)`,[eventId,input.label,input.amount,input.due_date,input.idempotency_key??null,req.identity!.id],conn);
    await audit(conn,eventId,'term_create','event_payment_schedules',entry.insertId,req.identity!.id,input.label);
    return entry.insertId;
  });res.status(201).json({id:created});
}));

projectRouter.post('/:id/payment-schedules/:scheduleId/issue',finance,wrap(async(req,res)=>{
  const eventId=toId(req.params.id),scheduleId=toId(req.params.scheduleId);
  const invoiceId=await transaction(async conn=>{
    const event=await lockProject(conn,eventId);
    const [term]=await rows<any>('SELECT * FROM event_payment_schedules WHERE id=? AND event_id=? FOR UPDATE',[scheduleId,eventId],conn);
    if(!term||term.status!=='planned')throw new Error('Termin tidak tersedia atau telah dibatalkan.');
    if(term.invoice_id){
      const [cancelled]=await rows('SELECT id FROM lifecycle_actions WHERE entity_type=? AND entity_id=? AND action=? LIMIT 1',
        ['invoices',term.invoice_id,'cancel'],conn);
      if(!cancelled)return term.invoice_id;
    }
    const invoice=await issueWeddingInvoice(conn,{eventId,event,amount:term.amount,dueDate:term.due_date,
      description:term.label,userId:req.identity!.id,issuedAt:today()});
    await execSql('UPDATE event_payment_schedules SET invoice_id=? WHERE id=?',[invoice.invoiceId,scheduleId],conn);
    await audit(conn,eventId,'term_issue','event_payment_schedules',scheduleId,req.identity!.id,invoice.number);
    return invoice.invoiceId;
  });res.json({invoice_id:invoiceId,ok:true});
}));

projectRouter.post('/:id/payment-schedules/:scheduleId/cancel',finance,wrap(async(req,res)=>{
  const eventId=toId(req.params.id),scheduleId=toId(req.params.scheduleId),
    input=z.object({reason:required.min(5).max(350)}).parse(req.body);
  await transaction(async conn=>{
    await lockProject(conn,eventId);
    const [term]=await rows<any>('SELECT * FROM event_payment_schedules WHERE id=? AND event_id=? FOR UPDATE',[scheduleId,eventId],conn);
    if(!term||term.status!=='planned'||term.invoice_id)throw new Error('Termin sudah dibatalkan/ditagih dan tidak bisa dibatalkan di sini.');
    await execSql("UPDATE event_payment_schedules SET status='cancelled',cancel_reason=? WHERE id=?",[input.reason,scheduleId],conn);
    await audit(conn,eventId,'term_cancel','event_payment_schedules',scheduleId,req.identity!.id,input.reason);
  });res.json({ok:true});
}));

const changeLine=z.object({title:required.max(200),action:z.enum(['add','remove']),
  fulfillment:z.enum(['internal','managed_vendor','client_direct']),
  quantity:z.union([z.string(),z.number()]).transform(String),unit_sell:amt,unit_cost:amt});
const changeInput=z.object({explanation:required.min(5).max(350),lines:z.array(changeLine).min(1).max(30)}).strict();
projectRouter.post('/:id/change-orders',finance,wrap(async(req,res)=>{
  const eventId=toId(req.params.id),input=changeInput.parse(req.body),summary=calculateChange(input.lines);
  const changeId=await transaction(async conn=>{
    await lockProject(conn,eventId);
    const inserted=await execSql(`INSERT INTO event_change_orders(event_id,number,explanation,delta_contract,delta_direct,delta_cost,requested_by)
      VALUES (?,?,?,?,?,?,?)`,[eventId,`TMP-${randomUUID()}`,input.explanation,
      summary.delta_contract,summary.delta_direct,summary.delta_cost,req.identity!.id],conn);
    await execSql('UPDATE event_change_orders SET number=? WHERE id=?',
      [`CO-${new Date().getUTCFullYear()}-${String(inserted.insertId).padStart(6,'0')}`,inserted.insertId],conn);
    for(const line of summary.lines){
      await execSql(`INSERT INTO event_change_order_lines(change_order_id,title,action,fulfillment,quantity,unit_sell,unit_cost,delta_sell,delta_cost)
        VALUES (?,?,?,?,?,?,?,?,?)`,[inserted.insertId,line.title,line.action,line.fulfillment,line.quantity,line.unit_sell,
        line.unit_cost,line.delta_sell,line.delta_cost],conn);
    }
    await audit(conn,eventId,'change_submit','event_change_orders',inserted.insertId,req.identity!.id,input.explanation);
    return inserted.insertId;
  });res.status(201).json({id:changeId});
}));

projectRouter.post('/:id/change-orders/:changeId/approve',manager,wrap(async(req,res)=>{
  const eventId=toId(req.params.id),changeId=toId(req.params.changeId),
    input=z.object({client_approval_reference:required.min(5).max(200)}).parse(req.body);
  await transaction(async conn=>{
    const event=await lockProject(conn,eventId);
    const [change]=await rows<any>('SELECT * FROM event_change_orders WHERE id=? AND event_id=? FOR UPDATE',[changeId,eventId],conn);
    if(!change||change.status!=='submitted')throw new Error('Change Order sudah diputuskan atau tidak ditemukan.');
    const [latest]=await rows<any>('SELECT * FROM event_contract_revisions WHERE event_id=? ORDER BY revision_no DESC LIMIT 1',[eventId],conn);
    const [initial]=await rows<any>('SELECT direct_budget FROM event_budget_revisions WHERE event_id=? ORDER BY revision_no DESC LIMIT 1',[eventId],conn);
    const [prior]=await rows<{total:string}>(`SELECT COALESCE(SUM(delta_direct),0) total FROM event_change_orders
      WHERE event_id=? AND status='approved'`,[eventId],conn);
    const priorValue=String(prior?.total??'0.00');
    const priorCents=priorValue.startsWith('-')?-cents(priorValue.slice(1)):cents(priorValue);
    const direct=latest?.direct_budget??decimal(cents(initial?.direct_budget??'0.00')+priorCents);
    const after=applyApprovedChange({contract:event.contract_amount,cost:event.estimated_cost,direct},change);
    const [invoiced]=await rows<{total:string}>(`SELECT COALESCE(SUM(i.amount),0) total FROM invoices i WHERE i.event_id=?
      AND NOT EXISTS (SELECT 1 FROM lifecycle_actions a WHERE a.entity_type='invoices' AND a.entity_id=i.id AND a.action='cancel')`,[eventId],conn);
    const [scheduled]=await rows<{total:string}>(`SELECT COALESCE(SUM(amount),0) total FROM event_payment_schedules
      WHERE event_id=? AND status='planned'`,[eventId],conn);
    if(cents(after.contract)<Math.max(cents(invoiced.total),cents(scheduled.total)))
      throw new Error('Nilai kontrak baru lebih kecil dari termin atau invoice aktif. Koreksi terlebih dahulu.');
    if(!latest){
      await execSql(`INSERT INTO event_contract_revisions(event_id,revision_no,contract_amount,estimated_cost,direct_budget,created_by)
        VALUES (?,?,?,?,?,?)`,[eventId,1,event.contract_amount,event.estimated_cost,direct,req.identity!.id],conn);
    }
    await execSql('UPDATE events SET contract_amount=?,estimated_cost=? WHERE id=?',[after.contract,after.cost,eventId],conn);
    await execSql(`INSERT INTO event_contract_revisions(event_id,revision_no,change_order_id,contract_amount,estimated_cost,direct_budget,created_by)
      VALUES (?,?,?,?,?,?,?)`,[eventId,(Number(latest?.revision_no)||1)+1,changeId,after.contract,after.cost,after.direct,req.identity!.id],conn);
    await execSql("UPDATE event_change_orders SET status='approved',client_approval_reference=?,decided_by=?,decided_at=NOW() WHERE id=?",
      [input.client_approval_reference,req.identity!.id,changeId],conn);
    await audit(conn,eventId,'change_approve','event_change_orders',changeId,req.identity!.id,input.client_approval_reference);
  });res.json({ok:true});
}));

projectRouter.post('/:id/change-orders/:changeId/reject',manager,wrap(async(req,res)=>{
  const eventId=toId(req.params.id),changeId=toId(req.params.changeId),
    input=z.object({reason:required.min(5).max(350)}).parse(req.body);
  await transaction(async conn=>{
    await lockProject(conn,eventId);
    const [change]=await rows<any>('SELECT * FROM event_change_orders WHERE id=? AND event_id=? FOR UPDATE',[changeId,eventId],conn);
    if(!change||change.status!=='submitted')throw new Error('Change Order sudah diputuskan atau tidak ditemukan.');
    await execSql("UPDATE event_change_orders SET status='rejected',decision_reason=?,decided_by=?,decided_at=NOW() WHERE id=?",
      [input.reason,req.identity!.id,changeId],conn);
    await audit(conn,eventId,'change_reject','event_change_orders',changeId,req.identity!.id,input.reason);
  });res.json({ok:true});
}));
