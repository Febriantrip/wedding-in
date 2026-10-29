import {useState,type FormEvent} from 'react';
import {AlertTriangle,BadgeCheck,ClipboardCheck,FileClock,Plus,ShieldAlert} from 'lucide-react';
import {formatRp,humanDate,isoToday,post} from '../../api';
import type {OpsProps,Row} from './types';

const labels:Record<string,string>={submitted:'Menunggu approval',approved:'Disetujui — menunggu transaksi',rejected:'Ditolak',fulfilled:'Realisasi tercatat'};
const number=(value:unknown)=>Number(value)||0;

export default function ExpenseApprovals({eventId,data,locked,canFinance,canEdit,canApprove,reload,notice}:OpsProps){
  const [showForm,setShowForm]=useState(false),[title,setTitle]=useState(''),[value,setValue]=useState(''),
    [due,setDue]=useState(isoToday()),[explanation,setExplanation]=useState(''),[busy,setBusy]=useState(false);
  const [selection,setSelection]=useState<Record<number,string>>({});
  const requests=(data.requests??[]) as Row[],transactions=(data.transactions??[]) as Row[];
  async function submit(e:FormEvent){e.preventDefault();setBusy(true);try{
    await post(`/projects/${eventId}/expense-requests`,{title,amount:value,needed_by:due,explanation});
    await reload();setShowForm(false);setTitle('');setValue('');setExplanation('');notice('Pengeluaran berhasil diajukan untuk disetujui.');
  }catch(error){notice((error as Error).message,true);}finally{setBusy(false);}}
  async function act(request:Row,action:'approve'|'reject'|'link'){
    let payload:Record<string,unknown>={};
    if(action==='approve'){const note=window.prompt('Catatan persetujuan:', 'Disetujui');if(note===null)return;payload={note};}
    if(action==='reject'){const reason=window.prompt('Alasan penolakan (minimal 8 karakter):');if(!reason)return;payload={reason};}
    if(action==='link'){if(!selection[Number(request.id)]){notice('Pilih transaksi yang sudah posted di Backoffice.',true);return;}
      payload={transaction_id:Number(selection[Number(request.id)])};}
    setBusy(true);try{await post(`/projects/${eventId}/expense-requests/${request.id}/${action}`,payload);
      await reload();notice(action==='approve'?'Pengeluaran disetujui.':action==='reject'?'Pengeluaran ditolak.':'Transaksi nyata berhasil ditautkan tanpa jurnal tambahan.');}
    catch(error){notice((error as Error).message,true);}finally{setBusy(false);}}
  return <section className="pc-card"><div className="pc-head"><div><span className="pc-kicker">CONTROLLED SPENDING</span>
    <h3>Purchase Request & Expense Approval</h3><p>Ajukan kebutuhan biaya, dapatkan persetujuan manajemen, lalu tautkan transaksi pengeluaran yang sudah diposting di Backoffice.</p></div>
    {(canEdit||canFinance)&&!locked&&<button type="button" className="pc-btn" onClick={()=>setShowForm(!showForm)}><Plus size={16}/>{showForm?'Tutup form':'Ajukan biaya'}</button>}</div>
    <div className="pc-note"><ShieldAlert size={16}/> Pengajuan biaya tidak mengurangi saldo bank atau menambah jurnal sampai transaksi aslinya diposting oleh Backoffice.</div>
    {showForm&&<form className="op-expense-form" onSubmit={submit}><div className="pc-form-grid"><label>Nama kebutuhan<input required maxLength={180}
      placeholder="Transportasi crew, kebutuhan lokasi..." value={title} onChange={e=>setTitle(e.target.value)}/></label>
      <label>Nilai diajukan (Rp)<input required type="number" step="0.01" min="0.01" value={value} onChange={e=>setValue(e.target.value)}/></label>
      <label>Tanggal diperlukan<input type="date" required value={due} onChange={e=>setDue(e.target.value)}/></label>
      <label className="pc-wide">Alasan / kebutuhan<textarea required minLength={8} maxLength={600} rows={2} value={explanation}
        onChange={e=>setExplanation(e.target.value)} placeholder="Jelaskan kebutuhan dan kegunaannya untuk project..."/></label></div>
      <div className="pc-dialog-actions"><button type="button" className="pc-btn-secondary" onClick={()=>setShowForm(false)}>Batal</button>
        <button className="pc-btn" disabled={busy} type="submit"><ClipboardCheck size={15}/> Kirim pengajuan</button></div></form>}
    <div className="op-requests">{requests.map(r=>{
      const matching=transactions.filter(t=>number(t.amount)===number(r.amount));
      return <article className="op-request" key={r.id}><div className="op-request-header"><div><strong>{r.title}</strong>
        <small>Pengaju: {r.requester_name} · Diperlukan {humanDate(r.needed_by)}</small></div>
        <span className={`pc-tag ${r.status==='fulfilled'?'success':r.status==='rejected'?'danger':'neutral'}`}>{labels[r.status]||r.status}</span></div>
        <div className="op-request-money">{formatRp(r.amount)}<small>{r.explanation}</small></div>
        {r.review_note&&<div className="op-request-note"><BadgeCheck size={14}/> {r.review_note} — {r.reviewer_name||'Reviewer'}</div>}
        {r.transaction_number&&<div className="pc-note"><FileClock size={14}/> Realisasi melalui {r.transaction_number} ({r.transaction_status}).</div>}
        {canApprove&&!locked&&r.status==='submitted'&&<div className="pc-dialog-actions"><button type="button" className="pc-btn-secondary" disabled={busy}
          onClick={()=>act(r,'reject')}><AlertTriangle size={14}/> Tolak</button><button type="button" className="pc-btn" disabled={busy}
          onClick={()=>act(r,'approve')}><BadgeCheck size={14}/> Setujui</button></div>}
        {canFinance&&!locked&&r.status==='approved'&&<div className="op-link-row"><select aria-label={`Transaksi untuk ${r.title}`} value={selection[Number(r.id)]||''}
          onChange={e=>setSelection(old=>({...old,[Number(r.id)]:e.target.value}))}><option value="">Pilih transaksi posted sesuai nominal...</option>
          {matching.map(t=><option key={t.id} value={t.id}>{t.number} — {t.description} ({formatRp(t.amount)})</option>)}</select>
          <button type="button" className="pc-btn-secondary" disabled={busy||!selection[Number(r.id)]} onClick={()=>act(r,'link')}>Tautkan realisasi</button>
          {matching.length===0&&<small>Belum ada transaksi posted dengan nominal sama. Catat dan posting pengeluaran melalui menu Backoffice dahulu.</small>}</div>}
      </article>;})}{!requests.length&&<div className="pc-empty">Belum ada pengajuan pengeluaran untuk project ini.</div>}</div>
  </section>;
}
