import 'dotenv/config';
import {pool,rows,execSql} from '../server/db.js';
import {defaultRunTemplate} from '../server/modules/operations/rundown-template-data.js';

try{
  const [migration]=await rows<{total:number}>(
    "SELECT COUNT(*) total FROM migrations WHERE filename='009_rundown_template.sql'");
  if(!migration?.total)throw new Error('Migrasi 009_rundown_template.sql belum dijalankan.');
  const code='WEDDING-IN-RUNDOWN-AKAD-RESEPSI-V1';
  const [existing]=await rows<{id:number}>('SELECT id FROM rundown_templates WHERE code=?',[code]);
  if(existing)console.log(`Master rundown #${existing.id} sudah tersedia; konten master TIDAK diubah.`);
  else{
    const created=await execSql('INSERT INTO rundown_templates(code,title,version_no,payload_json) VALUES (?,?,?,?)',
      [code,'Panduan Akad & Resepsi Standar (Referensi PDF)',1,JSON.stringify(defaultRunTemplate)]);
    console.log(`Master rundown #${created.insertId} dibuat (${defaultRunTemplate.rows.length} aktivitas dan ${defaultRunTemplate.sections.length} formulir).`);
  }
}finally{await pool.end();}
