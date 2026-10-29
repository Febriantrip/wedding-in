import type {ShowcaseJournal,ShowcaseRow} from '../showcase';

type Row=Record<string,any>;
type Data={journals:ShowcaseJournal[];invoices:ShowcaseRow[];bills:ShowcaseRow[];events:ShowcaseRow[]};
type Stored={categories:Row[];transactions:Row[]};
const key='weddingin_demo_backoffice_v1';
const round=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
const kindDirection:Record<string,string>={DIRECT_EXPENSE:'out',OTHER_RECEIPT:'in',INTERNAL_TRANSFER:'transfer'};
const defaults:Stored={categories:[
  {id:1,code:'OPEX',name:'Operasional Kantor',flow_type:'expense',default_debit_account_id:15,
    debit_code:'6000',active:1,requires_event:0},
  {id:2,code:'MARKETING',name:'Promosi & Marketing',flow_type:'expense',default_debit_account_id:17,
    debit_code:'6200',active:1,requires_event:0},
  {id:3,code:'CREW-LOGISTIK',name:'Konsumsi / Transport Crew',flow_type:'expense',default_debit_account_id:15,
    debit_code:'6000',active:1,requires_event:1},
  {id:4,code:'REVENUE-OTHER',name:'Pemasukan Non-Wedding',flow_type:'income',default_credit_account_id:11,
    credit_code:'4100',active:1,requires_event:0}
],transactions:[]};
const load=():Stored=>{try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):structuredClone(defaults);}
  catch{return structuredClone(defaults);}};
const save=(stored:Stored)=>localStorage.setItem(key,JSON.stringify(stored));
const nextId=(rows:Row[])=>Math.max(0,...rows.map(r=>Number(r.id)||0))+1;
const date=(value:string)=>String(value||'').slice(0,10);
const page=(list:Row[],url:URL)=>{const current=Math.max(1,Number(url.searchParams.get('page'))||1);
  return {data:list.slice((current-1)*15,current*15),total:list.length,page:current};};
const payments=(rows:ShowcaseRow[],type:'receipt'|'payment',events:ShowcaseRow[])=>rows.flatMap(invoice=>
  (invoice.payments||[]).map((payment:Row,index:number)=>({uid:`${type}-${invoice.id}-${index}`,id:index+1,
    number:`${type==='receipt'?'RCPT':'PAY'}-${invoice.id}-${index+1}`,transaction_date:date(payment.paid_at),
    kind:type==='receipt'?'CLIENT_RECEIPT':'VENDOR_PAYMENT',direction:type==='receipt'?'in':'out',
    description:`${type==='receipt'?'Penerimaan invoice':'Pembayaran tagihan'} ${invoice.number}`,
    event_title:events.find(e=>e.id===invoice.event_id)?.title||null,amount:Number(payment.amount),
    status:payment.cancel_reason?'reversed':'posted',origin:'legacy'})));
function journalTotals(db:Data,code:string){return round(db.journals.reduce((n,entry)=>n+entry.lines.reduce((acc,line)=>
  acc+(line.code===code?Number(line.debit||0)-Number(line.credit||0):0),0),0));}

