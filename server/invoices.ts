import {randomUUID} from 'node:crypto';
import {rows,execSql,type DbConn} from './db.js';
import {moneyCents,postJournal} from './accounting.js';

export type InvoiceEvent={title:string;status:string;contract_amount:string};
export async function issueWeddingInvoice(conn:DbConn,input:{
  eventId:number;event:InvoiceEvent;amount:string|number;dueDate:string;description:string;userId:number;issuedAt:string
}){
  const [issued]=await rows<{total:string}>(`SELECT COALESCE(SUM(amount),0) total FROM invoices i WHERE i.event_id=?
    AND NOT EXISTS(SELECT 1 FROM lifecycle_actions a WHERE a.entity_type='invoices' AND a.entity_id=i.id AND a.action='cancel')`,[input.eventId],conn);
  if(moneyCents(issued.total)+moneyCents(input.amount)>moneyCents(input.event.contract_amount))
    throw new Error('Total invoice melebihi nilai kontrak WO. Gunakan Change Order untuk biaya tambahan.');
  const number=`INV-${input.issuedAt.slice(0,4)}-${randomUUID().slice(0,8).toUpperCase()}`;
  const invoice=await execSql('INSERT INTO invoices(event_id,number,amount,due_date,description) VALUES (?,?,?,?,?)',
    [input.eventId,number,input.amount,input.dueDate,input.description],conn);
  await postJournal(conn,{date:input.issuedAt,description:`Invoice ${number} - ${input.event.title}`,
    reference_type:'invoice',reference_id:invoice.insertId,cash_flow:'none',user_id:input.userId,lines:[
      {code:'1100',debit:Number(input.amount),event_id:input.eventId},
      {code:input.event.status==='completed'?'4000':'2100',credit:Number(input.amount),event_id:input.eventId}
    ]});
  return {invoiceId:invoice.insertId,number};
}
