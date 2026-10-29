import {useState} from 'react';
import {CheckCircle2,MapPin,ShieldCheck,Truck,UsersRound} from 'lucide-react';
import {post} from '../../api';
import type {OpsProps,Row} from './types';

const stateNames:Record<string,string>={expected:'Belum hadir',arrived:'Sudah hadir',ready:'Siap bertugas',departed:'Sudah pulang'};
const nextState:Record<string,string>={expected:'arrived',arrived:'ready',ready:'departed'};
const nextLabel:Record<string,string>={expected:'Tandai Hadir',arrived:'Tandai Siap',ready:'Selesai Bertugas'};

export default function TeamCoordination({eventId,data,locked,canEdit,reload,notice}:OpsProps){
  const [busy,setBusy]=useState('');
  async function move(item:Row,kind:'crew'|'vendor'){
    const current=String(item.presence?.state||'expected'),next=nextState[current];if(!next)return;
    setBusy(`${kind}-${item.assignment_id}`);try{await post(`/projects/${eventId}/team/${kind}/${item.assignment_id}`,{state:next,note:''});
      await reload();notice('Status kehadiran tim diperbarui.');}catch(e){notice((e as Error).message,true);}finally{setBusy('');}}
  const render=(title:string,kind:'crew'|'vendor',items:Row[])=><div className="team-group"><div className="team-title">
    {kind==='crew'?<UsersRound size={18}/>:<Truck size={18}/>}<h4>{title}</h4><span>{items.filter(t=>['arrived','ready'].includes(String(t.presence?.state))).length} / {items.length} hadir/siap</span></div>
    <div className="team-list">{items.map(item=>{const current=String(item.presence?.state||'expected');return <div key={item.assignment_id} className="team-item">
      <div className={`team-avatar ${current==='ready'?'ready':''}`}>{current==='ready'?<CheckCircle2 size={18}/>:kind==='crew'?<UsersRound size={18}/>:<Truck size={18}/>}</div>
      <div className="team-person"><strong>{item.name}</strong><small>{kind==='crew'?(item.assignment||item.position):(item.service_name||'Vendor')}</small></div>
      <span className={`pc-tag ${current==='ready'?'success':'neutral'}`}>{stateNames[current]}</span>
      {canEdit&&!locked&&nextState[current]&&<button type="button" className="pc-btn ghost" disabled={busy!==''}
        onClick={()=>void move(item,kind)}>{nextLabel[current]}</button>}
    </div>;})}{!items.length&&<div className="pc-empty">Belum ada penugasan {kind==='crew'?'crew':'vendor'} pada project ini.</div>}</div></div>;
  const crew=(data?.crew??[]) as Row[],vendors=(data?.vendors??[]) as Row[];
  return <section className="pc-card"><div className="pc-head"><div><span className="pc-kicker">FIELD COORDINATION</span><h3>Kehadiran Crew & Vendor</h3>
    <p>Tandai kedatangan dan kesiapan tim yang sudah ditugaskan dalam wedding. Harga dan kontrak tetap dikelola di modul Vendor/Crew.</p></div>
    <span className="pc-tag neutral"><ShieldCheck size={14}/> Status lapangan</span></div>
    <div className="team-groups">{render('Crew wedding','crew',crew)}{render('Vendor partner','vendor',vendors)}</div>
    <p className="gantt-help"><MapPin size={13}/> Status mengikuti urutan Belum Hadir → Hadir → Siap → Pulang. Perubahan dicatat di audit project.</p>
  </section>;
}
