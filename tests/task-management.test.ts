import test from 'node:test';
import assert from 'node:assert/strict';
import {buildShowcase} from '../src/showcase.js';
import {demoRequest} from '../src/demo.js';

test('checklist bisa diedit lengkap, tampil di kalender, lalu dihapus tanpa merusak wedding lain', async()=>{
  const demo=buildShowcase(new Date(2026,9,27,12));
  const stored=new Map<string,string>([['weddingin_showcase_v2',JSON.stringify(demo)]]);
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
    getItem:(key:string)=>stored.get(key)??null,
    setItem:(key:string,val:string)=>{stored.set(key,val);},
    removeItem:(key:string)=>{stored.delete(key);}
  }});
  const chosen=demo.tasks.find(task=>task.event_id===6);
  assert.ok(chosen);
  const originalCount=demo.tasks.length;
  const updated={title:'Technical meeting vendor - sesi final',category:'Koordinasi',
    assigned_to:'Reni Kurnia',due_at:'2026-12-02 13:30:00',priority:'high',status:'progress'};
  assert.deepEqual(await demoRequest(`/tasks/${chosen.id}`,{method:'PATCH',body:JSON.stringify(updated)}),{ok:true});
  const detail=await demoRequest('/events/6');
  assert.deepEqual(Object.fromEntries(Object.keys(updated).map(k=>[k,detail.tasks.find((t:any)=>t.id===chosen.id)[k]])),updated);
  const calendar=await demoRequest('/calendar?month=2026-12');
  assert.ok(calendar.data.some((row:any)=>row.kind==='task'&&row.id===chosen.id&&row.date==='2026-12-02'&&row.time==='13:30'));
  assert.deepEqual(await demoRequest(`/tasks/${chosen.id}`,{method:'DELETE'}),{ok:true});
  assert.ok(!(await demoRequest('/events/6')).tasks.some((row:any)=>row.id===chosen.id));
  assert.ok(!(await demoRequest('/calendar?month=2026-12')).data.some((row:any)=>row.kind==='task'&&row.id===chosen.id));
  const after=JSON.parse(stored.get('weddingin_showcase_v2')!);
  assert.equal(after.tasks.length,originalCount-1);
  assert.ok(after.tasks.some((row:any)=>row.event_id!==6));
  await assert.rejects(()=>demoRequest(`/tasks/${chosen.id}`,{method:'DELETE'}),/tidak ditemukan/i);
  await assert.rejects(()=>demoRequest(`/tasks/${chosen.id}`,{method:'PATCH',body:JSON.stringify(updated)}),/tidak ditemukan/i);
});
