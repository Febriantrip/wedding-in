import {useEffect,useMemo,useState} from 'react';
import {ArrowUpRight,CalendarCheck2,CalendarDays,CheckCircle2,ChevronLeft,ChevronRight,
  Circle,Clock3,MapPin,Plus,RefreshCw} from 'lucide-react';
import {api,patch} from '../api';

type Entry={
  id:number;kind:'wedding'|'task';date:string;title:string;event_id:number;event_title:string;
  time?:string;venue?:string;city?:string;category?:string;assigned_to?:string;
  status:string;priority?:string;
};
type Props={
  onOpenEvent:(id:number)=>void;
  onOpenTasks:(id:number)=>void;
  onAddTask:(date:string,eventId?:number)=>void;
  canEdit:boolean;
};

const dayKey=(date:Date)=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),
  String(date.getDate()).padStart(2,'0')].join('-');
const monthKey=(date:Date)=>dayKey(date).slice(0,7);
const today=()=>dayKey(new Date());
const monthTitle=(month:string)=>new Date(Number(month.slice(0,4)),Number(month.slice(5))-1,1)
  .toLocaleDateString('id-ID',{month:'long',year:'numeric'});
const longDate=(date:string)=>new Date(`${date}T12:00:00`)
  .toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
const entryOrder=(a:Entry,b:Entry)=>a.kind===b.kind
  ? (a.time||'').localeCompare(b.time||'') : a.kind==='wedding'?-1:1;
const weekdayLabels=['Sen','Sel','Rab','Kam','Jum','Sab','Min'];

