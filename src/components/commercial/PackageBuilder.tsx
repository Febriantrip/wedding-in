import {useEffect,useState,type FormEvent} from 'react';
import {Plus,Trash2,BookOpenCheck} from 'lucide-react';
import {api,post,formatRp} from '../../api';

type Item=Record<string,any>;
type Line={service_id:string;vendor_service_id:string;line_name:string;qty:string;unit:string;fulfillment:string;
  default_cost_unit:string;default_sell_unit:string;is_optional:boolean};
const blank=():Line=>({service_id:'',vendor_service_id:'',line_name:'',qty:'1',unit:'event',
  fulfillment:'internal',default_cost_unit:'0',default_sell_unit:'0',is_optional:false});
export default function PackageBuilder({canManage}:{canManage:boolean}){
  const [packages,setPackages]=useState<Item[]>([]),[versions,setVersions]=useState<Item[]>([]),[services,setServices]=useState<Item[]>([]),
    [vendors,setVendors]=useState<Item[]>([]),[packageId,setPackageId]=useState(''),
    [lines,setLines]=useState<Line[]>([blank()]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const load=async()=>{
    const [p,c]=await Promise.all([api<{data:Item[]}>('/resources/packages'),api<any>('/commercial/catalog')]);
    setPackages(p.data);setServices(c.services);setVendors(c.vendor_services);setVersions(c.packages);
  };
  useEffect(()=>{void load().catch(e=>setError((e as Error).message));},[]);
  const update=(index:number,field:keyof Line,value:any)=>setLines(old=>old.map((line,i)=>i===index?{...line,[field]:value}:line));
  const fillService=(i:number,serviceId:string)=>{
    const svc=services.find(s=>String(s.id)===serviceId);
    setLines(old=>old.map((line,j)=>j===i?{...line,service_id:serviceId,line_name:svc?.name||line.line_name,
      unit:svc?.unit||line.unit,fulfillment:svc?.default_fulfillment||line.fulfillment,
      default_sell_unit:String(svc?.default_sell??0),default_cost_unit:String(svc?.default_cost??0)}:line));
  };
  async function save(event:FormEvent){
    event.preventDefault();setBusy(true);setError('');setNotice('');
    try{
      if(!packageId)throw new Error('Pilih paket induk.');
      const payload=lines.map(line=>({...line,service_id:line.service_id?Number(line.service_id):null,
        vendor_service_id:line.vendor_service_id?Number(line.vendor_service_id):null}));
      const result=await post('/commercial/packages',{package_id:Number(packageId),lines:payload}) as {id:number};
      setNotice(`Versi draft #${result.id} tersimpan. Publikasikan saat siap digunakan.`);await load();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function publish(versionId:number){
    setError('');setNotice('');
    try{await post(`/commercial/packages/${versionId}/publish`,{});await load();setNotice('Versi paket sudah dipublikasikan.');}
    catch(e){setError((e as Error).message);}
  }
  return <div className="wi-commerce-stack"><div className="wi-commerce-head"><h3>Susun komposisi paket wedding</h3>
    <span>Pilih paket induk yang sudah ada, lalu bentuk versi baru tanpa mengubah penawaran lama.</span></div>
    <form onSubmit={save} className="wi-commerce-card wi-commerce-form">
      <label>Nama paket induk<select required value={packageId} onChange={e=>setPackageId(e.target.value)}>
        <option value="">Pilih paket...</option>{packages.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <div className="wi-commerce-lines">{lines.map((line,i)=><div className="wi-commerce-package-line" key={i}>
        <div className="wi-commerce-flex"><strong>Komponen {i+1}</strong><button type="button" onClick={()=>setLines(x=>x.filter((_,j)=>j!==i))} disabled={lines.length===1}><Trash2 size={16}/></button></div>
        <div className="wi-commerce-form compact">
          <label>Pilih jasa internal / umum<select value={line.service_id} onChange={e=>fillService(i,e.target.value)}>
            <option value="">Pilih jika tersedia</option>{services.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label>Jasa vendor<select value={line.vendor_service_id} onChange={e=>{
            const match=vendors.find(v=>String(v.id)===e.target.value);
            update(i,'vendor_service_id',e.target.value);
            if(match){update(i,'line_name',match.title);update(i,'unit',match.unit);}
          }}><option value="">Tanpa vendor</option>{vendors.map(v=><option key={v.id} value={v.id}>{v.vendor_name} · {v.title}</option>)}</select></label>
          <label>Nama komponen<input required value={line.line_name} onChange={e=>update(i,'line_name',e.target.value)}/></label>
          <label>Pengadaan<select value={line.fulfillment} onChange={e=>update(i,'fulfillment',e.target.value)}>
            <option value="internal">Jasa WO</option><option value="managed_vendor">Vendor dikelola WO</option>
            <option value="client_direct">Vendor dibayar klien</option></select></label>
          <label>Qty<input type="number" min=".001" step=".001" required value={line.qty} onChange={e=>update(i,'qty',e.target.value)}/></label>
          <label>Satuan<input required value={line.unit} onChange={e=>update(i,'unit',e.target.value)}/></label>
          <label>Harga Jual / Unit<input type="number" min="0" step=".01" value={line.default_sell_unit} onChange={e=>update(i,'default_sell_unit',e.target.value)}/></label>
          <label>Modal / Unit<input type="number" min="0" step=".01" value={line.default_cost_unit} onChange={e=>update(i,'default_cost_unit',e.target.value)}/></label>
        </div>
      </div>)}</div>
      <div className="wi-commerce-flex"><button type="button" onClick={()=>setLines(x=>[...x,blank()])}><Plus size={16}/> Tambah Komponen</button>
        <span>{lines.length} komponen</span></div>
      {error&&<p className="wi-commerce-error">{error}</p>}{notice&&<p className="wi-commerce-success">{notice}</p>}
      <button className="wi-commerce-primary" disabled={!canManage||busy}><BookOpenCheck size={16}/>Simpan sebagai Versi Draft</button>
      <small>Harga paket mode jumlah item. Mode harga bundle tetap menunggu keputusan alokasi diskon.</small>
    </form>
    <section className="wi-commerce-card"><div className="wi-commerce-head"><h3>Versi paket terdaftar</h3><span>{versions.length} versi dipublikasikan</span></div>
      {versions.filter(v=>!packageId||String(v.package_id)===packageId).map(v=><div className="wi-commerce-listitem" key={v.id}>
        <div><strong>{v.package_name} · Versi {v.version_no}</strong><small>{v.status} · {v.pricing_mode}</small></div>
        {v.status==='draft'&&canManage&&<button type="button" onClick={()=>void publish(v.id)}>Publikasikan</button>}
        {v.fixed_bundle_price!=null&&<b>{formatRp(v.fixed_bundle_price)}</b>}
      </div>)}</section>
  </div>;
}
