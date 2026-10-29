import test from 'node:test';
import assert from 'node:assert/strict';
import {isValidDateTime,validWindow,wouldCycle,shiftLocalDateTime} from '../server/modules/operations/execution-rules.js';

test('tanggal rundown menerima jam valid dan tanggal kabisat',()=>{
  assert.equal(isValidDateTime('2028-02-29 09:30:00'),true);
  assert.equal(isValidDateTime('2027-02-29 09:30:00'),false);
  assert.equal(isValidDateTime('2027-05-02 24:00:00'),false);
  assert.equal(isValidDateTime('2027-05-02 09:70:00'),false);
});
test('rundown tidak menerima durasi nol, mundur, atau lebih dari 24 jam',()=>{
  assert.equal(validWindow('2027-05-02 10:00:00','2027-05-02 10:00:00'),false);
  assert.equal(validWindow('2027-05-02 11:00:00','2027-05-02 10:00:00'),false);
  assert.equal(validWindow('2027-05-02 10:00:00','2027-05-03 10:01:00'),false);
  assert.equal(validWindow('2027-05-02 23:30:00','2027-05-03 00:30:00'),true);
});
test('dependensi tidak boleh siklus langsung atau tidak langsung',()=>{
  const links=new Map<number,number|null>([[1,2],[2,3],[3,null]]);
  assert.equal(wouldCycle(3,1,links),true);
  assert.equal(wouldCycle(3,3,links),true);
  assert.equal(wouldCycle(4,1,links),false);
});
test('pergeseran Gantt mempertahankan jam dan melewati pergantian bulan',()=>{
  assert.equal(shiftLocalDateTime('2027-01-31 09:15:00',1),'2027-02-01 09:15:00');
  assert.equal(shiftLocalDateTime('2027-03-01 11:00:00',-1),'2027-02-28 11:00:00');
  assert.equal(shiftLocalDateTime('2027-03-01 11:00:00',366),null);
});
