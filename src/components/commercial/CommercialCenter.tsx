import {useState} from 'react';
import {Calculator,Layers3,Tags} from 'lucide-react';
import MasterPricing from './MasterPricing';
import PackageBuilder from './PackageBuilder';
import QuoteWorkspace from './QuoteWorkspace';
import './commercial.css';

export default function CommercialCenter({role,onOpenWedding}:{role:string;onOpenWedding:(id:number)=>void}){
  const [tab,setTab]=useState<'quotes'|'prices'|'packages'>('quotes');
  const canManage=['owner','admin'].includes(role);
  return <div className="wi-commerce">
    <div className="wi-commerce-head wi-commerce-intro"><div><span>HYBRID COMMERCIAL WORKSPACE</span>
      <h2>Paket, Harga, Vendor & Penawaran</h2>
      <p>Sumber harga rekomendasi terpisah dari harga final dalam quotation.</p></div></div>
    <div className="wi-commerce-tabs wi-commerce-main-tabs">
      <button type="button" className={tab==='quotes'?'active':''} onClick={()=>setTab('quotes')}><Calculator size={17}/> Kalkulator & Quotation</button>
      <button type="button" className={tab==='prices'?'active':''} onClick={()=>setTab('prices')}><Tags size={17}/> Master Harga & Vendor</button>
      <button type="button" className={tab==='packages'?'active':''} onClick={()=>setTab('packages')}><Layers3 size={17}/> Komponen Paket</button>
    </div>
    {tab==='quotes'?<QuoteWorkspace role={role} onOpenWedding={onOpenWedding}/>:
      tab==='prices'?<MasterPricing canManage={canManage}/>:<PackageBuilder canManage={canManage}/>}
  </div>;
}
