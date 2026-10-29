import type {ShowcaseRow} from '../showcase';

type Row=Record<string,any>;
type Showcase={clients:ShowcaseRow[];vendors:ShowcaseRow[];packages:ShowcaseRow[];events:ShowcaseRow[]};
type Quote={quote:Row;revisions:Row[];lines:Record<string,Row[]>};
type Store={event_types:Row[];services:Row[];service_price_rules:Row[];vendor_services:Row[];
  vendor_service_rates:Row[];packages:Row[];package_lines:Record<string,Row[]>;quotations:Quote[]};
const key='weddingin_demo_commercial_v1';
const kinds=['event_types','services','service_price_rules','vendor_services','vendor_service_rates'] as const;
type Kind=(typeof kinds)[number];
const round=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
const money=(n:number)=>round(n).toFixed(2);
const nextId=(a:Row[])=>Math.max(0,...a.map(x=>Number(x.id)||0))+1;
const page=(items:Row[],url:URL)=>{const current=Math.max(1,Number(url.searchParams.get('page'))||1);
  return {data:items.slice((current-1)*15,current*15),total:items.length,page:current};};
const future=(days:number)=>{const d=new Date();d.setDate(d.getDate()+days);return d.toISOString().slice(0,10);};

function initial(db:Showcase):Store{
  const event_types=[{id:1,code:'AKAD',name:'Akad dan Resepsi',duration_hours:8,active:1},
    {id:2,code:'INTIMATE',name:'Intimate Wedding',duration_hours:5,active:1},
    {id:3,code:'ADAT',name:'Wedding Adat',duration_hours:10,active:1}];
  const services=[{id:1,code:'WO-FULL',name:'Full Wedding Planning',category:'Wedding Organizer',unit:'event',
    default_fulfillment:'internal',default_cost:12000000,default_sell:32000000,active:1},
    {id:2,code:'WO-DAY',name:'Koordinasi Hari-H',category:'Wedding Organizer',unit:'event',
      default_fulfillment:'internal',default_cost:6500000,default_sell:18000000,active:1},
    ...db.vendors.map((v,i)=>({id:i+3,code:`VND-${i+1}`,name:`Jasa ${v.category}`,category:v.category,unit:'paket',
      default_fulfillment:'managed_vendor',default_cost:Number(v.base_price),default_sell:round(Number(v.base_price)*1.18),active:1}))];
  const vendor_services=db.vendors.map((v,i)=>({id:i+1,vendor_id:v.id,service_id:i+3,
    vendor_name:v.name,vendor_sku:`DEMO-VS-${i+1}`,title:`Paket ${v.category} ${v.name}`,
    unit:'paket',min_qty:1,capacity_per_day:2,service_area:'Bandung',active:1}));
  const vendor_service_rates=vendor_services.map((v,i)=>({id:i+1,vendor_service_id:v.id,
    effective_from:'2020-01-01',effective_to:null,min_qty:1,max_qty:null,cost_unit:Number(db.vendors[i].base_price),active:1}));
  const service_price_rules=[{id:1,service_id:1,event_type_id:null,city:'Bandung',valid_from:'2020-01-01',
    priority:1,cost_unit:12000000,sell_unit:32000000,active:1}];
  const packages=db.packages.map((p,i)=>({id:i+1,package_id:p.id,package_name:p.name,version_no:1,
    status:'published',pricing_mode:'sum_items',fixed_bundle_price:null}));
  const package_lines:Record<string,Row[]>={};
  packages.forEach(v=>{package_lines[v.id]=[{id:1,service_id:1,vendor_service_id:null,line_name:'Full Wedding Planning',
    qty:'1',unit:'event',fulfillment:'internal',default_cost_unit:12000000,default_sell_unit:32000000,is_optional:0},
    {id:2,service_id:3,vendor_service_id:null,line_name:'Dekorasi',qty:'1',unit:'paket',
      fulfillment:'managed_vendor',default_cost_unit:34000000,default_sell_unit:40120000,is_optional:0}];});
  const quotations:Quote[]=db.clients.slice(0,3).map((client,i)=>{
    const event=db.events[i],status=i===0?'accepted':i===1?'sent':'draft',id=i+1;
    const revision={id,version_no:1,status,event_type_id:1,event_date:String(event?.event_date||future(40)).slice(0,10),
      valid_until:future(180),city:'Bandung',venue:event?.venue||'',guest_count:event?.guest_count||200,
      notes:'Data simulasi Wedding-In',package_version_id:1,contract_total:'32000000.00',
      subtotal_direct:'0.00',client_budget_total:'32000000.00',cost_est_total:'12000000.00'};
    return {quote:{id,quote_number:`WIN-QTN-DEMO-${String(id).padStart(3,'0')}`,client_name:client.name,
      client_phone:client.phone,client_id:client.id,status,current_revision_id:id,
      accepted_event_id:status==='accepted'?event?.id:null},revisions:[revision],
      lines:{[id]:[{id:1,line_no:1,service_id:1,title_snapshot:'Full Wedding Planning',unit_snapshot:'event',
        fulfillment:'internal',quantity:'1',unit_sell:'32000000.00',unit_cost:'12000000.00',
        discount_amount:'0.00',sell_net:'32000000.00',cost_total:'12000000.00',overridden:false}]}};
  });
  return {event_types,services,service_price_rules,vendor_services,vendor_service_rates,packages,package_lines,quotations};
}
const load=(db:Showcase):Store=>{try{const stored=localStorage.getItem(key);return stored?JSON.parse(stored):initial(db);}
  catch{return initial(db);}};
