import test from 'node:test';
import assert from 'node:assert/strict';
import {buildShowcase} from '../src/showcase.js';
import {demoRequest} from '../src/demo.js';

const put=(path:string,payload:unknown,method='POST')=>demoRequest(path,{method,body:JSON.stringify(payload)});
const today=new Date().toISOString().slice(0,10);

test('MoM dan foto tersimpan per checklist, dapat diedit dan dihapus dengan checklist',async()=>{
  const db=buildShowcase(new Date(2026,9,27,12));
  const stored=new Map<string,string>([['weddingin_showcase_v2',JSON.stringify(db)]]);
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>stored.get(key)??null,
    setItem:(key:string,val:string)=>{stored.set(key,val);},removeItem:(key:string)=>{stored.delete(key);}}});
  const task=db.tasks[0],other=db.tasks[1];
  const photo={name:'meeting.jpeg',mime:'image/jpeg',data:'data:image/jpeg;base64,/9j/'};
  await put(`/tasks/${task.id}/documents`,{mom:'Keputusan: koordinasi vendor jam 09.00',photos:[photo]},'PUT');
  assert.equal((await demoRequest(`/tasks/${task.id}/documents`)).photos[0].name,'meeting.jpeg');
  assert.equal((await demoRequest(`/tasks/${other.id}/documents`)).photos.length,0);
  await put(`/tasks/${task.id}/documents`,{mom:'Revisi hasil rapat',photos:[]},'PUT');
  assert.equal((await demoRequest(`/tasks/${task.id}/documents`)).mom,'Revisi hasil rapat');
  await assert.rejects(()=>put(`/tasks/${task.id}/documents`,{mom:'x',photos:Array(5).fill(photo)},'PUT'),/valid/i);
  await demoRequest(`/tasks/${task.id}`,{method:'DELETE'});
  assert.equal(stored.has(`weddingin_task_document_${task.id}`),false);
});

test('pembatalan menyimpan alasan, mempertahankan histori, dan membalik jurnal secara seimbang',async()=>{
  const db=buildShowcase(new Date(2026,9,27,12));
  const stored=new Map<string,string>([['weddingin_showcase_v2',JSON.stringify(db)]]);
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>stored.get(key)??null,
    setItem:(key:string,val:string)=>{stored.set(key,val);},removeItem:()=>{}}});

  const before=await demoRequest('/events');
  const future=before.data.find((e:any)=>e.status==='planning');
  await assert.rejects(()=>put(`/events/${future.id}/cancel`,{reason:'a'}),/minimal/i);
  await put(`/events/${future.id}/cancel`,{reason:'Pengantin membatalkan reservasi'});
  const detail=await demoRequest(`/events/${future.id}`);
  assert.equal(detail.event.status,'cancelled');
  assert.match(detail.event.cancel_reason,/reservasi/);
  assert.ok((await demoRequest('/events')).data.some((e:any)=>e.id===future.id));
  assert.ok(!(await demoRequest(`/calendar?month=${String(future.event_date).slice(0,7)}`)).data.some((e:any)=>e.kind==='wedding'&&e.id===future.id));

  const lead=db.leads.find(l=>l.status==='proposal')!;
  await put(`/resources/leads/${lead.id}`,{name:'Prospek Revisi'},'PATCH');
  await put(`/resources/leads/${lead.id}/cancel`,{reason:'Klien memilih vendor berbeda'});
  assert.equal((await demoRequest('/resources/leads')).data.find((l:any)=>l.id===lead.id).status,'lost');

  const unpaid=db.invoices.find(i=>i.paid===0)!;
  const journalCount=JSON.parse(stored.get('weddingin_showcase_v2')!).journals.length;
  await put(`/finance/invoices/${unpaid.id}`,{description:'Invoice revisi',due_date:'2026-12-03'},'PATCH');
  await put(`/finance/invoices/${unpaid.id}/cancel`,{reason:'Invoice salah input, akan diganti'});
  const invoices=(await demoRequest('/finance/invoices')).data;
  assert.match(invoices.find((i:any)=>i.id===unpaid.id).cancel_reason,/salah input/);
  assert.equal(JSON.parse(stored.get('weddingin_showcase_v2')!).journals.length,journalCount+1);
  await assert.rejects(()=>put(`/finance/invoices/${unpaid.id}/cancel`,{reason:'Dibatalkan dua kali'}),/sudah dibatalkan/i);

  const paidInvoice=db.invoices.find(i=>i.paid>0&&i.payments.length===1)!;
  const payBefore=Number(paidInvoice.paid);
  await assert.rejects(()=>put(`/finance/invoices/${paidInvoice.id}/cancel`,{reason:'Alasan refund'}),/sudah dibayar/i);
  const payments=(await demoRequest(`/finance/invoices/${paidInvoice.id}/payments`)).data;
  assert.ok(payments.length);
  await put(`/finance/invoices/${paidInvoice.id}/payments/${payments[0].id}/cancel`,{reason:'Koreksi transfer bank'});
  const paymentAfter=(await demoRequest(`/finance/invoices/${paidInvoice.id}/payments`)).data[0];
  assert.match(paymentAfter.cancel_reason,/transfer bank/);
  assert.equal((await demoRequest('/finance/invoices')).data.find((i:any)=>i.id===paidInvoice.id).paid,payBefore-payments[0].amount);
  await assert.rejects(()=>put(`/finance/invoices/${paidInvoice.id}/payments/${payments[0].id}/cancel`,{reason:'Koreksi ulang'}),/sudah dibatalkan/i);

  const j=await put('/finance/journals',{date:today,description:'Jurnal pengujian',cash_flow:'none',lines:[
    {code:'1010',debit:1000,credit:0},{code:'3000',debit:0,credit:1000}]});
  assert.ok(j.ok);
  const journalRows=(await demoRequest('/finance/journals')).data;
  const manual=journalRows.find((r:any)=>r.description==='Jurnal pengujian');
  await put(`/finance/journals/${manual.id}/cancel`,{reason:'Salah akun buku besar'});
  assert.match((await demoRequest('/finance/journals')).data.find((r:any)=>r.id===manual.id).cancel_reason,/Salah akun/);
  assert.equal((await demoRequest('/reports/balance-sheet?as_of=2099-01-01')).balanced,true);
  assert.equal((await demoRequest('/reports/trial-balance?as_of=2099-01-01')).balanced,true);
});
