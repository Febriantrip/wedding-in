import {useEffect,useRef,useState} from 'react';
import {Bell,CalendarClock,ChevronRight,X} from 'lucide-react';
import {api,humanDate} from '../api';

type AgendaTask={id:number;event_id:number;title:string;event_title:string;due_at:string};

export default function TopbarAgenda({onRoute}:{onRoute:(route:string)=>void}){
  const [open,setOpen]=useState(false);
  const [tasks,setTasks]=useState<AgendaTask[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(false);
  const holder=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!open)return;
    let alive=true;setBusy(true);setError(false);
    api<{tasks:AgendaTask[]}>('/dashboard').then(data=>{if(alive)setTasks(data.tasks||[]);}).catch(()=>{if(alive)setError(true);}).finally(()=>{if(alive)setBusy(false);});
    const close=(event:PointerEvent)=>{if(holder.current&&!holder.current.contains(event.target as Node))setOpen(false);};
    const onEscape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false);};
    document.addEventListener('pointerdown',close);window.addEventListener('keydown',onEscape);
    return()=>{alive=false;document.removeEventListener('pointerdown',close);window.removeEventListener('keydown',onEscape);};
  },[open]);
  return <div className="wa-agenda-holder" ref={holder}>
    <button type="button" className={`wa-agenda-trigger ${open?'open':''}`} aria-label="Lihat agenda tugas" title="Agenda tugas" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>
      <Bell size={18}/><i/>
    </button>
    {open&&<section className="wa-agenda-popover" aria-label="Agenda tugas mendatang"><header><div><strong>Agenda Tugas</strong><small>Checklist yang memerlukan perhatian</small></div><button type="button" onClick={()=>setOpen(false)} aria-label="Tutup agenda"><X size={17}/></button></header>
      <div className="wa-agenda-list">{busy?<p>Memuat agenda...</p>:error?<p>Agenda belum dapat dimuat. Coba lagi.</p>:tasks.length?tasks.map(task=><button type="button" key={task.id} onClick={()=>{setOpen(false);onRoute(`event/${task.event_id}/tasks`);}}>
        <span className="wa-agenda-item-icon"><CalendarClock size={16}/></span><span><strong>{task.title}</strong><small>{task.event_title} · {humanDate(task.due_at)}</small></span><ChevronRight size={15}/></button>):<p>Belum ada tugas tertunda. Semua siap!</p>}</div>
    </section>}
  </div>;
}