const save=(store:Store)=>localStorage.setItem(key,JSON.stringify(store));
const active=(rows:Row[])=>rows.filter(x=>x.active!==0&&x.active!==false);
const catalog=(s:Store,db:Showcase)=>({event_types:active(s.event_types),services:active(s.services),
  vendor_services:active(s.vendor_services),packages:s.packages,clients:db.clients});
const current=(record:Quote)=>record.revisions.find(r=>r.id===record.quote.current_revision_id)!;

function calculate(store:Store,input:Row){
  if(!Array.isArray(input.lines)||!input.lines.length)throw new Error('Quotation wajib memiliki minimal satu layanan.');
  const lines=input.lines.map((line:Row,i:number)=>{
    const vendor=store.vendor_services.find(v=>v.id===Number(line.vendor_service_id)),
      service=store.services.find(s=>s.id===Number(line.service_id??vendor?.service_id));
    if(!service&&!vendor)throw new Error('Pilih layanan yang tersedia.');
    const quantity=Number(line.quantity),discount=Number(line.discount_amount||0);
    if(!Number.isFinite(quantity)||quantity<=0||!/^\d+(\.\d{1,3})?$/.test(String(line.quantity)))throw new Error('Qty harus positif, maksimal tiga desimal.');
    const rule=store.service_price_rules.find(r=>r.active&&r.service_id===service?.id&&
      String(r.valid_from)<=String(input.event_date)&&(!r.city||String(r.city).toLowerCase()===String(input.city||'').toLowerCase()));
    const rate=store.vendor_service_rates.find(r=>r.active&&r.vendor_service_id===vendor?.id);
    const baseSell=Number(rule?.sell_unit??service?.default_sell??rate?.cost_unit??0),
      baseCost=Number(rate?.cost_unit??rule?.cost_unit??service?.default_cost??0);
    const sell=line.unit_sell_override==null?baseSell:Number(line.unit_sell_override),
      cost=line.unit_cost_override==null?baseCost:Number(line.unit_cost_override);
    if(![sell,cost,discount].every(n=>Number.isFinite(n)&&n>=0))throw new Error('Nominal item tidak valid.');
    const overridden=sell!==baseSell||cost!==baseCost;
    if(overridden&&String(line.override_reason||'').trim().length<8)throw new Error('Alasan perubahan harga minimal 8 karakter.');
    const gross=round(quantity*sell),fulfillment=line.fulfillment||service?.default_fulfillment||'managed_vendor';
    if(discount>gross)throw new Error('Diskon melebihi harga item.');
    if(vendor&&fulfillment==='internal')throw new Error('Jasa vendor tidak dapat ditandai internal.');
    return {id:i+1,line_no:i+1,service_id:service?.id??null,vendor_service_id:vendor?.id??null,
      title_snapshot:vendor?.title||service?.name,unit_snapshot:vendor?.unit||service?.unit,
      quantity:String(line.quantity),fulfillment,unit_sell:money(sell),unit_cost:money(cost),
      discount_amount:money(discount),sell_net:money(gross-discount),
      cost_total:money(fulfillment==='client_direct'?0:quantity*cost),overridden,override_reason:line.override_reason||null};
  });
  const managed=round(lines.filter(x=>x.fulfillment!=='client_direct').reduce((n,x)=>n+Number(x.sell_net),0)),
    direct=round(lines.filter(x=>x.fulfillment==='client_direct').reduce((n,x)=>n+Number(x.sell_net),0)),
    cost=round(lines.reduce((n,x)=>n+Number(x.cost_total),0));
  return {lines,totals:{subtotal_managed:money(managed),subtotal_direct:money(direct),
    discount_total:money(lines.reduce((n,x)=>n+Number(x.discount_amount),0)),contract_total:money(managed),
    client_budget_total:money(managed+direct),cost_est_total:money(cost),gross_profit_est:money(managed-cost),
    margin_pct:managed?round((managed-cost)*100/managed):null}};
}

