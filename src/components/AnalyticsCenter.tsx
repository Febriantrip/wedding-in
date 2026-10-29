import {useEffect,useMemo,useState} from 'react';
import {motion,useReducedMotion} from 'motion/react';
import {Download,Info,TrendingUp,TrendingDown,CalendarDays,ArrowUpRight} from 'lucide-react';
import {Area,CartesianGrid,Line,LineChart,ComposedChart,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {api,compactRp,formatRp} from '../api';
import {getAnalytics,changePercent,type AnalyticsPeriod,type AnalyticsSegment,type AnalyticsEvent,type AnalyticsPoint} from '../analytics-data';

const periods:[AnalyticsPeriod,string][]=[['7d','7D'],['30d','30D'],['90d','90D'],['12m','12M']];
const segments:[AnalyticsSegment,string][]=[['all','Semua'],['active','Aktif'],['completed','Selesai']];
const pct=(n:number)=>`${n.toLocaleString('id-ID',{maximumFractionDigits:1,minimumFractionDigits:1})}%`;

function MiniChart({points,keyName,inverse=false}:{points:AnalyticsPoint[];keyName:keyof AnalyticsPoint;inverse?:boolean}){
  return <div className="wa-mini-chart" aria-hidden="true"><ResponsiveContainer width="100%" height="100%">
    <LineChart data={points}><Line type="monotone" dataKey={keyName} stroke={inverse?'#edf3f0':'#414c4b'} strokeWidth={1.8} dot={false} isAnimationActive animationDuration={600}/></LineChart>
  </ResponsiveContainer></div>;
}

function Delta({value,previous,emphasized=false}:{value:number;previous:number;emphasized?:boolean}){
  const change=changePercent(value,previous);
  const positive=change===null||change>=0;
  return <span className={`wa-delta ${positive?'up':'down'} ${emphasized?'on-dark':''}`}>
    {change===null?<TrendingUp size={12}/>:positive?<TrendingUp size={12}/>:<TrendingDown size={12}/>}
    {change===null?'Baru':`${change>=0?'+':''}${pct(change)}`}
  </span>;
}

function saveCsv(points:AnalyticsPoint[],period:AnalyticsPeriod){
  const rows=[['Periode','Nilai kontrak','Periode sebelumnya','Jumlah wedding','Rata-rata kontrak','Margin proyeksi (%)','Checklist selesai (%)'],
    ...points.map(point=>[point.label,point.current,point.previous,point.count,point.average,point.margin.toFixed(2),point.tasks.toFixed(2)])];
  const csv='\ufeff'+rows.map(row=>row.map(value=>`"${String(value).replaceAll('"','""')}"`).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  const link=document.createElement('a');link.href=url;link.download=`wedding-in-analytics-${period}.csv`;
  document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export default function AnalyticsCenter(){
  const reduceMotion=useReducedMotion();
  const [events,setEvents]=useState<AnalyticsEvent[]>([]);
  const [period,setPeriod]=useState<AnalyticsPeriod>('30d');
  const [segment,setSegment]=useState<AnalyticsSegment>('all');
  const [compare,setCompare]=useState(true);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    api<{data:AnalyticsEvent[]}>('/events').then(({data})=>{if(active)setEvents(data||[]);})
      .catch((reason:Error)=>{if(active)setError(reason.message||'Data analytics belum tersedia.');})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[]);
  const analytics=useMemo(()=>getAnalytics(events,period,segment),[events,period,segment]);
  const {current,previous,series}=analytics;
  const cards=[
    {title:'Nilai Kontrak',value:compactRp(current.totalContract),current:current.totalContract,prior:previous.totalContract,series:'current' as const},
    {title:'Jumlah Wedding',value:current.weddings.toLocaleString('id-ID'),current:current.weddings,prior:previous.weddings,series:'count' as const},
    {title:'Rata-rata Kontrak',value:compactRp(current.averageContract),current:current.averageContract,prior:previous.averageContract,series:'average' as const},
    {title:'Margin Proyeksi',value:pct(current.marginPercent),current:current.marginPercent,prior:previous.marginPercent,series:'margin' as const},
    {title:'Checklist Selesai',value:pct(current.taskPercent),current:current.taskPercent,prior:previous.taskPercent,series:'tasks' as const}
  ];
  const total=analytics.active.length+analytics.completed.length;
  const activePercent=total?analytics.active.length/total*100:0;
  const completedPercent=total?100-activePercent:0;
  const activeAmount=analytics.active.reduce((n,e)=>n+Number(e.contract_amount||0),0);
  const completedAmount=analytics.completed.reduce((n,e)=>n+Number(e.contract_amount||0),0);
  const tooltipFormatter=(value:number|undefined,name:string|undefined)=>[formatRp(value??0),name==='previous'?'Periode sebelumnya':'Periode ini'];

  return <div className="wa-analytics">
    <div className="wa-analytics-toolbar"><div className="wa-filter-left">
      <div className="wa-chip-group" role="group" aria-label="Rentang waktu">
        {periods.map(([value,label])=><button type="button" key={value} className={period===value?'active':''} onClick={()=>setPeriod(value)} aria-pressed={period===value}>{label}</button>)}
      </div>
      <div className="wa-chip-group" role="group" aria-label="Status wedding">
        {segments.map(([value,label])=><button type="button" key={value} className={segment===value?'active':''} onClick={()=>setSegment(value)} aria-pressed={segment===value}>{label}</button>)}
      </div>
    </div><div className="wa-filter-right"><label className="wa-compare-switch"><input type="checkbox" checked={compare} onChange={event=>setCompare(event.target.checked)}/><span className="wa-switch-thumb"/> bandingkan periode lalu</label>
      <button type="button" className="wa-export" disabled={loading||Boolean(error)} onClick={()=>saveCsv(series,period)}><Download size={15}/> Export CSV</button>
    </div></div>

    {error?<div className="wa-empty-state">{error}</div>:loading?<div className="wi-skeleton-grid wi-skeleton-analytics" aria-busy="true" aria-label="Memuat data analytics">{[0,1,2,3,4].map(i=><div className="wi-skeleton wi-skeleton-card" key={i}/>)}</div>:<>
      <div className="wa-kpi-grid">{cards.map((card,index)=><motion.article layout={reduceMotion?false:'position'} transition={{duration:.2}} className={`wa-kpi-card ${index===0?'featured':''}`} key={card.title}>
        <span className="wa-kpi-title">{card.title}</span><strong className="wa-kpi-value">{card.value}</strong>
        <div className="wa-kpi-change"><Delta value={card.current} previous={card.prior} emphasized={index===0}/><small>vs periode lalu</small></div>
        <MiniChart points={series} keyName={card.series} inverse={index===0}/>
      </motion.article>)}</div>

      <div className="wa-analytics-grid"><section className="wa-analytics-card wa-trend-card">
        <div className="wa-card-top"><div><h2>Nilai Kontrak dari Waktu ke Waktu</h2><div className="wa-large-value"><strong>{formatRp(current.totalContract)}</strong><Delta value={current.totalContract} previous={previous.totalContract}/></div>
          <p>{analytics.range.start} – {analytics.range.end} · berdasarkan tanggal wedding</p></div>
          <div className="wa-chart-legend"><span><i className="current"/> Periode ini</span>{compare&&<span><i className="previous"/> Periode sebelumnya</span>}</div>
        </div>
        <div className="wa-primary-chart" role="img" aria-label="Grafik nilai kontrak wedding, periode terpilih dibanding periode sebelumnya">
          <ResponsiveContainer width="100%" height="100%"><ComposedChart data={series} margin={{top:14,right:9,bottom:4,left:0}}>
            <defs><linearGradient id="wa-trend-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#252d2d" stopOpacity={0.13}/><stop offset="100%" stopColor="#252d2d" stopOpacity={0}/></linearGradient></defs>
            <CartesianGrid vertical={false} stroke="#e7ecea" strokeDasharray="2 4"/>
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fontSize:11,fill:'#8a9791'}} tickMargin={12} minTickGap={15}/>
            <YAxis tickFormatter={v=>compactRp(v)} axisLine={false} tickLine={false} tick={{fontSize:10,fill:'#91a09a'}} width={78}/>
            <Tooltip contentStyle={{border:'1px solid #dae5df',borderRadius:12,boxShadow:'0 10px 30px #13292316'}} formatter={tooltipFormatter as any}/>
            <Area type="monotone" dataKey="current" stroke="none" fill="url(#wa-trend-fill)" isAnimationActive={!reduceMotion} animationDuration={240} legendType="none" tooltipType="none"/>
            {compare&&<Line type="monotone" dataKey="previous" stroke="#969e9a" strokeWidth={1.8} strokeDasharray="5 5" dot={false} activeDot={{r:4}} isAnimationActive={!reduceMotion} animationDuration={240}/>}
            <Line type="monotone" dataKey="current" stroke="#202728" strokeWidth={2.8} dot={false} activeDot={{r:5,fill:'#202728'}} isAnimationActive={!reduceMotion} animationDuration={260}/>
          </ComposedChart></ResponsiveContainer>
        </div>
        {!current.weddings&&<div className="wa-chart-footnote"><Info size={14}/> Belum ada wedding pada periode dan status ini. Coba 90D atau 12M.</div>}
      </section>

      <section className="wa-analytics-card wa-status-card"><h2>Status Wedding</h2>
        <div className="wa-status-numbers"><strong>{pct(activePercent)}</strong><span>berjalan</span><strong>{pct(completedPercent)}</strong><span>selesai</span></div>
        <div className="wa-status-bar" aria-label={`${analytics.active.length} wedding aktif dan ${analytics.completed.length} selesai`}><span style={{width:`${activePercent}%`}}/></div>
        <div className="wa-status-line"><span className="wa-status-dot dark"/><div><strong>Wedding Aktif</strong><small>{analytics.active.length} acara · tahap persiapan & pelaksanaan</small></div><div className="wa-status-amount"><b>{compactRp(activeAmount)}</b><span>{pct(activePercent)} dari total</span></div></div>
        <div className="wa-status-line"><span className="wa-status-dot muted"/><div><strong>Wedding Selesai</strong><small>{analytics.completed.length} acara · sudah terlaksana</small></div><div className="wa-status-amount"><b>{compactRp(completedAmount)}</b><span>{pct(completedPercent)} dari total</span></div></div>
        <div className="wa-status-summary"><CalendarDays size={17}/><span>Ringkasan {current.weddings} wedding dalam rentang ini</span><ArrowUpRight size={16}/></div>
      </section></div>
      <p className="wa-analytics-disclaimer"><Info size={14}/> Nilai kontrak dan margin di atas adalah proyeksi berdasarkan tanggal wedding, bukan pengakuan pendapatan atau laba aktual. Lihat laporan keuangan untuk realisasi.</p>
    </>}
  </div>;
}
