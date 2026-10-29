import {useState,type FormEvent} from 'react';
import {CheckCircle2,Clock3,FilePlus2,Plus,ReceiptText,Trash2} from 'lucide-react';
import {api,post,formatRp,humanDate,isoToday} from '../../api';
import type {SectionProps} from './types';

export default function PaymentPlan({eventId,data,canFinance,locked,reload,notice,onCreate}:SectionProps){
  const [label,setLabel]=useState('DP Kontrak'),[value,setValue]=useState(''),[due,setDue]=useState(isoToday());
  const [busy,setBusy]=useState(false),[workingId,setWorkingId]=useState<number|null>(null);
  if(!canFinance||!data.totals)return null;
  const total=data.totals;
  const active=data.terms.filter(term=>term.status==='planned');
  const scheduled=active.reduce((sum,t)=>sum+Number(t.amount),0);
  const unplanned=Math.max(0,Number(total.contract_amount)-scheduled);
  async function addTerm(event:FormEvent){
    event.preventDefault();if(busy||locked)return;setBusy(true);
    try{
      await post(`/projects/${eventId}/payment-schedules`,{label,amount:value,due_date:due,idempotency_key:crypto.randomUUID()});
      await reload();setValue('');notice('Termin pembayaran ditambahkan. Belum membentuk piutang sampai invoice diterbitkan.');
    }catch(error){notice((error as Error).message,true);}finally{setBusy(false);}
  }
  async function issue(termId:number){
    setWorkingId(termId);
    try{await post(`/projects/${eventId}/payment-schedules/${termId}/issue`,{});await reload();notice('Invoice dan jurnal piutang berhasil diterbitkan.');}
    catch(error){notice((error as Error).message,true);}finally{setWorkingId(null);}
  }
  async function cancel(termId:number){
    const reason=window.prompt('Alasan pembatalan termin (minimal 5 karakter):');if(!reason)return;
    setWorkingId(termId);
    try{await post(`/projects/${eventId}/payment-schedules/${termId}/cancel`,{reason});await reload();notice('Termin dibatalkan. Histori tetap tersimpan.');}
    catch(error){notice((error as Error).message,true);}finally{setWorkingId(null);}
  }
  return <section className="pc-card">
    <div className="pc-head"><div><span className="pc-kicker">CLIENT RECEIVABLES</span><h3>Termin & pembayaran klien</h3><p>Rencanakan DP, termin lanjutan, dan pelunasan. Invoice dibuat satu kali per termin dan tercatat dalam jurnal yang sama.</p></div><ReceiptText size={23}/></div>
    <div className="pc-kpi-grid"><div><span>Nilai kontrak WO</span><strong>{formatRp(total.contract_amount)}</strong></div>
      <div><span>Sudah diterima</span><strong className="pc-positive">{formatRp(total.invoice_paid)}</strong></div>
      <div><span>Piutang terbit</span><strong>{formatRp(total.invoice_balance)}</strong></div>
      <div><span>Belum dijadwalkan</span><strong>{formatRp(unplanned)}</strong></div></div>
    {!locked&&<form className="pc-term-form" onSubmit={addTerm}><label>Nama termin<input required maxLength={140} value={label} onChange={e=>setLabel(e.target.value)} placeholder="DP 30% / Termin 2 / Pelunasan"/></label>
      <label>Nominal (Rp)<input required type="number" min="0.01" step="0.01" value={value} onChange={e=>setValue(e.target.value)}/></label>
      <label>Jatuh tempo<input required type="date" value={due} onChange={e=>setDue(e.target.value)}/></label>
      <button className="pc-btn" disabled={busy}><Plus size={16}/>{busy?'Menyimpan...':'Tambah Termin'}</button></form>}
    <div className="pc-table-scroll"><table className="pc-table"><thead><tr><th>Termin</th><th>Jatuh Tempo</th><th>Jumlah</th><th>Invoice / Dibayar</th><th>Status / Aksi</th></tr></thead><tbody>
      {data.terms.map(term=><tr key={term.id}><td><strong>{term.label}</strong>{term.cancel_reason&&<small className="pc-danger-note">{term.cancel_reason}</small>}</td>
        <td>{humanDate(term.due_date)}</td><td>{formatRp(term.amount)}</td><td>{term.invoice_number?<><strong>{term.invoice_number}</strong>
          <small>Terbayar {formatRp(term.paid)}</small></>:<small>Belum diterbitkan</small>}</td>
        <td><div className="pc-cell-actions">
          {term.status==='cancelled'?<span className="pc-tag danger">Dibatalkan</span>:
          term.invoice_cancel_reason?<><span className="pc-tag danger">Invoice dibatalkan</span>
            {!locked&&<button type="button" className="pc-text-btn" disabled={workingId===term.id} onClick={()=>issue(Number(term.id))}>Terbitkan ulang</button>}</>:
          term.invoice_id?Number(term.paid)>=Number(term.amount)?<span className="pc-tag success"><CheckCircle2 size={12}/> Lunas</span>:
            <button className="pc-text-btn" type="button" disabled={locked} onClick={()=>onCreate('payment',{
              kind:'invoices',item:{id:term.invoice_id,amount:term.amount,paid:term.paid,number:term.invoice_number}})}>Catat pembayaran</button>:
          <><button className="pc-text-btn" type="button" disabled={locked||workingId===term.id} onClick={()=>issue(Number(term.id))}><FilePlus2 size={14}/> Terbitkan invoice</button>
            <button className="pc-icon-btn danger" type="button" aria-label={`Batalkan termin ${term.label}`} disabled={locked||workingId===term.id} onClick={()=>cancel(Number(term.id))}><Trash2 size={15}/></button></>}
        </div></td></tr>)}
      {!data.terms.length&&<tr><td colSpan={5}><div className="pc-empty">Belum ada termin. Buat DP dan jadwal pelunasan sesuai kontrak.</div></td></tr>}
    </tbody></table></div>
    <div className="pc-note"><Clock3 size={15}/> Rencana termin tidak menambah saldo kas ataupun piutang sampai invoice terbit. Pembayaran aktual dicatat sekali melalui modul Invoice.</div>
  </section>;
}
