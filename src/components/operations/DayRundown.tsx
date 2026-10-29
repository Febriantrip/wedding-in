import {useMemo,useState} from 'react';
import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import {AlertTriangle,CheckCircle2,Clock3,Download,Edit3,Play,Plus,Save,Trash2,X} from 'lucide-react';
import {api,post,patch} from '../../api';
import type {OpsProps,Row} from './types';
import {printRundownGuide} from './rundown-print';

type Draft={id?:number;title:string;segment:string;planned_start:string;planned_end:string;
  staff_assignment_id:string;vendor_assignment_id:string;notes:string;run_detail:string;pic_text:string;technical_note:string};
const segmentNames:Record<string,string>={preparation:'Persiapan',ceremony:'Akad / Pemberkatan',reception:'Resepsi',closing:'Penutupan',other:'Lainnya'};
const statusNames:Record<string,string>={scheduled:'Terjadwal',ongoing:'Berlangsung',done:'Selesai',cancelled:'Batal'};
const fmt=(v:unknown)=>String(v??'').slice(0,16).replace(' ','T');
const sqlTime=(v:string)=>v.replace('T',' ')+':00';
const initial=(date:string):Draft=>({title:'',segment:'other',planned_start:`${date}T09:00`,planned_end:`${date}T10:00`,
  staff_assignment_id:'',vendor_assignment_id:'',notes:'',run_detail:'',pic_text:'',technical_note:''});
const hour=(v:string)=>v?.slice(11,16)||'—';

