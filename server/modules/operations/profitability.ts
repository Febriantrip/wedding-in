import type {Router} from 'express';
import {z} from 'zod';
import {allow} from '../../auth.js';
import {rows} from '../../db.js';
import {wrap} from './shared.js';

const finance=allow('owner','admin','finance');

export function registerProfitability(router:Router){
  router.get('/profitability',finance,wrap(async(req,res)=>{
    const year=z.coerce.number().int().min(2020).max(2100).parse(req.query.year??new Date().getUTCFullYear());
    const status=z.enum(['all','active','completed']).parse(req.query.status??'all');
    const page=z.coerce.number().int().min(1).max(10000).parse(req.query.page??1);
    const start=`${year}-01-01`,end=`${year+1}-01-01`;
    const filter=status==='completed'?"AND e.status='completed'":
      status==='active'?"AND e.status IN ('planning','confirmed','in_progress')":"AND e.status<>'cancelled'";
    const params=[start,end];
    const [[count],[summary],[actual],items]=await Promise.all([
      rows<{total:number}>(`SELECT COUNT(*) total FROM events e WHERE e.event_date>=? AND e.event_date<? ${filter}`,params),
      rows<any>(`SELECT COALESCE(SUM(e.contract_amount),0) contract_value,
        COALESCE(SUM(e.estimated_cost),0) estimated_cost,
        COALESCE(SUM(e.contract_amount-e.estimated_cost),0) projected_margin
        FROM events e WHERE e.event_date>=? AND e.event_date<? ${filter}`,params),
      rows<any>(`SELECT COALESCE(SUM(CASE WHEN a.type='revenue' THEN l.credit-l.debit ELSE 0 END),0) revenue,
        COALESCE(SUM(CASE WHEN a.type IN ('cogs','expense') THEN l.debit-l.credit ELSE 0 END),0) cost
        FROM events e JOIN journal_lines l ON l.event_id=e.id JOIN accounts a ON a.id=l.account_id
        WHERE e.event_date>=? AND e.event_date<? ${filter}`,params),
      rows<any>(`SELECT e.id,e.code,e.title,e.event_date,e.status,c.name client_name,
        e.contract_amount,e.estimated_cost,
        COALESCE(SUM(CASE WHEN a.type='revenue' THEN l.credit-l.debit ELSE 0 END),0) recognized_revenue,
        COALESCE(SUM(CASE WHEN a.type IN ('cogs','expense') THEN l.debit-l.credit ELSE 0 END),0) actual_cost
        FROM events e JOIN clients c ON c.id=e.client_id
        LEFT JOIN journal_lines l ON l.event_id=e.id LEFT JOIN accounts a ON a.id=l.account_id
        WHERE e.event_date>=? AND e.event_date<? ${filter}
        GROUP BY e.id,e.code,e.title,e.event_date,e.status,c.name,e.contract_amount,e.estimated_cost
        ORDER BY e.event_date DESC,e.id DESC LIMIT 15 OFFSET ?`,[...params,(page-1)*15])
    ]);
    res.json({year,status,page,total:Number(count?.total??0),summary:{...summary,
      recognized_revenue:actual?.revenue??'0.00',actual_cost:actual?.cost??'0.00',
      recognized_profit:Number(actual?.revenue??0)-Number(actual?.cost??0)},items});
  }));
}
