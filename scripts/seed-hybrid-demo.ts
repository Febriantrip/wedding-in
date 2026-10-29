import 'dotenv/config';
import {randomUUID} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {pool,rows,execSql,transaction,type DbConn} from '../server/db.js';
import {postJournal} from '../server/accounting.js';
import {priceLines,type DraftLine} from '../server/modules/commercial/pricing.js';

// Append-only demo. Never update, truncate or delete existing business records.
const tag='DEMO-HYB';
const at=(days:number)=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);
const add=async(conn:DbConn,sql:string,values:unknown[])=>
  (await execSql(sql,values as any[],conn)).insertId;

type ServiceDef={code:string;name:string;category:string;unit:string;fulfillment:'internal'|'managed_vendor';cost:string;sell:string};
const serviceDefs:ServiceDef[]=[
  {code:'WO-FULL',name:'Wedding Organizer Full Service',category:'Wedding Organizer',unit:'event',fulfillment:'internal',cost:'12500000',sell:'22500000'},
  {code:'WO-DAY',name:'Wedding Organizer Hari-H',category:'Wedding Organizer',unit:'event',fulfillment:'internal',cost:'6500000',sell:'12000000'},
  {code:'WO-PLAN',name:'Wedding Planning & Konsultasi',category:'Wedding Organizer',unit:'event',fulfillment:'internal',cost:'3500000',sell:'6500000'},
  {code:'WO-CREW',name:'Crew Operasional Wedding',category:'Wedding Organizer',unit:'person',fulfillment:'internal',cost:'450000',sell:'750000'},
  {code:'DECOR',name:'Dekorasi Pelaminan dan Venue',category:'Dekorasi',unit:'package',fulfillment:'managed_vendor',cost:'23000000',sell:'28500000'},
  {code:'CATER',name:'Catering Buffet',category:'Catering',unit:'pax',fulfillment:'managed_vendor',cost:'135000',sell:'185000'},
  {code:'PHOTO',name:'Dokumentasi Foto dan Video',category:'Dokumentasi',unit:'package',fulfillment:'managed_vendor',cost:'10000000',sell:'14000000'},
  {code:'MUA',name:'Makeup Artist Pengantin',category:'Makeup',unit:'package',fulfillment:'managed_vendor',cost:'3500000',sell:'4700000'},
  {code:'SOUND',name:'Sound System dan Lighting',category:'Produksi',unit:'package',fulfillment:'managed_vendor',cost:'7800000',sell:'10500000'},
  {code:'MC',name:'MC dan Entertainment',category:'Entertainment',unit:'package',fulfillment:'managed_vendor',cost:'4000000',sell:'6200000'},
  {code:'INVITE',name:'Undangan Digital',category:'Dokumentasi',unit:'package',fulfillment:'internal',cost:'300000',sell:'1250000'},
  {code:'SOUVENIR',name:'Souvenir Acara',category:'Merchandise',unit:'pcs',fulfillment:'managed_vendor',cost:'24000',sell:'35000'}
];

const vendors=[
  {code:'FLORAL',name:'Maison Floral Demo',category:'Dekorasi',service:'DECOR',cost:'23000000',unit:'package'},
  {code:'FOOD',name:'Rasa Rindu Catering Demo',category:'Catering',service:'CATER',cost:'135000',unit:'pax'},
  {code:'VISUAL',name:'Lumina Visual Demo',category:'Dokumentasi',service:'PHOTO',cost:'10000000',unit:'package'},
  {code:'BEAUTY',name:'Aurora Makeup Demo',category:'Makeup',service:'MUA',cost:'3500000',unit:'package'},
  {code:'STAGE',name:'Sonic Stage Demo',category:'Produksi',service:'SOUND',cost:'7800000',unit:'package'},
  {code:'MUSIC',name:'Harmoni Event Demo',category:'Entertainment',service:'MC',cost:'4000000',unit:'package'},
  {code:'GIFT',name:'Berkah Souvenir Demo',category:'Merchandise',service:'SOUVENIR',cost:'24000',unit:'pcs'}
] as const;

