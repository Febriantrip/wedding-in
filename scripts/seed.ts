import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool, rows, execSql, transaction } from '../server/db.js';
import { postJournal } from '../server/accounting.js';

const chart:[string,string,string,number][]=[
  ['1000','Kas','asset',1],['1010','Bank Operasional','asset',1],['1100','Piutang Klien','asset',0],
  ['1300','Uang Muka Vendor','asset',0],['1500','Peralatan & Aset Tetap','asset',0],
  ['2000','Utang Vendor','liability',0],['2100','Uang Muka Pelanggan','liability',0],
  ['3000','Modal Disetor','equity',0],['3100','Saldo Laba Tahun Lalu','equity',0],
  ['4000','Pendapatan Wedding','revenue',0],['4100','Pendapatan Tambahan','revenue',0],
  ['5000','Biaya Vendor Event','cogs',0],['5100','Biaya Crew Event','cogs',0],['5200','Biaya Dekorasi','cogs',0],
  ['6000','Beban Operasional','expense',0],['6100','Beban Gaji','expense',0],['6200','Beban Marketing','expense',0]
];
for(const [code,name,type,cash] of chart){
  await execSql(`INSERT INTO accounts(code,name,type,is_cash) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),type=VALUES(type),is_cash=VALUES(is_cash)`,[code,name,type,cash]);
}
const email=process.env.ADMIN_EMAIL?.toLowerCase(),password=process.env.ADMIN_PASSWORD;
if(!email || !password || password.length<12 || password.startsWith('replace-'))throw new Error('Isi ADMIN_EMAIL dan ADMIN_PASSWORD (minimal 12 karakter) di .env sebelum seed.');
const existing=await rows('SELECT id FROM users WHERE email=?',[email]);
if(!existing.length){
  const hash=await bcrypt.hash(password,12);
  await execSql('INSERT INTO users(name,email,password_hash,role) VALUES (?,?,?,?)',['Owner WO',email,hash,'owner']);
  console.log('Akun Owner dibuat:',email);
}else console.log('Akun Owner sudah ada; password tidak diubah.');
console.log('Chart of accounts siap:',chart.length,'akun.');
if(process.argv.includes('--demo')){
  const [anyEvent]=await rows('SELECT id FROM events LIMIT 1');
  if(!anyEvent){
    await transaction(async conn=>{
      const lead=await execSql("INSERT INTO leads(name,phone,source,status,estimated_budget) VALUES ('Nadia & Fajar','081234567890','Instagram','won',175000000)",[],conn);
      const client=await execSql("INSERT INTO clients(name,partner_name,phone) VALUES ('Nadia Putri','Fajar Rahman','081234567890')",[],conn);
      const date=new Date();date.setDate(date.getDate()+28);
      const eventDate=date.toISOString().slice(0,10);
      const event=await execSql("INSERT INTO events(code,title,client_id,lead_id,event_date,venue,city,guest_count,status,contract_amount,estimated_cost) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        ['WDG-DEMO-001','Nadia & Fajar Wedding',client.insertId,lead.insertId,eventDate,'The Grand Ballroom','Bandung',600,'confirmed',175000000,128000000],conn);
      for(const [title,offset,status] of [['Finalisasi vendor dekorasi',-16,'done'],['Technical meeting vendor',-9,'progress'],['Cek rundown dan musik',-4,'todo'],['Final briefing crew',-1,'todo']] as const){
        const d=new Date(`${eventDate}T12:00:00Z`);d.setDate(d.getDate()+offset);
        await execSql('INSERT INTO tasks(event_id,title,category,due_at,status) VALUES (?,?,?,?,?)',[event.insertId,title,'Persiapan',d.toISOString().slice(0,10)+' 09:00:00',status],conn);
      }
      await execSql("INSERT INTO vendors(name,category,contact_person,phone,city,base_price) VALUES ('Maison Floral','Dekorasi','Risa','081222222222','Bandung',28000000)",[],conn);
      await execSql("INSERT INTO vendors(name,category,contact_person,phone,city,base_price) VALUES ('Lumina Visual','Dokumentasi','Ardi','081233333333','Bandung',14500000)",[],conn);
      await execSql("INSERT INTO packages(name,description,price,inclusions) VALUES ('Signature Wedding','Paket WO lengkap',85000000,?)",[JSON.stringify(['Wedding planner','8 crew','Rundown & koordinasi vendor'])],conn);
      const [user]=await rows<{id:number}>('SELECT id FROM users WHERE email=?',[email],conn);
      await postJournal(conn,{date:new Date().toISOString().slice(0,10),description:'Setoran modal awal contoh',reference_type:'demo_seed',
        cash_flow:'financing',user_id:user.id,lines:[{code:'1010',debit:250000000},{code:'3000',credit:250000000}]});
    });console.log('Data contoh satu wedding, vendor, tugas, paket, dan modal awal ditambahkan.');
  }else console.log('Data contoh dilewati karena event sudah tersedia.');
}
await pool.end();
