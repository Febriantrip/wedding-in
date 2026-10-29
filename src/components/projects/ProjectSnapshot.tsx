import {CalendarDays,CheckCircle2,FileCheck2,Handshake,WalletCards} from 'lucide-react';
import {formatRp,humanDate} from '../../api';
import type {SectionProps} from './types';

export default function ProjectSnapshot({data,canFinance}:SectionProps){
  const total=data.totals,confirmed=data.vendors.filter(v=>v.booking_status==='confirmed').length;
  return <section className="pc-card pc-overview">
    <div className="pc-head"><div><span className="pc-kicker">PROJECT COMMAND CENTER</span><h3>Ringkasan proyek dan komitmen</h3><p>Pantau kesepakatan klien, booking partner, dan progres transaksi dalam satu tempat.</p></div><CalendarDays size={22}/></div>
    <div className="pc-overview-grid">
      <div className="pc-stat"><span><Handshake size={16}/> Vendor terkonfirmasi</span><strong>{confirmed} / {data.vendors.length}</strong><small>Penugasan vendor aktif</small></div>
      <div className="pc-stat"><span><FileCheck2 size={16}/> Status Kontrak</span><strong>{data.contract_revisions.length?`Revisi ${data.contract_revisions[0].revision_no}`:'Awal'}</strong><small>Perubahan tersimpan sebagai histori</small></div>
      {canFinance&&total&&<><div className="pc-stat"><span><WalletCards size={16}/> Piutang Invoice</span><strong>{formatRp(total.invoice_balance)}</strong><small>{formatRp(total.invoice_paid)} sudah diterima</small></div>
        <div className="pc-stat"><span><CheckCircle2 size={16}/> Potensi Margin WO</span><strong className="pc-positive">{formatRp(total.estimated_profit)}</strong><small>Estimasi; berbeda dari laba tercatat</small></div></>}
    </div>
    <div className="pc-note">Wedding {humanDate(data.project.event_date)} · Vendor dibayar langsung klien hanya ditampilkan sebagai bagian dari anggaran klien, bukan omzet Wedding-In.</div>
  </section>;
}
