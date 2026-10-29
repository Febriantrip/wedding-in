import {useEffect,useState,type FormEvent} from 'react';
import {Plus,RefreshCw,Save,CheckCircle2} from 'lucide-react';
import {api,post,formatRp} from '../../api';

type Data=Record<string,any>;
type Field={key:string;label:string;required?:boolean;type?:string;options?:{value:string;label:string}[]};
type Props={canManage:boolean};
const fields=(key:string,data:Data):Field[]=>{
  const opts=(items:Data[]=[],label='name')=>items.map(x=>({value:String(x.id),label:String(x[label])}));
  if(key==='event_types')return [{key:'code',label:'Kode',required:true},{key:'name',label:'Jenis Event',required:true},
    {key:'duration_hours',label:'Durasi (jam)',type:'number'}];
  if(key==='services')return [{key:'code',label:'Kode Layanan',required:true},{key:'name',label:'Nama Layanan',required:true},
    {key:'category',label:'Kategori',required:true},{key:'unit',label:'Satuan',required:true},
    {key:'default_fulfillment',label:'Jenis layanan',options:[{value:'internal',label:'Jasa WO'},
      {value:'managed_vendor',label:'Vendor dikelola WO'},{value:'client_direct',label:'Vendor dibayar klien'}]},
    {key:'default_cost',label:'Modal Dasar',type:'number'},{key:'default_sell',label:'Harga Jual Dasar',type:'number'}];
  if(key==='service_price_rules')return [{key:'service_id',label:'Layanan',required:true,options:opts(data.services)},
    {key:'event_type_id',label:'Jenis Event',options:opts(data.event_types)},
    {key:'city',label:'Kota / Wilayah'},{key:'min_guests',label:'Tamu Minimum',type:'number'},
    {key:'max_guests',label:'Tamu Maksimum',type:'number'},
    {key:'day_type',label:'Hari',options:[{value:'weekday',label:'Hari kerja'},{value:'weekend',label:'Akhir pekan'}]},
    {key:'valid_from',label:'Berlaku Mulai',type:'date',required:true},
    {key:'valid_to',label:'Berlaku Sampai',type:'date'},
    {key:'priority',label:'Prioritas',type:'number'},
    {key:'cost_unit',label:'Modal',type:'number',required:true},{key:'sell_unit',label:'Harga Jual',type:'number',required:true}];
  if(key==='vendor_services')return [{key:'vendor_id',label:'Vendor',options:opts(data.vendors),required:true},
    {key:'service_id',label:'Master Layanan',options:opts(data.services)},
    {key:'vendor_sku',label:'Kode Jasa Vendor',required:true},{key:'title',label:'Nama Jasa Vendor',required:true},
    {key:'unit',label:'Satuan',required:true},{key:'min_qty',label:'Qty Minimum',type:'number'},
    {key:'capacity_per_day',label:'Kapasitas / Hari',type:'number'},{key:'service_area',label:'Area Layanan'}];
  return [{key:'vendor_service_id',label:'Jasa Vendor',options:opts(data.vendor_services,'title'),required:true},
    {key:'effective_from',label:'Berlaku Mulai',type:'date',required:true},
    {key:'effective_to',label:'Berlaku Sampai',type:'date'},
    {key:'city',label:'Kota / Wilayah'},{key:'min_qty',label:'Qty Minimum',type:'number'},
    {key:'max_qty',label:'Qty Maksimum',type:'number'},
    {key:'cost_unit',label:'Tarif Vendor (Rp)',type:'number',required:true}];
};
const labels:Record<string,string>={event_types:'Jenis Event',services:'Master Layanan',
  service_price_rules:'Aturan Harga',vendor_services:'Katalog Jasa Vendor',vendor_service_rates:'Tarif Vendor'};
const defaults:Record<string,Data>={event_types:{},services:{unit:'event',default_fulfillment:'internal'},
  service_price_rules:{priority:'0'},vendor_services:{unit:'package',min_qty:'1',capacity_per_day:'1'},
  vendor_service_rates:{min_qty:'1'}};
