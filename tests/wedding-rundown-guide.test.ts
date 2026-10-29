import test from 'node:test';
import assert from 'node:assert/strict';
import {appointmentOn,cloneTemplate,defaultRunTemplate} from '../server/modules/operations/rundown-template-data.js';
import {renderRundownDocument} from '../src/components/operations/rundown-print.js';
import {demoRequest} from '../src/demo.js';

test('master Wedding-In tidak dimutasi ketika data klien diisi',()=>{
  const before=JSON.stringify(defaultRunTemplate);
  const first=cloneTemplate(defaultRunTemplate,{bride:'Klien Pertama',groom:'Pasangan Pertama',date:'2026-12-12'});
  first[0].fields[0].value='EDIT MANUAL';
  const second=cloneTemplate(defaultRunTemplate,{bride:'Klien Kedua',date:'2027-01-01'});
  assert.equal(JSON.stringify(defaultRunTemplate),before);
  assert.ok(second[0].fields.some(f=>f.key==='bride_name'&&f.value==='Klien Kedua'));
  assert.ok(!second.some(s=>s.fields.some(f=>f.value==='EDIT MANUAL')));
});

test('template rundown memuat jam akad, persiapan, dan resepsi seperti referensi',()=>{
  assert.ok(defaultRunTemplate.rows.length>=20);
  assert.ok(defaultRunTemplate.rows.some(r=>r.title==='Prosesi Akad Nikah'&&r.start==='08:10'&&r.end==='08:30'));
  assert.ok(defaultRunTemplate.rows.some(r=>r.title==='Acara Resepsi'&&r.start==='11:30'&&r.end==='14:00'));
  assert.equal(appointmentOn('2026-12-12','08:30'),'2026-12-12 08:30:00');
  assert.throws(()=>appointmentOn('2026-12-12','8:30'));
});

test('biodata dan VIP disertakan dalam halaman awal/akhir PDF, HTML disanitasi',()=>{
  const guide=cloneTemplate(defaultRunTemplate,{bride:'Alya <script>alert(1)</script>',groom:'Rizky',date:'2026-12-12'});
  const vip=guide.find(s=>s.id==='vip')!;vip.fields[0].value='Keluarga besar CPW';
  const html=renderRundownDocument({title:'Alya & Rizky',event_date:'2026-12-12',venue:'Bandung'},guide,[{
    id:1,title:'Akad',segment:'ceremony',planned_start:'2026-12-12 08:00:00',planned_end:'2026-12-12 08:30:00',
    run_detail:'Ijab kabul',pic_text:'MC / KUA',technical_note:'Mic siap'}]);
  assert.match(html,/DATA CALON PENGANTIN/);
  assert.match(html,/KEPANITIAAN ACARA/);
  assert.match(html,/INFORMASI &amp; PERLENGKAPAN ACARA/);
  assert.match(html,/DAFTAR TAMU VIP/);
  assert.match(html,/RANGKAIAN ACARA/);
  assert.match(html,/Keluarga besar CPW/);
  assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
  assert.match(html,/Alya &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html,/@page\{size:A4 landscape/);
});

test('preview mode demo menampilkan template read-only, rundown referensi, dan insiden monitoring',async()=>{
  const list=await demoRequest('/projects/rundown-templates');
  assert.equal(list.templates.length,1);
  const events=await demoRequest('/events');
  const eventId=Number(events.data?.[0]?.id??events[0]?.id??1);
  const guide=await demoRequest(`/projects/${eventId}/rundown-profile`);
  const rundown=await demoRequest(`/projects/${eventId}/rundown`);
  const monitor=await demoRequest(`/projects/${eventId}/monitor`);
  assert.ok(guide.profile.sections.length>=5);
  assert.equal(rundown.items.length,defaultRunTemplate.rows.length);
  assert.ok(monitor.incidents.some((i:{status:string})=>i.status==='open'));
  await assert.rejects(()=>demoRequest(`/projects/${eventId}/rundown`,{method:'POST'}),/hanya pratinjau/);
});
