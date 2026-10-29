import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {aggregateQuote,cents,multiply,quantityMilli,toMoney} from '../server/modules/commercial/pricing.js';

test('kalkulasi hybrid memisahkan kontrak WO dan pembayaran vendor langsung',()=>{
  const totals=aggregateQuote([
    {fulfillment:'internal',sell_net:'35000000.00',cost_total:'24500000.00',discount_amount:'0.00'},
    {fulfillment:'managed_vendor',sell_net:'27000000.00',cost_total:'22000000.00',discount_amount:'1000000.00'},
    {fulfillment:'client_direct',sell_net:'3000000.00',cost_total:'0.00',discount_amount:'0.00'}
  ]);
  assert.equal(totals.contract_total,'62000000.00');
  assert.equal(totals.client_budget_total,'65000000.00');
  assert.equal(totals.cost_est_total,'46500000.00');
  assert.equal(totals.gross_profit_est,'15500000.00');
  assert.equal(totals.margin_pct,25);
  assert.equal(totals.subtotal_direct,'3000000.00');
});

test('kuantitas desimal dikalikan secara presisi tanpa kesalahan floating-point',()=>{
  assert.equal(toMoney(multiply(quantityMilli('1.125'),cents('100000.00'))),'112500.00');
  assert.equal(toMoney(multiply(quantityMilli('0.001'),cents('900.00'))),'0.90');
});

test('validasi kuantitas menolak nol, minus dan lebih dari tiga desimal',()=>{
  for(const qty of ['0','-1','1.0001','1e3','1,5'])
    assert.throws(()=>quantityMilli(qty));
});

test('pembayaran vendor langsung tidak mengurangi gross profit WO',()=>{
  const totals=aggregateQuote([
    {fulfillment:'client_direct',sell_net:'13000000.00',cost_total:'12000000.00',discount_amount:'0.00'}
  ]);
  assert.equal(totals.contract_total,'0.00');
  assert.equal(totals.client_budget_total,'13000000.00');
  assert.equal(totals.cost_est_total,'0.00');
  assert.equal(totals.margin_pct,null);
});

test('migrasi hybrid aman dipisah dengan pemisah semicolon milik migration runner',()=>{
  for(const filename of ['004_commercial_core.sql','005_backoffice_register.sql']){
    const contents=readFileSync(resolve('sql',filename),'utf8');
    const commands=contents.split(';').map(x=>x.trim()).filter(Boolean);
    assert.ok(commands.length>=5,`${filename}: migrasi perlu berisi tabel`);
    for(const statement of commands){
      const withoutLeadingComment=statement.replace(/^--[^\n]*\n/,'').trim();
      assert.match(withoutLeadingComment,/^CREATE TABLE IF NOT EXISTS\s+\w+/i,
        `${filename}: semua bagian SQL harus merupakan CREATE TABLE lengkap`);
      assert.match(withoutLeadingComment,/\) ENGINE=InnoDB\s*$/i);
    }
  }
});
