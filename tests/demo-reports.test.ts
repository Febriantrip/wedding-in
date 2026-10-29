import test from 'node:test';
import assert from 'node:assert/strict';
import { demoRequest } from '../src/demo.js';

test('dashboard dan empat laporan mode demo selaras dengan transaksi', async () => {
  const saved = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => { saved.set(key, value); },
    removeItem: (key: string) => { saved.delete(key); }
  } });
  const dash = await demoRequest('/dashboard');
  assert.equal(dash.overview.total_events, 8);
  assert.ok(dash.overview.cash_balance > 0);
  assert.ok(dash.trend.length > 2);
  const sheet = await demoRequest('/reports/balance-sheet');
  const pnl = await demoRequest('/reports/income-statement');
  const cash = await demoRequest('/reports/cash-flow');
  const trial = await demoRequest('/reports/trial-balance');
  assert.equal(sheet.balanced, true);
  assert.equal(trial.balanced, true);
  assert.equal(sheet.total_assets, sheet.total_liabilities + sheet.total_equity);
  assert.equal(dash.overview.cash_balance, cash.ending_cash);
  assert.ok(pnl.revenue > 0 && pnl.net_profit > 0);
  const journal = await demoRequest('/finance/journals');
  assert.ok(journal.data.length > 50);

  const invoices = await demoRequest('/finance/invoices');
  const unpaid = invoices.data.find((x: any) => x.paid < x.amount);
  assert.ok(unpaid);
  const amount = Math.min(1000000, unpaid.amount - unpaid.paid);
  const today = new Date();
  const paidAt = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  await demoRequest(`/finance/invoices/${unpaid.id}/pay`, { method:'POST', body:JSON.stringify({ amount, paid_at: paidAt, method:'bank' }) });
  const after = await demoRequest('/reports/balance-sheet');
  const afterCash = await demoRequest('/reports/cash-flow');
  assert.equal(after.balanced, true);
  assert.equal(afterCash.ending_cash, cash.ending_cash + amount);
  assert.equal(after.total_assets, sheet.total_assets);
  assert.equal(after.assets.find((x: any) => x.code === '1100').balance,
    sheet.assets.find((x: any) => x.code === '1100').balance - amount);
});
