import {useState,type FormEvent} from 'react';
import {AlertTriangle,X} from 'lucide-react';
import {motion} from 'motion/react';
import './record-actions.css';

export type ReasonRequest={label:string;endpoint:string};
export default function ReasonDialog({request,onClose,onConfirm}:{request:ReasonRequest;onClose:()=>void;onConfirm:(reason:string)=>Promise<void>}){
  const [reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function submit(event:FormEvent){event.preventDefault();if(reason.trim().length<5){setError('Alasan pembatalan minimal 5 karakter.');return;}
    setBusy(true);setError('');try{await onConfirm(reason.trim());}catch(cause){setError((cause as Error).message);}finally{setBusy(false);}}
  return <motion.div className="modal-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:.14}} onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onClose();}}><motion.section className="reason-modal" initial={{opacity:0,scale:.987}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.987}} transition={{duration:.18}} role="dialog" aria-modal="true" aria-label="Alasan pembatalan">
    <div className="reason-modal-head"><div className="reason-modal-icon"><AlertTriangle size={21}/></div><div><h2>{request.label}</h2><p>Masukkan alasan agar riwayat pembatalan dapat ditelusuri.</p></div><button className="icon-button" type="button" aria-label="Tutup" disabled={busy} onClick={onClose}><X size={19}/></button></div>
    {/^\/events\/\d+\/cancel$/.test(request.endpoint)&&<p className="reason-finance-note">Pembatalan wedding tidak otomatis mengembalikan DP atau menghapus invoice dan jurnal. Tindak lanjut keuangan dikelola terpisah.</p>}
    <form onSubmit={submit}><label htmlFor="reason-input">Alasan pembatalan <b>*</b></label><textarea id="reason-input" rows={4} maxLength={2000} required minLength={5} autoFocus placeholder="Contoh: Klien membatalkan acara karena perubahan rencana keluarga..." value={reason} onChange={event=>setReason(event.target.value)}/>
      <small>{reason.length}/2000 karakter · Wajib diisi</small>{error&&<div className="inline-error">{error}</div>}
      <div className="reason-modal-footer"><button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>Kembali</button><button className="submit-inline danger" type="submit" disabled={busy}>{busy?'Memproses...':'Konfirmasi Pembatalan'}</button></div></form>
  </motion.section></motion.div>;
}