export default function WeddingCalendar({onOpenEvent,onOpenTasks,onAddTask,canEdit}:Props){
  const [month,setMonth]=useState(()=>sessionStorage.getItem('weddingin_calendar_month')||monthKey(new Date()));
  const [selected,setSelected]=useState(()=>sessionStorage.getItem('weddingin_calendar_day')||today());
  const [entries,setEntries]=useState<Entry[]>([]),[loading,setLoading]=useState(true);
  const [error,setError]=useState(''),[reload,setReload]=useState(0),[updating,setUpdating]=useState<number|null>(null);
  useEffect(()=>{
    sessionStorage.setItem('weddingin_calendar_month',month);
    let alive=true;
    setLoading(true);setError('');
    api<{data:Entry[]}>(`/calendar?month=${month}`).then(result=>{if(alive)setEntries(result.data);})
      .catch((e:Error)=>{if(alive){setEntries([]);setError(e.message);}})
      .finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[month,reload]);
  useEffect(()=>{sessionStorage.setItem('weddingin_calendar_day',selected);},[selected]);
  const byDate=useMemo(()=>{
    const map=new Map<string,Entry[]>();
    for(const item of entries){const list=map.get(item.date)||[];list.push(item);map.set(item.date,list);}
    map.forEach(items=>items.sort(entryOrder));
    return map;
  },[entries]);
  const [year,monthNumber]=month.split('-').map(Number);
  const firstWeekday=(new Date(year,monthNumber-1,1).getDay()+6)%7;
  const numberOfDays=new Date(year,monthNumber,0).getDate();
  const weeks=Math.ceil((firstWeekday+numberOfDays)/7);
  const cells=Array.from({length:weeks*7},(_,index)=>{
    const day=index-firstWeekday+1;
    return day<1||day>numberOfDays?null:`${month}-${String(day).padStart(2,'0')}`;
  });
  const agenda=byDate.get(selected)||[];
  const weddings=agenda.filter(x=>x.kind==='wedding'),tasks=agenda.filter(x=>x.kind==='task');
  const weddingCount=entries.filter(x=>x.kind==='wedding').length;
  const taskCount=entries.length-weddingCount;
  const eventIds=[...new Set(agenda.map(x=>x.event_id))];
  function navigateMonth(change:number){
    const next=new Date(year,monthNumber-1+change,1);
    const newMonth=monthKey(next);
    setMonth(newMonth);setSelected(`${newMonth}-01`);
  }
  function jumpToday(){setMonth(monthKey(new Date()));setSelected(today());}
  async function toggleTask(task:Entry){
    if(!canEdit||updating!==null)return;
    setUpdating(task.id);setError('');
    try{
      const next=task.status==='done'?'todo':'done';
      await patch(`/tasks/${task.id}`,{status:next});
      setEntries(current=>current.map(x=>x.kind==='task'&&x.id===task.id?{...x,status:next}:x));
    }catch(e){setError((e as Error).message);}
    finally{setUpdating(null);}
  }
  return <section className="wc-board" aria-label="Kalender wedding dan tugas">
    <div className="wc-toolbar">
      <div className="wc-toolbar-title"><span className="wc-toolbar-icon"><CalendarDays size={21}/></span>
        <div><span className="wc-overline">WEDDING SCHEDULE</span><h2>{monthTitle(month)}</h2></div></div>
      <div className="wc-toolbar-actions"><div className="wc-legend"><span><i className="wc-legend-wedding"/>Hari pernikahan</span><span><i className="wc-legend-task"/>Task & meeting</span></div>
        <div className="wc-navigation"><button type="button" title="Bulan sebelumnya" aria-label="Bulan sebelumnya" onClick={()=>navigateMonth(-1)}><ChevronLeft size={18}/></button>
          <button type="button" className="wc-today" onClick={jumpToday}>Hari ini</button>
          <button type="button" title="Bulan berikutnya" aria-label="Bulan berikutnya" onClick={()=>navigateMonth(1)}><ChevronRight size={18}/></button></div></div>
    </div>
    <div className="wc-summary"><span><strong>{weddingCount}</strong> wedding bulan ini</span><i/><span><strong>{taskCount}</strong> task & agenda</span>
      {loading&&<span className="wc-loading">Memuat kalender...</span>}</div>
    {error&&<div className="wc-error" role="alert">{error}<button type="button" onClick={()=>setReload(x=>x+1)}><RefreshCw size={14}/> Coba lagi</button></div>}
    <div className="wc-layout"><div className="wc-month">
      <div className="wc-weekdays">{weekdayLabels.map(label=><span key={label}>{label}</span>)}</div>
      <div className="wc-days">{cells.map((date,index)=>{
        if(!date)return <div key={`blank-${index}`} className="wc-day wc-day-outside" aria-hidden="true"/>;
        const items=byDate.get(date)||[],isSelected=selected===date,isToday=date===today();
        return <button type="button" key={date} aria-label={`${longDate(date)}, ${items.length} agenda`} aria-pressed={isSelected}
          className={`wc-day ${isSelected?'wc-day-selected':''} ${isToday?'wc-day-today':''}`} onClick={()=>setSelected(date)}>
          <span className="wc-day-number">{Number(date.slice(8))}</span>
          <span className="wc-day-items">{items.slice(0,2).map(item=><span key={`${item.kind}-${item.id}`}
            className={`wc-chip wc-chip-${item.kind} ${item.status==='done'?'wc-chip-completed':''}`} title={`${item.title} · ${item.event_title}`}>
            <i/>{item.title}</span>)}
            {items.length>2&&<small>+{items.length-2} agenda lainnya</small>}</span>
          {items.length>0&&<span className="wc-mobile-dots" aria-hidden="true">{items.slice(0,3).map(item=>
            <i key={`${item.kind}-${item.id}`} className={`wc-dot-${item.kind}`}/>)}</span>}
        </button>;
      })}</div>
    </div><aside className="wc-agenda" aria-live="polite"><div className="wc-agenda-heading"><div><span className="wc-overline">AGENDA TERPILIH</span>
      <h3>{longDate(selected)}</h3><p>{agenda.length} agenda terjadwal</p></div></div>
      {canEdit&&<button type="button" className="wc-add-task" onClick={()=>onAddTask(selected,eventIds.length===1?eventIds[0]:undefined)}>
        <Plus size={16}/> Tambah task di tanggal ini</button>}
      <div className="wc-agenda-scroll">
        {weddings.length>0&&<div className="wc-agenda-group"><h4><CalendarCheck2 size={16}/> Wedding day</h4>
          {weddings.map(item=><button type="button" className="wc-agenda-event" key={item.id} onClick={()=>onOpenEvent(item.event_id)}>
            <span className="wc-agenda-marker wc-marker-wedding"><CalendarDays size={16}/></span><span className="wc-agenda-copy"><strong>{item.title}</strong>
            <small><MapPin size={12}/>{[item.venue,item.city].filter(Boolean).join(', ')||'Venue belum ditentukan'}</small></span>
            <ArrowUpRight size={17}/></button>)}</div>}
        {tasks.length>0&&<div className="wc-agenda-group"><h4><Clock3 size={16}/> Task & meeting</h4>
          {tasks.map(item=><div className={`wc-agenda-task ${item.status==='done'?'wc-task-done':''}`} key={item.id}>
            <button type="button" className="wc-task-toggle" title={item.status==='done'?'Tandai belum selesai':'Tandai selesai'}
              disabled={!canEdit||updating!==null} onClick={()=>toggleTask(item)}
              aria-label={`${item.status==='done'?'Batalkan selesai':'Selesaikan'}: ${item.title}`}>
              {item.status==='done'?<CheckCircle2 size={21}/>:<Circle size={21}/>}</button>
            <button type="button" className="wc-agenda-copy wc-task-link" onClick={()=>onOpenTasks(item.event_id)}>
              <strong>{item.title}</strong><span>{item.event_title}</span><small>
                {item.time&&<><Clock3 size={12}/>{item.time} WIB</>}
                {item.assigned_to&&<em>· {item.assigned_to}</em>}</small></button>
            <ArrowUpRight size={16} className="wc-task-arrow"/></div>)}</div>}
        {!agenda.length&&<div className="wc-agenda-empty"><CalendarDays size={33}/><strong>Belum ada agenda</strong>
          <span>Pilih tanggal lain, atau buat task baru untuk wedding yang sedang dipersiapkan.</span></div>}
      </div>
    </aside></div>
  </section>;
}
