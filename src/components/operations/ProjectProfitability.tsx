import {useEffect,useState} from 'react';
import {motion,useReducedMotion} from 'motion/react';
import {ArrowUpRight,BarChart3,TrendingDown,TrendingUp,WalletCards} from 'lucide-react';
import {api,formatRp,humanDate} from '../../api';
import type {Row} from './types';
import './project-ops.css';

type Dataset={year:number;status:string;page:number;total:number;items:Row[];summary:Row};
const num=(value:unknown)=>Number(value)||0;

export default function ProjectProfitability({onOpenWedding}:{onOpenWedding:(id:number)=>void}){
  const reduced=useReducedMotion(),currentYear=new Date().getFullYear();
  const [year,setYear]=useState(currentYear),[status,setStatus]=useState('all'),[page,setPage]=useState(1),
    [data,setData]=useState<Dataset|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>{let alive=true;setLoading(true);
    api<Dataset>(`/projects/profitability?year=${year}&status=${status}&page=${page}`)
      .then(result=>{if(alive){setData(result);setError('');}})
      .catch((e:Error)=>{if(alive)setError(e.message);})
      .finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};
  },[year,status,page]);
  const totalPages=Math.max(1,Math.ceil((data?.total||0)/15));
  return <motion.div className="pc-root op-root pc-stack" initial={reduced?false:{opacity:0,y:5}}
    animate={{opacity:1,y:0}} transition={{duration:reduced?0:.18}}>
    <section className="pc-card"><div className="pc-head"><div><span className="pc-kicker">PORTFOLIO FINANCIAL INTELLIGENCE</span>
      <h3>Profitability Dashboard</h3><p>Analisis nilai kontrak, estimasi margin, dan laba yang benar-benar sudah masuk jurnal untuk setiap wedding.</p></div>
      <BarChart3 size={23}/></div>
      <div className="op-report-filters"><label>Tahun wedding<select value={year} onChange={e=>{setYear(Number(e.target.value));setPage(1);}}>
        {Array.from({length:8},(_,i)=>currentYear+1-i).map(n=><option key={n} value={n}>{n}</option>)}</select></label>
        <label>Status<select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="all">Semua kecuali batal</option>
          <option value="active">Aktif / berjalan</option><option value="completed">Selesai</option></select></label></div>
      {error&&<div className="pc-error">{error}</div>}
      {loading&&<div className="pc-loading">Menghitung profitabilitas seluruh wedding...</div>}
      {data&&<><div className="pc-kpi-grid"><div><span>Nilai kontrak</span><strong>{formatRp(data.summary.contract_value)}</strong></div>
        <div><span>Estimasi biaya</span><strong>{formatRp(data.summary.estimated_cost)}</strong></div>
        <div><span>Proyeksi margin</span><strong className="pc-positive">{formatRp(data.summary.projected_margin)}</strong></div>
        <div><span>Laba diakui dari jurnal</span><strong className={num(data.summary.recognized_profit)<0?'pc-negative':'pc-positive'}>{formatRp(data.summary.recognized_profit)}</strong></div></div>
        <div className="pc-note"><WalletCards size={15}/> Proyeksi berbeda dari laba akuntansi. Vendor yang dibayar langsung oleh klien tidak dimasukkan ke omzet dan biaya WO.</div>
        <div className="pc-table-scroll"><table className="pc-table op-profit-table"><thead><tr><th>Wedding / klien</th><th>Kontrak</th>
          <th>Estimasi margin</th><th>Pendapatan diakui</th><th>Laba aktual</th><th>Status</th><th/></tr></thead><tbody>
          {data.items.map(item=>{
            const predicted=num(item.contract_amount)-num(item.estimated_cost),actual=num(item.recognized_revenue)-num(item.actual_cost);
            const ratio=num(item.contract_amount)>0?Math.min(100,Math.max(0,(predicted/num(item.contract_amount))*100)):0;
            return <tr key={item.id}><td><strong>{item.title}</strong><small>{item.code} · {item.client_name} · {humanDate(item.event_date)}</small></td>
              <td>{formatRp(item.contract_amount)}</td><td><strong>{formatRp(predicted)}</strong>
                <div className="op-inline-meter"><span style={{width:`${ratio}%`}}/></div></td><td>{formatRp(item.recognized_revenue)}</td>
              <td><span className={actual<0?'pc-negative':'pc-positive'}>{actual<0?<TrendingDown size={13}/>:<TrendingUp size={13}/>} {formatRp(actual)}</span></td>
              <td><span className={`pc-tag ${item.status==='completed'?'success':'neutral'}`}>{item.status==='completed'?'Selesai':item.status==='confirmed'?'Terkonfirmasi':item.status==='in_progress'?'Berjalan':'Planning'}</span></td>
              <td><button type="button" className="pc-icon-btn" title="Lihat detail project" onClick={()=>onOpenWedding(Number(item.id))}><ArrowUpRight size={16}/></button></td></tr>;
          })}</tbody></table></div>
        {data.items.length===0&&<div className="pc-empty">Belum ada wedding sesuai filter ini.</div>}
        <div className="op-report-footer"><span>{data.total} wedding · Halaman {page} dari {totalPages}</span><div>
          <button type="button" className="pc-btn-secondary" disabled={page<=1} onClick={()=>setPage(page-1)}>Sebelumnya</button>
          <button type="button" className="pc-btn-secondary" disabled={page>=totalPages} onClick={()=>setPage(page+1)}>Berikutnya</button></div></div></>}
    </section>
  </motion.div>;
}