async function seed(conn:DbConn){
  const [migration]=await rows<{total:number}>(`SELECT COUNT(*) total FROM migrations
    WHERE filename IN ('004_commercial_core.sql','005_backoffice_register.sql')`,[],conn);
  if(Number(migration.total)!==2)throw new Error('Migrasi Hybrid 004 dan 005 harus terpasang terlebih dahulu.');
  const [prior]=await rows('SELECT id FROM quotations WHERE quote_number=? LIMIT 1',[`QTN-${tag}-001`],conn);
  if(prior){console.log('Data demo Hybrid sudah ada. Tidak ada data ganda yang ditambahkan.');return;}
  const [owner]=await rows<{id:number}>(`SELECT id FROM users WHERE role IN ('owner','admin') AND active=1 ORDER BY id LIMIT 1`,[],conn);
  if(!owner)throw new Error('User Owner/Admin aktif belum tersedia.');

  // Disable the artificial approver so no one can sign in with demo credentials.
  const reviewerEmail='demo-reviewer@wedding-in.invalid';
  let [reviewer]=await rows<{id:number}>('SELECT id FROM users WHERE email=?',[reviewerEmail],conn);
  if(!reviewer){
    const unknownPassword=await bcrypt.hash(randomUUID()+randomUUID(),12);
    const id=await add(conn,`INSERT INTO users(name,email,password_hash,role,active) VALUES (?,?,?,?,0)`,
      ['DEMO | Reviewer nonaktif',reviewerEmail,unknownPassword,'admin']);
    reviewer={id};
  }

  const accounts:[string,string,string,number][]=[
    ['1000','Kas','asset',1],['1010','Bank Operasional','asset',1],['1100','Piutang Klien','asset',0],
    ['2000','Utang Vendor','liability',0],['2100','Uang Muka Pelanggan','liability',0],
    ['3000','Modal Disetor','equity',0],['4000','Pendapatan Wedding','revenue',0],
    ['4100','Pendapatan Tambahan','revenue',0],['5000','Biaya Vendor Event','cogs',0],
    ['6000','Beban Operasional','expense',0],['6200','Beban Marketing','expense',0]
  ];
  const accIds=new Map<string,number>();
  for(const [code,name,type,isCash] of accounts){
    let [record]=await rows<{id:number}>('SELECT id FROM accounts WHERE code=?',[code],conn);
    if(!record){const id=await add(conn,'INSERT INTO accounts(code,name,type,is_cash) VALUES (?,?,?,?)',
      [code,name,type,isCash]);record={id};}
    accIds.set(code,record.id);
  }
  for(const [code,kind,label] of [['1000','cash','Kas Kantor Demo'],['1010','bank','Bank Operasional Demo']] as const){
    const [exists]=await rows('SELECT id FROM cash_accounts WHERE account_id=?',[accIds.get(code)],conn);
    if(!exists)await add(conn,'INSERT INTO cash_accounts(account_id,kind,bank_name,holder,account_number_masked) VALUES (?,?,?,?,?)',
      [accIds.get(code),kind,kind==='bank'?label:null,'Wedding-In','**** DEMO']);
  }

  const eventTypes=new Map<string,number>();
  for(const [code,name,hours] of [
    ['AKAD','Akad Nikah',5],['RESEPSI','Resepsi Wedding',8],['INTIMATE','Intimate Wedding',6],['ENGAGEMENT','Engagement / Lamaran',4]
  ] as const){
    const id=await add(conn,'INSERT INTO event_types(code,name,duration_hours,description) VALUES (?,?,?,?)',
      [`${tag}-${code}`,`DEMO | ${name}`,hours,'Data contoh Wedding-In Hybrid']);
    eventTypes.set(code,id);
  }

  const serviceIds=new Map<string,number>();
  for(const s of serviceDefs){
    const id=await add(conn,`INSERT INTO services(code,name,category,unit,default_fulfillment,default_cost,default_sell,notes)
      VALUES (?,?,?,?,?,?,?,?)`,[`${tag}-${s.code}`,`DEMO | ${s.name}`,s.category,s.unit,
      s.fulfillment,s.cost,s.sell,'Harga ilustrasi untuk pengujian, bukan penawaran resmi.']);
    serviceIds.set(s.code,id);
  }
  for(const rule of [
    {code:'WO-FULL',type:'RESEPSI',cost:'13500000',sell:'24500000',city:'Bandung',day:'weekend'},
    {code:'WO-DAY',type:'INTIMATE',cost:'6000000',sell:'11000000',city:'Bandung',day:'weekday'},
    {code:'CATER',type:'RESEPSI',cost:'140000',sell:'195000',city:'Bandung',day:'weekend'}
  ])await add(conn,`INSERT INTO service_price_rules(service_id,event_type_id,city,day_type,valid_from,valid_to,priority,cost_unit,sell_unit)
    VALUES (?,?,?,?,?,?,?,?,?)`,[serviceIds.get(rule.code),eventTypes.get(rule.type),rule.city,rule.day,at(-120),at(365),10,rule.cost,rule.sell]);

  const vendorIds=new Map<string,number>(),vendorServiceIds=new Map<string,number>();
  for(const [index,v] of vendors.entries()){
    const id=await add(conn,`INSERT INTO vendors(name,category,contact_person,phone,email,city,base_price,notes,active)
      VALUES (?,?,?,?,?,?,?,?,1)`,[`DEMO | ${v.name}`,v.category,'Kontak Demo','0000000000',
      `demo-vendor-${index+1}@wedding-in.invalid`,'Bandung',v.cost,'Vendor fiktif untuk simulasi.']);
    vendorIds.set(v.code,id);
    const vsId=await add(conn,`INSERT INTO vendor_services(vendor_id,service_id,vendor_sku,title,unit,min_qty,capacity_per_day,service_area,terms)
      VALUES (?,?,?,?,?,?,?,?,?)`,[id,serviceIds.get(v.service),`${tag}-${v.code}`,
      `DEMO | ${v.name} - ${v.service}`,v.unit,1,2,'Bandung Raya','Tarif dan ketersediaan hanya simulasi.']);
    vendorServiceIds.set(v.service,vsId);
    await add(conn,`INSERT INTO vendor_service_rates(vendor_service_id,effective_from,effective_to,city,min_qty,cost_unit,currency)
      VALUES (?,?,?,?,?,?,?)`,[vsId,at(-120),at(365),'Bandung',1,v.cost,'IDR']);
  }

  const packages=new Map<string,{packageId:number;versionId:number}>();
  const packageSpecs=[
    {code:'INTIMATE',name:'Intimate',price:'48000000',items:[['WO-DAY',1],['PHOTO',1],['MUA',1]]},
    {code:'SIGNATURE',name:'Signature',price:'125000000',items:[['WO-FULL',1],['DECOR',1],['CATER',300],['PHOTO',1],['MUA',1]]},
    {code:'ROYAL',name:'Royal',price:'205000000',items:[['WO-FULL',1],['DECOR',1],['CATER',500],['PHOTO',1],['SOUND',1],['MC',1],['MUA',1]]}
  ];
  for(const spec of packageSpecs){
    const pkgId=await add(conn,'INSERT INTO packages(name,description,price,inclusions,active) VALUES (?,?,?,?,1)',
      [`DEMO | Paket ${spec.name}`,`Paket dummy ${spec.name} Wedding-In.`,spec.price,
      JSON.stringify(spec.items.map(x=>x[0]))]);
    const versionId=await add(conn,`INSERT INTO package_versions(package_id,version_no,status,pricing_mode,published_at,created_by)
      VALUES (?,1,'published','sum_items',NOW(),?)`,[pkgId,owner.id]);
    packages.set(spec.code,{packageId:pkgId,versionId});
    for(const [index,[code,qty]] of spec.items.entries()){
      const service=serviceDefs.find(x=>x.code===code)!;
      await add(conn,`INSERT INTO package_version_lines(package_version_id,service_id,vendor_service_id,line_name,qty,unit,
        fulfillment,default_cost_unit,default_sell_unit,is_optional,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [versionId,serviceIds.get(code as string),vendorServiceIds.get(code as string)??null,
        `DEMO | ${service.name}`,qty,service.unit,service.fulfillment,service.cost,service.sell,0,index+1]);
    }
  }

  const clients=new Map<string,number>(),leads=new Map<string,number>();
  const people=[
    {code:'01',name:'Alya Putri',partner:'Rizky Pratama',status:'won',source:'Instagram',days:50,budget:150000000},
    {code:'02',name:'Nadia Maharani',partner:'Fajar Saputra',status:'proposal',source:'Website',days:85,budget:95000000},
    {code:'03',name:'Citra Anindya',partner:'Dimas Mahendra',status:'contacted',source:'Referral',days:110,budget:125000000},
    {code:'04',name:'Bella Kartika',partner:'Andi Wijaya',status:'new',source:'WhatsApp',days:145,budget:75000000},
    {code:'05',name:'Laras Puspita',partner:'Raka Nugraha',status:'lost',source:'Instagram',days:70,budget:110000000}
  ] as const;
  for(const person of people){
    const leadId=await add(conn,`INSERT INTO leads(name,phone,email,source,status,wedding_date,estimated_budget,notes)
      VALUES (?,?,?,?,?,?,?,?)`,[`DEMO | ${person.name} & ${person.partner}`,'0000000000',
      `demo-lead-${person.code}@wedding-in.invalid`,person.source,person.status,at(person.days),person.budget,
      'SIMULASI: data tidak mewakili pelanggan sungguhan.']);
    leads.set(person.code,leadId);
    if(['01','02','03'].includes(person.code)){
      const clientId=await add(conn,'INSERT INTO clients(name,partner_name,phone,email,address) VALUES (?,?,?,?,?)',
        [`DEMO | ${person.name}`,person.partner,'0000000000',
        `demo-client-${person.code}@wedding-in.invalid`,'Alamat dummy, Bandung']);
      clients.set(person.code,clientId);
    }
  }

  const eventIds=new Map<string,number>();
  for(const e of [
    {code:'01',title:'Alya & Rizky — Grand Wedding (DEMO)',pkg:'SIGNATURE',days:50,status:'confirmed',guest:300},
    {code:'02',title:'Nadia & Fajar — Intimate Wedding (DEMO)',pkg:'INTIMATE',days:85,status:'planning',guest:120},
    {code:'03',title:'Citra & Dimas — Wedding (DEMO)',pkg:'ROYAL',days:110,status:'planning',guest:500}
  ] as const){
    const id=await add(conn,`INSERT INTO events(code,title,client_id,lead_id,package_id,event_date,venue,city,
      guest_count,status,contract_amount,estimated_cost,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [`${tag}-WDG-${e.code}`,e.title,clients.get(e.code),leads.get(e.code),packages.get(e.pkg)!.packageId,
        at(e.days),'Gedung Contoh Bandung','Bandung',e.guest,e.status,
        packageSpecs.find(p=>p.code===e.pkg)!.price,
        e.pkg==='SIGNATURE'?85000000:e.pkg==='ROYAL'?145000000:32000000,
        'DATA DEMO untuk pengujian, tidak mewakili kontrak nyata.']);
    eventIds.set(e.code,id);
    for(const [index,[title,offset,status]] of [
      ['Briefing kebutuhan klien',-30,'done'],['Finalisasi vendor',-15,'progress'],
      ['Technical meeting dan rundown',-7,'todo'],['Final check crew',-1,'todo']
    ].entries()){
      await add(conn,'INSERT INTO tasks(event_id,title,category,due_at,assigned_to,priority,status) VALUES (?,?,?,?,?,?,?)',
        [id,`DEMO | ${title}`,'Persiapan',at(e.days+Number(offset))+' 09:00:00',
          'Tim Wedding-In Demo',index===3?'high':'medium',status]);
    }
  }

  const staffIds:number[]=[];
  for(const [name,position,rate,active] of [
    ['Adit Santoso','Event Coordinator',650000,1],['Rani Kusuma','Wedding Planner',800000,1],
    ['Sinta Dewi','Floor Coordinator',550000,1],['Fikri Malik','Crew',400000,1],
    ['Rudi Prasetyo','Crew',400000,0]
  ] as const){
    staffIds.push(await add(conn,'INSERT INTO staff(name,position,phone,daily_rate,active) VALUES (?,?,?,?,?)',
      [`DEMO | ${name}`,position,'0000000000',rate,active]));
  }
  for(const [index,staffId] of staffIds.slice(0,4).entries())await add(conn,
    'INSERT INTO event_staff(event_id,staff_id,assignment,fee) VALUES (?,?,?,?)',
    [eventIds.get('01'),staffId,index===0?'PIC Lapangan':'Operasional Acara',index===0?650000:500000]);

  async function createQuote(code:string,personCode:string,eventType:string,days:number,packageCode:string,
    status:'accepted'|'sent'|'draft',lines:DraftLine[],eventId?:number){
    const p=people.find(x=>x.code===personCode)!;
    const quoteId=await add(conn,`INSERT INTO quotations(quote_number,lead_id,client_id,client_name,client_phone,status,
      accepted_event_id,created_by) VALUES (?,?,?,?,?,?,?,?)`,
      [`QTN-${tag}-${code}`,leads.get(personCode),clients.get(personCode)??null,
        `DEMO | ${p.name} & ${p.partner}`,'0000000000',status,eventId??null,owner.id]);
    const totals=await priceLines(lines,{event_date:at(days),event_type_id:eventTypes.get(eventType),
      city:'Bandung',guest_count:personCode==='01'?300:120},true,conn);
    const revisionId=await add(conn,`INSERT INTO quotation_revisions(quotation_id,version_no,event_type_id,event_date,
      city,venue,guest_count,valid_until,notes,package_version_id,subtotal_managed,subtotal_direct,
      discount_total,tax_total,contract_total,client_budget_total,cost_est_total,status,created_by,sent_at,accepted_at)
      VALUES (?,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[
      quoteId,eventTypes.get(eventType),at(days),'Bandung','Gedung Contoh Bandung',personCode==='01'?300:120,
      at(15),'Penawaran dummy Wedding-In.',packages.get(packageCode)!.versionId,
      totals.totals.subtotal_managed,totals.totals.subtotal_direct,totals.totals.discount_total,'0.00',
      totals.totals.contract_total,totals.totals.client_budget_total,totals.totals.cost_est_total,
      status,owner.id,status!=='draft'?new Date():null,status==='accepted'?new Date():null]);
    for(const line of totals.lines){
      const id=await add(conn,`INSERT INTO quotation_lines(revision_id,line_no,service_id,vendor_service_id,title_snapshot,
        unit_snapshot,fulfillment,quantity,unit_sell,unit_cost,discount_amount,sell_net,cost_total,price_rule_id,
        overridden,override_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[
        revisionId,line.line_no,line.service_id,line.vendor_service_id,line.title_snapshot,line.unit_snapshot,
        line.fulfillment,line.quantity,line.unit_sell,line.unit_cost,line.discount_amount,line.sell_net,
        line.cost_total,line.price_rule_id,line.overridden,line.override_reason]);
      if(line.overridden&&line.original_sell!==line.unit_sell)await add(conn,`INSERT INTO price_override_audits
        (entity_type,entity_id,field_name,before_amount,after_amount,reason,actor_id) VALUES (?,?,?,?,?,?,?)`,
        ['quotation_lines',id,'unit_sell',line.original_sell,line.unit_sell,line.override_reason,owner.id]);
    }
    await execSql('UPDATE quotations SET current_revision_id=?,accepted_revision_id=? WHERE id=?',
      [revisionId,status==='accepted'?revisionId:null,quoteId],conn);
    if(status!=='draft')await add(conn,`INSERT INTO quotation_actions(quotation_id,revision_id,action,reason,actor_id)
      VALUES (?,?,?,?,?)`,[quoteId,revisionId,'send','Pengiriman simulasi',owner.id]);
    if(status==='accepted')await add(conn,`INSERT INTO quotation_actions(quotation_id,revision_id,action,reason,actor_id)
      VALUES (?,?,?,?,?)`,[quoteId,revisionId,'accept','Deal simulasi',owner.id]);
    if(eventId){
      await execSql('UPDATE events SET contract_amount=?,estimated_cost=? WHERE id=?',
        [totals.totals.contract_total,totals.totals.cost_est_total,eventId],conn);
      const budgetId=await add(conn,`INSERT INTO event_budget_revisions(event_id,revision_no,source_revision_id,
        contract_total,direct_budget,cost_est_total,created_by) VALUES (?,1,?,?,?,?,?)`,[
        eventId,revisionId,totals.totals.contract_total,totals.totals.subtotal_direct,totals.totals.cost_est_total,owner.id]);
      const quoteLines=await rows<any>('SELECT * FROM quotation_lines WHERE revision_id=? ORDER BY line_no',[revisionId],conn);
      for(const line of quoteLines)await add(conn,`INSERT INTO event_budget_lines(budget_revision_id,quotation_line_id,
        title_snapshot,fulfillment,quantity,unit_sell,unit_cost,sell_net,cost_total) VALUES (?,?,?,?,?,?,?,?,?)`,[
        budgetId,line.id,line.title_snapshot,line.fulfillment,line.quantity,line.unit_sell,line.unit_cost,
        line.sell_net,line.cost_total]);
      for(const [svc,vendorCode,cost] of [['DECOR','FLORAL',23000000],['CATER','FOOD',40500000],
        ['PHOTO','VISUAL',10000000]] as const)await add(conn,`INSERT INTO event_vendors
        (event_id,vendor_id,service_name,agreed_price,status,notes) VALUES (?,?,?,?,?,?)`,
        [eventId,vendorIds.get(vendorCode),`DEMO | ${svc}`,cost,'proposed','Belum dibooking, hanya usulan.']);
    }
  }

  await createQuote('001','01','RESEPSI',50,'SIGNATURE','accepted',[
    {service_id:serviceIds.get('WO-FULL'),quantity:'1'},
    {vendor_service_id:vendorServiceIds.get('DECOR'),quantity:'1'},
    {vendor_service_id:vendorServiceIds.get('CATER'),quantity:'300'},
    {vendor_service_id:vendorServiceIds.get('PHOTO'),quantity:'1'},
    {vendor_service_id:vendorServiceIds.get('MUA'),quantity:'1',fulfillment:'client_direct'}
  ],eventIds.get('01'));
  await createQuote('002','02','INTIMATE',85,'INTIMATE','sent',[
    {service_id:serviceIds.get('WO-DAY'),quantity:'1',unit_sell_override:'11500000',
      override_reason:'Promo early booking klien demo'},
    {vendor_service_id:vendorServiceIds.get('PHOTO'),quantity:'1'},
    {vendor_service_id:vendorServiceIds.get('MUA'),quantity:'1'}
  ]);
  await createQuote('003','03','RESEPSI',110,'ROYAL','draft',[
    {service_id:serviceIds.get('WO-FULL'),quantity:'1'},
    {vendor_service_id:vendorServiceIds.get('DECOR'),quantity:'1'},
    {vendor_service_id:vendorServiceIds.get('CATER'),quantity:'500'}
  ]);

  const financeCategories=new Map<string,number>();
  for(const c of [
    {code:'TRANSPORT',name:'Transportasi Crew',flow:'expense',debit:'6000',credit:null},
    {code:'MARKETING',name:'Marketing dan Promosi',flow:'expense',debit:'6200',credit:null},
    {code:'OTHER',name:'Pendapatan Lain-lain',flow:'income',debit:null,credit:'4100'}
  ]){
    const id=await add(conn,`INSERT INTO finance_categories(code,name,flow_type,default_debit_account_id,
      default_credit_account_id,requires_event,requires_attachment) VALUES (?,?,?,?,?,0,0)`,[
      `${tag}-${c.code}`,`DEMO | ${c.name}`,c.flow,c.debit?accIds.get(c.debit):null,
      c.credit?accIds.get(c.credit):null]);
    financeCategories.set(c.code,id);
  }

  async function makeInvoice(code:string,eventCode:string,amount:number,paid:number){
    const eventId=eventIds.get(eventCode)!;
    const id=await add(conn,'INSERT INTO invoices(event_id,number,amount,due_date,description) VALUES (?,?,?,?,?)',
      [eventId,`INV-${tag}-${code}`,amount,at(14),`DEMO | Tagihan termin ${code}`]);
    await postJournal(conn,{date:at(-2),description:`DEMO | Terbit invoice ${code}`,reference_type:'invoice',
      reference_id:id,cash_flow:'none',user_id:owner.id,lines:[
        {code:'1100',debit:amount,event_id:eventId},{code:'2100',credit:amount,event_id:eventId}]});
    if(paid){
      const journal=await postJournal(conn,{date:at(-1),description:`DEMO | Pembayaran invoice ${code}`,
        reference_type:'invoice_payment',reference_id:id,cash_flow:'operating',user_id:owner.id,lines:[
          {code:'1010',debit:paid,event_id:eventId},{code:'1100',credit:paid,event_id:eventId}]});
      await add(conn,'INSERT INTO invoice_payments(invoice_id,amount,method,paid_at,reference,journal_id) VALUES (?,?,?,?,?,?)',
        [id,paid,'bank',at(-1),`TRF-${tag}-${code}`,journal]);
    }
  }
  await makeInvoice('001','01',55000000,35000000);
  await makeInvoice('002','01',35000000,0);
  await makeInvoice('003','02',18000000,9000000);

  async function makeBill(code:string,eventCode:string,vendorCode:string,amount:number,paid:number){
    const eventId=eventIds.get(eventCode)!,vendorId=vendorIds.get(vendorCode)!;
    const id=await add(conn,`INSERT INTO bills(event_id,vendor_id,number,description,amount,due_date,expense_account_code)
      VALUES (?,?,?,?,?,?,?)`,[eventId,vendorId,`BILL-${tag}-${code}`,`DEMO | Tagihan ${vendorCode}`,
        amount,at(15),'5000']);
    await postJournal(conn,{date:at(-2),description:`DEMO | Terbit tagihan ${code}`,reference_type:'bill',
      reference_id:id,cash_flow:'none',user_id:owner.id,lines:[
        {code:'5000',debit:amount,event_id:eventId},{code:'2000',credit:amount,event_id:eventId}]});
    if(paid){
      const journal=await postJournal(conn,{date:at(-1),description:`DEMO | Bayar tagihan ${code}`,
        reference_type:'bill_payment',reference_id:id,cash_flow:'operating',user_id:owner.id,lines:[
          {code:'2000',debit:paid,event_id:eventId},{code:'1010',credit:paid,event_id:eventId}]});
      await add(conn,'INSERT INTO bill_payments(bill_id,amount,method,paid_at,reference,journal_id) VALUES (?,?,?,?,?,?)',
        [id,paid,'bank',at(-1),`PAY-${tag}-${code}`,journal]);
    }
  }
  await makeBill('001','01','FLORAL',12000000,5000000);
  await makeBill('002','01','FOOD',16000000,0);
  await makeBill('003','02','VISUAL',8000000,8000000);

  async function makeFinance(code:string,kind:'DIRECT_EXPENSE'|'OTHER_RECEIPT'|'INTERNAL_TRANSFER',
    amount:number,status:'draft'|'submitted'|'posted',categoryCode?:string,eventCode?:string){
    const id=await add(conn,`INSERT INTO finance_transactions(number,kind,direction,event_id,category_id,
      transaction_date,cash_account_id,destination_cash_account_id,counterparty_name,description,amount,
      status,reference,idempotency_key,created_by,approved_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[
      `TRX-${tag}-${code}`,kind,kind==='DIRECT_EXPENSE'?'out':kind==='OTHER_RECEIPT'?'in':'transfer',
      eventCode?eventIds.get(eventCode):null,categoryCode?financeCategories.get(categoryCode):null,
      at(-1),accIds.get('1010'),kind==='INTERNAL_TRANSFER'?accIds.get('1000'):null,'Pihak Demo',
      `DEMO | ${kind.replaceAll('_',' ')} #${code}`,amount,status,
      `REF-${tag}-${code}`,`IDEMP-${tag}-${code}`,owner.id,status==='posted'?reviewer.id:null]);
    const actions=status==='posted'?['created','submitted','approved','posted']:
      status==='submitted'?['created','submitted']:['created'];
    let journalId:number|null=null;
    if(status==='posted'){
      const lines=kind==='DIRECT_EXPENSE'?[{code:categoryCode==='MARKETING'?'6200':'6000',debit:amount,event_id:eventCode?eventIds.get(eventCode):null},
        {code:'1010',credit:amount,event_id:eventCode?eventIds.get(eventCode):null}]:
        kind==='OTHER_RECEIPT'?[{code:'1010',debit:amount},{code:'4100',credit:amount}]:
        [{code:'1000',debit:amount},{code:'1010',credit:amount}];
      journalId=await postJournal(conn,{date:at(-1),description:`DEMO | Transaksi Backoffice ${code}`,
        reference_type:'backoffice',reference_id:id,cash_flow:kind==='INTERNAL_TRANSFER'?'none':'operating',
        user_id:owner.id,lines});
      await execSql('UPDATE finance_transactions SET posted_journal_id=? WHERE id=?',[journalId,id],conn);
    }
    for(const action of actions)await add(conn,`INSERT INTO finance_audit_events(transaction_id,action,reason,actor_id)
      VALUES (?,?,?,?)`,[id,action,action==='approved'?'Persetujuan simulasi':null,
      action==='approved'?reviewer.id:owner.id]);
  }
  await makeFinance('001','DIRECT_EXPENSE',1250000,'posted','TRANSPORT','01');
  await makeFinance('002','DIRECT_EXPENSE',850000,'posted','MARKETING');
  await makeFinance('003','OTHER_RECEIPT',2500000,'posted','OTHER');
  await makeFinance('004','INTERNAL_TRANSFER',5000000,'posted');
  await makeFinance('005','DIRECT_EXPENSE',750000,'submitted','TRANSPORT','02');
  await makeFinance('006','DIRECT_EXPENSE',450000,'draft','MARKETING');

  console.log('DATA DEMO HYBRID BERHASIL DITAMBAHKAN');
  console.log('4 tipe event, 12 layanan, 3 aturan harga, 7 vendor/rate, 3 paket, 5 prospek, 3 client, 3 wedding.');
  console.log('3 quotation (draft, sent, accepted), 3 invoice, 3 tagihan, 6 transaksi backoffice + jurnal.');
  console.log('Semua nama/nomor data contoh menggunakan penanda DEMO.');
}

async function run(){
  if(!process.argv.includes('--apply')){
    console.log('Mode preview. Untuk memasukkan data dummy jalankan: npx tsx scripts/seed-hybrid-demo.ts --apply');
    return;
  }
  await transaction(seed);
}

try{await run();}
catch(error){console.error('Seeding dibatalkan, seluruh perubahan transaksi di-rollback:',(error as Error).message);
  process.exitCode=1;}
finally{await pool.end();}
