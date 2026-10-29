import {useMemo,useState} from 'react';
import {motion,useReducedMotion} from 'motion/react';
import {ArrowLeft,ArrowRight,CalendarClock,CheckCircle2,Flag,Link2,Pencil,Plus,Save} from 'lucide-react';
import {patch} from '../../api';
import type {OpsProps,Row} from './types';
import {shiftLocalDateTime} from './schedule-utils';

const midnight=(value:string)=>new Date(`${value.slice(0,10)}T00:00:00Z`).getTime();
const dateLabel=(value:string)=>new Date(`${value.slice(0,10)}T12:00:00Z`).toLocaleDateString('id-ID',{day:'2-digit',month:'short',timeZone:'UTC'});
const complete=(task:Row)=>String(task.status)==='done';
const formatted=(value:unknown)=>String(value??'').slice(0,16).replace(' ','T');
type Zoom='day'|'week'|'month';
type EditState={task:Row;start:string;end:string;depends:string};

export default function OperationsTimeline({eventId,data,locked,canEdit,reload,notice,onCreate,onTimelineCommit}:OpsProps){
  const reduced=useReducedMotion();
  const [zoom,setZoom]=useState<Zoom>('week'),[filter,setFilter]=useState<'all'|'milestones'|'pending'>('all');
  const [edit,setEdit]=useState<EditState|null>(null),[busy,setBusy]=useState(false);
  const all=(data?.tasks??[]) as Row[];
  const displayed=useMemo(()=>all.filter(t=>filter==='all'||(filter==='milestones'?
    String(t.category).toLowerCase()==='milestone':!complete(t))),[all,filter]);
  const dayWidth=zoom==='day'?45:zoom==='week'?25:12;
  const gantt=useMemo(()=>{
    const dates=all.flatMap(t=>[t.start_at,t.due_at].filter(Boolean).map((d:string)=>midnight(d))).filter(Number.isFinite);
    const eventDate=midnight(String(data?.event?.event_date??new Date().toISOString()));
    const start=Math.min(eventDate,...dates)-7*86400000;
    const end=Math.max(eventDate,...dates)+7*86400000;
    const days=Math.max(28,Math.min(550,Math.ceil((end-start)/86400000)+1));
    const ticks=Array.from({length:Math.ceil(days/(zoom==='day'?1:zoom==='week'?7:30))},(_,i)=>i*(zoom==='day'?1:zoom==='week'?7:30));
    return {start,days,ticks};
  },[all,data?.event?.event_date,zoom]);
  const x=(d:string)=>Math.max(0,Math.round((midnight(d)-gantt.start)/86400000)*dayWidth);
  const done=all.filter(complete).length,percentage=all.length?Math.round(done/all.length*100):0;
  function openEdit(task:Row){setEdit({task,start:formatted(task.start_at||task.due_at),end:formatted(task.due_at),
    depends:task.depends_on_task_id?String(task.depends_on_task_id):''});}
  async function save(taskId:number,start:string|null,end:string|null,depends:number|null){
    setBusy(true);try{await patch(`/projects/${eventId}/timeline/${taskId}`,{
      start_at:start, due_at:end, depends_on_task_id:depends});
      await reload();await onTimelineCommit?.();setEdit(null);notice('Tanggal Gantt dan checklist persiapan telah disinkronkan.');}
    catch(e){notice((e as Error).message,true);}finally{setBusy(false);}}
  async function shift(task:Row,days:number){
    if(!days||busy||locked||!canEdit||!task.due_at)return;
    const begin=String(task.start_at||task.due_at),end=String(task.due_at);
    const nextStart=shiftLocalDateTime(begin,days),nextEnd=shiftLocalDateTime(end,days);
    if(nextStart&&nextEnd)await save(Number(task.id),nextStart,nextEnd,task.depends_on_task_id?Number(task.depends_on_task_id):null);
  }
  return <section className="pc-card gantt-card">
    <div className="pc-head"><div><span className="pc-kicker">WEDDING SCHEDULING · GANTT</span><h3>Timeline & Milestone</h3>
      <p>Perencanaan tanggal dimulai, tenggat, dan hubungan antarpekerjaan. Checklist tetap menjadi sumber status pekerjaan.</p></div>
      {canEdit&&!locked&&<button className="pc-btn" onClick={()=>onCreate('task',{event_id:eventId,category:'Milestone'})}><Plus size={15}/> Milestone</button>}</div>
    <div className="op-progress-head"><span>{done} dari {all.length} pekerjaan selesai</span><strong>{percentage}%</strong></div>
    <div className="pc-progress-track"><motion.span initial={false} animate={{width:`${percentage}%`}} transition={{duration:reduced?0:.18}}/></div>
    <div className="gantt-toolbar"><div className="op-filters" role="group" aria-label="Filter timeline">{([['all','Semua'],['milestones','Milestone'],['pending','Belum selesai']] as const).map(([key,label])=><button
      type="button" key={key} className={filter===key?'selected':''} onClick={()=>setFilter(key)}>{label}</button>)}</div>
      <div className="op-filters" role="group" aria-label="Perbesaran timeline">{([['day','Harian'],['week','Mingguan'],['month','Bulanan']] as const).map(([key,label])=><button
      key={key} type="button" className={zoom===key?'selected':''} onClick={()=>setZoom(key)}>{label}</button>)}</div></div>
    <div className="gantt-table" role="region" aria-label="Gantt timeline wedding" tabIndex={0}>
      <div className="gantt-labels"><div className="gantt-label-head">Pekerjaan / PIC</div>{displayed.map(t=><button type="button" key={t.id} className="gantt-name" onClick={()=>openEdit(t)}>
        <span className="gantt-name-heading">{String(t.category).toLowerCase()==='milestone'&&<Flag size={13}/>} {t.title}</span>
        <small>{t.assigned_to||'Belum ada PIC'}{t.depends_on_task_id?` · ↳ #${t.depends_on_task_id}`:''}</small></button>)}
      </div>
      <div className="gantt-chart"><div className="gantt-canvas" style={{width:gantt.days*dayWidth}}>
        <div className="gantt-axis" style={{backgroundSize:`${dayWidth}px 100%`}}>{gantt.ticks.map(i=><span key={i} className="gantt-tick"
          style={{left:i*dayWidth}}>{dateLabel(new Date(gantt.start+i*86400000).toISOString())}</span>)}</div>
        {displayed.map(t=>{const end=t.due_at?String(t.due_at):null,start=t.start_at?String(t.start_at):end;
          const hasDate=Boolean(start&&end),left=hasDate?x(start!):0,length=hasDate?Math.max(dayWidth,Math.round((midnight(end!)-midnight(start!))/86400000+1)*dayWidth):0;
          return <div key={t.id} className="gantt-track" style={{backgroundSize:`${dayWidth}px 100%`}}>
            {hasDate?<motion.div key={`${t.id}-${start}-${end}`} className={`gantt-bar ${complete(t)?'is-done':''} ${String(t.category).toLowerCase()==='milestone'?'is-milestone':''}`}
              style={{left,width:length}} drag={canEdit&&!locked&&!busy?'x':false} dragMomentum={false} dragElastic={0} dragSnapToOrigin
              onDragEnd={(_e,info)=>{void shift(t,Math.round(info.offset.x/dayWidth));}} title={`${t.title} | ${dateLabel(start!)} – ${dateLabel(end!)}`}>
              {complete(t)?<CheckCircle2 size={12}/>:<CalendarClock size={12}/>}<span>{t.status==='done'?'Selesai':t.title}</span>
            </motion.div>:<button type="button" className="gantt-unscheduled" onClick={()=>openEdit(t)}>Jadwalkan</button>}
          </div>;})}
      </div></div></div>
    <p className="gantt-help">Geser bar untuk memindahkan jadwal. Klik nama aktivitas untuk mengedit tanggal atau ketergantungan. Gunakan tombol ±1 hari untuk akses keyboard.</p>
    {edit&&<div className="gantt-editor" role="group" aria-label={`Atur jadwal ${edit.task.title}`}><div className="gantt-editor-head"><strong>{edit.task.title}</strong><button type="button" className="pc-icon-btn" onClick={()=>setEdit(null)}>Tutup</button></div>
      <div className="gantt-editor-fields"><label>Mulai<input aria-label="Tanggal mulai" type="datetime-local" value={edit.start} disabled={locked||!canEdit} onChange={e=>setEdit({...edit,start:e.target.value})}/></label>
        <label>Tenggat selesai<input aria-label="Tanggal selesai" type="datetime-local" value={edit.end} disabled={locked||!canEdit} onChange={e=>setEdit({...edit,end:e.target.value})}/></label>
        <label>Setelah aktivitas<select aria-label="Ketergantungan" value={edit.depends} disabled={locked||!canEdit} onChange={e=>setEdit({...edit,depends:e.target.value})}>
          <option value="">Tanpa ketergantungan</option>{all.filter(t=>Number(t.id)!==Number(edit.task.id)).map(t=><option key={t.id} value={t.id}>{t.title}</option>)}
        </select></label></div>
      <div className="gantt-editor-actions"><button type="button" className="pc-btn ghost" disabled={busy||locked||!canEdit} onClick={()=>void shift(edit.task,-1)}><ArrowLeft size={14}/> -1 hari</button>
        <button type="button" className="pc-btn ghost" disabled={busy||locked||!canEdit} onClick={()=>void shift(edit.task,1)}>+1 hari <ArrowRight size={14}/></button>
        <button type="button" className="pc-btn ghost" onClick={()=>onCreate('taskEdit',{event_id:eventId,item:edit.task})}><Pencil size={14}/> Edit checklist</button>
        {canEdit&&!locked&&<button type="button" className="pc-btn" disabled={busy||!edit.end} onClick={()=>void save(Number(edit.task.id),edit.start?edit.start.replace('T',' ')+':00':null,
          edit.end?edit.end.replace('T',' ')+':00':null,edit.depends?Number(edit.depends):null)}><Save size={14}/> Simpan jadwal</button>}</div>
    </div>}
    {!displayed.length&&<div className="pc-empty"><Link2 size={15}/> Belum ada aktivitas dalam filter ini.</div>}
  </section>;
}
