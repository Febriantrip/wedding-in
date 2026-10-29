// Satu sumber data untuk mode demo browser dan seeder MySQL.
// Semua identitas, harga, dan transaksi di sini adalah FIKTIF.
export type ShowcaseRow = Record<string, any>;
export type ShowcasePayment = { amount: number; paid_at: string; method: 'bank' | 'cash'; reference: string; cancel_reason?:string };
export type ShowcaseInvoice = ShowcaseRow & { payments: ShowcasePayment[] };
export type ShowcaseJournal = {
  date: string; description: string; reference_type: string; reference_number?: string;
  cash_flow: 'operating' | 'investing' | 'financing' | 'opening' | 'none';
  lines: { code: string; debit?: number; credit?: number; event_id?: number | null }[];
};

export const showcaseAccounts = [
  ['1000', 'Kas', 'asset', 1], ['1010', 'Bank Operasional', 'asset', 1],
  ['1100', 'Piutang Klien', 'asset', 0], ['1300', 'Uang Muka Vendor', 'asset', 0],
  ['1500', 'Peralatan & Aset Tetap', 'asset', 0], ['2000', 'Utang Vendor', 'liability', 0],
  ['2100', 'Uang Muka Pelanggan', 'liability', 0], ['3000', 'Modal Disetor', 'equity', 0],
  ['3100', 'Saldo Laba Tahun Lalu', 'equity', 0], ['4000', 'Pendapatan Wedding', 'revenue', 0],
  ['4100', 'Pendapatan Tambahan', 'revenue', 0], ['5000', 'Biaya Vendor Event', 'cogs', 0],
  ['5100', 'Biaya Crew Event', 'cogs', 0], ['5200', 'Biaya Dekorasi', 'cogs', 0],
  ['6000', 'Beban Operasional', 'expense', 0], ['6100', 'Beban Gaji', 'expense', 0],
  ['6200', 'Beban Marketing', 'expense', 0]
] as const;

