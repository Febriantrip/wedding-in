import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShowcase, showcaseAccounts } from '../src/showcase.js';
import { validateJournalLines } from '../server/accounting.js';

const basis = new Date(2026, 9, 27, 12);
const data = buildShowcase(basis);

test('semua menu memiliki data demo lintas relasi', () => {
  assert.equal(data.events.length, 8);
  assert.ok(data.leads.length > data.events.length);
  assert.ok(data.clients.length > 0 && data.vendors.length >= 8 && data.staff.length >= 6);
  assert.ok(data.packages.length >= 4 && data.tasks.length >= 30);
  assert.ok(data.event_vendors.length >= 16 && data.event_staff.length >= 16);
  assert.ok(data.invoices.length >= 10 && data.bills.length >= 8 && data.journals.length >= 30);
  assert.ok(data.invoices.some(i => i.paid > 0 && i.paid < i.amount));
  assert.ok(data.invoices.some(i => i.paid === i.amount));
  assert.ok(data.bills.some(b => b.paid < b.amount));
  for (const event of data.events) {
    assert.ok(data.clients.some(c => c.id === event.client_id));
    assert.ok(data.leads.some(c => c.id === event.lead_id));
    assert.ok(data.tasks.some(t => t.event_id === event.id));
    assert.ok(data.event_vendors.some(v => v.event_id === event.id));
    assert.ok(data.event_staff.some(v => v.event_id === event.id));
  }
});

test('setiap jurnal demo seimbang dan semua akun tersedia', () => {
  const chart = new Set(showcaseAccounts.map(a => a[0]));
  for (const entry of data.journals) {
    validateJournalLines(entry.lines);
    for (const line of entry.lines) assert.ok(chart.has(line.code as never), `${entry.description} — ${line.code}`);
  }
});

test('invoice, vendor bill, dan buku besar selalu rekonsiliasi', () => {
  const debitMinusCredit = new Map<string, number>();
  for (const entry of data.journals) for (const line of entry.lines) {
    debitMinusCredit.set(line.code, (debitMinusCredit.get(line.code) || 0) + (line.debit || 0) - (line.credit || 0));
  }
  const invoiced = data.invoices.reduce((n, row) => n + row.amount, 0);
  const received = data.invoices.reduce((n, row) => n + row.paid, 0);
  const billed = data.bills.reduce((n, row) => n + row.amount, 0);
  const disbursed = data.bills.reduce((n, row) => n + row.paid, 0);
  assert.equal(debitMinusCredit.get('1100'), invoiced - received);
  assert.equal(-(debitMinusCredit.get('2000') || 0), billed - disbursed);
  const assets = [...debitMinusCredit].filter(([code]) => showcaseAccounts.find(a => a[0] === code)?.[2] === 'asset')
    .reduce((n, [, value]) => n + value, 0);
  const liabilitiesEquity = [...debitMinusCredit].filter(([code]) => ['liability', 'equity'].includes(showcaseAccounts.find(a => a[0] === code)?.[2] || ''))
    .reduce((n, [, value]) => n - value, 0);
  const revenue = [...debitMinusCredit].filter(([code]) => showcaseAccounts.find(a => a[0] === code)?.[2] === 'revenue')
    .reduce((n, [, value]) => n - value, 0);
  const costs = [...debitMinusCredit].filter(([code]) => ['cogs', 'expense'].includes(showcaseAccounts.find(a => a[0] === code)?.[2] || ''))
    .reduce((n, [, value]) => n + value, 0);
  assert.equal(assets, liabilitiesEquity + revenue - costs);
  assert.ok(revenue > costs, 'Data showcase menampilkan laba positif untuk contoh');
});
