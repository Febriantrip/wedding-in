import {randomUUID} from 'node:crypto';
import {Router,type Request,type Response,type NextFunction} from 'express';
import {z} from 'zod';
import {rows,execSql,transaction} from '../../db.js';
import {allow} from '../../auth.js';
import {moneyCents,postJournal} from '../../accounting.js';
import {reverseJournal} from '../../lifecycle.js';
import {openEvent} from '../operations/shared.js';

export const backofficeRouter=Router();
backofficeRouter.use(allow('owner','admin','finance'));
const owner=allow('owner','admin');
const wrap=(fn:(req:Request,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>
  Promise.resolve(fn(req,res)).catch(next);
const id=(value:unknown)=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<1)throw new Error('ID tidak valid.');return n;};
const money=z.union([z.string(),z.number()]).transform(String).refine(x=>{try{return moneyCents(x)>0;}catch{return false;}},'Nominal wajib positif.');
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const txSchema=z.object({kind:z.enum(['DIRECT_EXPENSE','OTHER_RECEIPT','INTERNAL_TRANSFER']),
  event_id:z.coerce.number().int().positive().nullable().optional(),
  category_id:z.coerce.number().int().positive().nullable().optional(),
  transaction_date:day,cash_account_id:z.coerce.number().int().positive(),
  destination_cash_account_id:z.coerce.number().int().positive().nullable().optional(),
  counterparty_name:z.string().max(160).optional(),
  description:z.string().trim().min(4).max(255),amount:money,reference:z.string().max(120).optional(),
  idempotency_key:z.string().max(100).optional()});