const dateOffset = (days: number, origin: Date) => {
  const d = new Date(origin.getFullYear(), origin.getMonth(), origin.getDate() + days, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dt = (days: number, origin: Date) => `${dateOffset(days, origin)} 09:00:00`;
const makePayment = (amount: number, days: number, ref: string, origin: Date, method: 'bank' | 'cash' = 'bank'): ShowcasePayment =>
  ({ amount, paid_at: dateOffset(days, origin), reference: ref, method });

export function buildShowcase(origin = new Date()) {
  const day = (offset: number) => dateOffset(offset, origin);
  const clients: ShowcaseRow[] = [
    ['Nadia Putri', 'Fajar Rahman'], ['Alya Zahra', 'Rizky Pratama'],
    ['Dinda Maharani', 'Reza Mahendra'], ['Michelle Clarissa', 'Daniel Wijaya'],
    ['Salsa Amelia', 'Andra Prakoso'], ['Intan Permata', 'Raka Nugraha'],
    ['Vania Oktavia', 'Kevin Adrian'], ['Putri Larasati', 'Bagas Saputra']
  ].map(([name, partner_name], i) => ({ id: i + 1, name, partner_name, phone: `08123${String(4500010 + i * 79)}`, email: `klien${i + 1}@contoh.invalid`, address: 'Bandung, Jawa Barat' }));

  const packages: ShowcaseRow[] = [
    { id: 1, name: 'Intimate Story', description: 'Koordinasi acara intim 100–200 tamu', price: 28000000, inclusions: ['WO hari-H', '6 crew', 'Rundown dan technical meeting'], active: 1 },
    { id: 2, name: 'Signature Celebration', description: 'Perencanaan dan koordinasi menyeluruh', price: 88000000, inclusions: ['Wedding planner', '10 crew', 'Koordinasi vendor dan keluarga'], active: 1 },
    { id: 3, name: 'Grand Elegance', description: 'Produksi resepsi premium 500+ tamu', price: 155000000, inclusions: ['Full planning', '15 crew', 'Manajemen logistik dan VIP'], active: 1 },
    { id: 4, name: 'Cultural Heritage', description: 'Wedding adat dengan prosesi lengkap', price: 110000000, inclusions: ['Adat consultant', 'Tim prosesi', 'Master rundown'], active: 1 }
  ];

  const eventTemplates = [
    { days: -112, venue: 'The Grand Ballroom', city: 'Bandung', guest_count: 500, status: 'completed', contract_amount: 188000000, estimated_cost: 121000000, package_id: 2 },
    { days: -71, venue: 'The Gaia Hotel', city: 'Bandung', guest_count: 380, status: 'completed', contract_amount: 235000000, estimated_cost: 154000000, package_id: 3 },
    { days: -26, venue: 'Sudirman Grand Hall', city: 'Bandung', guest_count: 650, status: 'completed', contract_amount: 148000000, estimated_cost: 102000000, package_id: 4 },
    { days: 8, venue: 'InterContinental Dago Pakar', city: 'Bandung', guest_count: 700, status: 'in_progress', contract_amount: 275000000, estimated_cost: 199000000, package_id: 3 },
    { days: 26, venue: 'Bumi Sangkuriang', city: 'Bandung', guest_count: 320, status: 'confirmed', contract_amount: 128000000, estimated_cost: 86000000, package_id: 2 },
    { days: 49, venue: 'Hotel Savoy Homann', city: 'Bandung', guest_count: 440, status: 'confirmed', contract_amount: 182000000, estimated_cost: 133000000, package_id: 4 },
    { days: 77, venue: 'The Trans Luxury Hotel', city: 'Bandung', guest_count: 600, status: 'planning', contract_amount: 228000000, estimated_cost: 164000000, package_id: 3 },
    { days: 103, venue: 'Pendopo Kota Baru Parahyangan', city: 'Bandung Barat', guest_count: 260, status: 'planning', contract_amount: 99000000, estimated_cost: 68000000, package_id: 1 }
  ];
  const events: ShowcaseRow[] = eventTemplates.map((row, i) => ({
    ...row, id: i + 1, code: `WIN-DEMO-${String(i + 1).padStart(3, '0')}`,
    title: `${clients[i].name.split(' ')[0]} & ${clients[i].partner_name.split(' ')[0]} Wedding`,
    client_id: i + 1, lead_id: i + 1, client_name: clients[i].name, partner_name: clients[i].partner_name,
    client_phone: clients[i].phone, event_date: day(row.days),
    notes: ['Modern classic ivory', 'Romantic garden', 'Adat Sunda kontemporer', 'Luxury modern gold', 'Earth-tone intimate', 'Tradisional elegan', 'Black-tie celebration', 'Rustic outdoor'][i]
  }));

  const leads: ShowcaseRow[] = clients.map((c, i) => ({
    id: i + 1, name: `${c.name.split(' ')[0]} & ${c.partner_name.split(' ')[0]}`, phone: c.phone,
    email: c.email, source: ['Instagram', 'Website', 'Referral', 'Wedding Expo'][i % 4],
    status: 'won', wedding_date: events[i].event_date, estimated_budget: events[i].contract_amount,
    notes: 'Lead contoh — sudah dikonversi ke wedding project'
  }));
  leads.push(
    { id: 9, name: 'Nabila & Irfan', phone: '081255501231', source: 'Instagram', status: 'proposal', wedding_date: day(130), estimated_budget: 165000000, notes: 'Menunggu revisi penawaran' },
    { id: 10, name: 'Celine & Marco', phone: '081255501232', source: 'Website', status: 'contacted', wedding_date: day(156), estimated_budget: 220000000, notes: 'Sudah jadwal konsultasi' },
    { id: 11, name: 'Tania & Bimo', phone: '081255501233', source: 'Wedding Expo', status: 'new', wedding_date: day(180), estimated_budget: 95000000, notes: 'Baru masuk dari pameran' }
  );

  const vendors: ShowcaseRow[] = [
    ['Maison Floral Studio', 'Dekorasi', 34000000, 'Risa'], ['Lumina Visual', 'Dokumentasi', 18000000, 'Ardi'],
    ['Gourmet Catering', 'Catering', 52000000, 'Wina'], ['Andante Music', 'Entertainment', 12500000, 'Rafi'],
    ['Ivory Bridal', 'Busana & MUA', 22000000, 'Cindy'], ['Aura Lighting', 'Lighting & Sound', 16000000, 'Danu'],
    ['Grace Invitation', 'Undangan & Suvenir', 9000000, 'Dina'], ['Mandala Tradisi', 'Adat & Prosesi', 15500000, 'Dewi']
  ].map(([name, category, base_price, contact_person], i) => ({
    id: i + 1, name, category, base_price, contact_person, phone: `08127890${String(2000 + i)}`,
    email: `vendor${i + 1}@contoh.invalid`, city: 'Bandung', active: 1, notes: 'Partner contoh Wedding-In'
  }));
  const staff: ShowcaseRow[] = [
    ['Putri Amanda', 'Lead Coordinator', 850000], ['Daffa Ramadhan', 'Floor Coordinator', 650000],
    ['Citra Wulandari', 'Bride Assistant', 550000], ['Farhan Akbar', 'Groom Assistant', 550000],
    ['Reni Kurnia', 'Vendor Liaison', 600000], ['Bagas Pratama', 'Logistic Crew', 500000],
    ['Wulan Prameswari', 'Family Liaison', 620000]
  ].map(([name, position, daily_rate], i) => ({ id: i + 1, name, position, daily_rate, phone: `08126677${String(3100 + i)}`, active: 1 }));

  const tasks: ShowcaseRow[] = [];
  const event_vendors: ShowcaseRow[] = [];
  const event_staff: ShowcaseRow[] = [];
  for (const event of events) {
    const completed = event.status === 'completed';
    const eventDays = eventTemplates[event.id - 1].days;
    const milestones: [string, string, number, string, string][] = [
      ['Brief klien & konsep', 'Perencanaan', -70, 'Putri Amanda', 'high'],
      ['Konfirmasi dekorasi & katering', 'Vendor', -35, 'Reni Kurnia', 'high'],
      ['Technical meeting seluruh vendor', 'Persiapan', -14, 'Daffa Ramadhan', 'medium'],
      ['Finalisasi rundown keluarga', 'Rundown', -5, 'Citra Wulandari', 'high'],
      ['Final check dan briefing crew', 'Operasional', -1, 'Bagas Pratama', 'high']
    ];
    milestones.forEach(([title, category, before, assigned_to, priority], index) => {
      const due_at = dt(eventDays + before, origin);
      const status = completed || eventDays + before < -10 ? 'done' : eventDays + before < 0 ? 'progress' : 'todo';
      tasks.push({ id: tasks.length + 1, event_id: event.id, title, category, due_at, assigned_to, priority, status });
    });
    const selection = [1, 2, 3, 4, 5, 6, 7, 8].slice((event.id - 1) % 4, ((event.id - 1) % 4) + 3);
    for (const vid of selection) event_vendors.push({
      id: event_vendors.length + 1, event_id: event.id, vendor_id: vid,
      vendor_name: vendors[vid - 1].name, category: vendors[vid - 1].category,
      service_name: vendors[vid - 1].category, agreed_price: vendors[vid - 1].base_price,
      status: completed ? 'completed' : event.id < 7 ? 'confirmed' : 'booked', notes: 'Simulasi penugasan vendor'
    });
    for (const sid of [1, 2, 3]) event_staff.push({
      id: event_staff.length + 1, event_id: event.id, staff_id: sid,
      staff_name: staff[sid - 1].name, position: staff[sid - 1].position,
      assignment: sid === 1 ? 'PIC utama' : sid === 2 ? 'Floor & rundown' : 'Assistant pengantin',
      fee: staff[sid - 1].daily_rate
    });
  }

  const journals: ShowcaseJournal[] = [];
  const record = (date: string, description: string, reference_type: string, cash_flow: ShowcaseJournal['cash_flow'],
    lines: ShowcaseJournal['lines'], reference_number?: string) => journals.push({ date, description, reference_type, cash_flow, lines, reference_number });
  record(day(-180), 'Setoran modal awal Wedding-In (simulasi)', 'demo_showcase', 'financing',
    [{ code: '1010', debit: 280000000 }, { code: '3000', credit: 280000000 }]);
  record(day(-160), 'Pembelian perangkat produksi & sound portable', 'demo_showcase', 'investing',
    [{ code: '1500', debit: 36000000 }, { code: '1010', credit: 36000000 }]);
  record(day(-45), 'Beban sewa studio dan operasional', 'demo_showcase', 'operating',
    [{ code: '6000', debit: 12000000 }, { code: '1010', credit: 12000000 }]);
  record(day(-20), 'Biaya promosi & konten digital', 'demo_showcase', 'operating',
    [{ code: '6200', debit: 6500000 }, { code: '1010', credit: 6500000 }]);
  record(day(-10), 'Pembayaran gaji kantor', 'demo_showcase', 'operating',
    [{ code: '6100', debit: 14000000 }, { code: '1010', credit: 14000000 }]);

  const invoices: ShowcaseInvoice[] = [];
  const completedTerms = [
    [56000000, 132000000], [70000000, 165000000], [44000000, 104000000]
  ];
  for (const event of events) {
    if (event.status === 'completed') {
      const [first, second] = completedTerms[event.id - 1];
      const offsets = eventTemplates[event.id - 1].days;
      for (const [term, amount, issued, due, paymentInfo] of [
        ['DP Booking', first, offsets - 85, offsets - 76, [[first, offsets - 75, 'bank']]],
        ['Pelunasan Wedding', second, offsets - 28, offsets - 8, event.id === 3 ? [[second / 2, offsets - 3, 'bank']] : [[second, offsets - 7, 'bank']]]
      ] as [string, number, number, number, [number, number, 'bank' | 'cash'][]][]) {
        const number = `WIN-INV-${String(invoices.length + 1).padStart(3, '0')}`;
        const payments = paymentInfo.map(([value, offset, method], i) => makePayment(value, offset, `${number}-TRF-${i + 1}`, origin, method));
        invoices.push({ id: invoices.length + 1, event_id: event.id, event_title: event.title,
          client_name: event.client_name, number, amount, due_date: day(due), issued_at: day(issued), description: term, payments,
          paid: payments.reduce((sum, p) => sum + p.amount, 0) });
      }
    } else {
      const amount = Math.round(event.contract_amount * 0.3);
      const number = `WIN-INV-${String(invoices.length + 1).padStart(3, '0')}`;
      const offset = event.id === 4 ? -28 : event.id === 5 ? -13 : event.id === 6 ? -9 : event.id === 7 ? -6 : -4;
      const paidAmount = event.id === 7 ? 0 : event.id === 8 ? Math.round(amount / 2) : amount;
      const payments = paidAmount ? [makePayment(paidAmount, offset + 3, `${number}-TRF`, origin)] : [];
      invoices.push({ id: invoices.length + 1, event_id: event.id, event_title: event.title,
        client_name: event.client_name, number, amount, due_date: day(offset + 12), issued_at: day(offset),
        description: 'DP Booking', payments, paid: paidAmount });
    }
  }

  const bills: ShowcaseInvoice[] = [];
  const billSpecs = [
    [1, 1, 5200, 43000000, 43000000, -100], [1, 3, 5000, 62000000, 62000000, -98],
    [2, 1, 5200, 57000000, 57000000, -64], [2, 3, 5000, 76000000, 76000000, -63],
    [3, 8, 5000, 28000000, 28000000, -21], [3, 3, 5000, 48000000, 24000000, -19],
    [4, 1, 5200, 48000000, 24000000, -13], [4, 3, 5000, 79000000, 32000000, -12],
    [5, 2, 5000, 17000000, 0, -7], [6, 8, 5000, 24500000, 10000000, -5]
  ] as const;
  for (const [eid, vid, account, amount, paidAmount, offset] of billSpecs) {
    const event = events[eid - 1], vendor = vendors[vid - 1];
    const number = `WIN-BILL-${String(bills.length + 1).padStart(3, '0')}`;
    const payments = paidAmount ? [makePayment(paidAmount, offset + 4, `${number}-TRF`, origin)] : [];
    bills.push({ id: bills.length + 1, event_id: eid, event_title: event.title,
      vendor_id: vid, vendor_name: vendor.name, number, description: `Jasa ${vendor.category} — ${event.title}`,
      amount, expense_account_code: String(account), due_date: day(offset + 17), issued_at: day(offset), payments,
      paid: paidAmount });
  }

  const financialActions = [
    ...invoices.flatMap(invoice => [
      { date: invoice.issued_at, kind: 'invoice' as const, row: invoice },
      ...invoice.payments.map(payment => ({ date: payment.paid_at, kind: 'invoice_payment' as const, row: invoice, payment }))
    ]),
    ...bills.flatMap(bill => [
      { date: bill.issued_at, kind: 'bill' as const, row: bill },
      ...bill.payments.map(payment => ({ date: payment.paid_at, kind: 'bill_payment' as const, row: bill, payment }))
    ])
  ].sort((a, b) => a.date.localeCompare(b.date));
  for (const action of financialActions) {
    const { row, date, kind } = action;
    if (kind === 'invoice') record(date, `Invoice ${row.number} — ${row.event_title}`, kind, 'none',
      [{ code: '1100', debit: row.amount, event_id: row.event_id },
        { code: date >= events[row.event_id - 1].event_date && events[row.event_id - 1].status === 'completed' ? '4000' : '2100', credit: row.amount, event_id: row.event_id }], row.number);
    if (kind === 'invoice_payment') record(date, `Penerimaan ${row.number}`, kind, 'operating',
      [{ code: action.payment!.method === 'bank' ? '1010' : '1000', debit: action.payment!.amount, event_id: row.event_id },
        { code: '1100', credit: action.payment!.amount, event_id: row.event_id }], row.number);
    if (kind === 'bill') record(date, `Tagihan vendor ${row.number}`, kind, 'none',
      [{ code: row.expense_account_code, debit: row.amount, event_id: row.event_id },
        { code: '2000', credit: row.amount, event_id: row.event_id }], row.number);
    if (kind === 'bill_payment') record(date, `Pembayaran ${row.number}`, kind, 'operating',
      [{ code: '2000', debit: action.payment!.amount, event_id: row.event_id },
        { code: action.payment!.method === 'bank' ? '1010' : '1000', credit: action.payment!.amount, event_id: row.event_id }], row.number);
  }
  for (const event of events.filter(e => e.status === 'completed')) {
    const unearned = invoices.filter(i => i.event_id === event.id && i.issued_at < event.event_date)
      .reduce((sum, i) => sum + Number(i.amount), 0);
    if (unearned > 0) record(event.event_date, `Pengakuan pendapatan saat ${event.title} selesai`, 'event_completion', 'none',
      [{ code: '2100', debit: unearned, event_id: event.id }, { code: '4000', credit: unearned, event_id: event.id }], event.code);
  }
  journals.sort((a, b) => a.date.localeCompare(b.date));

  return { clients, packages, events, leads, vendors, staff, tasks, event_vendors, event_staff, invoices, bills, journals };
}
