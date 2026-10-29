import test from 'node:test';
import assert from 'node:assert/strict';
import { moneyCents, decimal, validateJournalLines } from '../server/accounting.js';
test('nominal decimal disimpan akurat dalam sen',()=>{
  assert.equal(moneyCents('1250000.35'),125000035);
  assert.equal(decimal(125000035),'1250000.35');
});
test('nominal negatif, terlalu banyak digit pecahan, NaN ditolak',()=>{
  for(const bad of ['-10','5.001','NaN','1e5',''])assert.throws(()=>moneyCents(bad));
});
test('jurnal harus seimbang dan memiliki minimal dua baris',()=>{
  assert.equal(validateJournalLines([{code:'1010',debit:100000.25},{code:'3000',credit:100000.25}]),10000025);
  assert.throws(()=>validateJournalLines([{code:'1010',debit:100},{code:'3000',credit:99}]),/tidak seimbang/);
  assert.throws(()=>validateJournalLines([{code:'1010',debit:100,credit:100},{code:'3000',credit:100}]),/debit atau kredit/);
  assert.throws(()=>validateJournalLines([{code:'1010',debit:100}]),/minimal 2 baris/);
});
