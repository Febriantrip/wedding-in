import {useEffect,useMemo,useState} from 'react';
import {motion,useReducedMotion} from 'motion/react';
import {ArrowUpRight,CalendarDays,CheckCircle2} from 'lucide-react';
import {CartesianGrid,Line,LineChart,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {api,compactRp,formatRp} from '../api';
import {getAnalytics,type AnalyticsEvent,type AnalyticsPeriod} from '../analytics-data';

export default function DashboardCharts({canFinance}:{canFinance:boolean}){
  const [events,setEvents]=useState<AnalyticsEvent[]>([]);
  const [period,setPeriod]=useState<AnalyticsPeriod>('12m');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  const reduceMotion=useReducedMotion();
  useEffect(()=>{let alive=true;api<{data:AnalyticsEvent[]}>('/events').then(({data})=>{
    if(alive)setEvents(data||[]);
  }).catch(()=>{if(alive)setError(true);}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[]);

  const stats=useMemo(()=>getAnalytics(events,period),[events,period]);
  const active=events.filter(e=>['planning','confirmed','in_progress'].includes(e.status));
  const totalTasks=active.reduce((sum,e)=>sum+Number(e.total_tasks||0),0);
  const completedTasks=active.reduce((sum,e)=>sum+Number(e.completed_tasks||0),0);
  const progress=totalTasks?Math.max(0,Math.min(100,completedTasks/totalTasks*100)):0;
  const theta=(180-progress*1.8)*Math.PI/180;
  const dotX=140+91*Math.cos(theta),dotY=126-91*Math.sin(theta);
  const chart=stats.series.map(point=>({...point,main:canFinance?point.current:point.count,prior:canFinance?point.previous:0}));

  return <motion.section className="wd-insights" initial={reduceMotion?false:{opacity:.55}} whileInView={{opacity:1}} viewport={{once:true,amount:.08}} transition={{duration:.2}} aria-label="Grafik performa wedding">
    <motion.article layout={reduceMotion?false:'position'} transition={{duration:.2}} className="wd-readiness"><div className="wd-insight-head"><span>Wedding Performance</span><span className="wd-insight-info">Skor kesiapan</span></div>
      <div className="wd-gauge"><svg viewBox="0 0 280 170" aria-hidden="true">
        <path d="M49 126 A91 91 0 0 1 231 126" fill="none" stroke="#333d3c" strokeWidth="19" strokeLinecap="round" pathLength="100"/>
        <path d="M49 126 A91 91 0 0 1 231 126" fill="none" stroke="#f1f4f0" strokeWidth="19" strokeLinecap="round" pathLength="100"
          strokeDasharray={`${progress} 100`} className="wd-gauge-progress"/>
        <circle cx={dotX} cy={dotY} r="9" fill="#1a2020" stroke="#f2f5f1" strokeWidth="4"/>
      </svg><div className="wd-gauge-number"><strong>{Math.round(progress)}</strong><span>/ 100 poin</span></div></div>
      <strong className="wd-readiness-title">{progress>=75?'Persiapan berjalan baik':progress>=40?'Persiapan dalam proses':'Perlu perhatian tim'}</strong>
      <p>{completedTasks} dari {totalTasks} checklist wedding aktif selesai. Pantau kebutuhan yang belum terpenuhi sebelum hari-H.</p>
      <div className="wd-readiness-bottom"><span><CheckCircle2 size={15}/> {completedTasks} selesai</span><span><CalendarDays size={15}/> {active.length} wedding aktif</span></div>
    </motion.article>
    <motion.article layout={reduceMotion?false:'position'} transition={{duration:.2}} className="wd-revenue-panel"><div className="wd-revenue-header"><div><span className="wd-subtitle">{canFinance?'Nilai Kontrak':'Agenda Wedding'} <span className="wd-dot-separator">·</span> Tren {period==='12m'?'12 bulan':period==='90d'?'90 hari':'30 hari'}</span>
      <div className="wd-revenue-total"><strong>{canFinance?compactRp(stats.current.totalContract):`${stats.current.weddings} Wedding`}</strong><span><ArrowUpRight size={13}/> Data aktual</span></div></div>
      <div className="wd-period-tabs" role="group" aria-label="Periode grafik dashboard">{([['30d','30D'],['90d','90D'],['12m','12M']] as const).map(([key,label])=><button type="button" key={key}
        aria-pressed={period===key} className={period===key?'active':''} onClick={()=>setPeriod(key)}>{label}</button>)}</div></div>
      <div className="wd-chart-key"><span><i/> {canFinance?'Nilai kontrak periode ini':'Wedding periode ini'}</span>{canFinance&&<span><i className="previous"/> Periode sebelumnya</span>}</div>
      <div className="wd-revenue-chart">{loading?<div className="wi-skeleton wi-chart-skeleton" role="status" aria-label="Memuat grafik performa"/>:error?<div className="wd-chart-loading">Data grafik tidak tersedia. Muat ulang halaman untuk mencoba lagi.</div>:<ResponsiveContainer width="100%" height="100%"><LineChart data={chart} margin={{top:12,bottom:4,left:0,right:7}}>
        <CartesianGrid vertical={false} stroke="#eef0ed" strokeDasharray="3 4"/>
        <XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={15} tick={{fontSize:10,fill:'#91a19b'}} tickMargin={10}/>
        <YAxis axisLine={false} tickLine={false} width={76} tick={{fontSize:10,fill:'#91a19b'}} tickFormatter={v=>canFinance?compactRp(v):String(v)}/>
        <Tooltip contentStyle={{borderRadius:12,borderColor:'#e1e8e4'}} formatter={(value,name)=>[canFinance?formatRp(Number(value)||0):`${Number(value)||0} wedding`,String(name)==='prior'?'Periode lalu':'Periode ini']}/>
        {canFinance&&<Line type="monotone" dataKey="prior" stroke="#a3aaa6" strokeWidth={1.8} strokeDasharray="5 5" dot={false} isAnimationActive={!reduceMotion} animationDuration={240}/>}
        <Line type="monotone" dataKey="main" stroke="#252c2b" strokeWidth={2.8} dot={false} activeDot={{r:5,fill:'#252c2b'}} isAnimationActive={!reduceMotion} animationDuration={260}/>
      </LineChart></ResponsiveContainer>}</div>
      <div className="wd-chart-note">{canFinance?'Proyeksi kontrak berdasarkan jadwal acara, bukan pendapatan yang diakui.':'Jumlah wedding berdasarkan tanggal acara.'}</div>
    </motion.article>
  </motion.section>;
}
