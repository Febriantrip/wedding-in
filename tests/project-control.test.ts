import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateChange,applyApprovedChange} from '../server/modules/projects/calculations.js';

test('CO hybrid memisahkan kontrak WO dan vendor dibayar langsung klien',()=>{
  const result=calculateChange([
    {title:'Tambahan lighting',action:'add',fulfillment:'managed_vendor',quantity:'2',unit_sell:'2500000',unit_cost:'1600000'},
    {title:'Live streaming klien',action:'add',fulfillment:'client_direct',quantity:'1',unit_sell:'3500000',unit_cost:'3000000'}
  ]);
  assert.equal(result.delta_contract,'5000000.00');
  assert.equal(result.delta_cost,'3200000.00');
  assert.equal(result.delta_direct,'3500000.00');
  assert.equal(result.lines[1].delta_cost,'0.00');
});

test('CO pengurangan layanan menghasilkan delta negatif tanpa floating-point',()=>{
  const change=calculateChange([{title:'Kursi VIP',action:'remove',fulfillment:'internal',quantity:'1.125',unit_sell:'399.99',unit_cost:'200.11'}]);
  assert.equal(change.delta_contract,'-449.99');
  assert.equal(change.delta_cost,'-225.12');
});

test('Persetujuan CO memelihara uang dalam integer cents',()=>{
  const after=applyApprovedChange({contract:'50000000.00',cost:'35000000.00',direct:'2000000.00'},
    {delta_contract:'5000000.00',delta_cost:'3200000.00',delta_direct:'3500000.00'});
  assert.deepEqual(after,{contract:'55000000.00',cost:'38200000.00',direct:'5500000.00'});
});

test('CO ditolak jika anggaran menjadi negatif',()=>{
  assert.throws(()=>applyApprovedChange({contract:'1000.00',cost:'300.00',direct:'0.00'},
    {delta_contract:'-1200.00',delta_cost:'-300.00',delta_direct:'0.00'}),/negatif/);
});

test('Qty nol, minus, atau lebih dari 3 digit desimal ditolak',()=>{
  for(const qty of ['0','-1','1.0009'])assert.throws(()=>calculateChange([
    {title:'Layanan',action:'add',fulfillment:'managed_vendor',quantity:qty,unit_sell:'50',unit_cost:'20'}
  ]));
});