export default function MasterPricing({canManage}:Props){
  const [kind,setKind]=useState('services'),[catalog,setCatalog]=useState<Data>({}),[items,setItems]=useState<Data[]>([]),
    [page,setPage]=useState(1),[total,setTotal]=useState(0),[query,setQuery]=useState(''),
    [values,setValues]=useState<Data>({...defaults.services}),[error,setError]=useState(''),[busy,setBusy]=useState(false),
    [success,setSuccess]=useState('');
  const reloadCatalog=()=>Promise.all([api<Data>('/commercial/catalog'),api<{data:Data[]}>('/resources/vendors')])
    .then(([c,v])=>setCatalog({...c,vendors:v.data}));
  useEffect(()=>{void reloadCatalog();},[]);
  useEffect(()=>{setValues({...defaults[kind]});setPage(1);setQuery('');setSuccess('');},[kind]);
  useEffect(()=>{let live=true;api<{data:Data[];total:number}>(`/commercial/master/${kind}?page=${page}&q=${encodeURIComponent(query)}`)
    .then(x=>{if(live){setItems(x.data);setTotal(x.total);}}).catch(e=>{if(live)setError((e as Error).message);});
    return()=>{live=false;};},[kind,page,query,success]);
  async function submit(event:FormEvent){
    event.preventDefault();if(!canManage)return;setBusy(true);setError('');setSuccess('');
    try{
      const payload:Data={};
      for(const f of fields(kind,catalog)){
        const raw=values[f.key];if(raw==null||raw==='')continue;
        payload[f.key]=f.type==='number'?Number(raw):f.key.endsWith('_id')?Number(raw):raw;
      }
      await post(`/commercial/master/${kind}`,payload);
      setValues({...defaults[kind]});setSuccess('Master berhasil disimpan.');await reloadCatalog();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <div className="wi-commerce-stack">
    <div className="wi-commerce-tabs">{Object.entries(labels).map(([k,label])=><button type="button" key={k}
      className={kind===k?'active':''} onClick={()=>setKind(k)}>{label}</button>)}</div>
    <div className="wi-commerce-columns"><section className="wi-commerce-card">
      <div className="wi-commerce-head"><h3>{labels[kind]}</h3><span>Master dapat dinonaktifkan tanpa menghapus riwayat penawaran.</span></div>
      <div className="wi-commerce-toolbar"><input aria-label="Cari master" placeholder="Cari data master..." value={query}
        onChange={e=>{setPage(1);setQuery(e.target.value);}}/><button type="button" onClick={()=>{setSuccess('');void reloadCatalog();}}><RefreshCw size={15}/></button></div>
      <div className="wi-commerce-list">{items.map((item,index)=><div key={item.id} className="wi-commerce-listitem">
        <span className="wi-commerce-index">{(page-1)*15+index+1}</span><div><strong>{item.name||item.title||item.code||`Tarif #${item.id}`}</strong>
          <small>{item.code||item.vendor_sku||item.valid_from||item.effective_from||`ID ${item.id}`}</small></div>
        <span className="wi-commerce-value">{item.sell_unit!=null?formatRp(item.sell_unit):item.cost_unit!=null?formatRp(item.cost_unit):''}</span>
      </div>)}</div>
      {!items.length&&<div className="wi-commerce-empty">Belum ada data master.</div>}
      <div className="wi-commerce-pagination"><span>{total} data · 15 per halaman</span><button disabled={page===1} onClick={()=>setPage(n=>n-1)}>Sebelumnya</button>
        <span>{page}/{Math.max(1,Math.ceil(total/15))}</span><button disabled={page*15>=total} onClick={()=>setPage(n=>n+1)}>Berikutnya</button></div>
    </section>
    <section className="wi-commerce-card"><div className="wi-commerce-head"><h3><Plus size={18}/> Tambah {labels[kind]}</h3>
      <span>Harga baru hanya berlaku untuk quotation baru/revisi. Snapshot lama tidak berubah.</span></div>
      <form onSubmit={submit} className="wi-commerce-form">
        {fields(kind,catalog).map(f=><label key={f.key}>{f.label}{f.required&&' *'}
          {f.options?<select required={f.required} value={values[f.key]??''} onChange={e=>setValues(v=>({...v,[f.key]:e.target.value}))}>
            <option value="">Pilih...</option>{f.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>:
            <input required={f.required} type={f.type||'text'} min={f.type==='number'?0:undefined}
              step={f.type==='number'?'0.01':undefined} value={values[f.key]??''}
              onChange={e=>setValues(v=>({...v,[f.key]:e.target.value}))}/>}</label>)}
        {error&&<p className="wi-commerce-error">{error}</p>}{success&&<p className="wi-commerce-success"><CheckCircle2 size={15}/>{success}</p>}
        <button className="wi-commerce-primary" disabled={!canManage||busy}><Save size={16}/>{busy?'Menyimpan...':'Simpan Master'}</button>
        {!canManage&&<small>Hanya owner/admin dapat mengubah master harga.</small>}
      </form>
    </section></div>
  </div>;
}
