import {useState,type FormEvent} from 'react';
import {motion,useReducedMotion} from 'motion/react';
import {Check,HandCoins,Handshake,Plus,X} from 'lucide-react';
import {api,formatRp,humanDate} from '../../api';
import type {ProjectRow,SectionProps} from './types';

type BookingForm={payment_responsibility:'managed_vendor'|'client_direct';booking_status:'requested'|'confirmed'|'cancelled';
  contract_reference:string;deposit_amount:string;deposit_due:string;final_due:string;terms:string;cancel_reason:string};
const fromVendor=(vendor:ProjectRow):BookingForm=>({
  payment_responsibility:vendor.payment_responsibility??'managed_vendor',
  booking_status:vendor.booking_status??'requested',
  contract_reference:vendor.contract_reference??'',deposit_amount:String(vendor.deposit_amount??'0'),
  deposit_due:vendor.deposit_due?String(vendor.deposit_due).slice(0,10):'',
  final_due:vendor.final_due?String(vendor.final_due).slice(0,10):'',
  terms:vendor.terms??'',cancel_reason:vendor.cancel_reason??''
});

export default function VendorBookings({eventId,data,canFinance,canEdit,locked,reload,notice,onCreate}:SectionProps){
  const reduced=useReducedMotion();
  const [editing,setEditing]=useState<ProjectRow|null>(null),[values,setValues]=useState<BookingForm|null>(null),[busy,setBusy]=useState(false);
  const set=<K extends keyof BookingForm>(key:K,value:BookingForm[K])=>setValues(previous=>previous?{...previous,[key]:value}:previous);
  async function save(event:FormEvent){
    event.preventDefault();if(!editing||!values||busy)return;
    setBusy(true);
    try{
      await api(`/projects/${eventId}/bookings/${editing.assignment_id}`,{method:'PUT',body:JSON.stringify({
        ...values,deposit_due:values.deposit_due||null,final_due:values.final_due||null})});
      await reload();setEditing(null);setValues(null);notice('Booking vendor dan histori proyek diperbarui.');
    }catch(error){notice((error as Error).message,true);}finally{setBusy(false);}
  }
  return <section className="pc-card">
    <div className="pc-head"><div><span className="pc-kicker">VENDOR PROCUREMENT</span><h3>Booking dan tanggung jawab pembayaran</h3><p>Konfirmasi vendor, nilai kesepakatan, DP, dan sumber pembayaran. Ketersediaan diperiksa saat konfirmasi.</p></div>
      {canEdit&&!locked&&<button className="pc-btn" type="button" onClick={()=>onCreate('assignVendor',{event_id:eventId})}><Plus size={16}/> Pilih vendor</button>}</div>
    <div className="pc-stack">
      {data.vendors.map(vendor=><motion.article key={vendor.assignment_id} className="pc-vendor" initial={reduced?false:{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{duration:.18}}>
        <div className="pc-vendor-top"><div className="pc-mark"><Handshake size={19}/></div><div className="pc-grow"><strong>{vendor.vendor_name}</strong><small>{vendor.category} · {vendor.service_name||'Layanan belum diisi'}</small></div>
          <span className={`pc-tag ${vendor.booking_status==='confirmed'?'success':vendor.booking_status==='cancelled'?'danger':'neutral'}`}>
            {vendor.booking_status==='confirmed'?'Terkonfirmasi':vendor.booking_status==='cancelled'?'Dibatalkan':vendor.booking_status==='requested'?'Booking diajukan':'Belum dibooking'}</span></div>
        <div className="pc-vendor-detail"><span><HandCoins size={14}/> {vendor.payment_responsibility==='client_direct'?'Klien membayar vendor langsung':'Dikelola Wedding-In'}</span>
          {canFinance&&<span>Harga: <b>{formatRp(vendor.agreed_price)}</b></span>}
          {canFinance&&vendor.booking_id&&<span>DP: <b>{formatRp(vendor.deposit_amount)}</b></span>}
          {vendor.deposit_due&&<span>Jatuh tempo DP: {humanDate(vendor.deposit_due)}</span>}
          {vendor.contract_reference&&<span>Referensi: {vendor.contract_reference}</span>}</div>
        {vendor.cancel_reason&&<p className="pc-danger-note">Alasan pembatalan: {vendor.cancel_reason}</p>}
        <div className="pc-vendor-actions">
          {canFinance&&!locked&&<button type="button" className="pc-text-btn" onClick={()=>{setEditing(vendor);setValues(fromVendor(vendor));}}>
            {vendor.booking_id?'Kelola booking':'Buat booking'}
          </button>}
          {canFinance&&vendor.payment_responsibility!=='client_direct'&&vendor.booking_status==='confirmed'&&!locked&&
            <button type="button" className="pc-text-btn" onClick={()=>onCreate('bill',{event_id:eventId,vendor_id:vendor.vendor_id,
              description:`Vendor ${vendor.vendor_name} · ${vendor.service_name||'Layanan'}`,amount:String(vendor.agreed_price)})}>Catat tagihan vendor</button>}
        </div>
      </motion.article>)}
      {!data.vendors.length&&<div className="pc-empty">Belum ada penugasan vendor. Tambahkan vendor dari daftar partner untuk mulai booking.</div>}
    </div>
    {editing&&values&&<div className="pc-modal-shade" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget){setEditing(null);setValues(null);}}}>
      <motion.form onSubmit={save} className="pc-dialog" role="dialog" aria-modal="true" aria-label={`Booking ${editing.vendor_name}`}
        initial={reduced?false:{opacity:0,scale:.985,y:8}} animate={{opacity:1,scale:1,y:0}} transition={{duration:.18}}>
        <div className="pc-head"><div><span className="pc-kicker">BOOKING VENDOR</span><h3>{editing.vendor_name}</h3></div><button type="button" className="pc-icon-btn" onClick={()=>{setEditing(null);setValues(null);}} aria-label="Tutup"><X size={18}/></button></div>
        <div className="pc-form-grid"><label>Penanggung pembayaran<select value={values.payment_responsibility} onChange={e=>set('payment_responsibility',e.target.value as BookingForm['payment_responsibility'])}>
          <option value="managed_vendor">Wedding-In membayar vendor</option><option value="client_direct">Klien membayar langsung</option></select></label>
          <label>Status booking<select value={values.booking_status} onChange={e=>set('booking_status',e.target.value as BookingForm['booking_status'])}>
            <option value="requested">Diajukan / Booking</option><option value="confirmed">Terkonfirmasi</option><option value="cancelled">Dibatalkan</option></select></label>
          <label>DP disepakati (Rp)<input type="number" min="0" step="0.01" required value={values.deposit_amount} onChange={e=>set('deposit_amount',e.target.value)}/></label>
          <label>No. kontrak / referensi<input value={values.contract_reference} onChange={e=>set('contract_reference',e.target.value)} maxLength={150}/></label>
          <label>Jatuh tempo DP<input type="date" value={values.deposit_due} onChange={e=>set('deposit_due',e.target.value)}/></label>
          <label>Jatuh tempo pelunasan<input type="date" value={values.final_due} onChange={e=>set('final_due',e.target.value)}/></label>
          <label className="pc-wide">Syarat dan catatan<textarea rows={3} value={values.terms} onChange={e=>set('terms',e.target.value)}/></label>
          {values.booking_status==='cancelled'&&<label className="pc-wide">Alasan pembatalan (wajib)<textarea rows={2} required minLength={5} value={values.cancel_reason} onChange={e=>set('cancel_reason',e.target.value)}/></label>}
        </div>
        <div className="pc-dialog-actions"><button type="button" className="pc-btn-secondary" onClick={()=>{setEditing(null);setValues(null);}}>Batal</button>
          <button className="pc-btn" disabled={busy}><Check size={16}/>{busy?'Menyimpan...':'Simpan Booking'}</button></div>
      </motion.form>
    </div>}
  </section>;
}
