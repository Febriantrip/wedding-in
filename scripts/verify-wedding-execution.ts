import 'dotenv/config';
import {pool,rows} from '../server/db.js';

const required=['project_task_schedules','event_rundown_items','event_team_presence','event_incidents'];
try{
  const [migration]=await rows<{total:number}>("SELECT COUNT(*) total FROM migrations WHERE filename='008_wedding_execution.sql'");
  if(!migration?.total)throw new Error('Migrasi 008 belum tercatat.');
  const names=await rows<{name:string}>(`SELECT TABLE_NAME name FROM information_schema.tables
    WHERE table_schema=DATABASE() AND table_name IN (${required.map(()=>'?').join(',')})`,required);
  const present=new Set(names.map(r=>r.name.toLowerCase()));
  const missing=required.filter(name=>!present.has(name));
  if(missing.length)throw new Error(`Tabel Wedding Execution belum tersedia: ${missing.join(', ')}`);
  const [cross]=await rows<{total:number}>(`SELECT COUNT(*) total FROM project_task_schedules s
    JOIN tasks t ON t.id=s.task_id JOIN tasks dep ON dep.id=s.depends_on_task_id
    WHERE t.event_id<>dep.event_id`);
  if(cross?.total)throw new Error('Ada dependensi jadwal lintas wedding yang tidak valid.');
  const [badRundown]=await rows<{total:number}>(`SELECT COUNT(*) total FROM event_rundown_items r
    LEFT JOIN event_staff es ON es.id=r.staff_assignment_id
    LEFT JOIN event_vendors ev ON ev.id=r.vendor_assignment_id
    WHERE (es.id IS NOT NULL AND es.event_id<>r.event_id) OR (ev.id IS NOT NULL AND ev.event_id<>r.event_id)`);
  if(badRundown?.total)throw new Error('Ada PIC/vendor rundown dari wedding lain.');
  const [badPresence]=await rows<{total:number}>(`SELECT COUNT(*) total FROM event_team_presence p
    LEFT JOIN event_staff es ON p.team_kind='crew' AND es.id=p.assignment_id
    LEFT JOIN event_vendors ev ON p.team_kind='vendor' AND ev.id=p.assignment_id
    WHERE (p.team_kind='crew' AND (es.id IS NULL OR es.event_id<>p.event_id))
       OR (p.team_kind='vendor' AND (ev.id IS NULL OR ev.event_id<>p.event_id))`);
  if(badPresence?.total)throw new Error('Ada data kehadiran crew/vendor tanpa penugasan yang valid.');
  console.log('PASS - V5: migrasi, jadwal, rundown dan koordinasi tim konsisten.');
}finally{await pool.end();}
