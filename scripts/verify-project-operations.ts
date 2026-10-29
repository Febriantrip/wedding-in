import 'dotenv/config';
import {pool,rows} from '../server/db.js';

const required=['project_expense_requests','project_vendor_payment_proofs','project_closings'];
try{
  const tables=await rows<{name:string}>(`SELECT TABLE_NAME name FROM information_schema.tables
    WHERE table_schema=DATABASE() AND table_name IN (${required.map(()=>'?').join(',')})`,required);
  const found=new Set(tables.map(row=>row.name.toLowerCase()));
  const missing=required.filter(table=>!found.has(table));
  if(missing.length)throw new Error(`Tabel project operations belum dibuat: ${missing.join(', ')}`);
  const [migrated]=await rows<{total:number}>("SELECT COUNT(*) total FROM migrations WHERE filename='007_project_operations.sql'");
  if(!migrated||!migrated.total)throw new Error('Migrasi 007 belum tercatat lengkap.');

  const [wrongExpense]=await rows<{total:number}>(`SELECT COUNT(*) total FROM project_expense_requests r
    LEFT JOIN finance_transactions t ON t.id=r.finance_transaction_id
    WHERE r.status='fulfilled' AND (t.id IS NULL OR t.event_id<>r.event_id OR t.kind<>'DIRECT_EXPENSE'
      OR t.status<>'posted' OR t.amount<>r.amount)`);
  if(wrongExpense?.total)throw new Error(`Ada ${wrongExpense.total} realisasi pengeluaran tidak cocok dengan transaksi Backoffice.`);

  const [wrongClosing]=await rows<{total:number}>(`SELECT COUNT(*) total FROM project_closings c
    JOIN events e ON e.id=c.event_id WHERE c.status='completed' AND e.status<>'completed'`);
  if(wrongClosing?.total)throw new Error(`Ada ${wrongClosing.total} arsip project dengan status wedding tidak sinkron.`);

  const [lateTransaction]=await rows<{total:number}>(`SELECT COUNT(*) total FROM project_closings c
    JOIN finance_transactions t ON t.event_id=c.event_id
    WHERE c.status='completed' AND t.status IN ('draft','submitted','approved')`);
  if(lateTransaction?.total)throw new Error(`Ada ${lateTransaction.total} transaksi belum diposting pada wedding yang sudah ditutup.`);

  console.log('PASS - Project Operations V4: migrasi, expense approval, posting Backoffice dan arsip konsisten.');
}finally {await pool.end();}
