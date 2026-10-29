import {useEffect,useState,type FormEvent} from 'react';
import {Plus,Save,Send,CheckCircle2,FileText,Search,ArrowLeft,ArrowRight,Calculator,Trash2,Printer} from 'lucide-react';
import {api,post,patch,formatRp,humanDate,isoToday} from '../../api';

type Data=Record<string,any>;
type Line={source:string;fulfillment:'internal'|'managed_vendor'|'client_direct';quantity:string;
  unit_sell_override:string;unit_cost_override:string;discount_amount:string;override_reason:string};
const blank=():Line=>({source:'',fulfillment:'internal',quantity:'1',unit_sell_override:'',unit_cost_override:'',
  discount_amount:'0',override_reason:''});
const initial=()=>({client_name:'',client_phone:'',client_id:'',event_type_id:'',event_date:isoToday(),valid_until:isoToday(),
  city:'',venue:'',guest_count:'100',notes:'',package_version_id:''});
const stepStatus:Record<string,string>={draft:'Draft',sent:'Terkirim',accepted:'Diterima',rejected:'Ditolak',withdrawn:'Ditarik'};
export default function QuoteWorkspace({role,onOpenWedding}:{role:string;onOpenWedding:(id:number)=>void}){
  const canManage=['owner','admin','planner','sales'].includes(role),canApprove=['owner','admin'].includes(role),
    canCost=['owner','admin','finance'].includes(role);
  const [catalog,setCatalog]=useState<Data>({}),[records,setRecords]=useState<Data[]>([]),[page,setPage]=useState(1),
    [total,setTotal]=useState(0),[q,setQ]=useState(''),[screen,setScreen]=useState<'list'|'build'|'detail'>('list'),
    [form,setForm]=useState<Data>(initial),[lines,setLines]=useState<Line[]>([blank()]),[quote,setQuote]=useState<Data|null>(null),
    [revisionId,setRevisionId]=useState<number|null>(null),[preview,setPreview]=useState<Data|null>(null),
    [error,setError]=useState(''),[success,setSuccess]=useState(''),[busy,setBusy]=useState(false);
  const loadList=()=>api<{data:Data[];total:number}>(`/commercial/quotations?page=${page}&q=${encodeURIComponent(q)}`)
    .then(x=>{setRecords(x.data);setTotal(x.total);});
  useEffect(()=>{void api<Data>('/commercial/catalog').then(setCatalog).catch(e=>setError((e as Error).message));},[]);
  useEffect(()=>{void loadList().catch(e=>setError((e as Error).message));},[page,q]);
  const update=(i:number,key:keyof Line,value:string)=>{setPreview(null);setLines(x=>x.map((l,j)=>j===i?{...l,[key]:value}:l));};
  const updateForm=(key:string,value:string)=>{setPreview(null);setForm(v=>({...v,[key]:value}));};
  function startNew(){setError('');setSuccess('');setQuote(null);setPreview(null);setLines([blank()]);setForm(initial());setScreen('build');}
  function toPayload(){
    const picked=lines.map(l=>{
      if(!l.source)throw new Error('Semua item wajib memilih jasa.');
      const [kind,id]=l.source.split(':');
      return {...(kind==='service'?{service_id:Number(id)}:{vendor_service_id:Number(id)}),
        quantity:l.quantity,fulfillment:l.fulfillment,
        ...(l.unit_sell_override!==''?{unit_sell_override:l.unit_sell_override}:{}),
        ...(canCost&&l.unit_cost_override!==''?{unit_cost_override:l.unit_cost_override}:{}),
        discount_amount:l.discount_amount||'0',
        ...(l.override_reason?{override_reason:l.override_reason}:{})};
    });
    return {client_name:form.client_name,client_phone:form.client_phone,
      ...(form.client_id?{client_id:Number(form.client_id)}:{}),
      ...(form.event_type_id?{event_type_id:Number(form.event_type_id)}:{}),event_date:form.event_date,
      valid_until:form.valid_until,city:form.city,venue:form.venue,guest_count:Number(form.guest_count),
      notes:form.notes,...(form.package_version_id?{package_version_id:Number(form.package_version_id)}:{}),lines:picked};
  }
  async function calculate(event?:FormEvent){
    event?.preventDefault();setBusy(true);setError('');setSuccess('');
    try{const result=await post('/commercial/preview',toPayload()) as Data;setPreview(result);return result;}
    catch(e){setError((e as Error).message);return null;}finally{setBusy(false);}
  }
  async function save(){
    setBusy(true);setError('');
    try{
      const payload=toPayload(),url=quote?
        quote.revision.status==='draft'?`/commercial/quotations/${quote.quote.id}/draft`:
          `/commercial/quotations/${quote.quote.id}/revisions`:'/commercial/quotations';
      const result=quote?.revision.status==='draft'?await patch(url,payload):await post(url,payload);
      setSuccess('Quotation tersimpan sebagai draft.');await loadList();
      const entryId=quote?.quote.id||(result as Data).id;
      await openQuote(entryId);
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function openQuote(id:number,revision?:number){
    setError('');setSuccess('');
    try{
      const record=await api<Data>(`/commercial/quotations/${id}${revision?`?revision_id=${revision}`:''}`);
      setQuote(record);setRevisionId(record.revision.id);setScreen('detail');setPreview(null);
    }catch(e){setError((e as Error).message);}
  }
  async function action(kind:'send'|'accept'|'reject'|'convert'){
    if(!quote)return;setBusy(true);setError('');setSuccess('');
    try{
      const result=await post(`/commercial/quotations/${quote.quote.id}/${kind==='convert'?'convert':`status/${kind}`}`,{}) as Data;
      if(kind==='convert'&&result.event_id){onOpenWedding(result.event_id);return;}
      await openQuote(quote.quote.id);await loadList();
      setSuccess(kind==='send'?'Penawaran ditandai terkirim.':kind==='accept'?'Penawaran disetujui.':'Status diperbarui.');
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function revise(){
    if(!quote)return;
    const r=quote.revision;
    setForm({client_name:quote.quote.client_name,client_phone:quote.quote.client_phone||'',
      client_id:quote.quote.client_id||'',event_type_id:r.event_type_id||'',event_date:String(r.event_date).slice(0,10),
      valid_until:String(r.valid_until).slice(0,10),city:r.city||'',venue:r.venue||'',
      guest_count:String(r.guest_count),notes:r.notes||'',package_version_id:r.package_version_id||''});
    setLines(quote.lines.map((l:Data)=>({source:l.vendor_service_id?`vendor:${l.vendor_service_id}`:`service:${l.service_id}`,
      fulfillment:l.fulfillment,quantity:String(l.quantity),unit_sell_override:l.overridden?String(l.unit_sell):'',
      unit_cost_override:l.overridden&&canCost?String(l.unit_cost):'',
      discount_amount:String(l.discount_amount),override_reason:l.override_reason||''})));
    setError('');setSuccess('');setPreview(null);setScreen('build');
  }
  async function choosePackage(id:string){
    updateForm('package_version_id',id);
    if(!id)return;
    try{
      const data=await api<Data>(`/commercial/packages/${id}/lines`);
      const restored:Line[]=data.lines.filter((l:Data)=>!l.is_optional).map((l:Data)=>({
        source:l.vendor_service_id?`vendor:${l.vendor_service_id}`:`service:${l.service_id}`,
        fulfillment:l.fulfillment,quantity:String(l.qty),unit_sell_override:'',unit_cost_override:'',
        discount_amount:'0',override_reason:''}));
      setLines(restored.length?restored:[blank()]);
    }catch(e){setError((e as Error).message);}
  }
  return <div className="wi-commerce-stack wi-quotation-view">
    {error&&<p className="wi-commerce-error">{error}</p>}{success&&<p className="wi-commerce-success">{success}</p>}
    {screen==='list'?<><div className="wi-commerce-flex"><div className="wi-commerce-head"><h3>Daftar quotation</h3>
      <span>Penawaran yang dikirim tidak ditimpa saat ada revisi.</span></div>
      {canManage&&<button className="wi-commerce-primary" onClick={startNew}><Plus size={16}/>Quotation Baru</button>}</div>
      <section className="wi-commerce-card"><div className="wi-commerce-toolbar"><Search size={17}/>
        <input placeholder="Cari nama klien / nomor penawaran..." value={q} onChange={e=>{setPage(1);setQ(e.target.value);}}/></div>
        <div className="wi-commerce-table"><table><thead><tr><th>Nomor</th><th>Klien</th><th>Event</th><th>Nilai Kontrak WO</th><th>Status</th><th></th></tr></thead>
          <tbody>{records.map(r=><tr key={r.id}><td>{r.quote_number}</td><td>{r.client_name}</td><td>{humanDate(r.event_date)}</td>
            <td>{formatRp(r.contract_total)}</td><td>{stepStatus[r.status]||r.status} · v{r.version_no}</td>
            <td><button type="button" onClick={()=>void openQuote(r.id)}>Lihat</button></td></tr>)}</tbody></table></div>
        {!records.length&&<div className="wi-commerce-empty">Belum ada quotation.</div>}
        <div className="wi-commerce-pagination"><span>{total} penawaran</span><button disabled={page===1} onClick={()=>setPage(x=>x-1)}>Sebelumnya</button>
          <span>{page}/{Math.max(1,Math.ceil(total/15))}</span><button disabled={page*15>=total} onClick={()=>setPage(x=>x+1)}>Berikutnya</button></div></section></>:
    screen==='build'?<><div className="wi-commerce-flex"><button onClick={()=>setScreen(quote?'detail':'list')}><ArrowLeft size={16}/> Kembali</button>
      <strong>{quote?`Edit draft / revisi ${quote.quote.quote_number}`:'Quotation Baru'}</strong></div>
      <form className="wi-commerce-card wi-commerce-form" onSubmit={e=>void calculate(e)}>
        <div className="wi-commerce-head"><h3>Informasi calon klien & wedding</h3><span>Seluruh angka akan divalidasi ulang oleh server saat disimpan.</span></div>
        <div className="wi-commerce-form-grid">
          <label>Pilih klien terdaftar<select value={form.client_id} onChange={e=>{const chosen=catalog.clients?.find((x:Data)=>String(x.id)===e.target.value);
            setForm(v=>({...v,client_id:e.target.value,client_name:chosen?.name||v.client_name,client_phone:chosen?.phone||v.client_phone}));}}>
            <option value="">Calon klien baru</option>{catalog.clients?.map((x:Data)=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          {([['client_name','Nama Klien *','text'],['client_phone','Nomor Kontak','text'],['event_date','Tanggal Event *','date'],
            ['valid_until','Penawaran Berlaku Sampai *','date'],['city','Kota / Wilayah','text'],
            ['venue','Venue','text'],['guest_count','Jumlah Tamu','number']] as const).map(([key,label,type])=><label key={key}>{label}
              <input required={label.includes('*')} type={type} value={form[key]??''} onChange={e=>updateForm(key,e.target.value)}/></label>)}
          <label>Jenis Event<select value={form.event_type_id} onChange={e=>updateForm('event_type_id',e.target.value)}>
            <option value="">Umum</option>{catalog.event_types?.map((x:Data)=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label>Template Paket<select value={form.package_version_id} onChange={e=>void choosePackage(e.target.value)}>
            <option value="">Custom / tanpa paket</option>{catalog.packages?.filter((x:Data)=>x.status==='published').map((x:Data)=><option key={x.id} value={x.id}>{x.package_name} · v{x.version_no}</option>)}</select></label>
        </div>
        <div className="wi-commerce-head"><h3>Item layanan & vendor</h3><span>Vendor direct masuk budget klien tetapi bukan omzet/biaya Wedding-In.</span></div>
        {lines.map((line,i)=><div className="wi-commerce-quote-line" key={i}>
          <div className="wi-commerce-flex"><strong>Item #{i+1}</strong><button type="button" disabled={lines.length===1}
            onClick={()=>{setPreview(null);setLines(x=>x.filter((_,j)=>i!==j));}}><Trash2 size={16}/></button></div>
          <div className="wi-commerce-form-grid">
            <label>Jasa *<select required value={line.source} onChange={e=>{
              const svc=catalog.services?.find((x:Data)=>e.target.value===`service:${x.id}`);
              update(i,'source',e.target.value);
              if(svc)update(i,'fulfillment',svc.default_fulfillment);
              if(e.target.value.startsWith('vendor:'))update(i,'fulfillment','managed_vendor');
            }}><option value="">Pilih layanan...</option>
              <optgroup label="Layanan Wedding-In">{catalog.services?.map((s:Data)=><option key={s.id} value={`service:${s.id}`}>{s.name}</option>)}</optgroup>
              <optgroup label="Jasa vendor">{catalog.vendor_services?.map((s:Data)=><option key={s.id} value={`vendor:${s.id}`}>{s.vendor_name} · {s.title}</option>)}</optgroup></select></label>
            <label>Skema Pengadaan<select value={line.fulfillment} onChange={e=>update(i,'fulfillment',e.target.value)}>
              <option value="internal">Internal WO</option><option value="managed_vendor">Vendor dibayar WO</option>
              <option value="client_direct">Vendor dibayar klien</option></select></label>
            <label>Qty<input type="number" min=".001" step=".001" required value={line.quantity} onChange={e=>update(i,'quantity',e.target.value)}/></label>
            <label>Harga Jual Manual<input type="number" min="0" step=".01" placeholder="Otomatis dari master" value={line.unit_sell_override} onChange={e=>update(i,'unit_sell_override',e.target.value)}/></label>
            {canCost&&<label>Modal Manual<input type="number" min="0" step=".01" placeholder="Otomatis dari master" value={line.unit_cost_override} onChange={e=>update(i,'unit_cost_override',e.target.value)}/></label>}
            <label>Diskon Item (Rp)<input type="number" min="0" step=".01" value={line.discount_amount} onChange={e=>update(i,'discount_amount',e.target.value)}/></label>
            <label className="wi-commerce-wide">Alasan Override<input placeholder="Wajib jika harga/modal berbeda dari master" value={line.override_reason} onChange={e=>update(i,'override_reason',e.target.value)}/></label>
          </div>
        </div>)}
        <div className="wi-commerce-flex"><button type="button" onClick={()=>{setLines(x=>[...x,blank()]);setPreview(null);}}><Plus size={16}/>Tambah Layanan</button>
          <span>Perubahan harga disimpan sebagai jejak audit.</span></div>
        <label>Catatan Quotation<textarea rows={2} value={form.notes} onChange={e=>updateForm('notes',e.target.value)}/></label>
        <div className="wi-commerce-flex"><button type="submit" className="wi-commerce-secondary" disabled={busy}><Calculator size={16}/>Hitung Estimasi</button>
          <button type="button" className="wi-commerce-primary" disabled={busy} onClick={()=>void save()}><Save size={16}/>Simpan Draft</button></div>
      </form>
      {preview&&<Totals data={preview.totals} canCost={canCost} lines={preview.lines}/>}</>:
    quote&&<><div className="wi-commerce-flex"><button onClick={()=>setScreen('list')}><ArrowLeft size={16}/> Kembali</button>
      <div className="wi-commerce-flex"><button onClick={()=>window.print()}><Printer size={16}/> Cetak Penawaran</button>
        {canManage&&quote.revision.status!=='accepted'&&quote.quote.status!=='accepted'&&
          <button onClick={()=>void revise()}><FileText size={16}/>{quote.revision.status==='draft'?'Edit Draft':'Buat Revisi'}</button>}
        {canApprove&&quote.revision.status==='draft'&&<button className="wi-commerce-primary" disabled={busy} onClick={()=>void action('send')}><Send size={16}/> Tandai Terkirim</button>}
        {canApprove&&quote.revision.status==='sent'&&<><button onClick={()=>void action('reject')}>Ditolak</button>
          <button className="wi-commerce-primary" disabled={busy} onClick={()=>void action('accept')}><CheckCircle2 size={16}/>Klien Setuju</button></>}
        {canApprove&&quote.revision.status==='accepted'&&<button className="wi-commerce-primary" onClick={()=>void action('convert')}>
          <ArrowRight size={16}/>{quote.quote.accepted_event_id?'Buka Wedding':'Jadikan Wedding'}</button>}
      </div></div>
      <section className="wi-commerce-card wi-quote-print"><div className="wi-commerce-head"><h3>{quote.quote.quote_number} · v{quote.revision.version_no}</h3>
        <span>{stepStatus[quote.revision.status]} · {quote.quote.client_name}</span></div>
        <p>Wedding {humanDate(quote.revision.event_date)} · {quote.revision.venue||quote.revision.city||'Lokasi menyusul'} · {quote.revision.guest_count} tamu</p>
        <div className="wi-commerce-table"><table><thead><tr><th>Item</th><th>Skema</th><th>Qty</th><th>Harga</th><th>Total</th></tr></thead>
          <tbody>{quote.lines?.map((l:Data)=><tr key={l.id}><td>{l.title_snapshot}</td>
            <td>{l.fulfillment==='client_direct'?'Dibayar Klien':l.fulfillment==='internal'?'Internal WO':'Vendor Dikelola WO'}</td>
            <td>{l.quantity}</td><td>{formatRp(l.unit_sell)}</td><td>{formatRp(l.sell_net)}</td></tr>)}</tbody></table></div>
        <Totals data={{contract_total:quote.revision.contract_total,subtotal_direct:quote.revision.subtotal_direct,
          client_budget_total:quote.revision.client_budget_total,cost_est_total:quote.revision.cost_est_total,
          gross_profit_est:Number(quote.revision.contract_total)-Number(quote.revision.cost_est_total)}}
          canCost={canCost} lines={[]}/>
        <p className="wi-commerce-note">{quote.revision.notes}</p>
        <div className="wi-commerce-flex"><span>Masa berlaku {humanDate(quote.revision.valid_until)}</span>
          <select value={revisionId??''} onChange={e=>void openQuote(quote.quote.id,Number(e.target.value))}>
            {quote.revisions?.map((r:Data)=><option value={r.id} key={r.id}>Versi {r.version_no} · {stepStatus[r.status]}</option>)}</select>
        </div>
      </section></>}
  </div>;
}
function Totals({data,lines,canCost}:{data:Data;lines:Data[];canCost:boolean}){
  return <section className="wi-commerce-card wi-quote-totals"><div className="wi-commerce-head"><h3>Ringkasan Estimasi Hybrid</h3></div>
    {lines.length>0&&<div className="wi-commerce-table"><table><thead><tr><th>Layanan</th><th>Skema</th><th>Harga Klien</th></tr></thead>
      <tbody>{lines.map((l:Data,i:number)=><tr key={i}><td>{l.title_snapshot}</td><td>{l.fulfillment}</td><td>{formatRp(l.sell_net)}</td></tr>)}</tbody></table></div>}
    <div className="wi-commerce-total-grid"><div><small>Kontrak Wedding-In</small><strong>{formatRp(data.contract_total)}</strong></div>
      <div><small>Vendor dibayar langsung klien</small><strong>{formatRp(data.subtotal_direct)}</strong></div>
      <div><small>Total Budget Klien</small><strong>{formatRp(data.client_budget_total)}</strong></div>
      {canCost&&<><div><small>Estimasi Modal WO</small><strong>{formatRp(data.cost_est_total)}</strong></div>
        <div><small>Estimasi Laba Kotor</small><strong>{formatRp(data.gross_profit_est)}</strong></div>
        {data.margin_pct!=null&&<div><small>Margin Kotor</small><strong>{data.margin_pct}%</strong></div>}</>}</div>
    <p className="wi-commerce-note">Perkiraan bukan kas masuk ataupun laba yang sudah direalisasi. Pajak mengikuti pengaturan finance sebelum penerbitan kontrak.</p>
  </section>;
}
