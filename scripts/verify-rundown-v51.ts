import 'dotenv/config';
import {pool,rows} from '../server/db.js';

try{
  const [migration]=await rows<{total:number}>("SELECT COUNT(*) total FROM migrations WHERE filename='009_rundown_template.sql'");
  if(!migration?.total)throw new Error('Migrasi 009 belum tercatat.');
  const names=['rundown_templates','event_rundown_profiles','event_rundown_items'];
  const tables=await rows<{name:string}>(`SELECT TABLE_NAME name FROM information_schema.tables
    WHERE table_schema=DATABASE() AND table_name IN (?,?,?)`,names);
  if(tables.length!==names.length)throw new Error('Tabel master/panduan rundown belum lengkap.');
  const [master]=await rows<{total:number}>(
    "SELECT COUNT(*) total FROM rundown_templates WHERE code='WEDDING-IN-RUNDOWN-AKAD-RESEPSI-V1'");
  if(!master?.total)throw new Error('Master rundown referensi belum tersimpan.');
  const [unrelated]=await rows<{total:number}>(`SELECT COUNT(*) total FROM event_rundown_profiles p
    LEFT JOIN events e ON e.id=p.event_id LEFT JOIN rundown_templates t ON t.id=p.template_id
    WHERE e.id IS NULL OR t.id IS NULL`);
  if(unrelated?.total)throw new Error('Relasi rundown wedding dengan template tidak valid.');
  const [count]=await rows<{total:number}>(`SELECT COUNT(*) total FROM event_rundown_items r
    WHERE r.planned_start>=r.planned_end`);
  if(count?.total)throw new Error('Terdapat aktivitas rundown dengan durasi tidak valid.');
  const [demo]=await rows<{total:number}>(`SELECT COUNT(*) total FROM event_incidents WHERE title LIKE 'DEMO-V51-EXECUTION%'`);
  console.log(`PASS - V5.1: master immutable, profil wedding, rundown, data monitoring demo (${demo?.total??0} insiden).`);
}finally{await pool.end();}