export function demoCommercialRequest(path:string,method:string,body:Row,db:Showcase,saveShowcase:()=>void):any{
  const url=new URL(path,'https://demo.local'),seg=url.pathname.split('/').filter(Boolean);
  if(seg[0]!=='commercial')return undefined;
  const store=load(db),persist=(value:any)=>{save(store);return value;};
  if(seg[1]==='catalog'&&method==='GET')return catalog(store,db);
  if(seg[1]==='master'&&kinds.includes(seg[2] as Kind)){
    const kind=seg[2] as Kind,rows=store[kind];
    if(method==='GET'){const q=(url.searchParams.get('q')||'').toLowerCase();
      return page(rows.filter(r=>!q||[r.name,r.title,r.code,r.vendor_sku].some(s=>String(s||'').toLowerCase().includes(q))).slice().reverse(),url);}
    if(method==='POST'){const id=nextId(rows);rows.push({id,...body,active:1});return persist({id});}
    if(method==='PATCH'&&seg[3]){const record=rows.find(x=>x.id===Number(seg[3]));if(!record)throw new Error('Master tidak ditemukan.');
      Object.assign(record,body);return persist({ok:true});}
  }
  if(seg[1]==='packages'){
    if(seg[2]&&seg[3]==='lines'&&method==='GET'){
      const version=store.packages.find(v=>v.id===Number(seg[2]));if(!version)throw new Error('Versi paket tidak ditemukan.');
      return {version,lines:store.package_lines[version.id]||[]};}
    if(!seg[2]&&method==='POST'){
      const parent=db.packages.find(p=>p.id===Number(body.package_id));
      if(!parent||!Array.isArray(body.lines)||!body.lines.length)throw new Error('Pilih paket dan komponen yang valid.');
      const id=nextId(store.packages),version=1+Math.max(0,...store.packages.filter(v=>v.package_id===parent.id).map(v=>v.version_no));
      store.packages.push({id,package_id:parent.id,package_name:parent.name,version_no:version,status:'draft',pricing_mode:'sum_items'});
      store.package_lines[id]=body.lines.map((l:Row,i:number)=>({...l,id:i+1}));return persist({id});}
    if(seg[2]&&seg[3]==='publish'&&method==='POST'){
      const version=store.packages.find(v=>v.id===Number(seg[2]));
      if(!version||version.status!=='draft')throw new Error('Hanya versi draft dapat diterbitkan.');
      version.status='published';return persist({ok:true});}
  }
  if(seg[1]==='preview'&&method==='POST')return calculate(store,body);
  if(seg[1]==='quotations'){
    if(!seg[2]&&method==='GET'){
      const q=(url.searchParams.get('q')||'').toLowerCase();
      const list=store.quotations.map((r):Row=>({...r.quote,...current(r),id:r.quote.id,status:r.quote.status}))
        .filter(r=>!q||`${r.client_name} ${r.quote_number}`.toLowerCase().includes(q));
      return page(list.sort((a,b)=>b.id-a.id),url);}
    if(!seg[2]&&method==='POST'){
      const calc=calculate(store,body),id=Math.max(0,...store.quotations.map(r=>r.quote.id))+1;
      const quote={id,quote_number:`WIN-QTN-DEMO-${String(id).padStart(3,'0')}`,client_name:body.client_name,
        client_phone:body.client_phone||'',client_id:body.client_id||null,status:'draft',current_revision_id:id,accepted_event_id:null};
      store.quotations.push({quote,revisions:[{id,version_no:1,status:'draft',...body,...calc.totals}],lines:{[id]:calc.lines}});
      return persist({id,quote_number:quote.quote_number});}
    const item=store.quotations.find(r=>r.quote.id===Number(seg[2]));if(!item)throw new Error('Quotation tidak ditemukan.');
    if(seg.length===3&&method==='GET'){
      const id=Number(url.searchParams.get('revision_id')||item.quote.current_revision_id),revision=item.revisions.find(r=>r.id===id);
      if(!revision)throw new Error('Revisi tidak ditemukan.');
      return {quote:item.quote,revision,lines:item.lines[id],revisions:item.revisions.slice().reverse().map(({id,version_no,status})=>({id,version_no,status}))};}
    if((seg[3]==='draft'&&method==='PATCH')||(seg[3]==='revisions'&&method==='POST')){
      const calc=calculate(store,body),old=current(item),id=Math.max(...item.revisions.map(r=>r.id))+1;
      if(seg[3]==='draft'&&old.status!=='draft')throw new Error('Hanya draft dapat diedit.');
      if(seg[3]==='revisions'&&old.status==='draft')throw new Error('Kirim draft sebelum revisi.');
      if(seg[3]==='draft')old.status='withdrawn';
      item.revisions.push({id,version_no:old.version_no+1,status:'draft',...body,...calc.totals});
      item.lines[id]=calc.lines;item.quote.current_revision_id=id;item.quote.status='draft';return persist({id:item.quote.id,revision_id:id});}
    if(seg[3]==='status'&&method==='POST'){
      const action=seg[4],revision=current(item),expected=action==='send'?'draft':'sent';
      if(!['send','accept','reject'].includes(action)||revision.status!==expected)throw new Error('Transisi quotation tidak valid.');
      revision.status=action==='send'?'sent':action==='accept'?'accepted':'rejected';item.quote.status=revision.status;
      return persist({ok:true});}
    if(seg[3]==='convert'&&method==='POST'){
      if(item.quote.status!=='accepted')throw new Error('Quotation belum disetujui.');
      if(!item.quote.accepted_event_id){const r=current(item),id=Math.max(0,...db.events.map(e=>e.id))+1;
        let clientId=Number(item.quote.client_id)||null;
        if(!clientId){clientId=Math.max(0,...db.clients.map(c=>c.id))+1;
          db.clients.push({id:clientId,name:item.quote.client_name,phone:item.quote.client_phone||'',partner_name:''});
          item.quote.client_id=clientId;}
        db.events.push({id,client_id:clientId,client_name:item.quote.client_name,
          title:`${item.quote.client_name} Wedding`,code:`WIN-DEMO-${String(id).padStart(3,'0')}`,
          event_date:r.event_date,venue:r.venue||'',city:r.city||'',guest_count:r.guest_count,
          contract_amount:Number(r.contract_total),estimated_cost:Number(r.cost_est_total),status:'planning'});
        item.quote.accepted_event_id=id;saveShowcase();}
      return persist({event_id:item.quote.accepted_event_id});}
  }
  throw new Error(`Operasi Commercial tidak tersedia dalam demo: ${method} ${url.pathname}`);
}
