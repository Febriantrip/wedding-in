import 'dotenv/config';
import {pool,rows,execSql,transaction,type DbConn} from '../server/db.js';
import {appointmentOn,cloneTemplate,type RunTemplate} from '../server/modules/operations/rundown-template-data.js';

const apply=process.argv.includes('--apply');
const label='DEMO-V51-EXECUTION';
async function add(conn:DbConn,sql:string,params:unknown[]=[]){return (await execSql(sql,params,conn)).insertId;}

async function main(){
  if(!apply){console.log('PREVIEW: Seed V5.1 hanya menambah data fiktif bertanda DEMO ke wedding demo.');
    console.log('Jalankan dengan --apply untuk menyimpan data; tidak mengubah wedding nyata.');return;}
  const [migration]=await rows<{total:number}>("SELECT COUNT(*) total FROM migrations WHERE filename='009_rundown_template.sql'");
  if(!migration?.total)throw new Error('Jalankan migrasi 009 sebelum seed.');
  const [master]=await rows<{id:number;payload_json:string}>(
    `SELECT id,payload_json FROM rundown_templates WHERE code='WEDDING-IN-RUNDOWN-AKAD-RESEPSI-V1'`);
  if(!master)throw new Error('Master template belum tersedia. Jalankan seed-rundown-template.ts terlebih dahulu.');
  const template=JSON.parse(master.payload_json) as RunTemplate;
  const [owner]=await rows<{id:number}>("SELECT id FROM users WHERE active=1 AND role IN ('owner','admin') ORDER BY id LIMIT 1");
  if(!owner)throw new Error('Akun Owner/Admin aktif belum ada untuk menandatangani data demo.');
  let events=await rows<{id:number;event_date:string;venue:string;client_name:string;partner_name:string}>(
    `SELECT e.id,e.event_date,e.venue,c.name client_name,c.partner_name FROM events e JOIN clients c ON c.id=e.client_id
     WHERE e.code LIKE 'DEMO-HYB-WDG-%' AND e.status NOT IN ('completed','cancelled') ORDER BY e.id LIMIT 3`);
  if(!events.length){
    const [prior]=await rows<{id:number;event_date:string;venue:string;client_name:string;partner_name:string}>(
      `SELECT e.id,e.event_date,e.venue,c.name client_name,c.partner_name FROM events e JOIN clients c ON c.id=e.client_id
       WHERE e.code='DEMO-V51-WDG-01'`);
    if(prior)events=[prior];
    else{
      const id=await transaction(async conn=>{
        const client=await add(conn,'INSERT INTO clients(name,partner_name,phone,email,address) VALUES (?,?,?,?,?)',
          ['DEMO | Naya Maharani','Rafa Aditya','0000000000','demo-wedding-v51@wedding-in.invalid','Alamat fiktif, Bandung']);
        const date=new Date(Date.now()+40*86400000).toISOString().slice(0,10);
        return add(conn,`INSERT INTO events(code,title,client_id,event_date,venue,city,guest_count,status,contract_amount,estimated_cost,notes)
          VALUES (?,?,?,?,?,?,?,'planning',0,0,?)`,
          ['DEMO-V51-WDG-01','DEMO | Naya & Rafa — Rundown & Monitoring',client,date,'Venue Fiktif Bandung','Bandung',250,
            'DATA DEMO V5.1. Tidak ada kontrak finansial, pelanggan asli, atau transaksi keuangan.']);
      });
      events=await rows(`SELECT e.id,e.event_date,e.venue,c.name client_name,c.partner_name FROM events e
        JOIN clients c ON c.id=e.client_id WHERE e.id=?`,[id]);
    }
  }
  for(const event of events){
    const date=String(event.event_date).slice(0,10);
    await transaction(async conn=>{
      const [profile]=await rows('SELECT id FROM event_rundown_profiles WHERE event_id=?',[event.id],conn);
      const [priorRundown]=await rows('SELECT id FROM event_rundown_items WHERE event_id=? LIMIT 1',[event.id],conn);
      if(!profile){
        const sections=cloneTemplate(template,{date,venue:event.venue,
          bride:event.client_name?.replace(/^DEMO\s*\|\s*/,''),groom:event.partner_name});
        for(const section of sections)for(const field of section.fields){
          if(field.key==='dresscode')field.value='DEMO | Champagne & sage';
          if(field.key==='akad_guests')field.value='DEMO | 80 orang';
          if(field.key==='reception_guests')field.value='DEMO | 250 orang';
          if(field.key==='bride_coordinator')field.value='DEMO | Ibu Keluarga CPW';
          if(field.key==='groom_coordinator')field.value='DEMO | Bapak Keluarga CPP';
          if(field.key==='vip_bride')field.value='DEMO | Keluarga besar pihak CPW';
          if(field.key==='vip_groom')field.value='DEMO | Keluarga besar pihak CPP';
          if(field.key==='organizer')field.value='Wedding-In · DATA DEMO';
        }
        await add(conn,'INSERT INTO event_rundown_profiles(event_id,template_id,profile_json,created_by) VALUES (?,?,?,?)',
          [event.id,master.id,JSON.stringify(sections),owner.id]);
      }
      if(!priorRundown){
        for(const [index,row] of template.rows.entries()){
          const status=index===0?'done':index===1?'ongoing':'scheduled';
          await add(conn,`INSERT INTO event_rundown_items(event_id,title,segment,planned_start,planned_end,status,
            notes,run_detail,pic_text,technical_note,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [event.id,row.title,row.segment,appointmentOn(date,row.start),appointmentOn(date,row.end),status,
              'DATA DEMO V5.1',row.detail,row.pic,row.technical,owner.id]);
        }
        console.log(`Wedding demo #${event.id}: ${template.rows.length} kegiatan rundown + panduan ditambahkan.`);
      }else console.log(`Wedding demo #${event.id}: rundown existing dipertahankan, panduan dipastikan tersedia.`);

      const [existingCrew]=await rows('SELECT id FROM event_staff WHERE event_id=? LIMIT 1',[event.id],conn);
      if(!existingCrew){
        const [staff]=await rows<{id:number}>('SELECT id FROM staff WHERE name=? LIMIT 1',['DEMO | Koordinator Lapangan V5.1'],conn);
        const staffId=staff?.id??await add(conn,'INSERT INTO staff(name,position,phone,daily_rate,active) VALUES (?,?,?,?,1)',
          ['DEMO | Koordinator Lapangan V5.1','Floor Coordinator','0000000000',0]);
        await add(conn,'INSERT INTO event_staff(event_id,staff_id,assignment,fee) VALUES (?,?,?,0)',
          [event.id,staffId,`${label} · Koordinasi rundown`]);
      }
      const [existingVendor]=await rows('SELECT id FROM event_vendors WHERE event_id=? LIMIT 1',[event.id],conn);
      if(!existingVendor){
        const [vendor]=await rows<{id:number}>('SELECT id FROM vendors WHERE name=? LIMIT 1',['DEMO | Vendor Simulasi V5.1'],conn);
        const vendorId=vendor?.id??await add(conn,`INSERT INTO vendors(name,category,contact_person,phone,base_price,notes)
          VALUES (?,?,?,?,0,?)`,['DEMO | Vendor Simulasi V5.1','Event Production','Kontak Fiktif','0000000000',label]);
        await add(conn,`INSERT INTO event_vendors(event_id,vendor_id,service_name,agreed_price,status,notes)
          VALUES (?,?,?,0,'confirmed',?)`,[event.id,vendorId,'DEMO | Event Production',label]);
      }
      const crew=await rows<{id:number}>('SELECT id FROM event_staff WHERE event_id=? ORDER BY id LIMIT 2',[event.id],conn);
      const vendors=await rows<{id:number}>('SELECT id FROM event_vendors WHERE event_id=? ORDER BY id LIMIT 1',[event.id],conn);
      const pairs=[...crew.map(c=>({kind:'crew',id:c.id})),...vendors.map(v=>({kind:'vendor',id:v.id}))];
      for(const [index,pair] of pairs.entries()){
        await execSql(`INSERT IGNORE INTO event_team_presence(event_id,team_kind,assignment_id,state,
          arrived_at,ready_at,note,updated_by) VALUES (?,?,?,?,?,?,?,?)`,
          [event.id,pair.kind,pair.id,index===0?'ready':'arrived',`${date} 07:00:00`,
            index===0?`${date} 07:15:00`:null,`${label} · simulasi`,owner.id],conn);
      }
      const incidents=[{title:`${label} | Soundcheck tertunda`,description:'Simulasi: perlu koordinasi ulang waktu soundcheck dengan vendor audio.',
        severity:'medium',status:'open',resolution:null},{title:`${label} | Pergeseran jalur VIP`,
        description:'Simulasi: jalur masuk tamu VIP telah ditinjau dan disesuaikan.',
        severity:'low',status:'resolved',resolution:'Simulasi: briefing PIC selesai dan signage diperbaiki.'}];
      for(const issue of incidents){
        const [exists]=await rows('SELECT id FROM event_incidents WHERE event_id=? AND title=?',[event.id,issue.title],conn);
        if(exists)continue;
        await add(conn,`INSERT INTO event_incidents(event_id,title,description,severity,status,resolution,created_by,
          resolved_by,resolved_at) VALUES (?,?,?,?,?,?,?,?,?)`,
          [event.id,issue.title,issue.description,issue.severity,issue.status,issue.resolution,owner.id,
            issue.status==='resolved'?owner.id:null,issue.status==='resolved'?`${date} 07:40:00`:null]);
      }
    });
  }
  console.log(`PASS - V5.1: ${events.length} wedding demo siap untuk rundown, monitoring, PIC, dan panduan PDF.`);
}
try{await main();}finally{await pool.end();}
