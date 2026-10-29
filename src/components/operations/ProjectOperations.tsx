import {useCallback,useEffect,useState} from 'react';
import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import {AlertCircle,LoaderCircle} from 'lucide-react';
import {api,isDemo} from '../../api';
import type {OpsSection,Row,OpsProps} from './types';
import OperationsTimeline from './OperationsTimeline';
import VendorPaymentTracker from './VendorPaymentTracker';
import ExpenseApprovals from './ExpenseApprovals';
import ProjectClosing from './ProjectClosing';
import DayRundown from './DayRundown';
import WeddingGuide from './WeddingGuide';
import TeamCoordination from './TeamCoordination';
import EventMonitoring from './EventMonitoring';
import '../projects/project-control.css';
import './project-ops.css';
import './wedding-execution.css';
import './wedding-guide.css';

type Props={eventId:number;section:OpsSection;canFinance:boolean;canEdit:boolean;canApprove:boolean;
  refresh:number;notice:(message:string,error?:boolean)=>void;onCreate:(kind:string,context?:Row)=>void;
  onTimelineCommit?:()=>void|Promise<void>};
const address=(id:number,section:OpsSection)=>`/projects/${id}/${section==='expenses'?'expense-requests':
  section==='vendor-payments'?'vendor-payments':section==='guide'?'rundown-profile':section}`;

export default function ProjectOperations({eventId,section,canFinance,canEdit,canApprove,refresh,notice,onCreate,onTimelineCommit}:Props){
  const reduced=useReducedMotion();
  const [data,setData]=useState<any>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const reload=useCallback(async()=>{const result=await api(address(eventId,section));setData(result);setError('');},[eventId,section]);
  useEffect(()=>{let alive=true;setData(null);setLoading(true);setError('');
    api(address(eventId,section)).then(result=>{if(alive)setData(result);})
      .catch((e:Error)=>{if(alive)setError(e.message);}).finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[eventId,section,refresh]);
  const locked=isDemo()||['completed','cancelled'].includes(data?.event?.status||'');
  const sectionProps:OpsProps={eventId,data,locked,canFinance,canEdit,canApprove,reload,notice,onCreate,onTimelineCommit};
  return <div className="pc-root op-root">
    {loading&&<div className="pc-loading"><LoaderCircle size={16}/> Menyiapkan detail operasional...</div>}
    {error&&<div className="pc-error"><AlertCircle size={16}/>{error}</div>}
    {isDemo()&&<div className="pc-demo-note">Mode demo menampilkan contoh alur. Penyimpanan dan approval hanya tersedia melalui login database.</div>}
    <AnimatePresence mode="wait" initial={false}>
      {data&&<motion.div key={section} className="pc-stack" initial={reduced?false:{opacity:0,y:5}}
        animate={{opacity:1,y:0}} exit={reduced?undefined:{opacity:0}} transition={{duration:reduced?0:.18}}>
        {section==='timeline'&&<OperationsTimeline {...sectionProps}/>}
        {section==='guide'&&<WeddingGuide {...sectionProps}/>}
        {section==='rundown'&&<DayRundown {...sectionProps}/>}
        {section==='team'&&<TeamCoordination {...sectionProps}/>}
        {section==='monitor'&&<EventMonitoring {...sectionProps}/>}
        {section==='vendor-payments'&&canFinance&&<VendorPaymentTracker {...sectionProps}/>}
        {section==='expenses'&&<ExpenseApprovals {...sectionProps}/>}
        {section==='closing'&&canFinance&&<ProjectClosing {...sectionProps}/>}
      </motion.div>}
    </AnimatePresence>
  </div>;
}
