import {randomUUID} from 'node:crypto';
import {Router,type Request,type Response,type NextFunction} from 'express';
import {z} from 'zod';
import {rows,execSql,transaction,type DbConn} from '../../db.js';
import {allow} from '../../auth.js';
import {priceLines,resolvePrice,quantityMilli,cents,type DraftLine} from './pricing.js';

export const commercialRouter=Router();
const wrap=(fn:(req:Request,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>
  Promise.resolve(fn(req,res)).catch(next);
const positive=z.coerce.number().int().positive();
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const amt=z.union([z.string(),z.number()]).transform(value=>String(value)).refine(v=>{try{cents(v);return true;}catch{return false;}},'Nominal tidak valid');
const required=z.string().trim().min(1);
const owner=allow('owner','admin');
const editor=allow('owner','admin','planner','sales');
const costRoles=new Set(['owner','admin','finance']);
const toId=(value:unknown)=>positive.parse(value);
const stripCost=(item:any)=>{
  const {unit_cost,cost_total,cost_est_total,gross_profit_est,margin_pct,original_cost,
    default_cost,default_cost_unit,cost_unit,...safe}=item;return safe;
};

const master:Record<string,{table:string;schema:z.AnyZodObject}>={
  event_types:{table:'event_types',schema:z.object({code:required.max(45),name:required.max(130),
    duration_hours:z.coerce.number().min(0).max(1000).nullable().optional(),
    description:z.string().optional(),active:z.boolean().optional()})},
  services:{table:'services',schema:z.object({code:required.max(55),name:required.max(160),category:required.max(90),
    unit:required.max(30),default_fulfillment:z.enum(['internal','managed_vendor','client_direct']),
    default_cost:amt.nullable().optional(),default_sell:amt.nullable().optional(),
    notes:z.string().optional(),active:z.boolean().optional()})},
  service_price_rules:{table:'service_price_rules',schema:z.object({service_id:positive,event_type_id:positive.nullable().optional(),
    city:z.string().max(100).nullable().optional(),min_guests:z.coerce.number().int().min(0).nullable().optional(),
    max_guests:z.coerce.number().int().min(0).nullable().optional(),day_type:z.enum(['weekday','weekend']).nullable().optional(),
    valid_from:date,valid_to:date.nullable().optional(),priority:z.coerce.number().int().default(0),
    cost_unit:amt,sell_unit:amt,active:z.boolean().optional()})},
  vendor_services:{table:'vendor_services',schema:z.object({vendor_id:positive,service_id:positive.nullable().optional(),
    vendor_sku:required.max(75),title:required.max(180),unit:required.max(30),
    min_qty:z.coerce.number().positive().default(1),capacity_per_day:z.coerce.number().int().min(1).default(1),
    service_area:z.string().optional(),terms:z.string().optional(),active:z.boolean().optional()})},
  vendor_service_rates:{table:'vendor_service_rates',schema:z.object({vendor_service_id:positive,
    effective_from:date,effective_to:date.nullable().optional(),city:z.string().nullable().optional(),
    min_qty:z.coerce.number().positive().default(1),max_qty:z.coerce.number().positive().nullable().optional(),
    cost_unit:amt,active:z.boolean().optional()})}
};
commercialRouter.get('/master/:kind',wrap(async(req,res)=>{
  const kind=req.params.kind,config=master[kind];if(!config){res.sendStatus(404);return;}
  const page=Math.min(Math.max(Number(req.query.page)||1,1),100000),limit=15,q=String(req.query.q||'').slice(0,100);
  const searchable=kind==='services'?'name':kind==='event_types'?'name':kind==='vendor_services'?'title':null;
  const where=searchable?'WHERE '+searchable+' LIKE ?':'',values=searchable?[`%${q}%`]:[];
  const [count]=await rows<{total:number}>(`SELECT COUNT(*) total FROM ${config.table} ${where}`,values);
  const records=await rows(`SELECT * FROM ${config.table} ${where} ORDER BY id DESC LIMIT 15 OFFSET ?`,[...values,(page-1)*limit]);
  res.json({data:costRoles.has(req.identity!.role)?records:records.map(stripCost),total:count.total,page});
}));
commercialRouter.post('/master/:kind',owner,wrap(async(req,res)=>{
  const config=master[req.params.kind];if(!config){res.sendStatus(404);return;}
  const data=config.schema.strict().parse(req.body) as Record<string,unknown>;
  const fields=Object.keys(data),params=fields.map(x=>data[x]??null);
  const result=await execSql(`INSERT INTO ${config.table} (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`,params);
  res.status(201).json({id:result.insertId});
}));
commercialRouter.patch('/master/:kind/:id',owner,wrap(async(req,res)=>{
  const config=master[req.params.kind];if(!config){res.sendStatus(404);return;}
  const data=config.schema.partial().strict().parse(req.body) as Record<string,unknown>;
  const fields=Object.keys(data);if(!fields.length)throw new Error('Tidak ada perubahan.');
  const result=await execSql(`UPDATE ${config.table} SET ${fields.map(x=>x+'=?').join(',')} WHERE id=?`,
    [...fields.map(x=>data[x]??null),toId(req.params.id)]);
  if(!result.affectedRows){res.sendStatus(404);return;}res.json({ok:true});
}));

commercialRouter.get('/catalog',wrap(async(req,res)=>{
  const allowCost=costRoles.has(req.identity!.role);
  const [types,services,vendorServices,packages,clients]=await Promise.all([
    rows('SELECT * FROM event_types WHERE active=1 ORDER BY name'),
    rows('SELECT * FROM services WHERE active=1 ORDER BY category,name'),
    rows('SELECT vs.*,v.name vendor_name,v.category vendor_category FROM vendor_services vs JOIN vendors v ON v.id=vs.vendor_id WHERE vs.active=1 AND v.active=1 ORDER BY v.name,vs.title'),
    rows(`SELECT pv.*,p.name package_name FROM package_versions pv JOIN packages p ON p.id=pv.package_id
      WHERE p.active=1 ${allowCost?'':"AND pv.status='published'"} ORDER BY p.name,pv.version_no DESC`),
    rows('SELECT id,name,partner_name,phone FROM clients ORDER BY id DESC LIMIT 500')
  ]);
  res.json({event_types:types,services:allowCost?services:services.map(stripCost),
    vendor_services:vendorServices,packages:allowCost?packages:packages.map(stripCost),clients});
}));
commercialRouter.get('/packages/:id/lines',wrap(async(req,res)=>{
  const [version]=await rows<any>(`SELECT pv.*,p.name package_name FROM package_versions pv
    JOIN packages p ON p.id=pv.package_id WHERE pv.id=?`,[toId(req.params.id)]);
  if(!version){res.sendStatus(404);return;}
  if(version.status!=='published'&&!costRoles.has(req.identity!.role)){
    res.status(403).json({message:'Versi paket belum dipublikasikan.'});return;
  }
  const entries=await rows('SELECT * FROM package_version_lines WHERE package_version_id=? ORDER BY sort_order,id',[version.id]);
  res.json({version,lines:costRoles.has(req.identity!.role)?entries:entries.map(stripCost)});
}));
const packageLine=z.object({service_id:positive.nullable().optional(),vendor_service_id:positive.nullable().optional(),
  line_name:required.max(200),qty:z.string(),unit:required.max(30),
  fulfillment:z.enum(['internal','managed_vendor','client_direct']),
  default_cost_unit:amt,default_sell_unit:amt,is_optional:z.boolean().default(false)});
commercialRouter.post('/packages',owner,wrap(async(req,res)=>{
  const input=z.object({package_id:positive,lines:z.array(packageLine).min(1).max(60)}).parse(req.body);
  const result=await transaction(async conn=>{
    const [pkg]=await rows('SELECT id FROM packages WHERE id=? AND active=1 FOR UPDATE',[input.package_id],conn);
    if(!pkg)throw new Error('Paket tidak ditemukan.');
    const [last]=await rows<{v:number}>('SELECT COALESCE(MAX(version_no),0) v FROM package_versions WHERE package_id=?',[input.package_id],conn);
    const version=await execSql('INSERT INTO package_versions(package_id,version_no,status,pricing_mode,created_by) VALUES (?,?,?, ?,?)',
      [input.package_id,last.v+1,'draft','sum_items',req.identity!.id],conn);
    for(const [i,line] of input.lines.entries()){
      quantityMilli(line.qty);
      await execSql(`INSERT INTO package_version_lines(package_version_id,service_id,vendor_service_id,line_name,qty,unit,fulfillment,default_cost_unit,default_sell_unit,is_optional,sort_order)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`,[version.insertId,line.service_id??null,line.vendor_service_id??null,line.line_name,line.qty,line.unit,
        line.fulfillment,line.default_cost_unit,line.default_sell_unit,line.is_optional,i+1],conn);
    }
    return version.insertId;
  });
  res.status(201).json({id:result});
}));
commercialRouter.post('/packages/:id/publish',owner,wrap(async(req,res)=>{
  const entryId=toId(req.params.id);
  const result=await execSql('UPDATE package_versions SET status=?,published_at=NOW() WHERE id=? AND status=?',
    ['published',entryId,'draft']);
  if(!result.affectedRows)throw new Error('Hanya versi draft yang dapat dipublikasi.');
  res.json({ok:true});
}));

const quoteLine=z.object({service_id:positive.optional(),vendor_service_id:positive.optional(),
  quantity:z.union([z.string(),z.number()]).transform(String),
  fulfillment:z.enum(['internal','managed_vendor','client_direct']).optional(),
  unit_sell_override:amt.optional(),unit_cost_override:amt.optional(),
  discount_amount:amt.optional(),override_reason:z.string().max(350).optional()});
const quoteInput=z.object({lead_id:positive.optional(),client_id:positive.optional(),
  client_name:required.max(150),client_phone:z.string().max(40).optional(),
  event_type_id:positive.optional(),event_date:date,city:z.string().max(100).optional(),
  venue:z.string().max(200).optional(),guest_count:z.coerce.number().int().min(0).max(100000),
  valid_until:date,notes:z.string().optional(),package_version_id:positive.optional(),
  lines:z.array(quoteLine).min(1).max(100)});
commercialRouter.post('/preview',editor,wrap(async(req,res)=>{
  const input=quoteInput.parse(req.body);
  const result=await priceLines(input.lines,{event_date:input.event_date,event_type_id:input.event_type_id,
    city:input.city,guest_count:input.guest_count},costRoles.has(req.identity!.role));
  res.json(costRoles.has(req.identity!.role)?result:{...result,lines:result.lines.map(stripCost),
    totals:stripCost(result.totals)});
}));
async function persistRevision(conn:DbConn,quoteId:number,version:number,input:z.infer<typeof quoteInput>,actorId:number,financeAllowed:boolean){
  const result=await priceLines(input.lines,{event_date:input.event_date,event_type_id:input.event_type_id,
    city:input.city,guest_count:input.guest_count},financeAllowed,conn);
  const totals=result.totals;
  const revision=await execSql(`INSERT INTO quotation_revisions(quotation_id,version_no,event_type_id,event_date,city,venue,guest_count,valid_until,notes,package_version_id,
    subtotal_managed,subtotal_direct,discount_total,tax_total,contract_total,client_budget_total,cost_est_total,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[
    quoteId,version,input.event_type_id??null,input.event_date,input.city??null,input.venue??null,input.guest_count,input.valid_until,
    input.notes??null,input.package_version_id??null,totals.subtotal_managed,totals.subtotal_direct,totals.discount_total,'0.00',
    totals.contract_total,totals.client_budget_total,totals.cost_est_total,actorId],conn);
  for(const line of result.lines){
    const insert=await execSql(`INSERT INTO quotation_lines(revision_id,line_no,service_id,vendor_service_id,title_snapshot,unit_snapshot,fulfillment,
      quantity,unit_sell,unit_cost,discount_amount,sell_net,cost_total,price_rule_id,overridden,override_reason)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[
      revision.insertId,line.line_no,line.service_id,line.vendor_service_id,line.title_snapshot,line.unit_snapshot,line.fulfillment,
      line.quantity,line.unit_sell,line.unit_cost,line.discount_amount,line.sell_net,line.cost_total,
      line.price_rule_id,line.overridden,line.override_reason],conn);
    if(line.overridden){
      for(const [field,oldVal,newVal] of [['unit_sell',line.original_sell,line.unit_sell],['unit_cost',line.original_cost,line.unit_cost]]){
        if(oldVal!==newVal)await execSql(`INSERT INTO price_override_audits(entity_type,entity_id,field_name,before_amount,after_amount,reason,actor_id)
          VALUES ('quotation_lines',?,?,?,?,?,?)`,[insert.insertId,field,oldVal,newVal,line.override_reason,actorId],conn);
      }
    }
  }
  await execSql('UPDATE quotations SET current_revision_id=? WHERE id=?',[revision.insertId,quoteId],conn);
  return {revision_id:revision.insertId,totals};
}
commercialRouter.get('/quotations',wrap(async(req,res)=>{
  const q=String(req.query.q||'').slice(0,80),page=Math.max(1,Math.min(100000,Number(req.query.page)||1));
  const search=`%${q}%`;
  const [count]=await rows<{total:number}>(`SELECT COUNT(*) total FROM quotations q WHERE q.client_name LIKE ? OR q.quote_number LIKE ?`,[search,search]);
  const quotes=await rows<any>(`SELECT q.*,r.version_no,r.event_date,r.contract_total,r.client_budget_total,r.cost_est_total
    FROM quotations q LEFT JOIN quotation_revisions r ON r.id=q.current_revision_id
    WHERE q.client_name LIKE ? OR q.quote_number LIKE ? ORDER BY q.id DESC LIMIT 15 OFFSET ?`,[search,search,(page-1)*15]);
  res.json({data:costRoles.has(req.identity!.role)?quotes:quotes.map(stripCost),total:count.total,page});
}));
commercialRouter.get('/quotations/:id',wrap(async(req,res)=>{
  const [quote]=await rows<any>('SELECT * FROM quotations WHERE id=?',[toId(req.params.id)]);
  if(!quote){res.sendStatus(404);return;}
  const revisions=await rows<any>('SELECT * FROM quotation_revisions WHERE quotation_id=? ORDER BY version_no DESC',[quote.id]);
  const revisionId=req.query.revision_id?toId(req.query.revision_id):quote.current_revision_id;
  const chosen=revisions.find(x=>Number(x.id)===Number(revisionId));
  if(!chosen){res.sendStatus(404);return;}
  const lines=await rows<any>('SELECT * FROM quotation_lines WHERE revision_id=? ORDER BY line_no',[chosen.id]);
  res.json({quote,revision:costRoles.has(req.identity!.role)?chosen:stripCost(chosen),
    revisions:revisions.map(x=>({id:x.id,version_no:x.version_no,status:x.status,created_at:x.created_at})),
    lines:costRoles.has(req.identity!.role)?lines:lines.map(stripCost)});
}));
commercialRouter.post('/quotations',editor,wrap(async(req,res)=>{
  const input=quoteInput.parse(req.body),result=await transaction(async conn=>{
    const q=await execSql('INSERT INTO quotations(quote_number,lead_id,client_id,client_name,client_phone,created_by) VALUES (?,?,?,?,?,?)',
      [`TMP-${randomUUID()}`,input.lead_id??null,input.client_id??null,input.client_name,input.client_phone??null,req.identity!.id],conn);
    const year=new Date().getUTCFullYear(),quote_number=`QTN-${year}-${String(q.insertId).padStart(5,'0')}`;
    await execSql('UPDATE quotations SET quote_number=? WHERE id=?',[quote_number,q.insertId],conn);
    const revision=await persistRevision(conn,q.insertId,1,input,req.identity!.id,costRoles.has(req.identity!.role));
    return {id:q.insertId,quote_number,...revision};
  });res.status(201).json(result);
}));
commercialRouter.patch('/quotations/:id/draft',editor,wrap(async(req,res)=>{
  const input=quoteInput.parse(req.body),entryId=toId(req.params.id);
  const saved=await transaction(async conn=>{
    const [quote]=await rows<any>('SELECT * FROM quotations WHERE id=? FOR UPDATE',[entryId],conn);
    if(!quote||quote.status!=='draft')throw new Error('Hanya quotation draft yang dapat diedit.');
    const [old]=await rows<any>('SELECT * FROM quotation_revisions WHERE id=? FOR UPDATE',[quote.current_revision_id],conn);
    if(!old||old.status!=='draft')throw new Error('Revisi draft tidak valid.');
    await execSql('UPDATE quotation_revisions SET status=? WHERE id=?',['withdrawn',old.id],conn);
    return persistRevision(conn,entryId,old.version_no+1,input,req.identity!.id,costRoles.has(req.identity!.role));
  });res.json(saved);
}));
commercialRouter.post('/quotations/:id/revisions',editor,wrap(async(req,res)=>{
  const input=quoteInput.parse(req.body),entryId=toId(req.params.id);
  const saved=await transaction(async conn=>{
    const [quote]=await rows<any>('SELECT * FROM quotations WHERE id=? FOR UPDATE',[entryId],conn);
    if(!quote||quote.status==='accepted'||quote.status==='withdrawn')throw new Error('Quotation tidak dapat direvisi.');
    const [current]=await rows<any>('SELECT * FROM quotation_revisions WHERE id=?',[quote.current_revision_id],conn);
    if(current.status==='draft')throw new Error('Kirim quotation draft sebelum membuat revisi baru.');
    const result=await persistRevision(conn,entryId,current.version_no+1,input,req.identity!.id,costRoles.has(req.identity!.role));
    await execSql('UPDATE quotations SET status=? WHERE id=?',['draft',entryId],conn);
    return result;
  });res.status(201).json(saved);
}));
commercialRouter.post('/quotations/:id/status/:action',owner,wrap(async(req,res)=>{
  const action=req.params.action;if(!['send','accept','reject'].includes(action)){res.sendStatus(404);return;}
  const entryId=toId(req.params.id),reason=z.object({reason:z.string().max(350).optional()}).parse(req.body||{}).reason;
  await transaction(async conn=>{
    const [quote]=await rows<any>('SELECT * FROM quotations WHERE id=? FOR UPDATE',[entryId],conn);
    if(!quote)throw new Error('Quotation tidak ditemukan.');
    const [revision]=await rows<any>('SELECT * FROM quotation_revisions WHERE id=? FOR UPDATE',[quote.current_revision_id],conn);
    const expected=action==='send'?'draft':'sent';
    if(revision.status!==expected)throw new Error(`Status quotation harus ${expected}.`);
    if(action==='accept'&&String(revision.valid_until).slice(0,10)<new Date().toISOString().slice(0,10))
      throw new Error('Quotation sudah melewati masa berlaku.');
    const next=action==='send'?'sent':action==='accept'?'accepted':'rejected';
    await execSql(`UPDATE quotation_revisions SET status=?,sent_at=IF(?='sent',NOW(),sent_at),
      accepted_at=IF(?='accepted',NOW(),accepted_at) WHERE id=?`,[next,next,next,revision.id],conn);
    await execSql('UPDATE quotations SET status=?,accepted_revision_id=? WHERE id=?',
      [next,action==='accept'?revision.id:null,entryId],conn);
    await execSql('INSERT INTO quotation_actions(quotation_id,revision_id,action,reason,actor_id) VALUES (?,?,?,?,?)',
      [entryId,revision.id,action,reason??null,req.identity!.id],conn);
  });res.json({ok:true});
}));
commercialRouter.post('/quotations/:id/convert',owner,wrap(async(req,res)=>{
  const entryId=toId(req.params.id);
  const eventId=await transaction(async conn=>{
    const [quote]=await rows<any>('SELECT * FROM quotations WHERE id=? FOR UPDATE',[entryId],conn);
    if(!quote||quote.status!=='accepted'||!quote.accepted_revision_id)throw new Error('Hanya quotation accepted yang dapat dikonversi.');
    if(quote.accepted_event_id)return quote.accepted_event_id;
    const [revision]=await rows<any>('SELECT * FROM quotation_revisions WHERE id=?',[quote.accepted_revision_id],conn);
    if(!revision)throw new Error('Revisi penawaran tidak ditemukan.');
    const [chosenPackage]=revision.package_version_id?await rows<any>(
      'SELECT package_id FROM package_versions WHERE id=?',[revision.package_version_id],conn):[null];
    let clientId=quote.client_id;
    if(!clientId){
      const matches=quote.client_phone?await rows<any>('SELECT id FROM clients WHERE phone=? LIMIT 2',[quote.client_phone],conn):[];
      if(matches.length>1)throw new Error('Nomor klien ganda, pilih data klien dahulu.');
      clientId=matches[0]?.id;
      if(!clientId){
        const client=await execSql('INSERT INTO clients(name,phone) VALUES (?,?)',[quote.client_name,quote.client_phone??''],conn);
        clientId=client.insertId;
      }
    }
    const event=await execSql(`INSERT INTO events(code,title,client_id,lead_id,package_id,event_date,venue,city,guest_count,status,contract_amount,estimated_cost,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,[`TMP-${randomUUID()}`,`${quote.client_name} Wedding`,clientId,quote.lead_id,
      chosenPackage?.package_id??null,revision.event_date,
      revision.venue??'',revision.city??'',revision.guest_count,'planning',revision.contract_total,revision.cost_est_total,
      revision.notes??''],conn);
    await execSql('UPDATE events SET code=? WHERE id=?',[`WI-${String(revision.event_date).slice(0,4)}-${String(event.insertId).padStart(5,'0')}`,event.insertId],conn);
    const budget=await execSql(`INSERT INTO event_budget_revisions(event_id,revision_no,source_revision_id,contract_total,direct_budget,cost_est_total,created_by)
      VALUES (?,?,?,?,?,?,?)`,[event.insertId,1,revision.id,revision.contract_total,revision.subtotal_direct,revision.cost_est_total,req.identity!.id],conn);
    const lines=await rows<any>('SELECT * FROM quotation_lines WHERE revision_id=? ORDER BY line_no',[revision.id],conn);
    for(const line of lines)await execSql(`INSERT INTO event_budget_lines(budget_revision_id,quotation_line_id,title_snapshot,fulfillment,quantity,unit_sell,unit_cost,sell_net,cost_total)
      VALUES (?,?,?,?,?,?,?,?,?)`,[budget.insertId,line.id,line.title_snapshot,line.fulfillment,line.quantity,
      line.unit_sell,line.unit_cost,line.sell_net,line.cost_total],conn);
    const proposals=await rows<any>(`SELECT vs.vendor_id,
      GROUP_CONCAT(DISTINCT ql.title_snapshot ORDER BY ql.line_no SEPARATOR ', ') services,
      SUM(ql.cost_total) agreed_cost FROM quotation_lines ql
      JOIN vendor_services vs ON vs.id=ql.vendor_service_id
      WHERE ql.revision_id=? AND ql.fulfillment='managed_vendor' GROUP BY vs.vendor_id`,[revision.id],conn);
    for(const vendor of proposals){
      await execSql(`INSERT INTO event_vendors(event_id,vendor_id,service_name,agreed_price,status,notes)
        VALUES (?,?,?,?,?,?)`,[event.insertId,vendor.vendor_id,String(vendor.services).slice(0,130),
        vendor.agreed_cost,'proposed','Usulan dari quotation; konfirmasi ketersediaan sebelum booking.'],conn);
    }
    await execSql('UPDATE quotations SET accepted_event_id=?,client_id=? WHERE id=?',[event.insertId,clientId,entryId],conn);
    return event.insertId;
  });res.json({event_id:eventId});
}));
