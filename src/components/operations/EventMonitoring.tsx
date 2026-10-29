import {useEffect,useMemo,useState} from 'react';
import {AlertTriangle,CheckCircle2,Clock3,Flag,Plus,ShieldCheck,Timer,UsersRound} from 'lucide-react';
import {post} from '../../api';
import type {OpsProps,Row} from './types';

const wibNow=()=>new Date().toLocaleString('sv-SE',{timeZone:'Asia/Jakarta',hour12:false}).replace('T',' ');
const hour=(v:string)=>String(v??'').slice(11,16);
const severity:Record<string,string>={low:'Rendah',medium:'Sedang',high:'Tinggi'};

export default function EventMonitoring({eventId,data,locked,canEdit,reload,notice}:OpsProps){
  const [clock,setClock]=useState(wibNow),[busy,setBusy]=useState(false),[entry,setEntry]=useState(false);
  const [form,setForm]=useState({title:'',description:'',severity:'medium',rundown_item_id:''});
  useEffect(()=>{const timer=window.setInterval(()=>{setClock(wibNow());if(document.visibilityState==='visible')void reload().catch(()=>{});},60000);
    return()=>window.clearInterval(timer);},[reload]);
  const activities=(data?.rundown??[]) as Row[],incidents=(data?.incidents??[]) as Row[];
  const crew=(data?.crew??[]) as Row[],vendors=(data?.vendors??[]) as Row[];
  const active=activities.filter(i=>i.status==='ongoing'),upcoming=activities.find(i=>i.status==='scheduled'&&String(i.planned_start)>clock);
  const overdue=activities.filter(i=>i.status==='scheduled'&&String(i.planned_end)<clock);
  const ready=[...crew,...vendors].filter(t=>t.presence?.state==='ready').length;
  const open=incidents.filter(i=>i.status==='open'),high=open.filter(i=>i.severity==='high');
  const progress=activities.length?Math.round(activities.filter(i=>i.status==='done').length/activities.length*100):0;
  const conflicts=useMemo(()=>activities.filter(i=>i.status==='ongoing'&&String(i.planned_end)<clock),[activities,clock]);
  async function addIncident(){setBusy(true);try{await post(`/projects/${eventId}/incidents`,{
    title:form.title,description:form.description,severity:form.severity,rundown_item_id:form.rundown_item_id?Number(form.rundown_item_id):null});
    await reload();setEntry(false);setForm({title:'',description:'',severity:'medium',rundown_item_id:''});notice('Kendala berhasil dicatat.');}
    catch(e){notice((e as Error).message,true);}finally{setBusy(false);}}
  async function resolve(item:Row){const resolution=window.prompt(`Bagaimana kendala "${item.title}" diselesaikan?`);
    if(resolution===null)return;if(resolution.trim().length<8){notice('Penyelesaian minimal 8 karakter.',true);return;}
    setBusy(true);try{await post(`/projects/${eventId}/incidents/${item.id}/resolve`,{resolution:resolution.trim()});await reload();
      notice('Kendala ditandai selesai.');}catch(e){notice((e as Error).message,true);}finally{setBusy(false);}}
  return <section className="pc-card"><div className="pc-head"><div><span className="pc-kicker">LIVE EVENT COMMAND CENTER</span><h3>Monitoring Hari-H</h3>
    <p>Ringkasan realisasi rundown, kesiapan tim, dan kendala lapangan. Pembaruan otomatis setiap 60 detik saat tab aktif.</p></div>
    <span className="monitor-clock"><Clock3 size={16}/>{clock.slice(11,16)} WIB</span></div>
    <div className="monitor-kpis"><div><small>Progres kegiatan</small><strong>{progress}%</strong><span>{activities.filter(i=>i.status==='done').length}/{activities.length} selesai</span></div>
      <div><small>Tim siap</small><strong>{ready}/{crew.length+vendors.length}</strong><span>crew & vendor</span></div>
      <div className={overdue.length||conflicts.length?'risk':''}><small>Kegiatan terlambat</small><strong>{overdue.length+conflicts.length}</strong><span>perlu perhatian</span></div>
      <div className={high.length?'risk':''}><small>Kendala terbuka</small><strong>{open.length}</strong><span>{high.length} prioritas tinggi</span></div></div>
    <div className="monitor-dual"><div className="monitor-panel"><div className="monitor-panel-title"><Timer size={17}/><h4>Sedang berlangsung</h4></div>
      {active.length?active.map(i=><div key={i.id} className="monitor-activity"><strong>{i.title}</strong><span>{hour(i.planned_start)} – {hour(i.planned_end)}</span></div>):
        <p className="pc-empty">Tidak ada kegiatan berstatus berlangsung.</p>}
      <div className="monitor-panel-title"><Flag size={17}/><h4>Kegiatan berikutnya</h4></div>
      {upcoming?<div className="monitor-activity"><strong>{upcoming.title}</strong><span>{String(upcoming.planned_start).slice(0,16)}</span></div>:<p className="pc-empty">Tidak ada kegiatan terjadwal berikutnya.</p>}</div>
      <div className="monitor-panel"><div className="monitor-panel-title"><AlertTriangle size={17}/><h4>Kendala operasional</h4>
        {canEdit&&!locked&&<button type="button" className="pc-btn ghost" onClick={()=>setEntry(v=>!v)}><Plus size={14}/> Catat kendala</button>}</div>
        {entry&&<div className="monitor-incident-form"><label>Judul<input maxLength={180} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
          <label>Prioritas<select value={form.severity} onChange={e=>setForm({...form,severity:e.target.value})}>
            <option value="low">Rendah</option><option value="medium">Sedang</option><option value="high">Tinggi</option></select></label>
          <label>Aktivitas terkait<select value={form.rundown_item_id} onChange={e=>setForm({...form,rundown_item_id:e.target.value})}>
            <option value="">Tidak terkait</option>{activities.map(i=><option key={i.id} value={i.id}>{i.title}</option>)}</select></label>
          <label>Uraian<textarea rows={3} maxLength={800} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
          <button className="pc-btn" disabled={busy||!form.title.trim()||form.description.trim().length<8} onClick={()=>void addIncident()}>Simpan kendala</button></div>}
        {incidents.map(i=><div className="monitor-incident" key={i.id}><div><strong>{i.title}</strong><span>{severity[String(i.severity)]} · {i.status==='open'?'Belum selesai':'Selesai'}</span></div>
          {i.status==='open'?canEdit&&!locked?<button type="button" className="pc-btn ghost" disabled={busy} onClick={()=>void resolve(i)}><CheckCircle2 size={14}/> Selesaikan</button>:<AlertTriangle size={15}/>:<ShieldCheck size={15}/>}</div>)}
        {!incidents.length&&!entry&&<p className="pc-empty"><UsersRound size={15}/> Belum ada kendala tercatat.</p>}</div></div>
    <p className="gantt-help">Status, jam aktual, serta riwayat kendala berasal dari data operasional Wedding-In, bukan animasi simulasi. Pencatatan keuangan tetap di Backoffice.</p>
  </section>;
}
