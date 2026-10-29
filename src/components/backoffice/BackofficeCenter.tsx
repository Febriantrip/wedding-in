import {useEffect,useState,type FormEvent} from 'react';
import {Plus,Search,WalletCards,ArrowUpRight,ArrowDownRight,Landmark,ClipboardCheck,RefreshCw,
  CheckCircle2,FileText,ArrowRightLeft,ShieldCheck} from 'lucide-react';
import {api,post,formatRp,isoToday,humanDate} from '../../api';

type Data=Record<string,any>;
type TxKind='DIRECT_EXPENSE'|'OTHER_RECEIPT'|'INTERNAL_TRANSFER';
const kinds:{id:TxKind;title:string;tip:string}[]=[
  {id:'OTHER_RECEIPT',title:'Pemasukan Lain',tip:'Pendapatan selain tagihan klien. Pembayaran invoice tetap dicatat di Invoice.'},
  {id:'DIRECT_EXPENSE',title:'Biaya Operasional',tip:'Pengeluaran langsung. Tagihan vendor tetap dicatat di Vendor Bills.'},
  {id:'INTERNAL_TRANSFER',title:'Transfer Antar Rekening',tip:'Pindah kas/bank tanpa menaikkan pendapatan atau biaya perusahaan.'}
];
export default function BackofficeCenter({role,onRoute}:{role:string;onRoute:(to:string)=>void}){
  const [summary,setSummary]=useState<Data>({}),[accounts,setAccounts]=useState<Data[]>([]),
    [categories,setCategories]=useState<Data[]>([]),[events,setEvents]=useState<Data[]>([]),
    [records,setRecords]=useState<Data[]>([]),[total,setTotal]=useState(0),[page,setPage]=useState(1),[q,setQ]=useState(''),
    [mode,setMode]=useState<'list'|'create'|'detail'|'categories'>('list'),[item,setItem]=useState<Data|null>(null),
    [kind,setKind]=useState<TxKind>('DIRECT_EXPENSE'),[form,setForm]=useState<Data>({transaction_date:isoToday()}),
    [categoryForm,setCategoryForm]=useState<Data>({flow_type:'expense',requires_event:false}),
    [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const canApprove=['owner','admin'].includes(role);
  const loadList=async()=>{
    const result=await api<{data:Data[];total:number}>(`/backoffice/transactions?page=${page}&q=${encodeURIComponent(q)}`);
    setRecords(result.data);setTotal(result.total);
  };
  const loadSummary=async()=>setSummary(await api('/backoffice/summary'));
  useEffect(()=>{Promise.all([api<{data:Data[]}>('/backoffice/accounts'),api<{data:Data[]}>('/backoffice/categories'),
    api<{data:Data[]}>('/events')]).then(([a,c,e])=>{
      setAccounts(a.data);setCategories(c.data);setEvents(e.data);
    }).catch(e=>setError((e as Error).message));void loadSummary().catch(e=>setError((e as Error).message));},[]);
  useEffect(()=>{void loadList().catch(e=>setError((e as Error).message));},[page,q]);
  async function view(id:number){
    try{setItem(await api(`/backoffice/transactions/${id}`));setMode('detail');setError('');}
    catch(e){setError((e as Error).message);}
  }
  function newTransaction(){
    setForm({transaction_date:isoToday(),amount:'',description:'',cash_account_id:'',category_id:'',
      destination_cash_account_id:'',event_id:'',counterparty_name:'',reference:''});
    setKind('DIRECT_EXPENSE');setMode('create');setError('');setNotice('');
  }
  async function create(e:FormEvent){
    e.preventDefault();setBusy(true);setError('');
    try{
      const data:Data={...form,kind,amount:String(form.amount),
        cash_account_id:Number(form.cash_account_id),
        ...(form.category_id?{category_id:Number(form.category_id)}:{}),
        ...(form.event_id?{event_id:Number(form.event_id)}:{}),
        ...(form.destination_cash_account_id?{destination_cash_account_id:Number(form.destination_cash_account_id)}:{})};
      for(const key of ['category_id','event_id','destination_cash_account_id'])if(!data[key])delete data[key];
      const result=await post('/backoffice/transactions',data) as {id:number};
      setNotice('Transaksi tersimpan sebagai draft. Ajukan setelah bukti dan nominal diverifikasi.');
      await loadList();await view(result.id);
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function act(action:'submit'|'approve'|'post'|'reverse'){
    if(!item)return;setBusy(true);setError('');
    try{
      const reason=action==='reverse'?window.prompt('Alasan koreksi transaksi posted (min 8 karakter):'):'';
      if(action==='reverse'&&reason==null)return;
      await post(`/backoffice/transactions/${item.data.id}/${action}`,action==='reverse'?{reason}:{});
      setNotice(`Transaksi ${action} berhasil.`);await Promise.all([view(item.data.id),loadList(),loadSummary()]);
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function createCategory(e:FormEvent){
    e.preventDefault();setBusy(true);setError('');
    try{
      const input:Data={...categoryForm,requires_attachment:false};
      if(input.flow_type==='expense'){
        input.default_debit_account_id=Number(input.account_id);
      }else if(input.flow_type==='income'){
        input.default_credit_account_id=Number(input.account_id);
      }
      delete input.account_id;
      await post('/backoffice/categories',input);
      const result=await api<{data:Data[]}>('/backoffice/categories');setCategories(result.data);
      setCategoryForm({flow_type:'expense',requires_event:false});setNotice('Kategori baru tersimpan.');
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const cashAccounts=accounts.filter(a=>Number(a.is_cash)===1);
  const currentCategories=categories.filter(c=>Number(c.active)===1&&
    c.flow_type===(kind==='OTHER_RECEIPT'?'income':kind==='DIRECT_EXPENSE'?'expense':'transfer'));
  const update=(key:string,value:string)=>setForm(f=>({...f,[key]:value}));
  return <div className="wi-commerce wi-commerce-stack">
    <div className="wi-bo-kpis">
      {[
        {label:'Saldo Kas & Bank',value:summary.cash_balance,Icon:Landmark},
        {label:'Kas Masuk Hari Ini',value:summary.today_income,Icon:ArrowUpRight},
        {label:'Kas Keluar Hari Ini',value:summary.today_expense,Icon:ArrowDownRight},
        {label:'Piutang Klien',value:summary.receivables,Icon:WalletCards},
        {label:'Utang Vendor',value:summary.payables,Icon:FileText},
        {label:'Menunggu Proses',value:String(summary.pending||0),Icon:ClipboardCheck,noCurrency:true}
      ].map(({label,value,Icon,noCurrency})=><div key={label} className="wi-commerce-card wi-bo-kpi"><Icon size={19}/><small>{label}</small>
        <strong>{noCurrency?value:formatRp(value)}</strong></div>)}
    </div>
    <div className="wi-commerce-flex wi-bo-links"><div className="wi-commerce-flex">
      <button onClick={()=>onRoute('finance')}><WalletCards size={16}/> Invoice Klien / Tagihan Vendor</button>
      <button onClick={()=>onRoute('journals')}><FileText size={16}/> Jurnal</button>
      <button onClick={()=>onRoute('reports')}><ShieldCheck size={16}/> Laporan</button></div>
      {mode==='list'&&<><button className="wi-commerce-primary" onClick={newTransaction}><Plus size={16}/> Transaksi Baru</button>
        {canApprove&&<button onClick={()=>{setMode('categories');setError('');}}>Master Kategori</button>}</>}
      {mode!=='list'&&<button onClick={()=>{setMode('list');setError('');}}>Kembali ke Daftar</button>}
    </div>
    {error&&<div className="wi-commerce-error">{error}</div>}{notice&&<div className="wi-commerce-success">{notice}</div>}
    {mode==='categories'?<section className="wi-commerce-card"><div className="wi-commerce-head"><h3>Master Kategori Keuangan</h3>
      <span>Pemetaan kategori ke akun beban/pendapatan untuk menghasilkan jurnal yang tepat.</span></div>
      <div className="wi-commerce-columns"><form className="wi-commerce-form" onSubmit={createCategory}>
        <label>Kode kategori<input required maxLength={50} value={categoryForm.code||''} onChange={e=>setCategoryForm(f=>({...f,code:e.target.value}))} placeholder="OPERASIONAL"/></label>
        <label>Nama kategori<input required maxLength={120} value={categoryForm.name||''} onChange={e=>setCategoryForm(f=>({...f,name:e.target.value}))} placeholder="Biaya transportasi"/></label>
        <label>Jenis transaksi<select value={categoryForm.flow_type} onChange={e=>setCategoryForm(f=>({...f,flow_type:e.target.value,account_id:''}))}>
          <option value="expense">Pengeluaran</option><option value="income">Pemasukan lain</option></select></label>
        <label>Akun buku besar<select required value={categoryForm.account_id||''} onChange={e=>setCategoryForm(f=>({...f,account_id:e.target.value}))}>
          <option value="">Pilih akun...</option>{accounts.filter(a=>a.type===(categoryForm.flow_type==='expense'?'expense':'revenue')).map(a=>
            <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>
        {categoryForm.flow_type==='expense'&&<label className="wi-bo-check"><input type="checkbox" checked={!!categoryForm.requires_event} onChange={e=>setCategoryForm(f=>({...f,requires_event:e.target.checked}))}/> Wajib terhubung ke wedding project</label>}
        <button className="wi-commerce-primary" disabled={busy}>Simpan Kategori</button>
      </form><div className="wi-commerce-table"><table><thead><tr><th>Kode</th><th>Kategori</th><th>Jenis</th><th>Akun</th></tr></thead><tbody>
        {categories.map(c=><tr key={c.id}><td>{c.code}</td><td>{c.name}</td><td>{c.flow_type}</td>
          <td>{c.debit_code||c.credit_code||'Belum dipetakan'}</td></tr>)}
      </tbody></table><p className="wi-commerce-note">Akun kas/bank dan chart of accounts dikelola melalui Jurnal Akuntansi. Kategori yang wajib lampiran belum bisa diposting hingga dukungan dokumen tersedia.</p></div></div>
    </section>:mode==='list'?<section className="wi-commerce-card"><div className="wi-commerce-head"><h3>Register Transaksi</h3>
      <span>Gabungan pembayaran invoice, vendor, serta transaksi backoffice tanpa jurnal duplikat.</span></div>
      <div className="wi-commerce-toolbar"><Search size={17}/><input placeholder="Cari nomor, deskripsi, atau wedding..." value={q}
        onChange={e=>{setPage(1);setQ(e.target.value);}}/>
        <button aria-label="Muat ulang" onClick={()=>{void loadList();void loadSummary();}}><RefreshCw size={17}/></button></div>
      <div className="wi-commerce-table"><table><thead><tr><th>Tanggal</th><th>Nomor</th><th>Jenis</th><th>Keterangan</th>
        <th>Wedding</th><th>Nominal</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{records.map(r=><tr key={r.uid}>
          <td>{humanDate(r.transaction_date)}</td><td>{r.number}</td><td>{r.kind.replaceAll('_',' ')}</td>
          <td>{r.description}</td><td>{r.event_title||'Umum'}</td>
          <td>{r.direction==='out'?'- ':''}{formatRp(r.amount)}</td><td><span className="wi-commerce-status">{r.status}</span></td>
          <td>{r.origin==='new'?<button onClick={()=>void view(r.id)}>Detail</button>:<button onClick={()=>onRoute('finance')}>Sumber</button>}</td>
        </tr>)}</tbody></table></div>
      {!records.length&&<p className="wi-commerce-empty">Belum ada transaksi pada filter ini.</p>}
      <div className="wi-commerce-pagination"><span>{total} transaksi · 15 per halaman</span>
        <button disabled={page===1} onClick={()=>setPage(n=>n-1)}>Sebelumnya</button><span>{page}/{Math.max(1,Math.ceil(total/15))}</span>
        <button disabled={page*15>=total} onClick={()=>setPage(n=>n+1)}>Berikutnya</button></div>
    </section>:mode==='create'?<section className="wi-commerce-card">
      <div className="wi-commerce-head"><h3>Input Pemasukan / Pengeluaran</h3><span>Form ini membuat draft dahulu, bukan langsung mengubah saldo.</span></div>
      <div className="wi-bo-kind-switch">{kinds.map(k=><button className={kind===k.id?'active':''} key={k.id}
        onClick={()=>setKind(k.id)}><strong>{k.title}</strong><small>{k.tip}</small></button>)}</div>
      <form className="wi-commerce-form wi-commerce-form-grid" onSubmit={create}>
        <label>Tanggal<input type="date" required value={form.transaction_date} onChange={e=>update('transaction_date',e.target.value)}/></label>
        <label>Nominal (Rp)<input type="number" min=".01" step=".01" required value={form.amount||''} onChange={e=>update('amount',e.target.value)}/></label>
        <label>Kas / Bank Asal<select required value={form.cash_account_id||''} onChange={e=>update('cash_account_id',e.target.value)}>
          <option value="">Pilih rekening...</option>{cashAccounts.map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>
        {kind==='INTERNAL_TRANSFER'?<label>Rekening Tujuan<select required value={form.destination_cash_account_id||''} onChange={e=>update('destination_cash_account_id',e.target.value)}>
          <option value="">Pilih rekening tujuan...</option>{cashAccounts.filter(a=>String(a.id)!==String(form.cash_account_id)).map(a=>
            <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>:
          <label>Kategori<select required value={form.category_id||''} onChange={e=>update('category_id',e.target.value)}>
            <option value="">Pilih kategori...</option>{currentCategories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
        {kind==='DIRECT_EXPENSE'&&<label>Wedding Project (opsional)<select value={form.event_id||''} onChange={e=>update('event_id',e.target.value)}>
          <option value="">Beban kantor umum</option>{events.map(e=><option key={e.id} value={e.id}>{e.title}</option>)}</select></label>}
        <label>Nama Pihak<input value={form.counterparty_name||''} onChange={e=>update('counterparty_name',e.target.value)}/></label>
        <label>Referensi<input value={form.reference||''} onChange={e=>update('reference',e.target.value)} placeholder="Nomor bukti/transfer"/></label>
        <label className="wi-commerce-wide">Keterangan<input required minLength={4} value={form.description||''} onChange={e=>update('description',e.target.value)}/></label>
        <button disabled={busy} className="wi-commerce-primary wi-commerce-wide"><Plus size={16}/> Simpan Draft</button>
      </form>
      <p className="wi-commerce-note">Penerimaan dari klien wajib melalui pembayaran Invoice agar piutang tidak terhitung ganda.
        Biaya vendor dengan tagihan wajib melalui Vendor Bills. Draft perlu disetujui pengguna lain sebelum posting.</p>
    </section>:item&&<section className="wi-commerce-card"><div className="wi-commerce-head"><h3>{item.data.number} · {item.data.status}</h3>
      <span>{item.data.description}</span></div>
      <div className="wi-commerce-total-grid"><div><small>Jumlah</small><strong>{formatRp(item.data.amount)}</strong></div>
        <div><small>Tanggal</small><strong>{humanDate(item.data.transaction_date)}</strong></div>
        <div><small>Kas / Bank</small><strong>{item.data.cash_code}</strong></div>
        <div><small>Dibuat Oleh</small><strong>{item.data.creator_name}</strong></div></div>
      <div className="wi-commerce-flex wi-bo-actions">
        {item.data.status==='draft'&&Number(item.data.created_by)&&<button disabled={busy} onClick={()=>void act('submit')}>Ajukan</button>}
        {item.data.status==='submitted'&&canApprove&&<button className="wi-commerce-primary" disabled={busy} onClick={()=>void act('approve')}><CheckCircle2 size={16}/>Setujui</button>}
        {item.data.status==='approved'&&canApprove&&<button className="wi-commerce-primary" disabled={busy} onClick={()=>void act('post')}><ArrowRightLeft size={16}/>Posting Jurnal</button>}
        {item.data.status==='posted'&&canApprove&&<button disabled={busy} onClick={()=>void act('reverse')}>Koreksi dengan Reversal</button>}
      </div>
      <div className="wi-commerce-columns"><section><h4>Jejak Persetujuan</h4><ol className="wi-bo-history">{item.audit.map((a:Data,i:number)=>
        <li key={i}><strong>{a.action}</strong> · {a.actor_name}<small>{a.created_at}{a.reason&&` · ${a.reason}`}</small></li>)}</ol></section>
        <section><h4>Baris Jurnal</h4><div className="wi-commerce-table"><table><thead><tr><th>Akun</th><th>Debit</th><th>Kredit</th></tr></thead>
          <tbody>{item.journal.map((line:Data,i:number)=><tr key={i}><td>{line.code} · {line.name}</td><td>{formatRp(line.debit)}</td><td>{formatRp(line.credit)}</td></tr>)}</tbody></table></div>
          {!item.journal.length&&<p className="wi-commerce-note">Belum diposting, belum memengaruhi saldo.</p>}</section></div>
    </section>}
  </div>;
}
