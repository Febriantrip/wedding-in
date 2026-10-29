import {useState,type FormEvent} from 'react';
import {AlertCircle,Archive,CheckCircle2,ClipboardCheck,LockKeyhole,ShieldCheck} from 'lucide-react';
import {formatRp,post} from '../../api';
import type {OpsProps} from './types';

export default function ProjectClosing({eventId,data,locked,canFinance,canApprove,notice,reload}:OpsProps){
  const [note,setNote]=useState('Seluruh persiapan, dokumen, dan keuangan telah diperiksa.'),[busy,setBusy]=useState(false);
  const closing=data.closing,issues=(data.blockers??[]) as string[],completed=data.event?.status==='completed';
  const snapshot=closing?.summary_json?(typeof closing.summary_json==='string'?JSON.parse(closing.summary_json):closing.summary_json):null;
  async function submit(e:FormEvent){e.preventDefault();setBusy(true);try{
    await post(`/projects/${eventId}/closing/request`,{note});await reload();notice('Permintaan penutupan diajukan ke manajemen.');
  }catch(error){notice((error as Error).message,true);}finally{setBusy(false);}}
  async function decide(action:'approve'|'reject'){
    const value=window.prompt(action==='approve'?'Catatan keputusan penutupan (minimal 8 karakter):':'Alasan menolak penutupan (minimal 8 karakter):');
    if(!value)return;
    setBusy(true);try{await post(`/projects/${eventId}/closing/${action}`,action==='approve'?{note:value}:{reason:value});
      await reload();notice(action==='approve'?'Wedding berhasil ditutup. Laba dan histori telah disimpan.':'Permintaan penutupan ditolak.');}
    catch(error){notice((error as Error).message,true);}finally{setBusy(false);}}
  return <div className="pc-stack"><section className="pc-card"><div className="pc-head"><div><span className="pc-kicker">PROJECT CLOSEOUT & ARCHIVE</span>
    <h3>Penutupan proyek terkendali</h3><p>Selesaikan kewajiban vendor, klien, checklist, dan approval sebelum menutup wedding. Pendapatan akrual akan diakui melalui jurnal sekali saat disetujui.</p></div>
    {completed?<CheckCircle2 size={23}/>:<Archive size={23}/>}</div>
    <div className="op-close-status"><span className={`pc-tag ${completed?'success':issues.length?'danger':'neutral'}`}>
      {completed?'Project selesai':issues.length?`${issues.length} pemeriksaan belum lolos`:closing?.status==='requested'?'Menunggu persetujuan':'Siap diajukan'}</span>
      {closing&&<span>Permintaan: {closing.status==='requested'?'Menunggu keputusan':closing.status==='rejected'?'Ditolak':closing.status==='completed'?'Disetujui':'—'}</span>}</div>
    {!completed&&<div className="op-closing-checks">{issues.length?issues.map((issue,i)=><div key={i} className="op-closing-issue"><AlertCircle size={16}/>{issue}</div>):
      <div className="op-closing-ready"><ShieldCheck size={18}/> Checklist, invoice, tagihan, dan perubahan proyek tidak memiliki hambatan penutupan.</div>}</div>}
    {closing?.decision_note&&<div className="pc-note"><ClipboardCheck size={15}/> Catatan keputusan: {closing.decision_note}</div>}
    {completed&&<div className="op-closed-message"><LockKeyhole size={19}/><div><strong>Project telah diarsipkan.</strong>
      <p>Riwayat, bukti transfer, invoice, jurnal, dan seluruh aktivitas tetap dapat dibaca. Input dan perubahan proyek terkunci.</p></div></div>}
    {snapshot&&<div className="pc-kpi-grid op-close-kpis"><div><span>Nilai kontrak</span><strong>{formatRp(snapshot.contract_amount)}</strong></div>
      <div><span>Pendapatan diakui</span><strong>{formatRp(snapshot.revenue)}</strong></div>
      <div><span>Biaya aktual</span><strong>{formatRp(snapshot.cost)}</strong></div>
      <div><span>Laba akhir (jurnal)</span><strong>{formatRp(snapshot.profit)}</strong></div></div>}
    {canFinance&&!locked&&!completed&&(!closing||closing.status==='rejected')&&<form onSubmit={submit} className="op-close-form">
      <label>Catatan pengajuan penutupan<textarea required rows={2} minLength={8} maxLength={600} value={note} onChange={e=>setNote(e.target.value)}/></label>
      <button className="pc-btn" type="submit" disabled={busy||issues.length>0}><Archive size={15}/> Ajukan penutupan</button></form>}
    {canApprove&&!locked&&closing?.status==='requested'&&!completed&&<div className="pc-dialog-actions">
      <button className="pc-btn-secondary" type="button" disabled={busy} onClick={()=>decide('reject')}>Tolak permintaan</button>
      <button className="pc-btn" type="button" disabled={busy||issues.length>0} onClick={()=>decide('approve')}><ShieldCheck size={16}/> Setujui & tutup project</button></div>}
  </section></div>;
}
