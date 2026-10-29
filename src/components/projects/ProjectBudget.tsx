import {AlertTriangle,ArrowUpRight,Landmark,TrendingUp,WalletCards} from 'lucide-react';
import {formatRp} from '../../api';
import {amount,type SectionProps} from './types';

export default function ProjectBudget({data,canFinance}:SectionProps){
  const totals=data.totals;if(!canFinance||!totals)return null;
  const projected=amount(totals.estimated_cost),spent=amount(totals.actual_cost),overspent=spent>projected;
  const costPct=projected?Math.min(100,Math.max(0,spent/projected*100)):spent?100:0;
  const directVendor=data.vendors.filter(v=>v.payment_responsibility==='client_direct'&&v.booking_status!=='cancelled')
    .reduce((sum,v)=>sum+amount(v.agreed_price),0);
  return <div className="pc-stack">
    <section className="pc-card"><div className="pc-head"><div><span className="pc-kicker">PROJECT FINANCIAL INTELLIGENCE</span><h3>Anggaran vs realisasi</h3><p>Nilai kontrak dan biaya proyek dipantau terpisah dari transaksi vendor yang dibayar klien langsung.</p></div><TrendingUp size={22}/></div>
      <div className="pc-kpi-grid"><div><span>Kontrak Wedding-In</span><strong>{formatRp(totals.contract_amount)}</strong></div>
        <div><span>Anggaran biaya WO</span><strong>{formatRp(totals.estimated_cost)}</strong></div>
        <div><span>Biaya aktual tercatat</span><strong className={overspent?'pc-negative':''}>{formatRp(totals.actual_cost)}</strong></div>
        <div><span>Proyeksi margin</span><strong className="pc-positive">{formatRp(totals.estimated_profit)}</strong></div></div>
      <div className="pc-progress"><div><strong>Realisasi biaya</strong><span>{Math.round(costPct)}% dari anggaran</span></div><div className="pc-progress-track">
        <span className={overspent?'over':''} style={{width:`${costPct}%`}}/></div></div>
      {overspent&&<div className="pc-alert"><AlertTriangle size={17}/> Biaya yang sudah diakui melebihi estimasi sebesar {formatRp(spent-projected)}. Tinjau transaksi proyek.</div>}
      <div className="pc-two-col"><div className="pc-breakdown"><h4><Landmark size={17}/> Pencatatan aktual</h4>
        <div><span>Pendapatan diakui (jurnal)</span><strong>{formatRp(totals.recognized_revenue)}</strong></div>
        <div><span>Biaya yang diakui (jurnal)</span><strong>{formatRp(totals.actual_cost)}</strong></div>
        <div><span>Laba/rugi yang tercatat</span><strong>{formatRp(totals.recognized_profit)}</strong></div></div>
      <div className="pc-breakdown"><h4><WalletCards size={17}/> Komitmen & kewajiban</h4>
        <div><span>Booking vendor dikelola WO</span><strong>{formatRp(totals.vendor_committed)}</strong></div>
        <div><span>Tagihan vendor/biaya aktif</span><strong>{formatRp(totals.bill_total)}</strong></div>
        <div><span>Sisa utang vendor/biaya</span><strong>{formatRp(totals.bill_balance)}</strong></div></div></div>
    </section>
    <section className="pc-card"><div className="pc-head"><div><span className="pc-kicker">HYBRID FINANCIAL SEPARATION</span><h3>Anggaran klien & layanan vendor langsung</h3><p>Nominal ini informatif dan tidak masuk omzet, piutang, utang, atau kas Wedding-In.</p></div><ArrowUpRight size={22}/></div>
      <div className="pc-kpi-grid"><div><span>Budget langsung (quotation + CO)</span><strong>{formatRp(totals.direct_budget)}</strong></div>
        <div><span>Total anggaran klien</span><strong>{formatRp(totals.client_budget)}</strong></div>
        <div><span>Vendor langsung terdaftar</span><strong>{formatRp(directVendor)}</strong></div>
        <div><span>Jumlah revisi kontrak</span><strong>{data.contract_revisions.length}</strong></div></div>
      {data.budget_lines.length>0&&<><h4 className="pc-subhead">Snapshot layanan dari quotation yang diterima</h4>
        <div className="pc-table-scroll"><table className="pc-table"><thead><tr><th>Layanan</th><th>Jenis Pemenuhan</th><th>Qty</th><th>Nilai Jual</th></tr></thead><tbody>
          {data.budget_lines.map(line=><tr key={line.id}><td><strong>{line.title_snapshot}</strong></td>
            <td>{line.fulfillment==='client_direct'?'Vendor langsung klien':line.fulfillment==='managed_vendor'?'Vendor dikelola':'Internal WO'}</td>
            <td>{Number(line.quantity).toLocaleString('id-ID')}</td><td>{formatRp(line.sell_net)}</td></tr>)}
        </tbody></table></div></>}
      {data.contract_revisions.length>0&&<div className="pc-revision-log"><h4 className="pc-subhead">Histori versi nilai kontrak</h4>
        {data.contract_revisions.map(revision=><div key={revision.id}><span>Revisi {revision.revision_no}</span><strong>{formatRp(revision.contract_amount)}</strong><small>Estimasi biaya {formatRp(revision.estimated_cost)}</small></div>)}
      </div>}
    </section>
  </div>;
}