backofficeRouter.get('/categories',wrap(async(_req,res)=>{
  const data=await rows(`SELECT c.*,ad.code debit_code,ac.code credit_code FROM finance_categories c
    LEFT JOIN accounts ad ON ad.id=c.default_debit_account_id
    LEFT JOIN accounts ac ON ac.id=c.default_credit_account_id ORDER BY c.flow_type,c.name`);
  res.json({data});
}));
backofficeRouter.post('/categories',owner,wrap(async(req,res)=>{
  const input=z.object({code:z.string().min(2).max(50),name:z.string().min(2).max(120),
    flow_type:z.enum(['income','expense','transfer']),default_debit_account_id:z.number().int().positive().nullable().optional(),
    default_credit_account_id:z.number().int().positive().nullable().optional(),
    requires_event:z.boolean().default(false),requires_attachment:z.boolean().default(false)}).parse(req.body);
  const result=await execSql(`INSERT INTO finance_categories(code,name,flow_type,default_debit_account_id,default_credit_account_id,requires_event,requires_attachment)
    VALUES (?,?,?,?,?,?,?)`,[input.code,input.name,input.flow_type,input.default_debit_account_id??null,
    input.default_credit_account_id??null,input.requires_event,input.requires_attachment]);
  res.status(201).json({id:result.insertId});
}));
backofficeRouter.get('/accounts',wrap(async(_req,res)=>{
  const data=await rows(`SELECT a.id,a.code,a.name,a.type,a.is_cash,a.active,ca.kind,ca.bank_name,ca.account_number_masked,
    COALESCE(SUM(l.debit-l.credit),0) balance FROM accounts a LEFT JOIN cash_accounts ca ON ca.account_id=a.id
    LEFT JOIN journal_lines l ON l.account_id=a.id WHERE a.active=1
    GROUP BY a.id,a.code,a.name,a.type,a.is_cash,a.active,ca.kind,ca.bank_name,ca.account_number_masked ORDER BY a.code`);
  res.json({data});
}));
backofficeRouter.get('/summary',wrap(async(_req,res)=>{
  const [cash,receipts,expenses,ar,ap,pending]=await Promise.all([
    rows<{balance:string}>(`SELECT COALESCE(SUM(l.debit-l.credit),0) balance FROM journal_lines l
      JOIN accounts a ON a.id=l.account_id AND a.is_cash=1`),
    rows<{value:string}>(`SELECT COALESCE(SUM(l.debit-l.credit),0) value FROM journal_lines l
      JOIN accounts a ON a.id=l.account_id AND a.is_cash=1 JOIN journals j ON j.id=l.journal_id
      WHERE j.entry_date=CURDATE() AND l.debit>0 AND j.reference_type<>'reversal' AND j.cash_flow<>'none'`),
    rows<{value:string}>(`SELECT COALESCE(SUM(l.credit-l.debit),0) value FROM journal_lines l
      JOIN accounts a ON a.id=l.account_id AND a.is_cash=1 JOIN journals j ON j.id=l.journal_id
      WHERE j.entry_date=CURDATE() AND l.credit>0 AND j.reference_type<>'reversal' AND j.cash_flow<>'none'`),
    rows<{outstanding:string}>(`SELECT COALESCE(SUM(i.amount - (SELECT COALESCE(SUM(p.amount),0) FROM invoice_payments p
      WHERE p.invoice_id=i.id AND NOT EXISTS(SELECT 1 FROM lifecycle_actions a WHERE a.entity_type='invoice_payments'
      AND a.entity_id=p.id AND a.action='cancel'))),0) outstanding FROM invoices i
      WHERE NOT EXISTS(SELECT 1 FROM lifecycle_actions a WHERE a.entity_type='invoices' AND a.entity_id=i.id AND a.action='cancel')`),
    rows<{outstanding:string}>(`SELECT COALESCE(SUM(b.amount - (SELECT COALESCE(SUM(p.amount),0) FROM bill_payments p
      WHERE p.bill_id=b.id AND NOT EXISTS(SELECT 1 FROM lifecycle_actions a WHERE a.entity_type='bill_payments'
      AND a.entity_id=p.id AND a.action='cancel'))),0) outstanding FROM bills b
      WHERE NOT EXISTS(SELECT 1 FROM lifecycle_actions a WHERE a.entity_type='bills' AND a.entity_id=b.id AND a.action='cancel')`),
    rows<{count:number}>(`SELECT COUNT(*) count FROM finance_transactions WHERE status IN ('draft','submitted','approved')`)
  ]);
  res.json({cash_balance:cash[0]?.balance??'0',today_income:receipts[0]?.value??'0',today_expense:expenses[0]?.value??'0',
    receivables:ar[0]?.outstanding??'0',payables:ap[0]?.outstanding??'0',pending:pending[0]?.count??0});
}));
backofficeRouter.get('/transactions',wrap(async(req,res)=>{
  const page=Math.min(100000,Math.max(1,Number(req.query.page)||1)),q=String(req.query.q??'').trim().slice(0,90);
  // Legacy entries are projected, never journaled again by this register.
  const view=`SELECT CONCAT('new-',t.id) uid,t.id,t.number,t.transaction_date,t.kind,
    t.direction,t.description,t.amount,t.status,t.reference,e.title event_title,t.created_by, 'new' origin
    FROM finance_transactions t LEFT JOIN events e ON e.id=t.event_id
    UNION ALL
    SELECT CONCAT('receipt-',p.id),p.id,CONCAT('RCPT-',p.id),p.paid_at,'CLIENT_RECEIPT','in',
    CONCAT('Invoice ',i.number),p.amount,
    IF(EXISTS(SELECT 1 FROM lifecycle_actions l WHERE l.entity_type='invoice_payments' AND l.entity_id=p.id AND l.action='cancel'),'reversed','posted'),
    p.reference,e.title,NULL,'legacy' FROM invoice_payments p JOIN invoices i ON i.id=p.invoice_id
    JOIN events e ON e.id=i.event_id
    UNION ALL
    SELECT CONCAT('payment-',p.id),p.id,CONCAT('PAY-',p.id),p.paid_at,'VENDOR_PAYMENT','out',
    CONCAT('Tagihan ',b.number),p.amount,
    IF(EXISTS(SELECT 1 FROM lifecycle_actions l WHERE l.entity_type='bill_payments' AND l.entity_id=p.id AND l.action='cancel'),'reversed','posted'),
    p.reference,e.title,NULL,'legacy' FROM bill_payments p JOIN bills b ON b.id=p.bill_id
    LEFT JOIN events e ON e.id=b.event_id`;
  const search=`%${q}%`,where='WHERE x.number LIKE ? OR x.description LIKE ? OR COALESCE(x.event_title,\'\') LIKE ?';
  const [count]=await rows<{total:number}>(`SELECT COUNT(*) total FROM (${view}) x ${where}`,[search,search,search]);
  const data=await rows(`SELECT * FROM (${view}) x ${where} ORDER BY x.transaction_date DESC,x.uid DESC LIMIT 15 OFFSET ?`,
    [search,search,search,(page-1)*15]);
  res.json({data,total:count.total,page});
}));
backofficeRouter.get('/transactions/:id',wrap(async(req,res)=>{
  const [data]=await rows<any>(`SELECT t.*,a.code cash_code,d.code destination_code,c.name category_name,u.name creator_name,
    reviewer.name reviewer_name FROM finance_transactions t
    JOIN accounts a ON a.id=t.cash_account_id
    LEFT JOIN accounts d ON d.id=t.destination_cash_account_id
    LEFT JOIN finance_categories c ON c.id=t.category_id
    LEFT JOIN users u ON u.id=t.created_by
    LEFT JOIN users reviewer ON reviewer.id=t.approved_by WHERE t.id=?`,[id(req.params.id)]);
  if(!data){res.sendStatus(404);return;}
  const audit=await rows('SELECT a.action,a.reason,a.created_at,u.name actor_name FROM finance_audit_events a JOIN users u ON u.id=a.actor_id WHERE a.transaction_id=? ORDER BY a.id',[data.id]);
  const journal=data.posted_journal_id?await rows(`SELECT a.code,a.name,l.debit,l.credit FROM journal_lines l
    JOIN accounts a ON a.id=l.account_id WHERE l.journal_id=?`,[data.posted_journal_id]):[];
  res.json({data,audit,journal});
}));
backofficeRouter.post('/transactions',wrap(async(req,res)=>{
  const input=txSchema.parse(req.body),cash=await rows<any>('SELECT * FROM accounts WHERE id=? AND is_cash=1 AND active=1',[input.cash_account_id]);
  if(!cash.length)throw new Error('Rekening asal harus akun kas/bank aktif.');
  const [category]=input.category_id?await rows<any>('SELECT * FROM finance_categories WHERE id=? AND active=1',[input.category_id]):[null];
  if(input.kind!=='INTERNAL_TRANSFER'&&(!category||category.flow_type!==(input.kind==='DIRECT_EXPENSE'?'expense':'income')))
    throw new Error('Pilih kategori sesuai jenis transaksi.');
  if(category?.requires_event&&!input.event_id)throw new Error('Kategori ini wajib memilih project.');
  if(input.kind==='OTHER_RECEIPT'&&input.event_id)throw new Error('Pemasukan klien wajib melalui Invoice/DP, bukan penerimaan lain.');
  if(input.kind==='INTERNAL_TRANSFER'&&(!input.destination_cash_account_id||input.cash_account_id===input.destination_cash_account_id))
    throw new Error('Pilih rekening tujuan berbeda.');
  const direction=input.kind==='INTERNAL_TRANSFER'?'transfer':input.kind==='DIRECT_EXPENSE'?'out':'in';
  const key=input.idempotency_key||randomUUID();
  const saved=await transaction(async conn=>{
    if(input.event_id)await openEvent(conn,input.event_id);
    const existing=await rows<any>('SELECT id FROM finance_transactions WHERE idempotency_key=? FOR UPDATE',[key],conn);
    if(existing.length)return existing[0].id;
    const tmp=`TRX-TMP-${randomUUID()}`;
    const result=await execSql(`INSERT INTO finance_transactions(number,kind,direction,event_id,category_id,transaction_date,
      cash_account_id,destination_cash_account_id,counterparty_name,description,amount,reference,idempotency_key,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[tmp,input.kind,direction,input.event_id??null,input.category_id??null,
      input.transaction_date,input.cash_account_id,input.destination_cash_account_id??null,input.counterparty_name??null,
      input.description,input.amount,input.reference??null,key,req.identity!.id],conn);
    const number=`TRX-${new Date().getUTCFullYear()}-${String(result.insertId).padStart(6,'0')}`;
    await execSql('UPDATE finance_transactions SET number=? WHERE id=?',[number,result.insertId],conn);
    await execSql('INSERT INTO finance_audit_events(transaction_id,action,actor_id) VALUES (?,?,?)',[result.insertId,'created',req.identity!.id],conn);
    return result.insertId;
  });
  res.status(201).json({id:saved});
}));
backofficeRouter.post('/transactions/:id/submit',wrap(async(req,res)=>{
  const entryId=id(req.params.id);
  await transaction(async conn=>{
    const [draft]=await rows<any>('SELECT event_id FROM finance_transactions WHERE id=? FOR UPDATE',[entryId],conn);
    if(!draft)throw new Error('Transaksi tidak ditemukan.');
    if(draft.event_id)await openEvent(conn,draft.event_id);
    const result=await execSql('UPDATE finance_transactions SET status=? WHERE id=? AND status=? AND created_by=?',
      ['submitted',entryId,'draft',req.identity!.id],conn);
    if(!result.affectedRows)throw new Error('Hanya pembuat yang dapat mengajukan transaksi draft.');
    await execSql('INSERT INTO finance_audit_events(transaction_id,action,actor_id) VALUES (?,?,?)',[entryId,'submitted',req.identity!.id],conn);
  });
  res.json({ok:true});
}));
backofficeRouter.post('/transactions/:id/approve',owner,wrap(async(req,res)=>{
  const entryId=id(req.params.id);
  await transaction(async conn=>{
    const [item]=await rows<any>('SELECT * FROM finance_transactions WHERE id=? FOR UPDATE',[entryId],conn);
    if(!item||item.status!=='submitted')throw new Error('Transaksi harus diajukan dahulu.');
    if(item.event_id)await openEvent(conn,item.event_id);
    if(Number(item.created_by)===req.identity!.id)throw new Error('Pembuat tidak boleh menyetujui transaksi sendiri.');
    await execSql('UPDATE finance_transactions SET status=?,approved_by=? WHERE id=?',['approved',req.identity!.id,entryId],conn);
    await execSql('INSERT INTO finance_audit_events(transaction_id,action,actor_id) VALUES (?,?,?)',[entryId,'approved',req.identity!.id],conn);
  });res.json({ok:true});
}));
backofficeRouter.post('/transactions/:id/post',owner,wrap(async(req,res)=>{
  const entryId=id(req.params.id);
  await transaction(async conn=>{
    const [item]=await rows<any>('SELECT * FROM finance_transactions WHERE id=? FOR UPDATE',[entryId],conn);
    if(!item||item.status!=='approved'||!item.approved_by)throw new Error('Transaksi belum disetujui.');
    if(item.event_id)await openEvent(conn,item.event_id);
    if(item.posted_journal_id)throw new Error('Jurnal transaksi sudah tercatat.');
    const [cash]=await rows<any>('SELECT code,is_cash,active FROM accounts WHERE id=? FOR UPDATE',[item.cash_account_id],conn);
    if(!cash||!cash.is_cash||!cash.active)throw new Error('Akun kas/bank tidak aktif.');
    const amount=Number(item.amount),lineEvent=item.event_id??null;
    let lines;
    if(item.kind==='INTERNAL_TRANSFER'){
      const [dest]=await rows<any>('SELECT code,is_cash,active FROM accounts WHERE id=? FOR UPDATE',[item.destination_cash_account_id],conn);
      if(!dest||!dest.is_cash||!dest.active||dest.code===cash.code)throw new Error('Rekening tujuan tidak valid.');
      lines=[{code:dest.code,debit:amount},{code:cash.code,credit:amount}];
    }else{
      const [category]=await rows<any>(`SELECT c.*,d.code debit_code,d.type debit_type,d.active debit_active,
        cr.code credit_code,cr.type credit_type,cr.active credit_active FROM finance_categories c
        LEFT JOIN accounts d ON d.id=c.default_debit_account_id
        LEFT JOIN accounts cr ON cr.id=c.default_credit_account_id WHERE c.id=? AND c.active=1`,[item.category_id],conn);
      if(!category||category.requires_attachment)throw new Error('Kategori belum siap posting atau memerlukan lampiran.');
      if(item.kind==='DIRECT_EXPENSE'){
        if(category.flow_type!=='expense'||category.debit_type!=='expense'||!category.debit_active)
          throw new Error('Kategori pengeluaran harus dipetakan ke akun beban aktif.');
        lines=[{code:category.debit_code,debit:amount,event_id:lineEvent},{code:cash.code,credit:amount,event_id:lineEvent}];
      }else{
        if(category.flow_type!=='income'||category.credit_type!=='revenue'||!category.credit_active)
          throw new Error('Kategori pemasukan lain harus dipetakan ke akun pendapatan aktif.');
        lines=[{code:cash.code,debit:amount},{code:category.credit_code,credit:amount}];
      }
    }
    const journalId=await postJournal(conn,{date:String(item.transaction_date).slice(0,10),description:item.description,
      reference_type:'backoffice',reference_id:item.id,cash_flow:item.kind==='INTERNAL_TRANSFER'?'none':'operating',
      user_id:req.identity!.id,lines});
    await execSql('UPDATE finance_transactions SET status=?,posted_journal_id=? WHERE id=?',['posted',journalId,entryId],conn);
    await execSql('INSERT INTO finance_audit_events(transaction_id,action,actor_id) VALUES (?,?,?)',[entryId,'posted',req.identity!.id],conn);
  });res.json({ok:true});
}));
backofficeRouter.post('/transactions/:id/reverse',owner,wrap(async(req,res)=>{
  const entryId=id(req.params.id),reason=z.object({reason:z.string().trim().min(8).max(350)}).parse(req.body).reason;
  await transaction(async conn=>{
    const [item]=await rows<any>('SELECT * FROM finance_transactions WHERE id=? FOR UPDATE',[entryId],conn);
    if(!item||item.status!=='posted'||!item.posted_journal_id)throw new Error('Hanya transaksi posted dapat dikoreksi.');
    if(item.event_id)await openEvent(conn,item.event_id);
    await reverseJournal(conn,item.posted_journal_id,reason,req.identity!.id);
    await execSql('UPDATE finance_transactions SET status=?,reason=? WHERE id=?',['reversed',reason,entryId],conn);
    await execSql('INSERT INTO finance_audit_events(transaction_id,action,reason,actor_id) VALUES (?,?,?,?)',[entryId,'reversed',reason,req.identity!.id],conn);
  });res.json({ok:true});
}));