export function demoBackofficeRequest(path:string,method:string,body:Row,db:Data,accounts:Row[],saveShowcase:()=>void,today:string):any{
  const url=new URL(path,'https://demo.local'),parts=url.pathname.split('/').filter(Boolean);
  if(parts[0]!=='backoffice')return undefined;
  const store=load(),persist=(value:any)=>{save(store);return value;};
  if(parts[1]==='accounts'&&method==='GET')return {data:accounts.filter(x=>x.active).map(a=>({...a,
    kind:a.is_cash?'bank':null,bank_name:a.is_cash?'Rekening simulasi':null,balance:journalTotals(db,a.code)}))};
  if(parts[1]==='categories'){
    if(method==='GET')return {data:store.categories};
    if(method==='POST'){
      if(store.categories.some(x=>x.code===body.code))throw new Error('Kode kategori sudah tersedia.');
      const id=nextId(store.categories),account=accounts.find(a=>a.id===Number(body.default_debit_account_id||body.default_credit_account_id));
      store.categories.push({id,...body,active:1,debit_code:body.default_debit_account_id?account?.code:null,
        credit_code:body.default_credit_account_id?account?.code:null});return persist({id});}
  }
  if(parts[1]==='summary'&&method==='GET'){
    const cashCodes=new Set(accounts.filter(x=>x.is_cash).map(x=>x.code));
    const cash_balance=round(accounts.filter(x=>x.is_cash).reduce((sum,a)=>sum+journalTotals(db,a.code),0));
    const cashChanges=db.journals.filter(j=>date(j.date)===today&&j.cash_flow!=='none'&&j.reference_type!=='reversal')
      .flatMap(j=>j.lines.filter(l=>cashCodes.has(l.code)));
    const due=(items:ShowcaseRow[])=>round(items.filter(x=>!x.cancel_reason).reduce((n,x)=>n+Number(x.amount)-Number(x.paid),0));
    return {cash_balance,today_income:round(cashChanges.reduce((n,l)=>n+Math.max(0,Number(l.debit||0)),0)),
      today_expense:round(cashChanges.reduce((n,l)=>n+Math.max(0,Number(l.credit||0)),0)),
      receivables:due(db.invoices),payables:due(db.bills),
      pending:store.transactions.filter(x=>['draft','submitted','approved'].includes(x.status)).length};
  }
  if(parts[1]==='transactions'){
    if(!parts[2]&&method==='GET'){
      const legacy=[...payments(db.invoices,'receipt',db.events),...payments(db.bills,'payment',db.events)];
      const rows=[...store.transactions.map(t=>({...t,uid:`new-${t.id}`,origin:'new',
        event_title:db.events.find(e=>e.id===Number(t.event_id))?.title||null})),...legacy];
      const q=(url.searchParams.get('q')||'').toLowerCase();
      return page(rows.filter(t=>!q||`${t.number} ${t.description} ${t.event_title||''}`.toLowerCase().includes(q))
        .sort((a,b)=>String(b.transaction_date).localeCompare(String(a.transaction_date))||String(b.uid).localeCompare(String(a.uid))),url);
    }
    if(!parts[2]&&method==='POST'){
      const amount=Number(body.amount),cash=accounts.find(a=>a.id===Number(body.cash_account_id)&&a.is_cash);
      if(!Number.isFinite(amount)||amount<=0||!cash)throw new Error('Nominal dan rekening kas/bank harus valid.');
      const cat=store.categories.find(c=>c.id===Number(body.category_id));
      if(body.kind!=='INTERNAL_TRANSFER'&&(!cat||cat.flow_type!==(body.kind==='OTHER_RECEIPT'?'income':'expense')))
        throw new Error('Pilih kategori sesuai jenis transaksi.');
      if(cat?.requires_event&&!body.event_id)throw new Error('Kategori ini wajib memilih project.');
      if(body.kind==='INTERNAL_TRANSFER'&&(!body.destination_cash_account_id||body.destination_cash_account_id===body.cash_account_id))
        throw new Error('Rekening tujuan harus berbeda dari rekening asal.');
      const id=nextId(store.transactions),item={...body,id,number:`WIN-TRX-DEMO-${String(id).padStart(3,'0')}`,
        amount:round(amount),cash_code:cash.code,category_name:cat?.name||null,
        transaction_date:date(body.transaction_date),direction:kindDirection[body.kind],
        created_by:1,creator_name:'Admin Demo',status:'draft',posted_journal_id:null,
        audit:[{action:'created',actor_name:'Admin Demo',created_at:today}],journal:[]};
      store.transactions.push(item);return persist({id});
    }
    const item=store.transactions.find(t=>t.id===Number(parts[2]));
    if(!item)throw new Error('Transaksi demo tidak ditemukan.');
    if(method==='GET'&&parts.length===3)return {data:item,audit:item.audit,journal:item.journal};
    if(method==='POST'&&parts[3]){
      const expected:Record<string,string>={submit:'draft',approve:'submitted',post:'approved',reverse:'posted'};
      if(item.status!==expected[parts[3]])throw new Error('Status transaksi tidak sesuai untuk aksi ini.');
      if(parts[3]==='reverse'&&String(body.reason||'').trim().length<8)throw new Error('Alasan koreksi minimal 8 karakter.');
      if(parts[3]==='post'){
        const original=accounts.find(a=>a.id===Number(item.cash_account_id)),
          dest=accounts.find(a=>a.id===Number(item.destination_cash_account_id)),
          cat=store.categories.find(c=>c.id===Number(item.category_id)),amount=Number(item.amount);
        if(!original)throw new Error('Akun kas asal tidak tersedia.');
        const lines=item.kind==='INTERNAL_TRANSFER'?[
          {code:dest?.code||'',debit:amount,credit:0},{code:original.code,debit:0,credit:amount}]:
          item.kind==='DIRECT_EXPENSE'?[
            {code:cat?.debit_code||'',debit:amount,credit:0,event_id:item.event_id||null},
            {code:original.code,debit:0,credit:amount,event_id:item.event_id||null}]:[
            {code:original.code,debit:amount,credit:0},{code:cat?.credit_code||'',debit:0,credit:amount}];
        if(lines.some(l=>!l.code))throw new Error('Pemetaan akun belum lengkap.');
        item.journal=lines.map(l=>({...l,name:accounts.find(a=>a.code===l.code)?.name||l.code}));
        db.journals.push({date:item.transaction_date,description:item.description,reference_type:'backoffice',
          reference_number:item.number,cash_flow:item.kind==='INTERNAL_TRANSFER'?'none':'operating',lines});
        item.posted_journal_id=db.journals.length;saveShowcase();
      }
      if(parts[3]==='reverse'){
        const entry=db.journals.find(j=>j.reference_type==='backoffice'&&j.reference_number===item.number);
        if(!entry)throw new Error('Jurnal sumber tidak ditemukan.');
        db.journals.push({...entry,reference_type:'reversal',description:`Pembalikan ${entry.description}: ${body.reason}`,
          date:today,lines:entry.lines.map(l=>({...l,debit:l.credit||0,credit:l.debit||0}))});saveShowcase();
      }
      item.status={submit:'submitted',approve:'approved',post:'posted',reverse:'reversed'}[parts[3]];
      item.audit.push({action:parts[3],actor_name:'Admin Demo',created_at:today,reason:body.reason||null});
      return persist({ok:true});
    }
  }
  throw new Error(`Operasi Backoffice tidak tersedia dalam demo: ${method} ${url.pathname}`);
}
