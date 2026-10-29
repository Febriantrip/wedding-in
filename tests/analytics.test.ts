import test from 'node:test';
import assert from 'node:assert/strict';
import {changePercent,getAnalytics,type AnalyticsEvent} from '../src/analytics-data.js';

const reference=new Date(2026,9,27,12);
const events:AnalyticsEvent[]=[
  {id:1,title:'Rina & Ardi',event_date:'2026-10-01',status:'completed',contract_amount:50_000_000,estimated_cost:30_000_000,total_tasks:10,completed_tasks:10},
  {id:2,title:'Laras & Bima',event_date:'2026-10-25',status:'planning',contract_amount:20_000_000,estimated_cost:12_000_000,total_tasks:5,completed_tasks:3},
  {id:3,title:'Batal',event_date:'2026-10-17',status:'cancelled',contract_amount:1_000_000_000,estimated_cost:1,total_tasks:1,completed_tasks:0},
  {id:4,title:'Tari & Seno',event_date:'2026-09-20',status:'completed',contract_amount:35_000_000,estimated_cost:20_000_000,total_tasks:8,completed_tasks:8},
  {id:5,title:'Intan & Raka',event_date:'2026-12-15',status:'planning',contract_amount:75_000_000,estimated_cost:42_000_000,total_tasks:12,completed_tasks:3}
];

test('Analytics 30 hari memakai data riil, menyaring pembatalan, dan membandingkan 30 hari sebelumnya',()=>{
  const result=getAnalytics(events,'30d','all',reference);
  assert.equal(result.current.weddings,2);
  assert.equal(result.current.totalContract,70_000_000);
  assert.equal(result.current.averageContract,35_000_000);
  assert.equal(result.current.marginPercent,40);
  assert.equal(result.current.taskPercent,13/15*100);
  assert.equal(result.previous.weddings,1);
  assert.equal(result.previous.totalContract,35_000_000);
  assert.equal(result.series.reduce((sum,point)=>sum+point.current,0),70_000_000);
  assert.equal(result.series.reduce((sum,point)=>sum+point.previous,0),35_000_000);
});

test('Segment aktif dan selesai tidak saling mencampur dan tidak memasukkan agenda luar rentang',()=>{
  const active=getAnalytics(events,'30d','active',reference);
  assert.deepEqual(active.events.map(item=>item.id),[2]);
  assert.equal(active.current.totalContract,20_000_000);
  const completed=getAnalytics(events,'30d','completed',reference);
  assert.deepEqual(completed.events.map(item=>item.id),[1]);
  assert.equal(completed.current.totalContract,50_000_000);
});

test('Tidak mengarang pertumbuhan ketika periode sebelumnya kosong',()=>{
  assert.equal(changePercent(0,0),0);
  assert.equal(changePercent(100,0),null);
  assert.equal(changePercent(50,100),-50);
  const empty=getAnalytics([],'7d','all',reference);
  assert.equal(empty.current.totalContract,0);
  assert.equal(empty.current.taskPercent,0);
  assert.ok(empty.series.every(point=>point.current===0&&point.previous===0));
});
