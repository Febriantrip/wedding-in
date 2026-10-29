import assert from 'node:assert/strict';
import {test} from 'node:test';
import {demoRequest} from '../src/demo';

const reset=()=>{
  const data=new Map<string,string>();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
    getItem:(key:string)=>data.get(key)??null,
    setItem:(key:string,value:string)=>{data.set(key,value);},
    removeItem:(key:string)=>{data.delete(key);}
  }});
};
const send=(path:string,payload:unknown,method='POST')=>demoRequest(path,{method,body:JSON.stringify(payload)});

test('semua GET modul commercial dan backoffice mengembalikan bentuk data sesuai UI',async()=>{
  reset();
  const catalog=await demoRequest('/commercial/catalog');
  assert.ok(catalog.services.length>0&&catalog.vendor_services.length>0&&catalog.packages.length>0);
  const list=await demoRequest('/commercial/quotations?page=1&q=');
  assert.ok(list.total>=2&&list.data[0].quote_number);
  assert.ok((await demoRequest(`/commercial/quotations/${list.data[0].id}`)).revision);
  const lines=await demoRequest(`/commercial/packages/${catalog.packages[0].id}/lines`);
  assert.ok(lines.lines.length>0);
  for(const kind of ['event_types','services','service_price_rules','vendor_services','vendor_service_rates']){
    const records=await demoRequest(`/commercial/master/${kind}?page=1&q=`);
    assert.ok(records.total>=1,`${kind} harus memiliki dummy`);
    assert.ok(Array.isArray(records.data));
  }
  const [accounts,categories,summary,register]=await Promise.all([
    demoRequest('/backoffice/accounts'),demoRequest('/backoffice/categories'),
    demoRequest('/backoffice/summary'),demoRequest('/backoffice/transactions?page=1&q=')]);
  assert.ok(accounts.data.some((a:any)=>a.is_cash));
  assert.ok(categories.data.some((c:any)=>c.flow_type==='expense'));
  assert.ok(Number.isFinite(Number(summary.cash_balance)));
  assert.ok(register.total>0&&register.data.every((r:any)=>r.uid&&r.origin));
});

test('quotation demo dapat dihitung, disimpan, dibaca, dikirim, dan dikonversi',async()=>{
  reset();
  const form={client_name:'Contoh Klien Demo',client_phone:'08120000000',event_date:'2026-11-20',
    valid_until:'2026-11-15',city:'Bandung',venue:'Venue Contoh',guest_count:200,
    lines:[{service_id:1,quantity:'1',fulfillment:'internal',discount_amount:'0'}]};
  const price=await send('/commercial/preview',form);
  assert.equal(price.totals.contract_total,'32000000.00');
  const saved=await send('/commercial/quotations',form);
  assert.ok(saved.id>0);
  const quote=await demoRequest(`/commercial/quotations/${saved.id}`);
  assert.equal(quote.quote.client_name,form.client_name);
  await send(`/commercial/quotations/${saved.id}/status/send`,{});
  await send(`/commercial/quotations/${saved.id}/status/accept`,{});
  const converted=await send(`/commercial/quotations/${saved.id}/convert`,{});
  assert.ok((await demoRequest('/events')).data.some((e:any)=>e.id===converted.event_id));
  const direct=await send('/commercial/preview',{...form,lines:[{service_id:1,quantity:'1',fulfillment:'client_direct'}]});
  assert.equal(direct.totals.contract_total,'0.00');
  assert.equal(direct.totals.client_budget_total,'32000000.00');
});

test('transaksi backoffice demo menjaga jurnal berpasangan dan dapat dibalik',async()=>{
  reset();
  const saved=await send('/backoffice/transactions',{kind:'DIRECT_EXPENSE',transaction_date:'2026-10-29',
    cash_account_id:2,category_id:1,amount:'450000',description:'Pengeluaran kantor demonstrasi'});
  assert.ok(saved.id>0);
  let item=await demoRequest(`/backoffice/transactions/${saved.id}`);
  assert.equal(item.data.status,'draft');
  for(const action of ['submit','approve','post'])await send(`/backoffice/transactions/${saved.id}/${action}`,{});
  item=await demoRequest(`/backoffice/transactions/${saved.id}`);
  assert.equal(item.data.status,'posted');
  assert.equal(item.journal.reduce((n:number,l:any)=>n+Number(l.debit)-Number(l.credit),0),0);
  assert.equal((await demoRequest('/reports/balance-sheet?as_of=2099-01-01')).balanced,true);
  await send(`/backoffice/transactions/${saved.id}/reverse`,{reason:'Salah referensi pembayaran'});
  assert.equal((await demoRequest(`/backoffice/transactions/${saved.id}`)).data.status,'reversed');
  assert.equal((await demoRequest('/reports/balance-sheet?as_of=2099-01-01')).balanced,true);
});
