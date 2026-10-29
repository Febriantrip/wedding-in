import {useState,type ChangeEvent} from 'react';
import {Banknote,CalendarClock,FileCheck2,FileUp,Plus,ShieldCheck,WalletCards} from 'lucide-react';
import {api,formatRp,humanDate,post} from '../../api';
import type {OpsProps,Row} from './types';

const num=(value:unknown)=>Number(value)||0;
type FilePayload={file_name:string;mime_type:string;data_base64:string};
async function encodedFile(file:File):Promise<FilePayload>{
  if(file.size>900_000)throw new Error('Bukti transfer maksimal 900 KB.');
  if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type))
    throw new Error('Pilih JPG, PNG, WebP, atau PDF.');
  const data=await new Promise<string>((resolve,reject)=>{
    const reader=new FileReader();reader.onerror=()=>reject(new Error('File tidak dapat dibaca.'));
    reader.onload=()=>resolve(String(reader.result));reader.readAsDataURL(file);
  });
  return {file_name:file.name,mime_type:file.type,data_base64:data.slice(data.indexOf(',')+1)};
}

export default function VendorPaymentTracker({eventId,data,locked,canFinance,notice,reload,onCreate}:OpsProps){
  const [selected,setSelected]=useState<number|null>(null),[busy,setBusy]=useState(false);
  const bookings=(data.bookings??[]) as Row[],bills=(data.bills??[]) as Row[],payments=(data.payments??[]) as Row[],proofs=(data.proofs??[]) as Row[];
  const managed=bookings.filter(v=>v.payment_responsibility!=='client_direct'&&v.booking_status!=='cancelled');
  const direct=bookings.filter(v=>v.payment_responsibility==='client_direct'&&v.booking_status!=='cancelled');
  const activeBills=bills.filter(b=>!num(b.cancelled)),activePayments=payments.filter(p=>!num(p.cancelled));
  const billed=activeBills.reduce((a,b)=>a+num(b.amount),0),paid=activePayments.reduce((a,p)=>a+num(p.amount),0);
  async function upload(e:ChangeEvent<HTMLInputElement>,paymentId:number){const file=e.target.files?.[0];if(!file)return;
    setBusy(true);setSelected(paymentId);
    try{const payload=await encodedFile(file);await post(`/projects/${eventId}/vendor-payments/${paymentId}/proofs`,payload);
      await reload();notice('Bukti transfer berhasil disimpan tanpa menggandakan pembayaran.');}
    catch(reason){notice((reason as Error).message,true);}finally{setBusy(false);e.target.value='';}}
  async function downloadProof(proofId:number){setBusy(true);try{
    const file=await api<{data_base64:string;mime_type:string;file_name:string}>(`/projects/${eventId}/vendor-payments/proofs/${proofId}`);
    const anchor=document.createElement('a');anchor.href=`data:${file.mime_type};base64,${file.data_base64}`;
    anchor.download=file.file_name;document.body.appendChild(anchor);anchor.click();anchor.remove();
  }catch(e){notice((e as Error).message,true);}finally{setBusy(false);}}
  return <div className="pc-stack"><section className="pc-card"><div className="pc-head"><div><span className="pc-kicker">VENDOR PAYMENT MONITOR</span>
    <h3>DP, pelunasan & bukti transfer vendor</h3><p>Nominal riil diambil dari tagihan dan pembayaran Backoffice. Tidak membuat jurnal pembayaran kedua.</p></div><WalletCards size={21}/></div>
    <div className="pc-kpi-grid"><div><span>Tagihan WO</span><strong>{formatRp(billed)}</strong></div>
      <div><span>Sudah dibayar</span><strong className="pc-positive">{formatRp(paid)}</strong></div>
      <div><span>Sisa tagihan</span><strong className={billed-paid>0?'pc-negative':''}>{formatRp(Math.max(0,billed-paid))}</strong></div>
      <div><span>Vendor bayar langsung klien</span><strong>{direct.length} vendor</strong></div></div>
    <div className="op-vendor-grid">{managed.map(v=>{
      const vendorBills=activeBills.filter(b=>Number(b.vendor_id)===Number(v.vendor_id));
      const allPaid=activePayments.filter(p=>vendorBills.some(b=>Number(b.id)===Number(p.bill_id)));
      const cost=vendorBills.reduce((a,b)=>a+num(b.amount),0),realized=allPaid.reduce((a,p)=>a+num(p.amount),0);
      return <div className="op-vendor-card" key={v.assignment_id}><div className="op-vendor-card-top"><div className="pc-mark"><Banknote size={18}/></div>
        <div><strong>{v.vendor_name}</strong><small>{v.service_name||'Vendor event'} · {v.booking_status||'Belum dikonfirmasi'}</small></div></div>
        <div className="op-vendor-terms"><span>Harga booking <b>{formatRp(v.agreed_price)}</b></span><span>DP disepakati <b>{formatRp(v.deposit_amount)}</b></span>
          <span><CalendarClock size={13}/> DP {humanDate(v.deposit_due)}</span><span>Pelunasan {humanDate(v.final_due)}</span></div>
        <div className="op-vendor-balance"><span>Tagihan: {formatRp(cost)}</span><strong>Terbayar: {formatRp(realized)}</strong></div>
        {canFinance&&!locked&&Math.max(0,num(v.agreed_price)-cost)>0&&<button type="button" className="pc-btn-secondary" onClick={()=>onCreate('bill',{event_id:eventId,vendor_id:v.vendor_id,
          description:`Tagihan ${v.service_name||v.vendor_name}`,amount:Math.max(0,num(v.agreed_price)-cost)})}><Plus size={14}/> Catat tagihan di Backoffice</button>}
        {vendorBills.length>0&&<div className="op-vendor-bills">{vendorBills.map(b=>{
          const paymentsForBill=allPaid.filter(p=>Number(p.bill_id)===Number(b.id));
          return <div key={b.id}><strong>{b.number}</strong><small>{formatRp(b.amount)} · jatuh tempo {humanDate(b.due_date)}</small>
            {paymentsForBill.map(p=><div className="op-payment" key={p.id}><span><FileCheck2 size={13}/>{humanDate(p.paid_at)} · {formatRp(p.amount)}<small>{p.reference||p.method}</small></span>
              <div className="op-proof-actions">{proofs.filter(f=>Number(f.bill_payment_id)===Number(p.id)).map(f=><button type="button" key={f.id}
                disabled={busy} className="pc-text-btn" onClick={()=>downloadProof(Number(f.id))}>Bukti #{f.id}</button>)}
                {!locked&&<label className="pc-text-btn" title="Lampirkan bukti transfer"><FileUp size={13}/>
                  {selected===Number(p.id)&&busy?'Menyimpan...':'Lampirkan'}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                    disabled={busy} className="op-hidden-file" onChange={e=>upload(e,Number(p.id))}/></label>}</div></div>)}</div>;})}</div>}
      </div>;})}</div>
    {!managed.length&&<div className="pc-empty">Belum ada vendor dikelola WO. Tambahkan dan konfirmasi dari tab Vendor & Booking.</div>}
  </section>
  {direct.length>0&&<section className="pc-card"><div className="pc-head"><div><span className="pc-kicker">CLIENT DIRECT — OFF BOOKS</span>
    <h3>Vendor dibayar langsung oleh klien</h3><p>Ditampilkan sebagai informasi proyek saja, tidak menjadi utang, biaya, ataupun pengeluaran Wedding-In.</p></div><ShieldCheck size={22}/></div>
    <div className="op-direct-list">{direct.map(v=><div key={v.assignment_id}><strong>{v.vendor_name}</strong><span>{v.service_name||'Layanan vendor'}</span><b>{formatRp(v.agreed_price)}</b></div>)}</div></section>}
  </div>;
}
