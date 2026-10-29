import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool, rows, execSql, transaction, type DbConn } from '../server/db.js';
import { postJournal } from '../server/accounting.js';
import { buildShowcase, showcaseAccounts } from '../src/showcase.js';

// Aman untuk dijalankan berulang. Menolak database yang sudah berisi data operasional
// selain contoh bawaan versi awal, dan tidak menghapus atau menimpa satupun data.
async function requireDemoSafeDatabase(conn: DbConn): Promise<'empty' | 'already' | 'skip'> {
  const [events, invoices, bills, journals, leads, clients, vendors, packages, staff] = await Promise.all([
    rows<{ code: string }>('SELECT code FROM events', [], conn),
    rows<{ number: string }>('SELECT number FROM invoices', [], conn),
    rows<{ number: string }>('SELECT number FROM bills', [], conn),
    rows<{ reference_type: string }>('SELECT DISTINCT reference_type FROM journals', [], conn),
    rows<{ name: string }>('SELECT name FROM leads', [], conn),
    rows<{ name: string }>('SELECT name FROM clients', [], conn),
    rows<{ name: string }>('SELECT name FROM vendors', [], conn),
    rows<{ name: string }>('SELECT name FROM packages', [], conn),
    rows<{ name: string }>('SELECT name FROM staff', [], conn)
  ]);
  const showcaseCount = events.filter(e => e.code.startsWith('WIN-DEMO-')).length;
  if (showcaseCount) {
    if (showcaseCount === 8) return 'already';
    throw new Error('Ditemukan data demo Wedding-In yang belum lengkap. Database tidak diubah; periksa data terlebih dahulu.');
  }
  const matches = <T>(list: T[], allowed: (value: T) => boolean) => list.every(allowed);
  const safe = matches(events, x => x.code === 'WDG-DEMO-001') && events.length <= 1 &&
    invoices.length === 0 && bills.length === 0 &&
    matches(journals, x => x.reference_type === 'demo_seed') &&
    matches(leads, x => x.name === 'Nadia & Fajar') && leads.length <= 1 &&
    matches(clients, x => x.name === 'Nadia Putri') && clients.length <= 1 &&
    matches(vendors, x => ['Maison Floral', 'Lumina Visual'].includes(x.name)) && vendors.length <= 2 &&
    matches(packages, x => x.name === 'Signature Wedding') && packages.length <= 1 && staff.length === 0;
  if (!safe) {
    console.warn('DILEWATI: Database sudah memuat data bisnis. Data dummy MySQL tidak ditambahkan. Gunakan "Lihat demo interaktif" di login atau database khusus demo.');
    return 'skip';
  }
  return 'empty';
}

