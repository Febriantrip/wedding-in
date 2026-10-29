import { Router, type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { rows, execSql, transaction, type DbConn } from './db.js';
import { allow } from './auth.js';
import { postJournal, moneyCents, balanceSheet, incomeStatement, cashFlow, trialBalance } from './accounting.js';
import {taskDocumentsRouter} from './task-documents.js';
import {cancellationInput,logAction,alreadyCancelled} from './lifecycle.js';
import {financeActionsRouter} from './finance-actions.js';
import {settingsRouter} from './settings.js';
import {commercialRouter} from './modules/commercial/routes.js';
import {backofficeRouter} from './modules/backoffice/routes.js';
import {projectRouter} from './modules/projects/routes.js';
import {issueWeddingInvoice} from './invoices.js';
import {operationsRouter} from './modules/operations/index.js';
import {openEvent} from './modules/operations/shared.js';

export const routes=Router();
routes.use('/tasks',taskDocumentsRouter);
routes.use('/finance',financeActionsRouter);
routes.use('/settings',settingsRouter);
routes.use('/commercial',commercialRouter);
routes.use('/backoffice',backofficeRouter);
routes.use('/projects',operationsRouter);
routes.use('/projects',projectRouter);
const wrap=(f:(req:Request,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{Promise.resolve(f(req,res)).catch(next);};
const str=z.string().trim().min(1),date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const amount=z.coerce.number().finite().min(0).max(9999999999999);
const positive=amount.positive();
const id=(raw:unknown)=>{const n=Number(raw);if(!Number.isSafeInteger(n)||n<=0)throw new Error('ID tidak valid.');return n;};
const today=()=>new Date().toISOString().slice(0,10);
const finance=allow('owner','admin','finance');
const editor=allow('owner','admin','planner','sales');
async function ensureWeddingOpen(eventId:number){
  const [event]=await rows<{status:string}>('SELECT status FROM events WHERE id=?',[eventId]);
  if(!event)throw new Error('Wedding tidak ditemukan.');
  if(event.status==='cancelled'||event.status==='completed')throw new Error('Wedding sudah selesai/dibatalkan; data historis tidak dapat diubah.');
}

const resourceFields:Record<string,string[]>={
  leads:['name','phone','email','source','status','wedding_date','estimated_budget','notes'],
  clients:['name','partner_name','phone','email','address'],
  vendors:['name','category','contact_person','phone','email','city','base_price','notes','active'],
  packages:['name','description','price','inclusions','active'],
  staff:['name','position','phone','daily_rate','active']
};
const schemas:Record<string,z.AnyZodObject>={
  leads:z.object({name:str,phone:z.string().optional(),email:z.union([z.string().email(),z.literal('')]).optional(),source:z.string().optional(),status:z.enum(['new','contacted','proposal','won','lost']).default('new'),wedding_date:date.optional().nullable(),estimated_budget:amount.default(0),notes:z.string().optional()}),
  clients:z.object({name:str,partner_name:z.string().optional(),phone:z.string().optional(),email:z.union([z.string().email(),z.literal('')]).optional(),address:z.string().optional()}),
  vendors:z.object({name:str,category:str,contact_person:z.string().optional(),phone:z.string().optional(),email:z.union([z.string().email(),z.literal('')]).optional(),city:z.string().optional(),base_price:amount.default(0),notes:z.string().optional(),active:z.boolean().optional()}),
  packages:z.object({name:str,description:z.string().optional(),price:amount,inclusions:z.array(z.string()).default([]),active:z.boolean().optional()}),
  staff:z.object({name:str,position:z.string().optional(),phone:z.string().optional(),daily_rate:amount.default(0),active:z.boolean().optional()})
};
routes.get('/resources/:kind',wrap(async(req,res)=>{
  const kind=req.params.kind;if(!resourceFields[kind]){res.status(404).json({message:'Master tidak ditemukan.'});return;}
  const data=await rows(`SELECT r.*,(SELECT a.reason FROM lifecycle_actions a WHERE a.entity_type=? AND a.entity_id=r.id AND a.action='cancel' LIMIT 1) cancel_reason
    FROM ${kind} r ORDER BY r.id DESC LIMIT 500`,[kind]);
  res.json({data:data.map(item=>kind==='packages'?{...item,inclusions:typeof item.inclusions==='string'?JSON.parse(item.inclusions):item.inclusions}:item)});
}));
routes.post('/resources/:kind',editor,wrap(async(req,res)=>{
  const kind=req.params.kind;if(!schemas[kind]){res.sendStatus(404);return;}
  const data=schemas[kind].parse(req.body) as Record<string,unknown>;
  const fields=Object.keys(data).filter(key=>resourceFields[kind].includes(key));
  const values=fields.map(key=>key==='inclusions'?JSON.stringify(data[key]):data[key]??null);
  const added=await execSql(`INSERT INTO ${kind} (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`,values);
  res.status(201).json({id:added.insertId});
}));
routes.patch('/resources/:kind/:id',editor,wrap(async(req,res)=>{
  const kind=req.params.kind;if(!schemas[kind]){res.sendStatus(404);return;}
  if(['leads','vendors','packages','staff'].includes(kind)){
    const [existing]=await rows<any>(`SELECT * FROM ${kind} WHERE id=?`,[id(req.params.id)]);
    if(!existing)throw new Error('Data tidak ditemukan.');
    const cancelled=await rows('SELECT id FROM lifecycle_actions WHERE entity_type=? AND entity_id=? AND action=?',[kind,id(req.params.id),'cancel']);
    if(cancelled.length)throw new Error('Data sudah dibatalkan/nonaktif dan tidak dapat diubah.');
  }
  const data=schemas[kind].partial().parse(req.body) as Record<string,unknown>;
  const fields=Object.keys(data).filter(key=>resourceFields[kind].includes(key));
  if(!fields.length)throw new Error('Tidak ada data untuk diperbarui.');
  await execSql(`UPDATE ${kind} SET ${fields.map(key=>`${key}=?`).join(',')} WHERE id=?`,[...fields.map(key=>key==='inclusions'?JSON.stringify(data[key]):data[key]??null),id(req.params.id)]);
  res.json({ok:true});
}));
routes.post('/resources/:kind/:id/cancel',editor,wrap(async(req,res)=>{
  const kind=req.params.kind,entryId=id(req.params.id),{reason}=cancellationInput.parse(req.body);
  if(!['leads','vendors','packages','staff'].includes(kind)){res.sendStatus(404);return;}
  await transaction(async conn=>{
    const [record]=await rows<any>(`SELECT * FROM ${kind} WHERE id=? FOR UPDATE`,[entryId],conn);
    if(!record)throw new Error('Data tidak ditemukan.');
    if(kind==='leads'){
      if(record.status==='lost')throw new Error('Lead sudah dibatalkan.');
      await execSql('UPDATE leads SET status=? WHERE id=?',['lost',entryId],conn);
    }else{
      if(!record.active)throw new Error('Data sudah nonaktif.');
      await execSql(`UPDATE ${kind} SET active=0 WHERE id=?`,[entryId],conn);
    }
    await logAction(conn,kind,entryId,'cancel',reason,req.identity!.id);
  });res.json({ok:true});
}));

routes.get('/dashboard',wrap(async(_req,res)=>{
  const [overview]=await rows<any>(`SELECT COUNT(*) total_events,
    COALESCE(SUM(status IN ('planning','confirmed','in_progress')),0) active_events,
    COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN contract_amount ELSE 0 END),0) contract_value,
    COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN contract_amount-estimated_cost ELSE 0 END),0) projected_margin
    FROM events`);
  const upcoming=await rows(`SELECT e.id,e.code,e.title,e.event_date,e.venue,e.city,e.status,c.name client_name,
    (SELECT COUNT(*) FROM tasks t WHERE t.event_id=e.id AND t.status<>'done') open_tasks
    FROM events e JOIN clients c ON c.id=e.client_id
    WHERE e.event_date>=CURDATE() AND e.status NOT IN ('completed','cancelled') ORDER BY e.event_date LIMIT 6`);
  const tasks=await rows(`SELECT t.id,t.title,t.due_at,t.status,e.title event_title,e.id event_id
    FROM tasks t JOIN events e ON e.id=t.event_id WHERE t.status<>'done' AND e.status<>'cancelled' ORDER BY t.due_at LIMIT 6`);
  const [cash]=await rows<{balance:string}>(`SELECT COALESCE(SUM(l.debit-l.credit),0) balance FROM journal_lines l JOIN accounts a ON a.id=l.account_id AND a.is_cash=1`);
  const [overdue]=await rows<{count:number}>(`SELECT COUNT(*) count FROM invoices i WHERE i.due_date<CURDATE() AND i.amount>
    (SELECT COALESCE(SUM(p.amount),0) FROM invoice_payments p WHERE p.invoice_id=i.id
      AND NOT EXISTS(SELECT 1 FROM lifecycle_actions a WHERE a.entity_type='invoice_payments' AND a.entity_id=p.id AND a.action='cancel'))
    AND NOT EXISTS(SELECT 1 FROM lifecycle_actions a WHERE a.entity_type='invoices' AND a.entity_id=i.id AND a.action='cancel')`);
  const trend=await rows(`SELECT DATE_FORMAT(event_date,'%Y-%m') month,COUNT(*) events,
    SUM(contract_amount) contract_value FROM events WHERE event_date >= DATE_SUB(CURDATE(),INTERVAL 5 MONTH)
    AND status<>'cancelled' GROUP BY DATE_FORMAT(event_date,'%Y-%m') ORDER BY month LIMIT 7`);
  const canFinance=['owner','admin','finance'].includes(_req.identity?.role||'');
  res.json({overview:canFinance?{...overview,cash_balance:cash?.balance??'0',overdue_invoices:overdue?.count??0}:
    {...overview,cash_balance:null,contract_value:null,projected_margin:null,overdue_invoices:null},upcoming,tasks,trend:canFinance?trend:[]});
}));

routes.get('/calendar',wrap(async(req,res)=>{
  const month=String(req.query.month??today().slice(0,7));
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Bulan kalender tidak valid.');
  const [year,monthNum]=month.split('-').map(Number),start=`${month}-01`;
  const endDate=new Date(Date.UTC(year,monthNum,1));
  const end=`${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth()+1).padStart(2,'0')}-01`;
  const [events,tasks]=await Promise.all([
    rows<{id:number;title:string;event_date:string;venue:string;city:string;status:string}>(
      `SELECT id,title,event_date,venue,city,status FROM events
       WHERE event_date>=? AND event_date<? AND status<>'cancelled' ORDER BY event_date,id LIMIT 300`,[start,end]),
    rows<{id:number;event_id:number;event_title:string;due_at:string;title:string;category:string;assigned_to:string;status:string;priority:string}>(
      `SELECT t.id,t.event_id,e.title event_title,t.due_at,t.title,t.category,t.assigned_to,t.status,t.priority
       FROM tasks t JOIN events e ON e.id=t.event_id
       WHERE t.due_at>=? AND t.due_at<? AND e.status<>'cancelled'
       ORDER BY t.due_at,t.id LIMIT 800`,[`${start} 00:00:00`,`${end} 00:00:00`])
  ]);
  const data=[
    ...events.map(event=>({id:event.id,kind:'wedding' as const,date:String(event.event_date).slice(0,10),
      title:event.title,event_id:event.id,event_title:event.title,status:event.status,venue:event.venue,city:event.city})),
    ...tasks.map(task=>({id:task.id,kind:'task' as const,date:String(task.due_at).slice(0,10),
      time:String(task.due_at).slice(11,16),title:task.title,event_id:task.event_id,event_title:task.event_title,
      category:task.category,assigned_to:task.assigned_to,status:task.status,priority:task.priority}))
  ].sort((a,b)=>a.date.localeCompare(b.date)||(a.kind==='wedding'?-1:1));
  res.json({month,data});
}));

routes.get('/events',wrap(async(req,res)=>{
  const search=String(req.query.q??'').slice(0,100),term=`%${search}%`;
  const data=await rows(`SELECT e.*,c.name client_name,c.partner_name,c.phone client_phone,
    (SELECT reason FROM lifecycle_actions a WHERE a.entity_type='events' AND a.entity_id=e.id AND a.action='cancel' LIMIT 1) cancel_reason,
    (SELECT COUNT(*) FROM tasks t WHERE t.event_id=e.id) total_tasks,
    (SELECT COUNT(*) FROM tasks t WHERE t.event_id=e.id AND t.status='done') completed_tasks
    FROM events e JOIN clients c ON c.id=e.client_id
    WHERE e.title LIKE ? OR e.code LIKE ? OR c.name LIKE ? ORDER BY e.event_date DESC LIMIT 200`,[term,term,term]);
  const canFinance=['owner','admin','finance'].includes(req.identity?.role||'');
  res.json({data:canFinance?data:data.map(e=>({...e,estimated_cost:null}))});
}));
const eventInput=z.object({title:str,client_name:str,partner_name:z.string().optional(),phone:z.string().optional(),
  event_date:date,venue:z.string().optional(),city:z.string().optional(),guest_count:z.coerce.number().int().min(0).default(0),
  contract_amount:amount.default(0),estimated_cost:amount.default(0),notes:z.string().optional(),package_id:z.coerce.number().int().positive().optional()});
routes.post('/events',editor,wrap(async(req,res)=>{
  const input=eventInput.parse(req.body);
  const newId=await transaction(async conn=>{
    const client=await execSql('INSERT INTO clients(name,partner_name,phone) VALUES (?,?,?)',[input.client_name,input.partner_name??'',input.phone??''],conn);
    const temporary=`TMP-${randomUUID()}`;
    const event=await execSql(`INSERT INTO events(code,title,client_id,package_id,event_date,venue,city,guest_count,status,contract_amount,estimated_cost,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,[temporary,input.title,client.insertId,input.package_id??null,input.event_date,input.venue??'',input.city??'',input.guest_count,'planning',input.contract_amount,input.estimated_cost,input.notes??''],conn);
    const code=`WDG-${input.event_date.slice(0,4)}-${String(event.insertId).padStart(4,'0')}`;
    await execSql('UPDATE events SET code=? WHERE id=?',[code,event.insertId],conn);
    const checklist=['Kick-off meeting & brief pengantin','Finalisasi vendor dan kontrak','Technical meeting bersama vendor','Finalisasi rundown & pembagian PIC','Final check H-1'];
    const leadDays=[90,60,14,7,1];
    for(let i=0;i<checklist.length;i++){
      const d=new Date(`${input.event_date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-leadDays[i]);
      await execSql('INSERT INTO tasks(event_id,title,category,due_at,priority) VALUES (?,?,?,?,?)',
        [event.insertId,checklist[i],'Milestone',d.toISOString().slice(0,10)+' 09:00:00','medium'],conn);
    }
    return event.insertId;
  });
  res.status(201).json({id:newId});
}));
routes.get('/events/:id',wrap(async(req,res)=>{
  const eventId=id(req.params.id);
  const [event]=await rows(`SELECT e.*,c.name client_name,c.partner_name,c.phone client_phone,c.email client_email,p.name package_name,
    (SELECT reason FROM lifecycle_actions a WHERE a.entity_type='events' AND a.entity_id=e.id AND a.action='cancel' LIMIT 1) cancel_reason
    FROM events e JOIN clients c ON c.id=e.client_id LEFT JOIN packages p ON p.id=e.package_id WHERE e.id=?`,[eventId]);
  if(!event){res.sendStatus(404);return;}
  const [tasks,vendors,staff,invoices,bills]=await Promise.all([
    rows('SELECT * FROM tasks WHERE event_id=? ORDER BY due_at IS NULL,due_at,id',[eventId]),
    rows('SELECT ev.*,v.name vendor_name,v.category,v.phone FROM event_vendors ev JOIN vendors v ON v.id=ev.vendor_id WHERE ev.event_id=?',[eventId]),
    rows('SELECT es.*,s.name staff_name,s.position FROM event_staff es JOIN staff s ON s.id=es.staff_id WHERE es.event_id=?',[eventId]),
    rows(`SELECT i.*,COALESCE((SELECT SUM(p.amount) FROM invoice_payments p WHERE p.invoice_id=i.id AND NOT EXISTS
      (SELECT 1 FROM lifecycle_actions a WHERE a.entity_type='invoice_payments' AND a.entity_id=p.id AND a.action='cancel')),0) paid,
      (SELECT a.reason FROM lifecycle_actions a WHERE a.entity_type='invoices' AND a.entity_id=i.id AND a.action='cancel' LIMIT 1) cancel_reason
      FROM invoices i WHERE i.event_id=?`,[eventId]),
    rows(`SELECT b.*,v.name vendor_name,COALESCE((SELECT SUM(p.amount) FROM bill_payments p WHERE p.bill_id=b.id AND NOT EXISTS
      (SELECT 1 FROM lifecycle_actions a WHERE a.entity_type='bill_payments' AND a.entity_id=p.id AND a.action='cancel')),0) paid,
      (SELECT a.reason FROM lifecycle_actions a WHERE a.entity_type='bills' AND a.entity_id=b.id AND a.action='cancel' LIMIT 1) cancel_reason
      FROM bills b LEFT JOIN vendors v ON v.id=b.vendor_id WHERE b.event_id=?`,[eventId])
  ]);
  const canFinance=['owner','admin','finance'].includes(req.identity?.role||'');
  const profit=canFinance?await incomeStatement('2000-01-01',today(),eventId):null;
  res.json({event:canFinance?event:{...event,estimated_cost:null},tasks,vendors:canFinance?vendors:vendors.map(v=>({...v,agreed_price:null})),
    staff:canFinance?staff:staff.map(s=>({...s,fee:null})),invoices:canFinance?invoices:[],bills:canFinance?bills:[],profit});
}));
routes.patch('/events/:id',editor,wrap(async(req,res)=>{
  const update=z.object({title:str,event_date:date,venue:z.string(),city:z.string(),guest_count:z.coerce.number().int().nonnegative(),
    status:z.enum(['planning','confirmed','in_progress']),contract_amount:amount,estimated_cost:amount,notes:z.string(),
    client_name:str,partner_name:z.string(),phone:z.string()}).partial().parse(req.body);
  const clientFields=['client_name','partner_name','phone'] as const;
  const fields=Object.keys(update).filter(k=>!clientFields.includes(k as any));
  if(!Object.keys(update).length)throw new Error('Tidak ada data untuk diperbarui.');
  await transaction(async conn=>{
    const [existing]=await rows<{status:string;client_id:number;contract_amount:string;estimated_cost:string}>(
      'SELECT status,client_id,contract_amount,estimated_cost FROM events WHERE id=? FOR UPDATE',[id(req.params.id)],conn);
    if(!existing)throw new Error('Event tidak ditemukan.');
    if(['completed','cancelled'].includes(existing.status))throw new Error('Event selesai/dibatalkan tidak boleh diubah.');
    const financialChange=(update.contract_amount!==undefined&&moneyCents(update.contract_amount)!==moneyCents(existing.contract_amount))||
      (update.estimated_cost!==undefined&&moneyCents(update.estimated_cost)!==moneyCents(existing.estimated_cost));
    if(financialChange){
      const [locked]=await rows('SELECT id FROM event_contract_revisions WHERE event_id=? LIMIT 1',[id(req.params.id)],conn);
      const [quoted]=await rows('SELECT id FROM event_budget_revisions WHERE event_id=? LIMIT 1',[id(req.params.id)],conn);
      if(locked||quoted||existing.status!=='planning')
        throw new Error('Nilai kontrak/anggaran sudah dikunci. Gunakan Change Order di Kontrol Proyek.');
    }
    if(fields.length)await execSql(`UPDATE events SET ${fields.map(k=>`${k}=?`).join(',')} WHERE id=?`,[...fields.map(k=>(update as any)[k]),id(req.params.id)],conn);
    const edits=[['client_name','name'],['partner_name','partner_name'],['phone','phone']].filter(([from])=>(update as any)[from]!==undefined);
    if(edits.length)await execSql(`UPDATE clients SET ${edits.map(([,to])=>`${to}=?`).join(',')} WHERE id=?`,[...edits.map(([from])=>(update as any)[from]),existing.client_id],conn);
  });res.json({ok:true});
}));
routes.post('/events/:id/cancel',editor,wrap(async(req,res)=>{
  const eventId=id(req.params.id),{reason}=cancellationInput.parse(req.body);
  await transaction(async conn=>{
    const [event]=await rows<{status:string}>('SELECT status FROM events WHERE id=? FOR UPDATE',[eventId],conn);
    if(!event)throw new Error('Wedding tidak ditemukan.');
    if(['completed','cancelled'].includes(event.status))throw new Error('Wedding selesai atau sudah dibatalkan.');
    await execSql("UPDATE events SET status='cancelled' WHERE id=?",[eventId],conn);
    await logAction(conn,'events',eventId,'cancel',reason,req.identity!.id);
  });res.json({ok:true});
}));
routes.post('/events/:id/complete',finance,wrap(async(req,res)=>{
  void req;void res;
  throw new Error('Event tidak boleh diselesaikan melalui endpoint lama. Gunakan tab Project Closing agar checklist dan keuangan diperiksa terlebih dahulu.');
}));
routes.post('/events/:id/tasks',editor,wrap(async(req,res)=>{
  await ensureWeddingOpen(id(req.params.id));
  const input=z.object({title:str,category:z.string().default('Persiapan'),due_at:z.string().nullable().optional(),assigned_to:z.string().optional(),priority:z.enum(['low','medium','high']).default('medium')}).parse(req.body);
  const result=await execSql('INSERT INTO tasks(event_id,title,category,due_at,assigned_to,priority) VALUES (?,?,?,?,?,?)',
    [id(req.params.id),input.title,input.category,input.due_at||null,input.assigned_to??'',input.priority]);res.status(201).json({id:result.insertId});
}));
routes.patch('/tasks/:id',editor,wrap(async(req,res)=>{
  const [task]=await rows<{event_id:number}>('SELECT event_id FROM tasks WHERE id=?',[id(req.params.id)]);
  if(!task)throw new Error('Checklist tidak ditemukan.');
  await ensureWeddingOpen(task.event_id);
  const input=z.object({title:str,category:z.string().max(60),status:z.enum(['todo','progress','done']),due_at:z.string().nullable(),assigned_to:z.string().max(100),priority:z.enum(['low','medium','high'])}).partial().parse(req.body);
  const keys=Object.keys(input);if(!keys.length)throw new Error('Tidak ada perubahan.');
  if(input.due_at!==undefined){
    const [own]=await rows<{start_at:string|null;depends_on_task_id:number|null}>(
      'SELECT start_at,depends_on_task_id FROM project_task_schedules WHERE task_id=?',[id(req.params.id)]);
    if(own?.start_at&&(!input.due_at||input.due_at<own.start_at))
      throw new Error('Tenggat checklist tidak boleh sebelum tanggal mulai Gantt. Edit jadwal di Gantt Timeline.');
    if(own?.depends_on_task_id){
      const [parent]=await rows<{due_at:string|null}>('SELECT due_at FROM tasks WHERE id=?',[own.depends_on_task_id]);
      if(!own.start_at||!parent?.due_at||own.start_at<parent.due_at)
        throw new Error('Jadwal tidak sesuai ketergantungan. Buka Gantt Timeline.');
    }
    const successors=await rows<{start_at:string|null}>(
      'SELECT start_at FROM project_task_schedules WHERE depends_on_task_id=?',[id(req.params.id)]);
    if(successors.some(v=>!input.due_at||!v.start_at||v.start_at<input.due_at))
      throw new Error('Tenggat berbenturan dengan aktivitas lanjutan. Perbarui dari Gantt Timeline.');
  }
  const result=await execSql(`UPDATE tasks SET ${keys.map(k=>`${k}=?`).join(',')} WHERE id=?`,[...keys.map(k=>(input as any)[k]),id(req.params.id)]);
  if(!result.affectedRows){res.status(404).json({message:'Checklist tidak ditemukan.'});return;}
  res.json({ok:true});
}));
routes.delete('/tasks/:id',editor,wrap(async(req,res)=>{
  const [task]=await rows<{event_id:number}>('SELECT event_id FROM tasks WHERE id=?',[id(req.params.id)]);
  if(!task)throw new Error('Checklist tidak ditemukan.');
  await ensureWeddingOpen(task.event_id);
  const result=await execSql('DELETE FROM tasks WHERE id=?',[id(req.params.id)]);
  if(!result.affectedRows){res.status(404).json({message:'Checklist tidak ditemukan.'});return;}
  res.json({ok:true});
}));
routes.post('/events/:id/vendors',editor,wrap(async(req,res)=>{
  await ensureWeddingOpen(id(req.params.id));
  const input=z.object({vendor_id:z.coerce.number().int().positive(),service_name:z.string().optional(),agreed_price:amount,
    status:z.literal('proposed').default('proposed'),notes:z.string().optional()}).parse(req.body);
  const data=await execSql('INSERT INTO event_vendors(event_id,vendor_id,service_name,agreed_price,status,notes) VALUES (?,?,?,?,?,?)',
    [id(req.params.id),input.vendor_id,input.service_name??'',input.agreed_price,input.status,input.notes??'']);res.status(201).json({id:data.insertId});
}));
routes.patch('/events/:id/vendors/:assignmentId',editor,wrap(async(req,res)=>{
  await ensureWeddingOpen(id(req.params.id));
  const data=z.object({service_name:z.string().max(150),agreed_price:amount,
    notes:z.string()}).partial().strict().parse(req.body);
  const keys=Object.keys(data);if(!keys.length)throw new Error('Tidak ada perubahan.');
  const [booking]=await rows<any>(`SELECT b.booking_status,ev.agreed_price,ev.service_name
    FROM event_vendors ev LEFT JOIN event_vendor_bookings b ON b.assignment_id=ev.id
    WHERE ev.id=? AND ev.event_id=?`,[id(req.params.assignmentId),id(req.params.id)]);
  if(!booking)throw new Error('Penugasan vendor tidak ditemukan.');
  if(booking.booking_status==='confirmed'&&(
    (data.agreed_price!==undefined&&moneyCents(data.agreed_price)!==moneyCents(booking.agreed_price))||
    (data.service_name!==undefined&&data.service_name!==String(booking.service_name??''))))
    throw new Error('Layanan/harga vendor yang sudah dikonfirmasi terkunci. Buat perubahan kontrak atau proses booking baru.');
  const result=await execSql(`UPDATE event_vendors SET ${keys.map(k=>`${k}=?`).join(',')} WHERE id=? AND event_id=?`,
    [...keys.map(k=>(data as any)[k]),id(req.params.assignmentId),id(req.params.id)]);
  if(!result.affectedRows){res.status(404).json({message:'Penugasan vendor tidak ditemukan.'});return;}res.json({ok:true});
}));
routes.delete('/events/:id/vendors/:assignmentId',editor,wrap(async(req,res)=>{
  await ensureWeddingOpen(id(req.params.id));
  const [booking]=await rows('SELECT id FROM event_vendor_bookings WHERE assignment_id=?', [id(req.params.assignmentId)]);
  if(booking)throw new Error('Vendor memiliki histori booking. Batalkan melalui Kontrol Proyek dan simpan histori penugasan.');
  const [operational]=await rows(`SELECT id FROM event_team_presence WHERE event_id=? AND team_kind='vendor' AND assignment_id=?
    UNION SELECT id FROM event_rundown_items WHERE event_id=? AND vendor_assignment_id=? LIMIT 1`,
    [id(req.params.id),id(req.params.assignmentId),id(req.params.id),id(req.params.assignmentId)]);
  if(operational)throw new Error('Vendor sudah terhubung dengan kehadiran atau rundown. Simpan histori penugasan ini.');
  const result=await execSql('DELETE FROM event_vendors WHERE id=? AND event_id=?',[id(req.params.assignmentId),id(req.params.id)]);
  if(!result.affectedRows){res.status(404).json({message:'Penugasan vendor tidak ditemukan.'});return;}res.json({ok:true});
}));
routes.post('/events/:id/staff',editor,wrap(async(req,res)=>{
  await ensureWeddingOpen(id(req.params.id));
  const input=z.object({staff_id:z.coerce.number().int().positive(),assignment:z.string().optional(),fee:amount}).parse(req.body);
  const eventId=id(req.params.id);
  const collision=await rows(`SELECT e.title FROM event_staff es JOIN events e ON e.id=es.event_id
    JOIN events target ON target.id=? WHERE es.staff_id=? AND e.event_date=target.event_date AND e.id<>? AND e.status<>'cancelled'`,[eventId,input.staff_id,eventId]);
  if(collision.length){res.status(409).json({message:'Crew sudah bertugas pada event lain di tanggal yang sama.'});return;}
  const data=await execSql('INSERT INTO event_staff(event_id,staff_id,assignment,fee) VALUES (?,?,?,?)',
    [eventId,input.staff_id,input.assignment??'',input.fee]);res.status(201).json({id:data.insertId});
}));
routes.patch('/events/:id/staff/:assignmentId',editor,wrap(async(req,res)=>{
  await ensureWeddingOpen(id(req.params.id));
  const data=z.object({assignment:z.string().max(150),fee:amount}).partial().parse(req.body);
  const keys=Object.keys(data);if(!keys.length)throw new Error('Tidak ada perubahan.');
  const result=await execSql(`UPDATE event_staff SET ${keys.map(k=>`${k}=?`).join(',')} WHERE id=? AND event_id=?`,
    [...keys.map(k=>(data as any)[k]),id(req.params.assignmentId),id(req.params.id)]);
  if(!result.affectedRows){res.status(404).json({message:'Penugasan crew tidak ditemukan.'});return;}res.json({ok:true});
}));
routes.delete('/events/:id/staff/:assignmentId',editor,wrap(async(req,res)=>{
  await ensureWeddingOpen(id(req.params.id));
  const [operational]=await rows(`SELECT id FROM event_team_presence WHERE event_id=? AND team_kind='crew' AND assignment_id=?
    UNION SELECT id FROM event_rundown_items WHERE event_id=? AND staff_assignment_id=? LIMIT 1`,
    [id(req.params.id),id(req.params.assignmentId),id(req.params.id),id(req.params.assignmentId)]);
  if(operational)throw new Error('Crew sudah terhubung dengan kehadiran atau rundown. Simpan histori penugasan ini.');
  const result=await execSql('DELETE FROM event_staff WHERE id=? AND event_id=?',[id(req.params.assignmentId),id(req.params.id)]);
  if(!result.affectedRows){res.status(404).json({message:'Penugasan crew tidak ditemukan.'});return;}res.json({ok:true});
}));

routes.get('/finance/accounts',finance,wrap(async(_req,res)=>{res.json({data:await rows('SELECT * FROM accounts ORDER BY code')});}));
routes.get('/finance/invoices',finance,wrap(async(_req,res)=>{
  const data=await rows(`SELECT i.*,e.title event_title,c.name client_name,
    COALESCE((SELECT SUM(p.amount) FROM invoice_payments p WHERE p.invoice_id=i.id AND NOT EXISTS
      (SELECT 1 FROM lifecycle_actions a WHERE a.entity_type='invoice_payments' AND a.entity_id=p.id AND a.action='cancel')),0) paid,
    (SELECT a.reason FROM lifecycle_actions a WHERE a.entity_type='invoices' AND a.entity_id=i.id AND a.action='cancel' LIMIT 1) cancel_reason
    FROM invoices i JOIN events e ON e.id=i.event_id JOIN clients c ON c.id=e.client_id ORDER BY i.id DESC LIMIT 300`);
  res.json({data});
}));
routes.get('/finance/bills',finance,wrap(async(_req,res)=>{
  const data=await rows(`SELECT b.*,e.title event_title,v.name vendor_name,
    COALESCE((SELECT SUM(p.amount) FROM bill_payments p WHERE p.bill_id=b.id AND NOT EXISTS
      (SELECT 1 FROM lifecycle_actions a WHERE a.entity_type='bill_payments' AND a.entity_id=p.id AND a.action='cancel')),0) paid,
    (SELECT a.reason FROM lifecycle_actions a WHERE a.entity_type='bills' AND a.entity_id=b.id AND a.action='cancel' LIMIT 1) cancel_reason
    FROM bills b LEFT JOIN events e ON e.id=b.event_id LEFT JOIN vendors v ON v.id=b.vendor_id ORDER BY b.id DESC LIMIT 300`);
  res.json({data});
}));
routes.post('/finance/invoices',finance,wrap(async(req,res)=>{
  const input=z.object({event_id:z.coerce.number().int().positive(),amount:positive,due_date:date,description:z.string().optional()}).parse(req.body);
  const invoiceId=await transaction(async conn=>{
    const [event]=await rows<{status:string;title:string;contract_amount:string}>(
      'SELECT status,title,contract_amount FROM events WHERE id=? FOR UPDATE',[input.event_id],conn);
    if(!event||['cancelled','completed'].includes(event.status))throw new Error('Event tidak ditemukan atau sudah selesai/dibatalkan.');
    const issued=await issueWeddingInvoice(conn,{eventId:input.event_id,event,amount:input.amount,
      dueDate:input.due_date,description:input.description??'Tagihan wedding',userId:req.identity!.id,issuedAt:today()});
    return issued.invoiceId;
  });res.status(201).json({id:invoiceId});
}));
routes.post('/finance/invoices/:id/pay',finance,wrap(async(req,res)=>{
  const input=z.object({amount:positive,paid_at:date,method:z.enum(['bank','cash']).default('bank'),reference:z.string().optional()}).parse(req.body);
  await transaction(async conn=>{
    const [inv]=await rows<{id:number;event_id:number;number:string;amount:string}>('SELECT * FROM invoices WHERE id=? FOR UPDATE',[id(req.params.id)],conn);
    if(!inv)throw new Error('Invoice tidak ditemukan.');
    await openEvent(conn,inv.event_id);
    if(await alreadyCancelled(conn,'invoices',inv.id))throw new Error('Invoice sudah dibatalkan.');
    const [sum]=await rows<{paid:string}>(`SELECT COALESCE(SUM(p.amount),0) paid FROM invoice_payments p WHERE p.invoice_id=?
      AND NOT EXISTS(SELECT 1 FROM lifecycle_actions a WHERE a.entity_type='invoice_payments' AND a.entity_id=p.id AND a.action='cancel')`,[inv.id],conn);
    if(moneyCents(input.amount)>moneyCents(inv.amount)-moneyCents(sum.paid))throw new Error('Pembayaran melebihi sisa tagihan.');
    const journal=await postJournal(conn,{date:input.paid_at,description:`Penerimaan ${inv.number}`,reference_type:'invoice_payment',reference_id:inv.id,
      cash_flow:'operating',user_id:req.identity!.id,lines:[
        {code:input.method==='bank'?'1010':'1000',debit:input.amount,event_id:inv.event_id},
        {code:'1100',credit:input.amount,event_id:inv.event_id}]});
    await execSql('INSERT INTO invoice_payments(invoice_id,amount,method,paid_at,reference,journal_id) VALUES (?,?,?,?,?,?)',
      [inv.id,input.amount,input.method,input.paid_at,input.reference??'',journal],conn);
  });res.json({ok:true});
}));
routes.post('/finance/bills',finance,wrap(async(req,res)=>{
  const input=z.object({event_id:z.coerce.number().int().positive().nullable().optional(),vendor_id:z.coerce.number().int().positive().nullable().optional(),
    description:str,amount:positive,due_date:date,expense_account_code:z.enum(['1300','5000','5100','5200','6000','6100','6200'])}).parse(req.body);
  const billId=await transaction(async conn=>{
    if(input.event_id)await openEvent(conn,input.event_id);
    if(input.event_id&&input.vendor_id){
      const [direct]=await rows(`SELECT b.id FROM event_vendor_bookings b JOIN event_vendors ev ON ev.id=b.assignment_id
        WHERE ev.event_id=? AND ev.vendor_id=? AND b.payment_responsibility='client_direct' AND b.booking_status<>'cancelled' LIMIT 1`,
        [input.event_id,input.vendor_id],conn);
      if(direct)throw new Error('Vendor ini dibayar langsung oleh klien. Tagihan tidak boleh masuk utang Wedding-In.');
    }
    const number=`BILL-${today().slice(0,4)}-${randomUUID().slice(0,8).toUpperCase()}`;
    const bill=await execSql(`INSERT INTO bills(event_id,vendor_id,number,description,amount,due_date,expense_account_code)
      VALUES (?,?,?,?,?,?,?)`,[input.event_id??null,input.vendor_id??null,number,input.description,input.amount,input.due_date,input.expense_account_code],conn);
    await postJournal(conn,{date:today(),description:`Tagihan vendor/biaya ${number}`,reference_type:'bill',reference_id:bill.insertId,
      cash_flow:'none',user_id:req.identity!.id,lines:[
        {code:input.expense_account_code,debit:input.amount,event_id:input.event_id},
        {code:'2000',credit:input.amount,event_id:input.event_id}]});return bill.insertId;
  });res.status(201).json({id:billId});
}));
routes.post('/finance/bills/:id/pay',finance,wrap(async(req,res)=>{
  const input=z.object({amount:positive,paid_at:date,method:z.enum(['bank','cash']).default('bank'),reference:z.string().optional()}).parse(req.body);
  await transaction(async conn=>{
    const [bill]=await rows<{id:number;event_id:number|null;number:string;amount:string}>('SELECT * FROM bills WHERE id=? FOR UPDATE',[id(req.params.id)],conn);
    if(!bill)throw new Error('Tagihan vendor tidak ditemukan.');
    if(bill.event_id)await openEvent(conn,bill.event_id);
    if(await alreadyCancelled(conn,'bills',bill.id))throw new Error('Tagihan sudah dibatalkan.');
    const [sum]=await rows<{paid:string}>(`SELECT COALESCE(SUM(p.amount),0) paid FROM bill_payments p WHERE p.bill_id=?
      AND NOT EXISTS(SELECT 1 FROM lifecycle_actions a WHERE a.entity_type='bill_payments' AND a.entity_id=p.id AND a.action='cancel')`,[bill.id],conn);
    if(moneyCents(input.amount)>moneyCents(bill.amount)-moneyCents(sum.paid))throw new Error('Pembayaran melebihi sisa tagihan vendor.');
    const journal=await postJournal(conn,{date:input.paid_at,description:`Pembayaran ${bill.number}`,reference_type:'bill_payment',reference_id:bill.id,
      cash_flow:'operating',user_id:req.identity!.id,lines:[
        {code:'2000',debit:input.amount,event_id:bill.event_id},
        {code:input.method==='bank'?'1010':'1000',credit:input.amount,event_id:bill.event_id}]});
    await execSql('INSERT INTO bill_payments(bill_id,amount,method,paid_at,reference,journal_id) VALUES (?,?,?,?,?,?)',
      [bill.id,input.amount,input.method,input.paid_at,input.reference??'',journal],conn);
  });res.json({ok:true});
}));
routes.get('/finance/journals',finance,wrap(async(req,res)=>{
  const from=String(req.query.from??'2000-01-01'),to=String(req.query.to??today());
  if(!date.safeParse(from).success||!date.safeParse(to).success)throw new Error('Tanggal tidak valid.');
  const data=await rows(`SELECT j.id,j.entry_date,j.description,j.reference_type,j.cash_flow,
    (SELECT a.reason FROM lifecycle_actions a WHERE a.entity_type='journals' AND a.entity_id=j.id AND a.action='cancel' LIMIT 1) cancel_reason,
    a.code,a.name account_name,l.event_id,l.debit,l.credit
    FROM journals j JOIN journal_lines l ON l.journal_id=j.id JOIN accounts a ON a.id=l.account_id
    WHERE j.entry_date BETWEEN ? AND ? ORDER BY j.entry_date DESC,j.id DESC,l.id LIMIT 1000`,[from,to]);
  res.json({data});
}));
routes.post('/finance/journals',allow('owner','admin','finance'),wrap(async(req,res)=>{
  const input=z.object({date,description:str,cash_flow:z.enum(['operating','investing','financing','opening','none']),
    lines:z.array(z.object({code:str,debit:amount.optional(),credit:amount.optional(),event_id:z.coerce.number().int().positive().nullable().optional()})).min(2)}).parse(req.body);
  const journalId=await transaction(async conn=>{
    const projects=[...new Set(input.lines.map(line=>line.event_id).filter((value):value is number=>typeof value==='number'))];
    for(const eventId of projects)await openEvent(conn,eventId);
    return postJournal(conn,{...input,reference_type:'manual',user_id:req.identity!.id});
  });
  res.status(201).json({id:journalId});
}));
routes.get('/reports/:report',finance,wrap(async(req,res)=>{
  const asOf=String(req.query.as_of??today()),from=String(req.query.from??`${today().slice(0,4)}-01-01`),to=String(req.query.to??today());
  if(![asOf,from,to].every(x=>date.safeParse(x).success))throw new Error('Tanggal tidak valid.');
  if(from>to)throw new Error('Periode awal tidak boleh melewati periode akhir.');
  const report=req.params.report;
  if(report==='balance-sheet')res.json(await balanceSheet(asOf));
  else if(report==='income-statement')res.json(await incomeStatement(from,to));
  else if(report==='cash-flow')res.json(await cashFlow(from,to));
  else if(report==='trial-balance')res.json(await trialBalance(asOf));
  else res.status(404).json({message:'Laporan tidak ditemukan.'});
}));
