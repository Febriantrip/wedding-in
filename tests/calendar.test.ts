import test from 'node:test';
import assert from 'node:assert/strict';
import {buildShowcase} from '../src/showcase.js';
import {demoRequest} from '../src/demo.js';

test('kalender mengaitkan wedding, meeting vendor, dan task pada tanggal yang sama',async()=>{
  const demo=buildShowcase(new Date(2026,9,27,12));
  const technicalMeeting=demo.tasks.find(t=>t.title==='Technical meeting seluruh vendor'&&t.due_at.startsWith('2026-12-01'));
  assert.ok(technicalMeeting,'meeting untuk Intan & Raka harus jatuh pada 1 Desember');
  assert.equal(technicalMeeting.event_id,6);

  const saved=new Map<string,string>([['weddingin_showcase_v2',JSON.stringify(demo)]]);
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
    getItem:(key:string)=>saved.get(key)??null,
    setItem:(key:string,value:string)=>{saved.set(key,value);},
    removeItem:(key:string)=>{saved.delete(key);}
  }});
  const december=await demoRequest('/calendar?month=2026-12');
  assert.ok(december.data.some((item:any)=>item.kind==='wedding'&&item.event_id===6&&item.date==='2026-12-15'));
  const meeting=december.data.find((item:any)=>item.kind==='task'&&item.id===technicalMeeting.id);
  assert.equal(meeting.date,'2026-12-01');
  assert.equal(meeting.event_title,'Intan & Raka Wedding');
  assert.equal(meeting.time,'09:00');

  await demoRequest(`/tasks/${meeting.id}`,{method:'PATCH',body:JSON.stringify({status:'done'})});
  const updated=await demoRequest('/calendar?month=2026-12');
  assert.equal(updated.data.find((item:any)=>item.kind==='task'&&item.id===meeting.id).status,'done');

  await demoRequest('/events/6/tasks',{method:'POST',body:JSON.stringify({
    title:'Final cek seluruh vendor',category:'Vendor',assigned_to:'Daffa Ramadhan',
    due_at:'2026-12-01 14:00:00',priority:'high'
  })});
  const added=await demoRequest('/calendar?month=2026-12');
  assert.ok(added.data.some((item:any)=>item.kind==='task'&&item.title==='Final cek seluruh vendor'
    &&item.event_id===6&&item.time==='14:00'));
});

test('kalender menolak bulan tidak valid',async()=>{
  await assert.rejects(()=>demoRequest('/calendar?month=2026-19'),/Bulan kalender tidak valid/);
});
