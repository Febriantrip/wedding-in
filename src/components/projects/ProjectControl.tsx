import {useCallback,useEffect,useState} from 'react';
import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import {AlertCircle,LoaderCircle} from 'lucide-react';
import {api,isDemo} from '../../api';
import type {ProjectControlData,ProjectRow,SectionProps} from './types';
import ProjectSnapshot from './ProjectSnapshot';
import VendorBookings from './VendorBookings';
import PaymentPlan from './PaymentPlan';
import ProjectBudget from './ProjectBudget';
import ChangeOrders from './ChangeOrders';
import './project-control.css';

type Props={
  eventId:number;section:'overview'|'vendors'|'finance'|'budget'|'changes';
  canFinance:boolean;canEdit:boolean;canApprove:boolean;refresh:number;
  notice:(message:string,error?:boolean)=>void;
  onCreate:(type:string,context?:ProjectRow)=>void;
};

export default function ProjectControl({eventId,section,canFinance,canEdit,canApprove,refresh,notice,onCreate}:Props){
  const reduced=useReducedMotion();
  const [data,setData]=useState<ProjectControlData|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const reload=useCallback(async()=>{
    const response=await api<ProjectControlData>(`/projects/${eventId}/control`);setData(response);setError('');
  },[eventId]);
  useEffect(()=>{let alive=true;setLoading(true);
    api<ProjectControlData>(`/projects/${eventId}/control`).then(response=>{if(alive){setData(response);setError('');}})
      .catch((reason:Error)=>{if(alive)setError(reason.message);}).finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[eventId,refresh]);
  if(loading&&!data)return <div className="pc-loading"><LoaderCircle size={19}/> Memuat kontrol proyek...</div>;
  if(error&&!data)return <div className="pc-error"><AlertCircle size={19}/> Kontrol proyek belum tersedia: {error}</div>;
  if(!data)return null;
  const locked=isDemo()||['completed','cancelled'].includes(data.project.status);
  const props:SectionProps={eventId,data,canFinance,canEdit,canApprove,locked,reload,notice,onCreate};
  return <AnimatePresence mode="wait" initial={false}><motion.div key={section} className="pc-root"
    initial={reduced?false:{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={reduced?undefined:{opacity:0,y:-3}}
    transition={{duration:reduced?0:.18}}>
    {error&&<div className="pc-error"><AlertCircle size={18}/> {error}</div>}
    {isDemo()&&<div className="pc-note pc-demo-note">Mode demo hanya menampilkan pratinjau kontrol proyek. Booking, termin, dan Change Order baru tersedia saat masuk ke database Wedding-In.</div>}
    {section==='overview'&&<ProjectSnapshot {...props}/>}
    {section==='vendors'&&<VendorBookings {...props}/>}
    {section==='finance'&&<PaymentPlan {...props}/>}
    {section==='budget'&&<ProjectBudget {...props}/>}
    {section==='changes'&&<ChangeOrders {...props}/>}
  </motion.div></AnimatePresence>;
}
