import { buildShowcase, showcaseAccounts, type ShowcaseJournal } from './showcase';
import {cloneTemplate,defaultRunTemplate} from '../server/modules/operations/rundown-template-data';
import {demoCommercialRequest} from './demo/commercial';
import {demoBackofficeRequest} from './demo/backoffice';

type Row = Record<string, any>;
type DemoDB = ReturnType<typeof buildShowcase>;
const key = 'weddingin_showcase_v2';
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const read = (): DemoDB => {
  try { const saved = localStorage.getItem(key); return saved ? JSON.parse(saved) : buildShowcase(); }
  catch { return buildShowcase(); }
};
const save = (db: DemoDB) => localStorage.setItem(key, JSON.stringify(db));
const idNew = (rows: Row[]) => Math.max(0, ...rows.map(row => Number(row.id) || 0)) + 1;
const addJournal = (db: DemoDB, journal: ShowcaseJournal) => db.journals.push(journal);
const reverseDemoJournal=(db:DemoDB,original:ShowcaseJournal,reason:string)=>addJournal(db,{
  date:today(),description:`Pembatalan: ${original.description} — ${reason.slice(0,80)}`,
  reference_type:'reversal',reference_number:original.reference_number,cash_flow:original.cash_flow,
  lines:original.lines.map(line=>({...line,debit:line.credit||0,credit:line.debit||0}))
});
const accountKey='weddingin_demo_accounts_v4',usersKey='weddingin_demo_users_v4';
const defaultAccounts=showcaseAccounts.map(([code, name, type, is_cash], index) => ({ id: index + 1, code, name, type, is_cash, active: 1 }));
const accounts:Row[]=(()=>{try{const stored=localStorage.getItem(accountKey);return stored?JSON.parse(stored):defaultAccounts;}catch{return defaultAccounts;}})();
const accountByCode = new Map<string, (typeof accounts)[number]>(accounts.map(account => [account.code, account]));
const demoUsers:Row[]=(()=>{try{const stored=localStorage.getItem(usersKey);return stored?JSON.parse(stored):
  [{id:1,name:'Admin Demo',email:'demo@wedding-in.invalid',role:'owner',active:1,created_at:today()}];}catch{return [];}})();
const signed = (type: string, debit: number, credit: number) =>
  ['liability', 'equity', 'revenue'].includes(type) ? credit - debit : debit - credit;

function journalBalance(db: DemoDB, asOf: string) {
  const totals = new Map<string, number>();
  for (const entry of db.journals.filter(j => j.date <= asOf)) {
    for (const line of entry.lines) totals.set(line.code, round((totals.get(line.code) || 0) + (line.debit || 0) - (line.credit || 0)));
  }
  return totals;
}
function balanceSheet(db: DemoDB, asOf: string) {
  const totals = journalBalance(db, asOf);
  const groups = Object.fromEntries(['asset', 'liability', 'equity', 'revenue', 'cogs', 'expense'].map(type => [type,
    accounts.filter(a => a.type === type).map(a => ({ code: a.code, name: a.name, type, balance: round(signed(type, totals.get(a.code) || 0, 0)) }))
  ])) as Record<string, Row[]>;
  const sum = (rows: Row[]) => round(rows.reduce((n, x) => n + Number(x.balance), 0));
  const earnings = round(sum(groups.revenue) - sum(groups.cogs) - sum(groups.expense));
  const assets = groups.asset, liabilities = groups.liability;
  const equity = [...groups.equity, { code: '3999', name: 'Laba ditahan & berjalan', type: 'equity', balance: earnings }];
  const total_assets = sum(assets), total_liabilities = sum(liabilities), total_equity = sum(equity);
  return { as_of: asOf, assets, liabilities, equity, total_assets, total_liabilities, total_equity,
    balanced: Math.abs(total_assets - total_liabilities - total_equity) < 0.01 };
}
function incomeStatement(db: DemoDB, from: string, to: string, eventId?: number) {
  const totals = new Map<string, number>();
  for (const entry of db.journals.filter(j => j.date >= from && j.date <= to)) {
    for (const line of entry.lines) {
      if (eventId && Number(line.event_id) !== eventId) continue;
      const a = accountByCode.get(line.code);
      if (!a || !['revenue', 'cogs', 'expense'].includes(a.type)) continue;
      totals.set(line.code, round((totals.get(line.code) || 0) + signed(a.type, line.debit || 0, line.credit || 0)));
    }
  }
  const groups = Object.fromEntries(['revenue', 'cogs', 'expense'].map(type => [type,
    accounts.filter(a => a.type === type && totals.has(a.code)).map(a => ({ code: a.code, name: a.name, amount: totals.get(a.code) || 0 }))
  ])) as Record<string, { code: string; name: string; amount: number }[]>;
  const total = (type: string) => round(groups[type].reduce((sum, a) => sum + a.amount, 0));
  const revenue = total('revenue'), cogs = total('cogs'), operating_expense = total('expense');
  return { from, to, event_id: eventId ?? null, groups, revenue, cogs,
    gross_profit: round(revenue - cogs), operating_expense, net_profit: round(revenue - cogs - operating_expense) };
}
function cashFlow(db: DemoDB, from: string, to: string) {
  let beginning_cash = 0;
  const movements: Record<string, number> = { operating: 0, investing: 0, financing: 0, opening: 0, none: 0 };
  for (const entry of db.journals) {
    const change = entry.lines.reduce((sum, l) => sum + (accountByCode.get(l.code)?.is_cash ? (l.debit || 0) - (l.credit || 0) : 0), 0);
    if (entry.date < from) beginning_cash += change;
    else if (entry.date <= to) movements[entry.cash_flow] = round((movements[entry.cash_flow] || 0) + change);
  }
  const net_change = round(Object.values(movements).reduce((a, b) => a + b, 0));
  return { from, to, beginning_cash: round(beginning_cash), movements, net_change,
    ending_cash: round(beginning_cash + net_change) };
}
function trialBalance(db: DemoDB, asOf: string) {
  const totals = journalBalance(db, asOf);
  const result = accounts.map(a => {
    const value = round(totals.get(a.code) || 0);
    return { code: a.code, name: a.name, debit: Math.max(0, value), credit: Math.max(0, -value) };
  });
  const total_debit = round(result.reduce((sum, row) => sum + row.debit, 0));
  const total_credit = round(result.reduce((sum, row) => sum + row.credit, 0));
  return { as_of: asOf, accounts: result, total_debit, total_credit,
    balanced: Math.abs(total_debit - total_credit) < 0.01 };
}
const enrich = (db: DemoDB): Row[] => db.events.map(e => ({ ...e,
  total_tasks: db.tasks.filter(t => t.event_id === e.id).length,
  completed_tasks: db.tasks.filter(t => t.event_id === e.id && t.status === 'done').length }));