async function run() {
  const showcase = buildShowcase();
  await transaction(async conn => {
    const result = await requireDemoSafeDatabase(conn);
    if (result === 'skip') return;
    if (result === 'already') {
      console.log('Data showroom Wedding-In sudah ada. Tidak ada data ganda yang ditambahkan.');
      return;
    }
    const existingAccounts = new Set((await rows<{ code: string }>('SELECT code FROM accounts', [], conn)).map(row => row.code));
    for (const [code,name,type,cash] of showcaseAccounts) {
      if (!existingAccounts.has(code)) await execSql('INSERT INTO accounts(code,name,type,is_cash) VALUES (?,?,?,?)',
        [code,name,type,cash],conn);
    }
    const users = await rows<{ id: number }>('SELECT id FROM users WHERE role IN (\'owner\',\'admin\') ORDER BY id LIMIT 1', [], conn);
    let userId = users[0]?.id;
    if (!userId) {
      const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
      const password = process.env.ADMIN_PASSWORD || '';
      if (!email.includes('@') || password.length < 12 || /^(ganti_|replace[-_]|change[-_])/i.test(password))
        throw new Error('Akun owner belum ada. Isi ADMIN_EMAIL dan ADMIN_PASSWORD kuat (minimal 12 karakter, bukan placeholder) pada .env.');
      const hash = await bcrypt.hash(password,12);
      const created = await execSql('INSERT INTO users(name,email,password_hash,role) VALUES (?,?,?,?)',
        ['Wedding-In Owner',email,hash,'owner'],conn);
      userId = created.insertId;
    }
    const ids = {
      leads: new Map<number, number>(), clients: new Map<number, number>(), packages: new Map<number, number>(),
      events: new Map<number, number>(), vendors: new Map<number, number>(), staff: new Map<number, number>()
    };
    for (const c of showcase.clients) {
      const r = await execSql('INSERT INTO clients(name,partner_name,phone,email,address) VALUES (?,?,?,?,?)',
        [c.name,c.partner_name,c.phone,c.email,c.address],conn);
      ids.clients.set(c.id, r.insertId);
    }
    for (const lead of showcase.leads) {
      const r = await execSql('INSERT INTO leads(name,phone,email,source,status,wedding_date,estimated_budget,notes) VALUES (?,?,?,?,?,?,?,?)',
        [lead.name,lead.phone,lead.email || null,lead.source,lead.status,lead.wedding_date,lead.estimated_budget,lead.notes],conn);
      ids.leads.set(lead.id, r.insertId);
    }
    for (const pkg of showcase.packages) {
      const r = await execSql('INSERT INTO packages(name,description,price,inclusions,active) VALUES (?,?,?,?,?)',
        [pkg.name,pkg.description,pkg.price,JSON.stringify(pkg.inclusions),pkg.active],conn);
      ids.packages.set(pkg.id, r.insertId);
    }
    for (const vendor of showcase.vendors) {
      const r = await execSql('INSERT INTO vendors(name,category,contact_person,phone,email,city,base_price,notes,active) VALUES (?,?,?,?,?,?,?,?,?)',
        [vendor.name,vendor.category,vendor.contact_person,vendor.phone,vendor.email,vendor.city,vendor.base_price,vendor.notes,vendor.active],conn);
      ids.vendors.set(vendor.id, r.insertId);
    }
    for (const person of showcase.staff) {
      const r = await execSql('INSERT INTO staff(name,position,phone,daily_rate,active) VALUES (?,?,?,?,?)',
        [person.name,person.position,person.phone,person.daily_rate,person.active],conn);
      ids.staff.set(person.id, r.insertId);
    }
    for (const event of showcase.events) {
      const r = await execSql(`INSERT INTO events(code,title,client_id,lead_id,package_id,event_date,venue,city,guest_count,status,contract_amount,estimated_cost,notes)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,[event.code,event.title,ids.clients.get(event.client_id),ids.leads.get(event.lead_id),
          ids.packages.get(event.package_id),event.event_date,event.venue,event.city,event.guest_count,event.status,event.contract_amount,event.estimated_cost,event.notes],conn);
      ids.events.set(event.id, r.insertId);
    }
    for (const task of showcase.tasks) await execSql('INSERT INTO tasks(event_id,title,category,due_at,assigned_to,priority,status) VALUES (?,?,?,?,?,?,?)',
      [ids.events.get(task.event_id),task.title,task.category,task.due_at,task.assigned_to,task.priority,task.status],conn);
    for (const vendor of showcase.event_vendors) await execSql('INSERT INTO event_vendors(event_id,vendor_id,service_name,agreed_price,status,notes) VALUES (?,?,?,?,?,?)',
      [ids.events.get(vendor.event_id),ids.vendors.get(vendor.vendor_id),vendor.service_name,vendor.agreed_price,vendor.status,vendor.notes],conn);
    for (const person of showcase.event_staff) await execSql('INSERT INTO event_staff(event_id,staff_id,assignment,fee) VALUES (?,?,?,?)',
      [ids.events.get(person.event_id),ids.staff.get(person.staff_id),person.assignment,person.fee],conn);

    const invoiceByNumber = new Map<string, number>(), billByNumber = new Map<string, number>();
    for (const invoice of showcase.invoices) {
      const r = await execSql('INSERT INTO invoices(event_id,number,amount,due_date,description) VALUES (?,?,?,?,?)',
        [ids.events.get(invoice.event_id),invoice.number,invoice.amount,invoice.due_date,invoice.description],conn);
      invoiceByNumber.set(invoice.number, r.insertId);
    }
    for (const bill of showcase.bills) {
      const r = await execSql('INSERT INTO bills(event_id,vendor_id,number,description,amount,due_date,expense_account_code) VALUES (?,?,?,?,?,?,?)',
        [ids.events.get(bill.event_id),ids.vendors.get(bill.vendor_id),bill.number,bill.description,bill.amount,bill.due_date,bill.expense_account_code],conn);
      billByNumber.set(bill.number, r.insertId);
    }
    const paymentIndex = new Map<string, number>();
    for (const entry of showcase.journals) {
      const invoiceId = entry.reference_number ? invoiceByNumber.get(entry.reference_number) : undefined;
      const billId = entry.reference_number ? billByNumber.get(entry.reference_number) : undefined;
      const sourceEvent = showcase.events.find(event => event.code === entry.reference_number);
      const reference_id = invoiceId ?? billId ?? (sourceEvent ? ids.events.get(sourceEvent.id) : null) ?? null;
      const journalId = await postJournal(conn, {
        date: entry.date, description: entry.description, reference_type: entry.reference_type,
        cash_flow: entry.cash_flow, reference_id, user_id: userId,
        lines: entry.lines.map(line => ({ ...line, event_id: line.event_id ? ids.events.get(line.event_id) : null }))
      });
      if (entry.reference_type === 'invoice_payment' && invoiceId) {
        const invoice = showcase.invoices.find(x => x.number === entry.reference_number)!;
        const index = paymentIndex.get(`i${invoiceId}`) || 0, p = invoice.payments[index];
        if (!p) throw new Error(`Pembayaran invoice ${invoice.number} tidak cocok.`);
        await execSql('INSERT INTO invoice_payments(invoice_id,amount,method,paid_at,reference,journal_id) VALUES (?,?,?,?,?,?)',
          [invoiceId,p.amount,p.method,p.paid_at,p.reference,journalId],conn);
        paymentIndex.set(`i${invoiceId}`,index + 1);
      }
      if (entry.reference_type === 'bill_payment' && billId) {
        const bill = showcase.bills.find(x => x.number === entry.reference_number)!;
        const index = paymentIndex.get(`b${billId}`) || 0, p = bill.payments[index];
        if (!p) throw new Error(`Pembayaran tagihan ${bill.number} tidak cocok.`);
        await execSql('INSERT INTO bill_payments(bill_id,amount,method,paid_at,reference,journal_id) VALUES (?,?,?,?,?,?)',
          [billId,p.amount,p.method,p.paid_at,p.reference,journalId],conn);
        paymentIndex.set(`b${billId}`,index + 1);
      }
    }
    console.log(`Data Wedding-In tersimpan: ${showcase.events.length} wedding, ${showcase.leads.length} leads, ${showcase.vendors.length} vendor, ${showcase.invoices.length} invoice, ${showcase.bills.length} tagihan, ${showcase.journals.length} jurnal.`);
  });
}

try { await run(); }
catch (error) { console.error('Seeder demo dibatalkan tanpa perubahan data:',(error as Error).message);process.exitCode = 1; }
finally { await pool.end(); }
