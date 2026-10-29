import 'dotenv/config';
import {pool,rows} from '../server/db.js';

const required=['event_vendor_bookings','event_payment_schedules','event_change_orders',
  'event_change_order_lines','event_contract_revisions','event_project_audits'];
try{
  const tables=await rows<{name:string}>(`SELECT TABLE_NAME AS name FROM information_schema.tables
    WHERE table_schema=DATABASE() AND table_name IN (${required.map(()=>'?').join(',')})`,required);
  const found=new Set(tables.map(item=>item.name.toLowerCase()));
  const missing=required.filter(name=>!found.has(name));
  if(missing.length)throw new Error(`Tabel proyek belum dibuat: ${missing.join(', ')}`);
  const [migration]=await rows<{total:number}>(`SELECT COUNT(*) total FROM migrations WHERE filename='006_project_control.sql'`);
  if(!migration||!migration.total)throw new Error('Migrasi 006 belum tercatat lengkap.');
  const [overplanned]=await rows<{total:number}>(`SELECT COUNT(*) total FROM (
    SELECT e.id FROM events e JOIN event_payment_schedules s ON s.event_id=e.id AND s.status='planned'
    GROUP BY e.id HAVING SUM(s.amount)>MAX(e.contract_amount)
  ) q`);
  if(overplanned?.total)throw new Error(`Ada ${overplanned.total} wedding dengan total termin lebih besar dari nilai kontrak.`);
  const [orphan]=await rows<{total:number}>(`SELECT COUNT(*) total FROM event_change_orders c
    LEFT JOIN event_contract_revisions r ON r.change_order_id=c.id
    WHERE c.status='approved' AND r.id IS NULL`);
  if(orphan?.total)throw new Error(`Ada ${orphan.total} Change Order disetujui tanpa revisi kontrak.`);
  const [directBill]=await rows<{total:number}>(`SELECT COUNT(*) total FROM event_vendor_bookings b
    JOIN event_vendors v ON v.id=b.assignment_id JOIN bills i ON i.event_id=v.event_id AND i.vendor_id=v.vendor_id
    WHERE b.payment_responsibility='client_direct' AND b.booking_status<>'cancelled'
    AND NOT EXISTS(SELECT 1 FROM lifecycle_actions a WHERE a.entity_type='bills' AND a.entity_id=i.id AND a.action='cancel')`);
  if(directBill?.total)throw new Error(`Ada ${directBill.total} tagihan Wedding-In yang seharusnya dibayar langsung oleh klien.`);
  console.log('PASS - Migrasi, tabel, termin, revisi, dan pemisahan pembayaran Hybrid valid.');
}finally{await pool.end();}
