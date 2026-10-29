import {useState,type FormEvent} from 'react';
import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import {Check,FilePenLine,Plus,Trash2,X} from 'lucide-react';
import {post,formatRp,humanDate} from '../../api';
import type {SectionProps} from './types';

type Line={title:string;action:'add'|'remove';fulfillment:'internal'|'managed_vendor'|'client_direct';
  quantity:string;unit_sell:string;unit_cost:string};
const blank=():Line=>({title:'',action:'add',fulfillment:'managed_vendor',quantity:'1',unit_sell:'0',unit_cost:'0'});

export default function ChangeOrders({eventId,data,canFinance,canApprove,locked,reload,notice}:SectionProps){
  const reduced=useReducedMotion();
  const [explanation,setExplanation]=useState(''),[lines,setLines]=useState<Line[]>([blank()]);
  const [editing,setEditing]=useState(false),[busy,setBusy]=useState(false);
  const [deciding,setDeciding]=useState<{id:number;action:'approve'|'reject'}|null>(null),[decisionText,setDecisionText]=useState('');
  if(!canFinance)return null;
  const changeLine=(index:number,key:keyof Line,value:string)=>setLines(current=>current.map((line,i)=>i===index?{...line,[key]:value}:line));
  async function submit(event:FormEvent){event.preventDefault();if(busy)return;setBusy(true);
    try{await post(`/projects/${eventId}/change-orders`,{explanation,lines});await reload();
      setExplanation('');setLines([blank()]);setEditing(false);notice('Change Order diajukan. Kontrak belum berubah sebelum disetujui.');}
    catch(error){notice((error as Error).message,true);}finally{setBusy(false);}
  }
  async function decide(event:FormEvent){event.preventDefault();if(!deciding||busy)return;setBusy(true);
    try{await post(`/projects/${eventId}/change-orders/${deciding.id}/${deciding.action}`,
      deciding.action==='approve'?{client_approval_reference:decisionText}:{reason:decisionText});
      await reload();setDeciding(null);setDecisionText('');
      notice(deciding.action==='approve'?'Perubahan kontrak disetujui, histori revisi dibuat.':'Change Order ditolak tanpa mengubah kontrak.');}
    catch(error){notice((error as Error).message,true);}finally{setBusy(false);}
  }
  return <section className="pc-card">
    <div className="pc-head"><div><span className="pc-kicker">CONTRACT CHANGE MANAGEMENT</span><h3>Change Order / Revisi layanan</h3><p>Tambah atau kurangi layanan setelah deal. Persetujuan pemilik/admin dan bukti persetujuan klien wajib sebelum nilai kontrak berubah.</p></div>
      {!locked&&!editing&&<button type="button" className="pc-btn" onClick={()=>setEditing(true)}><Plus size={16}/> Ajukan Perubahan</button>}</div>
    <AnimatePresence>{editing&&!locked&&<motion.form className="pc-change-form" onSubmit={submit}
      initial={reduced?false:{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={reduced?undefined:{opacity:0,y:-4}} transition={{duration:.18}}>
      <div className="pc-form-title"><strong>Perubahan baru</strong><button type="button" className="pc-icon-btn" aria-label="Tutup form" onClick={()=>setEditing(false)}><X size={18}/></button></div>
      <label className="pc-full-label">Alasan dan deskripsi perubahan<textarea rows={2} minLength={5} maxLength={350} required value={explanation} onChange={e=>setExplanation(e.target.value)}
        placeholder="Contoh: Penambahan lighting setelah technical meeting"/></label>
      {lines.map((line,index)=><div className="pc-change-line" key={index}>
        <div className="pc-form-title"><strong>Item #{index+1}</strong>{lines.length>1&&<button type="button" className="pc-icon-btn danger" onClick={()=>setLines(current=>current.filter((_,i)=>i!==index))} aria-label={`Hapus item ${index+1}`}><Trash2 size={16}/></button>}</div>
        <div className="pc-form-grid"><label className="pc-wide">Nama layanan<input required maxLength={200} value={line.title} onChange={e=>changeLine(index,'title',e.target.value)} placeholder="Dekorasi tambahan"/></label>
          <label>Jenis perubahan<select value={line.action} onChange={e=>changeLine(index,'action',e.target.value)}>
            <option value="add">Tambah layanan</option><option value="remove">Kurangi layanan</option></select></label>
          <label>Pembayaran<select value={line.fulfillment} onChange={e=>changeLine(index,'fulfillment',e.target.value)}>
            <option value="internal">Internal WO</option><option value="managed_vendor">Vendor dikelola WO</option><option value="client_direct">Klien bayar vendor langsung</option></select></label>
          <label>Kuantitas<input required type="number" min="0.001" step="0.001" value={line.quantity} onChange={e=>changeLine(index,'quantity',e.target.value)}/></label>
          <label>Harga jual/unit (Rp)<input required type="number" min="0" step="0.01" value={line.unit_sell} onChange={e=>changeLine(index,'unit_sell',e.target.value)}/></label>
          {line.fulfillment!=='client_direct'&&<label>Biaya/unit WO (Rp)<input required type="number" min="0" step="0.01" value={line.unit_cost} onChange={e=>changeLine(index,'unit_cost',e.target.value)}/></label>}
        </div></div>)}
      <div className="pc-dialog-actions"><button type="button" className="pc-btn-secondary" disabled={lines.length>=30} onClick={()=>setLines(current=>[...current,blank()])}><Plus size={15}/> Tambah item</button>
        <button type="submit" className="pc-btn" disabled={busy}><FilePenLine size={16}/>{busy?'Mengirim...':'Ajukan Change Order'}</button></div>
    </motion.form>}</AnimatePresence>
    <div className="pc-stack">
      {data.changes.map(change=><article key={change.id} className="pc-change-card"><div className="pc-change-card-head"><div><small className="pc-kicker">{change.number} · {humanDate(change.created_at)}</small>
        <strong>{change.explanation}</strong></div><span className={`pc-tag ${change.status==='approved'?'success':change.status==='rejected'?'danger':'neutral'}`}>
          {change.status==='approved'?'Disetujui':change.status==='rejected'?'Ditolak':'Menunggu persetujuan'}</span></div>
        <div className="pc-change-totals"><span>Δ Kontrak WO: <b>{formatRp(change.delta_contract)}</b></span>
          <span>Δ Biaya WO: <b>{formatRp(change.delta_cost)}</b></span><span>Δ Vendor langsung: <b>{formatRp(change.delta_direct)}</b></span></div>
        <div className="pc-change-items">{change.lines?.map((line:Record<string,any>)=><div key={line.id}>
          <span>{line.action==='add'?'+':'−'} {line.title} <small>({Number(line.quantity).toLocaleString('id-ID')}×; {line.fulfillment==='client_direct'?'dibayar klien':'kontrak WO'})</small></span><b>{formatRp(line.delta_sell)}</b>
        </div>)}</div>
        {change.client_approval_reference&&<p className="pc-note">Persetujuan klien: {change.client_approval_reference}</p>}
        {change.decision_reason&&<p className="pc-danger-note">Alasan penolakan: {change.decision_reason}</p>}
        {change.status==='submitted'&&canApprove&&!locked&&<div className="pc-dialog-actions"><button className="pc-btn-secondary" type="button" onClick={()=>{setDeciding({id:change.id,action:'reject'});setDecisionText('');}}>Tolak</button>
          <button className="pc-btn" type="button" onClick={()=>{setDeciding({id:change.id,action:'approve'});setDecisionText('');}}><Check size={15}/> Setujui</button></div>}
        {deciding!==null&&deciding.id===change.id&&<form className="pc-decision" onSubmit={decide}><label>{deciding.action==='approve'?'Referensi persetujuan klien (WA/email/dokumen)':'Alasan penolakan'}
          <input required minLength={5} maxLength={deciding.action==='approve'?200:350} value={decisionText} onChange={e=>setDecisionText(e.target.value)} placeholder={deciding.action==='approve'?'Contoh: WA klien 28/10/2026':'Masukkan alasan...'} /></label>
          <div className="pc-dialog-actions"><button type="button" className="pc-btn-secondary" onClick={()=>setDeciding(null)}>Batal</button>
            <button className="pc-btn" disabled={busy}>{busy?'Memproses...':'Konfirmasi'}</button></div></form>}
      </article>)}
      {!data.changes.length&&<div className="pc-empty">Belum ada revisi layanan. Nilai kontrak tetap mengikuti quotation atau kontrak awal.</div>}
    </div>
  </section>;
}