export async function demoRequest(path: string, options: RequestInit = {}): Promise<any> {
  const db = read(), method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(String(options.body)) : {};
  const url = new URL(path, 'https://demo.local'), p = url.pathname;
  const segments = p.split('/').filter(Boolean);
  await new Promise(resolve => setTimeout(resolve, 70));
  if (segments[0] === 'tasks' && segments[2] === 'documents') {
    const task=db.tasks.find(t=>t.id===Number(segments[1]));
    if (!task) throw new Error('Checklist tidak ditemukan.');
    const key = `weddingin_task_document_${segments[1]}`;
    if (method === 'GET') return JSON.parse(localStorage.getItem(key) || '{"mom":"","photos":[]}');
    if (method === 'PUT') {
      if(db.events.some(e=>e.id===task.event_id&&e.status==='cancelled'))throw new Error('Wedding telah dibatalkan.');
      if (String(body.mom || '').length > 20000 || !Array.isArray(body.photos) || body.photos.length > 4)
        throw new Error('Isi MoM atau foto tidak valid.');
      localStorage.setItem(key, JSON.stringify({mom:body.mom,photos:body.photos}));return {ok:true};
    }
  }
  if (p === '/auth/me' || p === '/auth/login') return { user: { id: 1, name: 'Admin Demo', email: 'demo@wedding-in.invalid', role: 'owner' } };
  if (p === '/auth/logout') return { ok: true };
  if(segments[0]==='commercial')return demoCommercialRequest(path,method,body,db,()=>save(db));
  if(segments[0]==='backoffice')return demoBackofficeRequest(path,method,body,db,accounts,()=>save(db),today());
  if(p==='/projects/profitability'&&method==='GET'){
    const year=Number(url.searchParams.get('year')||new Date().getFullYear()),status=url.searchParams.get('status')||'all',
      page=Math.max(1,Number(url.searchParams.get('page')||1));
    const projects=db.events.filter(item=>String(item.event_date).startsWith(String(year))&&item.status!=='cancelled'&&
      (status==='all'||(status==='completed'?item.status==='completed':item.status!=='completed')));
    const summaries:Row[]=projects.map(item=>{const financial=incomeStatement(db,'2000-01-01',today(),item.id);
      return {...item,client_name:db.clients.find(c=>c.id===item.client_id)?.name||'Klien',
        recognized_revenue:financial.revenue,actual_cost:round(financial.cogs+financial.operating_expense)};});
    const sum=(key:string)=>round(summaries.reduce((n,item)=>n+Number(item[key as keyof typeof item]||0),0));
    return {year,status,page,total:summaries.length,summary:{contract_value:sum('contract_amount'),estimated_cost:sum('estimated_cost'),
      projected_margin:round(sum('contract_amount')-sum('estimated_cost')),recognized_revenue:sum('recognized_revenue'),
      actual_cost:sum('actual_cost'),recognized_profit:round(sum('recognized_revenue')-sum('actual_cost'))},
      items:summaries.sort((a,b)=>String(b.event_date).localeCompare(String(a.event_date))).slice((page-1)*15,page*15)};
  }
  if(p==='/projects/rundown-templates'&&method==='GET')return {templates:[{id:1,
    code:'WEDDING-IN-RUNDOWN-AKAD-RESEPSI-V1',title:'Panduan Akad & Resepsi Standar (Referensi PDF)',version_no:1}]};
  if(segments[0]==='projects'&&segments[2]==='rundown-profile'&&method==='GET'){
    const event=db.events.find(e=>e.id===Number(segments[1]));if(!event)throw new Error('Wedding tidak ditemukan.');
    const client=db.clients.find(c=>c.id===event.client_id);
    const sections=cloneTemplate(defaultRunTemplate,{bride:client?.name||'Contoh CPW',groom:client?.partner_name||'Contoh CPP',
      date:String(event.event_date).slice(0,10),venue:event.venue||''});
    for(const section of sections)for(const field of section.fields){
      if(field.key==='dresscode')field.value='DEMO | Champagne dan sage';
      if(field.key==='vip_bride')field.value='DEMO | Keluarga besar pengantin wanita';
      if(field.key==='vip_groom')field.value='DEMO | Keluarga besar pengantin pria';
    }
    return {profile:{id:1,template_id:1,sections,template_title:'Panduan Akad & Resepsi Standar (Referensi PDF)',template_version:1}};
  }
  if(segments[0]==='projects'&&['rundown','team','monitor','incidents'].includes(segments[2])){
    if(method!=='GET')throw new Error('Mode demo hanya pratinjau. Gunakan login database untuk menyimpan data Wedding Operations.');
    const eventId=Number(segments[1]),event=db.events.find(e=>e.id===eventId);
    if(!event)throw new Error('Wedding tidak ditemukan.');
    const day=String(event.event_date).slice(0,10);
    const crew=db.event_staff.filter(s=>s.event_id===eventId).map((s,index)=>({...s,assignment_id:s.id,
      name:db.staff.find(i=>i.id===s.staff_id)?.name||'Crew',presence:index===0?{state:'ready'}:{state:'arrived'}}));
    const vendors=db.event_vendors.filter(v=>v.event_id===eventId).map(v=>({...v,assignment_id:v.id,
      name:db.vendors.find(i=>i.id===v.vendor_id)?.name||'Vendor',presence:{state:'arrived'}}));
    const items=defaultRunTemplate.rows.map((row,index)=>({id:9101+index,event_id:eventId,title:row.title,segment:row.segment,
      planned_start:`${day} ${row.start}:00`,planned_end:`${day} ${row.end}:00`,
      status:index===0?'done':index===1?'ongoing':'scheduled',
      actual_start:index<2?`${day} ${row.start}:00`:null,actual_end:index===0?`${day} ${row.end}:00`:null,
      staff_assignment_id:null,vendor_assignment_id:null,crew_name:'',vendor_name:'',notes:'DATA DEMO',
      run_detail:row.detail,pic_text:row.pic,technical_note:row.technical}));
    const incidents=[{id:8101,title:'DEMO | Soundcheck tertunda',severity:'medium',status:'open',
      description:'Simulasi monitoring soundcheck',created_at:day},
      {id:8102,title:'DEMO | Arah tamu VIP disesuaikan',severity:'low',status:'resolved',
        description:'Simulasi masalah sudah selesai',created_at:day}];
    if(segments[2]==='team')return {event,crew,vendors};
    if(segments[2]==='rundown')return {event,items,crew,vendors};
    if(segments[2]==='incidents')return {event,incidents};
    return {event,rundown:items,crew,vendors,incidents};
  }
  if(segments[0]==='projects'&&['timeline','vendor-payments','expense-requests','closing'].includes(segments[2])){
    if(method!=='GET')throw new Error('Operasional V4 dalam mode demo hanya pratinjau. Gunakan login database untuk menyimpan data.');
    const eventId=Number(segments[1]),event=db.events.find(e=>e.id===eventId);
    if(!event)throw new Error('Wedding tidak ditemukan.');
    if(segments[2]==='timeline'){
      const taskRows:Row[]=db.tasks.filter(t=>t.event_id===eventId)
        .map(t=>({...t,start_at:t.due_at?String(t.due_at).slice(0,10)+' 09:00:00':null,depends_on_task_id:null}));
      return {event,tasks:taskRows.sort((a,b)=>String(a.due_at).localeCompare(String(b.due_at)))};
    }
    if(segments[2]==='expense-requests')return {event,requests:[],transactions:[]};
    if(segments[2]==='closing')return {event,closing:null,blockers:['Mode demo tidak dapat menutup project.'],counts:null,financial:null};
    return {event,bookings:db.event_vendors.filter(v=>v.event_id===eventId).map(v=>({...v,assignment_id:v.id,vendor_name:
      db.vendors.find(item=>item.id===v.vendor_id)?.name||'Vendor',booking_status:v.status,payment_responsibility:'managed_vendor',
      deposit_amount:0,deposit_due:null,final_due:null})),bills:db.bills.filter(b=>b.event_id===eventId),payments:[],proofs:[]};
  }
  if (segments[0] === 'projects' && segments[2] === 'control') {
    if (method !== 'GET') throw new Error('Kontrol Proyek dalam mode demo hanya untuk pratinjau. Gunakan login real untuk menyimpan transaksi.');
    const eventId = Number(segments[1]), project = db.events.find(item => item.id === eventId);
    if (!project) throw new Error('Wedding tidak ditemukan.');
    const vendors = db.event_vendors.filter(v => v.event_id === eventId).map(v => ({...v,
      assignment_id:v.id, assignment_status:v.status, booking_id:null,
      booking_status:v.status === 'confirmed' ? 'confirmed' : null,payment_responsibility:'managed_vendor'}));
    const invoices = db.invoices.filter(item => item.event_id === eventId);
    const bills = db.bills.filter(item => item.event_id === eventId);
    const activeInvoices = invoices.filter(item => !item.cancel_reason);
    const activeBills = bills.filter(item => !item.cancel_reason);
    const total = (items:Row[],field:string) => round(items.reduce((n,item) => n + Number(item[field]||0),0));
    const actual = incomeStatement(db,'2000-01-01',today(),eventId);
    const contract = Number(project.contract_amount||0),budget = Number(project.estimated_cost||0);
    return {project,vendors,terms:[],changes:[],budget_lines:[],contract_revisions:[],audits:[],invoices,bills,
      totals:{contract_amount:contract.toFixed(2),estimated_cost:budget.toFixed(2),direct_budget:'0.00',client_budget:contract.toFixed(2),
        estimated_profit:round(contract-budget).toFixed(2),invoice_total:total(activeInvoices,'amount').toFixed(2),
        invoice_paid:total(activeInvoices,'paid').toFixed(2),
        invoice_balance:round(total(activeInvoices,'amount')-total(activeInvoices,'paid')).toFixed(2),
        bill_total:total(activeBills,'amount').toFixed(2),bill_paid:total(activeBills,'paid').toFixed(2),
        bill_balance:round(total(activeBills,'amount')-total(activeBills,'paid')).toFixed(2),
        vendor_committed:total(vendors.filter(v=>v.booking_status==='confirmed'),'agreed_price').toFixed(2),
        actual_cost:round(actual.cogs+actual.operating_expense).toFixed(2),
        recognized_revenue:actual.revenue.toFixed(2),recognized_profit:actual.net_profit.toFixed(2)}};
  }
  if (segments[0] === 'projects') throw new Error('Transaksi Project Control tidak disimpan dalam mode demo. Silakan masuk ke database real.');
  if(segments[0]==='settings'&&['accounts','users'].includes(segments[1])){
    const list=segments[1]==='accounts'?accounts:demoUsers,storage=segments[1]==='accounts'?accountKey:usersKey;
    if(method==='GET')return {data:list.map(row=>({...row}))};
    const entry=segments[2]?list.find(row=>row.id===Number(segments[2])):null;
    if(method==='PATCH'&&!entry)throw new Error('Data pengaturan tidak ditemukan.');
    if(method==='POST'&&!segments[2]){
      if(segments[1]==='accounts'&&list.some(row=>row.code===body.code))throw new Error('Kode akun sudah dipakai.');
      if(segments[1]==='users'&&list.some(row=>row.email===body.email))throw new Error('Email sudah dipakai.');
      const added={...body,id:idNew(list),active:1,created_at:today()};delete added.password;list.push(added);
      if(segments[1]==='accounts')accountByCode.set(added.code,added);
      localStorage.setItem(storage,JSON.stringify(list));return {id:added.id};
    }
    if(method==='PATCH'&&entry){
      if(segments[1]==='users'&&entry.id===1&&(body.active===false||(body.role&&body.role!=='owner')))
        throw new Error('Akun owner aktif tidak bisa dinonaktifkan atau diubah role.');
      const next={...body};delete next.password;
      Object.assign(entry,next);
      if(segments[1]==='accounts')accountByCode.set(entry.code,entry);
      localStorage.setItem(storage,JSON.stringify(list));return {ok:true};
    }
  }
  if (p === '/calendar') {
    const month = url.searchParams.get('month') || today().slice(0, 7);
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Bulan kalender tidak valid.');
    const weddings = db.events.filter(e => e.status !== 'cancelled' && String(e.event_date).slice(0, 7) === month)
      .map(e => ({ id: e.id, kind: 'wedding' as const, date: String(e.event_date).slice(0, 10), title: e.title,
        event_id: e.id, event_title: e.title, status: e.status, venue: e.venue, city: e.city }));
    const tasks = db.tasks.filter(t => t.due_at && String(t.due_at).slice(0, 7) === month &&
      db.events.some(e => e.id === t.event_id && e.status !== 'cancelled'))
      .map(t => ({ id: t.id, kind: 'task' as const, date: String(t.due_at).slice(0, 10),
        time: String(t.due_at).slice(11, 16), title: t.title, event_id: t.event_id,
        event_title: db.events.find(e => e.id === t.event_id)?.title, category: t.category,
        assigned_to: t.assigned_to, status: t.status, priority: t.priority }));
    return { month, data: [...weddings, ...tasks].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'wedding' ? -1 : 1)) };
  }
  if (p === '/dashboard') {
    const all = enrich(db), active = all.filter(e => !['cancelled', 'completed'].includes(e.status));
    const trends = new Map<string, { month: string; events: number; contract_value: number }>();
    all.filter(e => e.status !== 'cancelled').forEach(e => {
      const month = String(e.event_date).slice(0, 7), row = trends.get(month) || { month, events: 0, contract_value: 0 };
      row.events++; row.contract_value += Number(e.contract_amount); trends.set(month, row);
    });
    return { overview: { total_events: all.length, active_events: active.length,
      contract_value: all.filter(e => e.status !== 'cancelled').reduce((n, e) => n + Number(e.contract_amount), 0),
      projected_margin: all.filter(e => e.status !== 'cancelled').reduce((n, e) => n + Number(e.contract_amount) - Number(e.estimated_cost), 0),
      cash_balance: balanceSheet(db, today()).assets.filter(a => accountByCode.get(a.code)?.is_cash).reduce((n, a) => n + a.balance, 0),
      overdue_invoices: db.invoices.filter(i => !i.cancel_reason && i.due_date < today() && Number(i.paid) < Number(i.amount)).length },
      upcoming: active.filter(e => e.event_date >= today()).sort((a, b) => String(a.event_date).localeCompare(String(b.event_date))).slice(0, 6).map(e => ({ ...e,
        open_tasks: db.tasks.filter(t => t.event_id === e.id && t.status !== 'done').length })),
      tasks: db.tasks.filter(t => t.status !== 'done' && active.some(e => e.id === t.event_id)).sort((a, b) => String(a.due_at).localeCompare(String(b.due_at)))
        .slice(0, 6).map(t => ({ ...t, event_title: db.events.find(e => e.id === t.event_id)?.title })),
      trend: [...trends.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-7) };
  }
  if (segments[0] === 'resources') {
    const kind = segments[1] as 'leads' | 'clients' | 'vendors' | 'packages' | 'staff';
    if (!['leads', 'clients', 'vendors', 'packages', 'staff'].includes(kind)) throw new Error('Master tidak ditemukan.');
    const list = db[kind];
    if (method === 'GET') return { data: list };
    if (method === 'POST' && segments[3] === 'cancel') {
      const item = list.find(x=>x.id===Number(segments[2]));if(!item)throw new Error('Data tidak ditemukan.');
      const reason=String(body.reason||'').trim();if(reason.length<5)throw new Error('Alasan pembatalan wajib diisi minimal 5 karakter.');
      if(item.cancel_reason)throw new Error('Data sudah dibatalkan/nonaktif.');
      if(kind==='leads')item.status='lost';else item.active=0;
      item.cancel_reason=reason;save(db);return {ok:true};
    }
    if (method === 'POST') { const item = { ...body, id: idNew(list) }; list.push(item); save(db); return { id: item.id }; }
    if (method === 'PATCH') { const item = list.find(x => x.id === Number(segments[2]));if(!item)throw new Error('Data tidak ditemukan.');
      if(item.cancel_reason)throw new Error('Data sudah dibatalkan/nonaktif.');
      Object.assign(item, body); save(db); return { ok: true }; }
  }
  if (segments[0] === 'events') {
    if (segments.length === 1) {
      if (method === 'GET') return { data: enrich(db).sort((a, b) => String(b.event_date).localeCompare(String(a.event_date))) };
      const newId = idNew(db.events), clientId = idNew(db.clients);
      db.clients.push({ id: clientId, name: body.client_name, partner_name: body.partner_name, phone: body.phone });
      db.events.push({ ...body, id: newId, client_id: clientId, client_name: body.client_name,
        code: `WIN-DEMO-${String(newId).padStart(3, '0')}`, status: 'planning' });
      save(db); return { id: newId };
    }
    const eventId = Number(segments[1]), event = db.events.find(e => e.id === eventId);
    if (!event) throw new Error('Wedding tidak ditemukan.');
    if (segments.length === 2) {
      if (method === 'PATCH') {
        if(['completed','cancelled'].includes(event.status))throw new Error('Event selesai/dibatalkan tidak boleh diubah.');
        Object.assign(event, body);
        if(body.phone!==undefined)event.client_phone=body.phone;
        const client=db.clients.find(c=>c.id===event.client_id);
        if(client){if(body.client_name!==undefined)client.name=body.client_name;
          if(body.partner_name!==undefined)client.partner_name=body.partner_name;
          if(body.phone!==undefined)client.phone=body.phone;}
        save(db); return { ok: true }; }
      return { event, tasks: db.tasks.filter(t => t.event_id === eventId),
        vendors: db.event_vendors.filter(x => x.event_id === eventId), staff: db.event_staff.filter(x => x.event_id === eventId),
        invoices: db.invoices.filter(x => x.event_id === eventId), bills: db.bills.filter(x => x.event_id === eventId),
        profit: incomeStatement(db, '2000-01-01', today(), eventId) };
    }
    if(segments[2] === 'cancel' && method === 'POST'){
      const reason=String(body.reason||'').trim();if(reason.length<5)throw new Error('Alasan pembatalan wajib diisi minimal 5 karakter.');
      if(['completed','cancelled'].includes(event.status))throw new Error('Wedding sudah selesai atau dibatalkan.');
      event.status='cancelled';event.cancel_reason=reason;save(db);return {ok:true};
    }
    if (segments[2] === 'complete') {
      if (!['completed', 'cancelled'].includes(event.status)) {
        const currentAdvance = db.journals.flatMap(j => j.lines).filter(l => l.event_id === eventId && l.code === '2100')
          .reduce((sum, l) => sum + (l.credit || 0) - (l.debit || 0), 0);
        if (currentAdvance > 0) addJournal(db, { date: today(), description: `Pengakuan pendapatan — ${event.title}`,
          reference_type: 'event_completion', cash_flow: 'none', lines: [
            { code: '2100', debit: currentAdvance, event_id: eventId }, { code: '4000', credit: currentAdvance, event_id: eventId }] });
        event.status = 'completed'; save(db);
      }
      return { ok: true };
    }
    if (segments[2] === 'tasks') {if(event.status==='cancelled')throw new Error('Wedding sudah dibatalkan.');
      const item = { ...body, id: idNew(db.tasks), event_id: eventId, status: 'todo' }; db.tasks.push(item); save(db); return { id: item.id }; }
    if (segments[2] === 'vendors') {
      if(event.status==='cancelled')throw new Error('Wedding sudah dibatalkan.');
      if(segments[3]){
        const index=db.event_vendors.findIndex(x=>x.id===Number(segments[3])&&x.event_id===eventId);
        if(index<0)throw new Error('Penugasan vendor tidak ditemukan.');
        if(method==='PATCH')Object.assign(db.event_vendors[index],body);
        else if(method==='DELETE')db.event_vendors.splice(index,1);
        save(db);return {ok:true};
      }
      const vendor = db.vendors.find(v => v.id === Number(body.vendor_id));
      if (db.event_vendors.some(v => v.event_id === eventId && v.vendor_id === Number(body.vendor_id))) throw new Error('Vendor sudah ditugaskan.');
      const item = { ...body, id: idNew(db.event_vendors), event_id: eventId, vendor_name: vendor?.name, category: vendor?.category };
      db.event_vendors.push(item); save(db); return { id: item.id };
    }
    if (segments[2] === 'staff') {
      if(event.status==='cancelled')throw new Error('Wedding sudah dibatalkan.');
      if(segments[3]){
        const index=db.event_staff.findIndex(x=>x.id===Number(segments[3])&&x.event_id===eventId);
        if(index<0)throw new Error('Penugasan crew tidak ditemukan.');
        if(method==='PATCH')Object.assign(db.event_staff[index],body);
        else if(method==='DELETE')db.event_staff.splice(index,1);
        save(db);return {ok:true};
      }
      const staff = db.staff.find(v => v.id === Number(body.staff_id));
      if (db.event_staff.some(s => s.event_id === eventId && s.staff_id === Number(body.staff_id))) throw new Error('Crew sudah ditugaskan.');
      const item = { ...body, id: idNew(db.event_staff), event_id: eventId, staff_name: staff?.name, position: staff?.position };
      db.event_staff.push(item); save(db); return { id: item.id };
    }
  }
  if (segments[0] === 'tasks' && (method === 'PATCH' || method === 'DELETE')) {
    const taskIndex = db.tasks.findIndex(t => t.id === Number(segments[1]));
    if (taskIndex < 0) throw new Error('Checklist tidak ditemukan.');
    if(db.events.some(e=>e.id===db.tasks[taskIndex].event_id&&e.status==='cancelled'))throw new Error('Wedding sudah dibatalkan.');
    if (method === 'PATCH') Object.assign(db.tasks[taskIndex], body);
    else {db.tasks.splice(taskIndex, 1);localStorage.removeItem(`weddingin_task_document_${segments[1]}`);}
    save(db); return { ok: true };
  }
  if (segments[0] === 'finance') {
    if (p === '/finance/accounts') return { data: accounts };
    if (p === '/finance/journals' && method === 'GET') {
      const from = url.searchParams.get('from') || '2000-01-01', to = url.searchParams.get('to') || today();
      const data = db.journals.filter(j => j.date >= from && j.date <= to).flatMap((j, index) => j.lines.map(line => ({
        id: db.journals.indexOf(j) + 1, entry_date: j.date, description: j.description,
        reference_type: j.reference_type, cash_flow: j.cash_flow, code: line.code,
        cancel_reason:(j as Row).cancel_reason||null,account_name: accountByCode.get(line.code)?.name || line.code,
        event_id: line.event_id ?? null, debit: line.debit || 0, credit: line.credit || 0, index
      }))).sort((a, b) => b.entry_date.localeCompare(a.entry_date) || b.id - a.id).slice(0, 1000);
      return { data };
    }
    const kind = segments[1] as 'invoices' | 'bills';
    if (kind === 'invoices' || kind === 'bills') {
      if(method==='GET'&&segments[3]==='payments'){
        const item=db[kind].find(x=>x.id===Number(segments[2]));if(!item)throw new Error('Dokumen tidak ditemukan.');
        return {data:(item.payments||[]).map((payment:Row,index:number)=>({...payment,id:index+1}))};
      }
      if(method==='POST'&&segments[3]==='payments'&&segments[5]==='cancel'){
        const item=db[kind].find(x=>x.id===Number(segments[2]));if(!item)throw new Error('Dokumen tidak ditemukan.');
        const payment=(item.payments||[])[Number(segments[4])-1];if(!payment)throw new Error('Pembayaran tidak ditemukan.');
        const reason=String(body.reason||'').trim();if(reason.length<5)throw new Error('Alasan pembatalan wajib minimal 5 karakter.');
        if(payment.cancel_reason)throw new Error('Pembayaran sudah dibatalkan.');
        if(item.cancel_reason)throw new Error('Dokumen asal sudah dibatalkan.');
        const originals=db.journals.filter(j=>j.reference_type===(kind==='invoices'?'invoice_payment':'bill_payment')&&j.reference_number===item.number);
        const original=originals[Number(segments[4])-1];if(!original)throw new Error('Jurnal pembayaran asal tidak ditemukan.');
        reverseDemoJournal(db,original,reason);payment.cancel_reason=reason;item.paid=round(Number(item.paid)-Number(payment.amount));
        save(db);return {ok:true};
      }
      if (method === 'GET') return { data: db[kind].slice().reverse() };
      if(method==='PATCH'&&segments[2]){
        const item=db[kind].find(x=>x.id===Number(segments[2]));if(!item)throw new Error('Dokumen tidak ditemukan.');
        if(item.cancel_reason)throw new Error('Dokumen sudah dibatalkan.');
        if(body.description!==undefined)item.description=String(body.description);
        if(body.due_date!==undefined)item.due_date=String(body.due_date);
        save(db);return {ok:true};
      }
      if(method==='POST'&&segments[3]==='cancel'){
        const item=db[kind].find(x=>x.id===Number(segments[2]));if(!item)throw new Error('Dokumen tidak ditemukan.');
        const reason=String(body.reason||'').trim();if(reason.length<5)throw new Error('Alasan pembatalan wajib diisi minimal 5 karakter.');
        if(item.cancel_reason)throw new Error('Dokumen sudah dibatalkan.');
        if(Number(item.paid)>0)throw new Error('Dokumen sudah dibayar. Selesaikan refund/koreksi pembayaran dahulu.');
        const original=db.journals.find(j=>j.reference_type===(kind==='invoices'?'invoice':'bill')&&j.reference_number===item.number);
        if(!original)throw new Error('Jurnal asal tidak ditemukan.');
        reverseDemoJournal(db,original,reason);item.cancel_reason=reason;
        save(db);return {ok:true};
      }
      if (method === 'POST' && segments.length === 2) {
        const event = db.events.find(e => e.id === Number(body.event_id));
        const vendor = db.vendors.find(v => v.id === Number(body.vendor_id));
        const id = idNew(db[kind]);
        const number = `${kind === 'invoices' ? 'WIN-INV' : 'WIN-BILL'}-${String(id).padStart(3, '0')}`;
        const item = { ...body, id, number, paid: 0, payments: [], issued_at: today(), event_title: event?.title,
          client_name: event?.client_name, vendor_name: vendor?.name };
        db[kind].push(item);
        addJournal(db, { date: today(), description: `${kind === 'invoices' ? 'Invoice' : 'Tagihan vendor'} ${number}`,
          reference_type: kind === 'invoices' ? 'invoice' : 'bill', reference_number: number, cash_flow: 'none',
          lines: kind === 'invoices' ? [
            { code: '1100', debit: Number(body.amount), event_id: event?.id },
            { code: event?.status === 'completed' ? '4000' : '2100', credit: Number(body.amount), event_id: event?.id }
          ] : [
            { code: body.expense_account_code, debit: Number(body.amount), event_id: event?.id },
            { code: '2000', credit: Number(body.amount), event_id: event?.id }
          ] });
        save(db); return { id };
      }
      if (method === 'POST' && segments[3] === 'pay') {
        const item = db[kind].find(x => x.id === Number(segments[2]));
        if (!item) throw new Error('Tagihan tidak ditemukan.');
        if(item.cancel_reason)throw new Error('Tagihan sudah dibatalkan.');
        const amount = Number(body.amount);
        if (!Number.isFinite(amount) || amount <= 0 || Number(item.paid) + amount > Number(item.amount)) throw new Error('Nominal pembayaran tidak valid.');
        item.paid = round(Number(item.paid) + amount);
        item.payments.push({ amount, paid_at: body.paid_at || today(), method: body.method || 'bank', reference: body.reference || '' });
        const bank = body.method === 'cash' ? '1000' : '1010';
        addJournal(db, { date: body.paid_at || today(),
          description: `${kind === 'invoices' ? 'Penerimaan' : 'Pembayaran'} ${item.number}`,
          reference_type: kind === 'invoices' ? 'invoice_payment' : 'bill_payment',
          reference_number: item.number, cash_flow: 'operating',
          lines: kind === 'invoices' ? [
            { code: bank, debit: amount, event_id: item.event_id }, { code: '1100', credit: amount, event_id: item.event_id }
          ] : [
            { code: '2000', debit: amount, event_id: item.event_id }, { code: bank, credit: amount, event_id: item.event_id }
          ] });
        save(db); return { ok: true };
      }
    }
    if(method==='POST'&&segments[1]==='journals'&&segments[2]&&segments[3]==='cancel'){
      const journal=db.journals[Number(segments[2])-1];
      if(!journal)throw new Error('Jurnal tidak ditemukan.');
      if(journal.reference_type!=='manual')throw new Error('Jurnal otomatis harus dibatalkan dari dokumen asal.');
      if((journal as Row).cancel_reason)throw new Error('Jurnal sudah dibatalkan.');
      const reason=String(body.reason||'').trim();if(reason.length<5)throw new Error('Alasan pembatalan wajib diisi minimal 5 karakter.');
      reverseDemoJournal(db,journal,reason);(journal as Row).cancel_reason=reason;save(db);return {ok:true};
    }
    if (method === 'POST' && segments[1] === 'journals') {
      const debit = body.lines.reduce((n: number, l: Row) => n + Number(l.debit || 0), 0);
      const credit = body.lines.reduce((n: number, l: Row) => n + Number(l.credit || 0), 0);
      if (Math.abs(debit - credit) > 0.005 || debit <= 0) throw new Error('Total debit dan kredit harus seimbang.');
      addJournal(db, { date: body.date, description: body.description, reference_type: 'manual',
        cash_flow: body.cash_flow, lines: body.lines }); save(db); return { ok: true };
    }
  }
  if (segments[0] === 'reports') {
    const asOf = url.searchParams.get('as_of') || today();
    const from = url.searchParams.get('from') || `${today().slice(0, 4)}-01-01`;
    const to = url.searchParams.get('to') || today();
    if (segments[1] === 'balance-sheet') return balanceSheet(db, asOf);
    if (segments[1] === 'income-statement') return incomeStatement(db, from, to);
    if (segments[1] === 'cash-flow') return cashFlow(db, from, to);
    if (segments[1] === 'trial-balance') return trialBalance(db, asOf);
  }
  throw new Error(`Mode demo belum mencakup ${method} ${path}`);
}
