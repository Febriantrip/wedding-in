import {test} from 'node:test';
import assert from 'node:assert/strict';
import {closingBlockers,type ClosingCounts} from '../server/modules/operations/closing-rules.js';

const clean:ClosingCounts={openTasks:0,pendingChanges:0,pendingExpenses:0,reversedExpenses:0,
  pendingBackoffice:0,unissuedTerms:0,invoiceGap:0,invoiceOutstanding:0,billOutstanding:0,unbilledVendors:0};

test('Project closing hanya siap setelah seluruh kontrol benar-benar bersih',()=>{
  assert.deepEqual(closingBlockers(clean),[]);
});

test('Checklist, vendor, invoice dan pengeluaran menahan penutupan proyek',()=>{
  const result=closingBlockers({...clean,openTasks:2,unbilledVendors:1,invoiceOutstanding:50000,
    pendingExpenses:1,pendingBackoffice:1});
  assert.equal(result.length,5);
  assert.ok(result.some(x=>x.includes('2 checklist')));
  assert.ok(result.some(x=>x.includes('vendor')));
  assert.ok(result.some(x=>x.includes('piutang')));
  assert.ok(result.some(x=>x.includes('Backoffice')));
});

test('Transaksi sudah reversed tidak dianggap pengeluaran terpenuhi',()=>{
  assert.ok(closingBlockers({...clean,reversedExpenses:1})[0].includes('dibalik'));
});

test('Change Order dan termin belum final mencegah closing',()=>{
  const result=closingBlockers({...clean,pendingChanges:1,unissuedTerms:2,invoiceGap:100});
  assert.equal(result.length,3);
  assert.ok(result.some(x=>x.includes('Change Order')));
  assert.ok(result.some(x=>x.includes('termin')));
});