export default function DayRundown({eventId,data,locked,canEdit,reload,notice}:OpsProps){
  const reduced=useReducedMotion(),items=(data?.items??[]) as Row[],crew=(data?.crew??[]) as Row[],vendors=(data?.vendors??[]) as Row[];
  const [draft,setDraft]=useState<Draft|null>(null),[saving,setSaving]=useState(false),[filter,setFilter]=useState('all');
  const visible=items.filter(i=>filter==='all'||String(i.status)===filter);
  const conflicts=useMemo(()=>{
    const set=new Set<number>();const ordered=items.filter(i=>i.status!=='cancelled').sort((a,b)=>String(a.planned_start).localeCompare(String(b.planned_start)));
    for(let i=0;i<ordered.length;i++)for(let j=i+1;j<ordered.length;j++){
      const a=ordered[i],b=ordered[j];if(String(b.planned_start)>=String(a.planned_end))break;
      if((a.staff_assignment_id&&Number(a.staff_assignment_id)===Number(b.staff_assignment_id))||
        (a.vendor_assignment_id&&Number(a.vendor_assignment_id)===Number(b.vendor_assignment_id))){set.add(Number(a.id));set.add(Number(b.id));}
    }return set;
  },[items]);
  async function save(){if(!draft)return;setSaving(true);try{
    const body={title:draft.title,segment:draft.segment,planned_start:sqlTime(draft.planned_start),planned_end:sqlTime(draft.planned_end),
      staff_assignment_id:draft.staff_assignment_id?Number(draft.staff_assignment_id):null,
      vendor_assignment_id:draft.vendor_assignment_id?Number(draft.vendor_assignment_id):null,notes:draft.notes,
      run_detail:draft.run_detail,pic_text:draft.pic_text,technical_note:draft.technical_note};
    if(draft.id)await patch(`/projects/${eventId}/rundown/${draft.id}`,body);
    else await post(`/projects/${eventId}/rundown`,body);
    await reload();setDraft(null);notice('Rundown disimpan.');
  }catch(e){notice((e as Error).message,true);}finally{setSaving(false);}}
  async function status(item:Row,next:'ongoing'|'done'|'cancelled'){
    let reason='';if(next==='cancelled'){
      const answer=window.prompt('Alasan pembatalan kegiatan (minimal 8 karakter):');if(answer===null)return;reason=answer.trim();
      if(reason.length<8){notice('Alasan pembatalan minimal 8 karakter.',true);return;}}
    setSaving(true);try{await post(`/projects/${eventId}/rundown/${item.id}/state`,{state:next,reason});
      await reload();notice('Status kegiatan diperbarui.');}catch(e){notice((e as Error).message,true);}finally{setSaving(false);}}
  async function remove(item:Row){if(!window.confirm(`Hapus kegiatan ${item.title}?`))return;
    setSaving(true);try{await api(`/projects/${eventId}/rundown/${item.id}`,{method:'DELETE'});
      await reload();notice('Kegiatan yang belum berjalan dihapus.');}catch(e){notice((e as Error).message,true);}finally{setSaving(false);}}
  async function print(){try{await printRundownGuide(eventId);}catch(e){notice((e as Error).message,true);}}
  return <section className="pc-card run-card"><div className="pc-head"><div><span className="pc-kicker">RUN OF SHOW · HARI-H</span><h3>Wedding Day Rundown</h3>
    <p>Jadwal operasional menit demi menit. Salin master melalui tab Data Pengantin & Panduan, lalu edit jadwal untuk wedding ini.</p></div>
    <div className="guide-actions"><button className="pc-btn ghost" type="button" onClick={()=>void print()}><Download size={15}/> Ekspor PDF</button>
      {canEdit&&!locked&&<button className="pc-btn" onClick={()=>setDraft(initial(String(data?.event?.event_date??'').slice(0,10)))}><Plus size={15}/> Aktivitas</button>}</div></div>
    <div className="run-stats"><span><strong>{items.length}</strong> kegiatan</span><span><strong>{items.filter(i=>i.status==='done').length}</strong> selesai</span>
      <span className={conflicts.size?'run-warning':''}><strong>{conflicts.size}</strong> benturan PIC/vendor</span></div>
    <div className="op-filters" role="group" aria-label="Filter rundown">{[['all','Semua'],['scheduled','Terjadwal'],['ongoing','Berlangsung'],['done','Selesai']].map(([key,label])=><button
      type="button" key={key} className={filter===key?'selected':''} onClick={()=>setFilter(key)}>{label}</button>)}</div>
    <div className="run-list">{visible.map(item=><div key={item.id} className={`run-row is-${item.status}`}>
      <div className="run-time"><strong>{hour(item.planned_start)}</strong><span>{hour(item.planned_end)}</span><small>{String(item.planned_start).slice(0,10)}</small></div>
      <div className="run-content"><div className="run-heading"><strong>{item.title}</strong><span className={`pc-tag ${item.status==='done'?'success':'neutral'}`}>{statusNames[String(item.status)]}</span></div>
        <div className="run-meta"><span>{segmentNames[String(item.segment)]}</span><span>•</span><span>{item.crew_name||'Crew belum ditentukan'}</span>
          {item.vendor_name&&<><span>•</span><span>{item.vendor_name}</span></>}</div>
        {item.run_detail&&<p>{item.run_detail}</p>}{item.notes&&<p>{item.notes}</p>}{item.pic_text&&<small className="run-actual">PIC panduan: {item.pic_text}</small>}
        {item.technical_note&&<small className="run-actual">Teknis: {item.technical_note}</small>}
        {conflicts.has(Number(item.id))&&<div className="run-alert"><AlertTriangle size={13}/> PIC/vendor bertabrakan dengan aktivitas lain.</div>}
        {item.actual_start&&<small className="run-actual">Aktual: {hour(item.actual_start)} – {item.actual_end?hour(item.actual_end):'berlangsung'}</small>}
        {item.cancel_reason&&<small className="run-alert">Batal: {item.cancel_reason}</small>}</div>
      {canEdit&&!locked&&<div className="run-actions">
        {item.status==='scheduled'&&<><button type="button" title="Edit" disabled={saving} onClick={()=>setDraft({id:Number(item.id),title:String(item.title),segment:String(item.segment),
          planned_start:fmt(item.planned_start),planned_end:fmt(item.planned_end),staff_assignment_id:String(item.staff_assignment_id??''),
          vendor_assignment_id:String(item.vendor_assignment_id??''),notes:String(item.notes??''),
          run_detail:String(item.run_detail??''),pic_text:String(item.pic_text??''),technical_note:String(item.technical_note??'')})}><Edit3 size={16}/></button>
          <button type="button" title="Mulai" disabled={saving} onClick={()=>void status(item,'ongoing')}><Play size={16}/></button>
          <button type="button" title="Hapus" disabled={saving} onClick={()=>void remove(item)}><Trash2 size={16}/></button></>}
        {(item.status==='scheduled'||item.status==='ongoing')&&<button type="button" title="Selesai" disabled={saving} onClick={()=>void status(item,'done')}><CheckCircle2 size={16}/></button>}
        {(item.status==='scheduled'||item.status==='ongoing')&&<button type="button" title="Batalkan dengan alasan" disabled={saving} onClick={()=>void status(item,'cancelled')}><X size={16}/></button>}
      </div>}</div>)}{!visible.length&&<div className="pc-empty"><Clock3 size={17}/> Belum ada kegiatan untuk filter ini.</div>}</div>
    <AnimatePresence>{draft&&<motion.div initial={reduced?false:{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={{duration:reduced?0:.15}}
      className="run-form"><div className="gantt-editor-head"><strong>{draft.id?'Edit aktivitas rundown':'Tambah aktivitas rundown'}</strong><button type="button" onClick={()=>setDraft(null)}>Tutup</button></div>
      <div className="run-form-grid"><label>Nama kegiatan<input autoFocus value={draft.title} maxLength={180} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
        <label>Segmen<select value={draft.segment} onChange={e=>setDraft({...draft,segment:e.target.value})}>{Object.entries(segmentNames).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        <label>Mulai<input type="datetime-local" value={draft.planned_start} onChange={e=>setDraft({...draft,planned_start:e.target.value})}/></label>
        <label>Selesai<input type="datetime-local" value={draft.planned_end} onChange={e=>setDraft({...draft,planned_end:e.target.value})}/></label>
        <label>Crew / PIC<select value={draft.staff_assignment_id} onChange={e=>setDraft({...draft,staff_assignment_id:e.target.value})}><option value="">Tanpa crew</option>{crew.map(c=><option key={c.id} value={c.id}>{c.name} · {c.assignment}</option>)}</select></label>
        <label>Vendor<select value={draft.vendor_assignment_id} onChange={e=>setDraft({...draft,vendor_assignment_id:e.target.value})}><option value="">Tanpa vendor</option>{vendors.map(v=><option key={v.id} value={v.id}>{v.name} · {v.service_name}</option>)}</select></label>
        <label className="run-wide">Detail rangkaian acara<textarea rows={2} maxLength={1600} value={draft.run_detail} onChange={e=>setDraft({...draft,run_detail:e.target.value})}/></label>
        <label>PIC untuk dokumen PDF<input maxLength={180} value={draft.pic_text} placeholder="MC / WO / Keluarga" onChange={e=>setDraft({...draft,pic_text:e.target.value})}/></label>
        <label>Catatan teknis<textarea rows={2} maxLength={1600} value={draft.technical_note} onChange={e=>setDraft({...draft,technical_note:e.target.value})}/></label>
        <label className="run-wide">Catatan<textarea rows={2} maxLength={600} value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label></div>
      <button type="button" className="pc-btn" disabled={saving||!draft.title.trim()||!draft.planned_start||!draft.planned_end}
        onClick={()=>void save()}><Save size={15}/> {saving?'Menyimpan...':'Simpan rundown'}</button></motion.div>}</AnimatePresence>
  </section>;
}
