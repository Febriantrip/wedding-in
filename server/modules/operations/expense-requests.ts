import type {Router} from 'express';
import {z} from 'zod';
import {allow} from '../../auth.js';
import {moneyCents} from '../../accounting.js';
import {rows,execSql,transaction} from '../../db.js';
import {auditProject} from '../projects/audit.js';
import {wrap,id,openEvent,canFinance,required,amount,day} from './shared.js';

const editor=allow('owner','admin','finance','planner','sales');
const finance=allow('owner','admin','finance');
const manager=allow('owner','admin');
const requestSchema=z.object({title:required.max(180),amount,needed_by:day,
  explanation:required.min(8).max(600)}).strict();

export function registerExpenseRequests(router:Router){
  router.get('/:id/expense-requests',editor,wrap(async(req,res)=>{
    const eventId=id(req.params.id),financial=canFinance(req.identity!.role);
    const [event]=await rows<{id:number;status:string}>('SELECT id,status FROM events WHERE id=?',[eventId]);
    if(!event){res.sendStatus(404);return;}
    const requests=await rows<any>(`SELECT r.*,creator.name requester_name,reviewer.name reviewer_name,
      tx.number transaction_number,tx.status transaction_status
      FROM project_expense_requests r JOIN users creator ON creator.id=r.requested_by
      LEFT JOIN users reviewer ON reviewer.id=r.reviewed_by
      LEFT JOIN finance_transactions tx ON tx.id=r.finance_transaction_id
      WHERE r.event_id=? ${financial?'':'AND r.requested_by=?'} ORDER BY r.id DESC LIMIT 150`,
      financial?[eventId]:[eventId,req.identity!.id]);
    const transactions=financial?await rows<any>(`SELECT t.id,t.number,t.description,t.amount,t.status
      FROM finance_transactions t WHERE t.event_id=? AND t.kind='DIRECT_EXPENSE'
        AND t.status='posted' AND NOT EXISTS(SELECT 1 FROM project_expense_requests r
        WHERE r.finance_transaction_id=t.id) ORDER BY t.id DESC LIMIT 100`,[eventId]):[];
    res.json({event,requests,transactions});
  }));

  router.post('/:id/expense-requests',editor,wrap(async(req,res)=>{
    const eventId=id(req.params.id),input=requestSchema.parse(req.body);
    const created=await transaction(async conn=>{
      await openEvent(conn,eventId);
      const result=await execSql(`INSERT INTO project_expense_requests(event_id,title,amount,needed_by,explanation,requested_by)
        VALUES (?,?,?,?,?,?)`,[eventId,input.title,input.amount,input.needed_by,input.explanation,req.identity!.id],conn);
      await auditProject(conn,eventId,'expense_request','project_expense_requests',result.insertId,req.identity!.id,input.title);
      return result.insertId;
    });res.status(201).json({id:created});
  }));

  router.post('/:id/expense-requests/:requestId/approve',manager,wrap(async(req,res)=>{
    const eventId=id(req.params.id),requestId=id(req.params.requestId),
      note=z.object({note:z.string().trim().max(350).default('Disetujui')}).parse(req.body).note;
    await transaction(async conn=>{
      await openEvent(conn,eventId);
      const [record]=await rows<any>('SELECT * FROM project_expense_requests WHERE id=? AND event_id=? FOR UPDATE',[requestId,eventId],conn);
      if(!record||record.status!=='submitted')throw new Error('Pengajuan tidak ditemukan atau sudah diputuskan.');
      if(Number(record.requested_by)===req.identity!.id)throw new Error('Pengaju tidak boleh menyetujui pengeluarannya sendiri.');
      await execSql(`UPDATE project_expense_requests SET status='approved',reviewed_by=?,reviewed_at=NOW(),review_note=? WHERE id=?`,
        [req.identity!.id,note,requestId],conn);
      await auditProject(conn,eventId,'expense_approve','project_expense_requests',requestId,req.identity!.id,note);
    });res.json({ok:true});
  }));

  router.post('/:id/expense-requests/:requestId/reject',manager,wrap(async(req,res)=>{
    const eventId=id(req.params.id),requestId=id(req.params.requestId),
      note=z.object({reason:required.min(8).max(350)}).parse(req.body).reason;
    await transaction(async conn=>{
      await openEvent(conn,eventId);
      const [record]=await rows<any>('SELECT * FROM project_expense_requests WHERE id=? AND event_id=? FOR UPDATE',[requestId,eventId],conn);
      if(!record||record.status!=='submitted')throw new Error('Pengajuan tidak ditemukan atau sudah diputuskan.');
      await execSql(`UPDATE project_expense_requests SET status='rejected',reviewed_by=?,reviewed_at=NOW(),review_note=? WHERE id=?`,
        [req.identity!.id,note,requestId],conn);
      await auditProject(conn,eventId,'expense_reject','project_expense_requests',requestId,req.identity!.id,note);
    });res.json({ok:true});
  }));

  router.post('/:id/expense-requests/:requestId/link',finance,wrap(async(req,res)=>{
    const eventId=id(req.params.id),requestId=id(req.params.requestId),
      transactionId=id(z.object({transaction_id:z.coerce.number().int().positive()}).parse(req.body).transaction_id);
    await transaction(async conn=>{
      await openEvent(conn,eventId);
      const [record]=await rows<any>('SELECT * FROM project_expense_requests WHERE id=? AND event_id=? FOR UPDATE',[requestId,eventId],conn);
      if(!record||record.status!=='approved')throw new Error('Pengajuan wajib disetujui sebelum ditautkan ke pengeluaran nyata.');
      const [posted]=await rows<any>(`SELECT id,amount FROM finance_transactions WHERE id=? AND event_id=?
        AND kind='DIRECT_EXPENSE' AND status='posted' FOR UPDATE`,[transactionId,eventId],conn);
      if(!posted)throw new Error('Transaksi pengeluaran posted untuk wedding ini tidak ditemukan.');
      if(moneyCents(posted.amount)!==moneyCents(record.amount))
        throw new Error('Nominal transaksi harus sama dengan nilai yang disetujui.');
      const [used]=await rows('SELECT id FROM project_expense_requests WHERE finance_transaction_id=? LIMIT 1',[transactionId],conn);
      if(used)throw new Error('Transaksi sudah ditautkan ke pengajuan lain.');
      await execSql(`UPDATE project_expense_requests SET finance_transaction_id=?,status='fulfilled' WHERE id=?`,[transactionId,requestId],conn);
      await auditProject(conn,eventId,'expense_fulfill','project_expense_requests',requestId,req.identity!.id,`Transaksi ${transactionId}`);
    });res.json({ok:true});
  }));
}
