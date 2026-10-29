import {Fragment,useState,useEffect,useCallback,useMemo,useRef,type FormEvent,type MouseEvent as ReactMouseEvent,type ReactNode} from 'react';
import {flushSync} from 'react-dom';
import {AnimatePresence,motion,useReducedMotion,useScroll,useTransform} from 'motion/react';
import {LayoutDashboard,CalendarDays,UsersRound,Handshake,Layers3,UserRoundCheck,Wallet,ChartNoAxesCombined,
  BookOpenCheck,ArrowRight,ArrowUpRight,ArrowDownRight,Plus,Search,Menu,X,ChevronRight,ChevronDown,
  Bell,LogOut,Eye,EyeOff,LockKeyhole,Mail,Flower2,Heart,CheckCircle2,Circle,Clock3,MapPin,
  ClipboardList,CalendarCheck2,Check,BriefcaseBusiness,Receipt,Landmark,ArrowLeft,TrendingUp,
  WalletCards,Coins,MoreHorizontal,RefreshCw,FileText,Contact,Building2,Filter,ShieldCheck,
  PanelLeftClose,PanelLeftOpen,Info,AlertCircle,Sparkles,Sun,Moon,SlidersHorizontal,Pencil,Trash2,Settings2,KeyRound,Fingerprint} from 'lucide-react';
import {api,post,patch,formatRp,compactRp,humanDate,isoToday,isDemo,setDemo,type User} from './api';
import {daysUntilCalendarDate,isValidReportPeriod} from './date-periods';
import WeddingCalendar from './components/WeddingCalendar';
import ChecklistDocuments from './components/ChecklistDocuments';
import RecordActions from './components/RecordActions';
import ReasonDialog,{type ReasonRequest} from './components/ReasonDialog';
import WorkspaceNavigation from './components/WorkspaceNavigation';
import AnalyticsCenter from './components/AnalyticsCenter';
import DashboardCharts from './components/DashboardCharts';
import TopbarAgenda from './components/TopbarAgenda';
import {useListView,SortHeading,Pagination} from './components/useListView';
import SettingsCenter from './components/SettingsCenter';
import ReportList from './components/ReportList';
import CommercialCenter from './components/commercial/CommercialCenter';
import BackofficeCenter from './components/backoffice/BackofficeCenter';
import ProjectControl from './components/projects/ProjectControl';
import ProjectOperations from './components/operations/ProjectOperations';
import ProjectProfitability from './components/operations/ProjectProfitability';
import './components/backoffice/backoffice.css';
import {startAuthentication} from '@simplewebauthn/browser';
import './checklist.css';
import './darkmode-contrast.css';

type AnyRecord=Record<string,any>;
const navGroups=[
  {label:'WORKSPACE',items:[{key:'dashboard',name:'Dashboard',icon:LayoutDashboard},{key:'events',name:'Wedding Projects',icon:CalendarDays},{key:'leads',name:'CRM & Leads',icon:UsersRound}]},
  {label:'OPERASIONAL',items:[{key:'commercial',name:'Harga & Quotation',icon:Layers3},{key:'vendors',name:'Vendor Partners',icon:Handshake},{key:'packages',name:'Paket & Layanan',icon:Layers3},{key:'staff',name:'Tim & Crew',icon:UserRoundCheck}]},
  {label:'KEUANGAN',items:[{key:'backoffice',name:'Backoffice Keuangan',icon:WalletCards},{key:'finance',name:'Invoice & Tagihan',icon:WalletCards},{key:'profitability',name:'Profitability',icon:TrendingUp},{key:'journals',name:'Jurnal Akuntansi',icon:BookOpenCheck},{key:'reports',name:'Laporan Keuangan',icon:ChartNoAxesCombined},{key:'analytics',name:'Analytics',icon:TrendingUp}]},
  {label:'SISTEM',items:[{key:'settings',name:'Pengaturan',icon:Settings2}]}
];
const titles:Record<string,{title:string;description:string}>={dashboard:{title:'Overview Dashboard',description:'Ringkasan bisnis & aktivitas wedding Anda'},
  events:{title:'Wedding Projects',description:'Kelola setiap momen spesial dari satu tempat'},leads:{title:'CRM & Leads',description:'Semua peluang klien dalam satu pipeline'},
  vendors:{title:'Vendor Partners',description:'Jaringan partner terbaik untuk acara Anda'},packages:{title:'Paket & Layanan',description:'Penawaran yang indah, harga yang transparan'},
  commercial:{title:'Harga, Paket & Quotation',description:'Susun penawaran hybrid dengan harga rekomendasi dan kalkulator project'},
  staff:{title:'Tim & Crew',description:'Atur tim, peran, dan kebutuhan acara'},
  backoffice:{title:'Backoffice Keuangan',description:'Register pemasukan, pengeluaran, kas/bank dan jejak persetujuan'},
  finance:{title:'Invoice & Tagihan',description:'Pantau penerimaan dan kewajiban vendor'},
  profitability:{title:'Project Profitability',description:'Analisis keuntungan seluruh wedding berdasarkan kontrak dan jurnal riil'},
  journals:{title:'Jurnal Akuntansi',description:'Jejak transaksi yang rapi dan dapat diaudit'},reports:{title:'Laporan Keuangan',description:'Laporan berbasis jurnal berpasangan'},
  analytics:{title:'Analytics',description:'Pantau tren wedding, kinerja proyek, dan kesiapan tim'},
  settings:{title:'Pengaturan Sistem',description:'Kelola akun, pengguna, dan keamanan akses Wedding-In'}};
const statusLabel:Record<string,string>={planning:'Perencanaan',confirmed:'Terkonfirmasi',in_progress:'Persiapan Akhir',completed:'Selesai',cancelled:'Batal',
  new:'Baru',contacted:'Dihubungi',proposal:'Penawaran',won:'Deal',lost:'Tidak Deal',todo:'To Do',progress:'Dikerjakan',done:'Selesai',
  proposed:'Diusulkan',booked:'Booking',low:'Rendah',medium:'Sedang',high:'Tinggi'};
const statusTone=(value:string)=>['confirmed','won','completed','done'].includes(value)?'green':
  ['cancelled','lost','high'].includes(value)?'rose':['planning','proposal','progress','booked','in_progress'].includes(value)?'orange':'slate';
const number=(v:unknown)=>Number(v)||0;
function Badge({value,tone}:{value:string;tone?:string}){return <span className={`badge badge-${tone||statusTone(value)}`}><span className="badge-dot"/>{statusLabel[value]||value}</span>;}
function Empty({title='Belum ada data',subtitle='Mulai dengan menambahkan data pertama.'}:{title?:string;subtitle?:string}){return <div className="empty"><div className="empty-icon"><Flower2 size={24}/></div><strong>{title}</strong><span>{subtitle}</span></div>;}
function Panel({children,className='',heading,right}:{children:ReactNode;className?:string;heading?:string;right?:ReactNode}){return <section className={`panel ${className}`}>{heading&&<div className="panel-head"><h3>{heading}</h3>{right}</div>}{children}</section>;}
function Button({children,onClick,variant='primary',icon:Icon=Plus,disabled=false}:any){return <button type="button" disabled={disabled} className={`btn btn-${variant}`} onClick={onClick}>{Icon&&<Icon size={16}/>} {children}</button>;}
function SmallAction({children,onClick}:any){return <button className="small-action" onClick={onClick}>{children}<ChevronRight size={16}/></button>;}
const iconFor={dashboard:LayoutDashboard,events:CalendarDays,leads:UsersRound,vendors:Handshake,packages:Layers3,staff:UserRoundCheck,finance:WalletCards,journals:BookOpenCheck,reports:ChartNoAxesCombined};

function Login({onLogin}:{onLogin:(user:User)=>void}){
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{const result=await post('/auth/login',{email,password}) as {user:User};onLogin(result.user);}catch(err){setError((err as Error).message);}finally{setBusy(false);}}
  async function passkeyLogin(){
    setBusy(true);setError('');
    try{
      if(!window.isSecureContext||!window.PublicKeyCredential)throw new Error('Passkey memerlukan HTTPS atau localhost dan browser yang mendukung.');
      const options=await post('/auth/passkey/options',{});
      const signed=await startAuthentication({optionsJSON:options});
      const result=await post('/auth/passkey/verify',signed) as {user:User};
      onLogin(result.user);
    }catch(err){setError((err as Error).message);}finally{setBusy(false);}
  }
  async function enterDemo(){setDemo(true);const result=await api<{user:User}>('/auth/me');onLogin(result.user);}
  return <div className="login-page"><div className="login-visual"><div className="login-brand"><div className="mark"><Flower2 size={27}/></div><span>WEDDING-IN <small>WEDDING ORGANIZER ERP</small></span></div>
    <div className="visual-content"><div className="eyebrow light"><span/> ALL-IN-ONE WEDDING MANAGEMENT</div><h1>Beautiful moments.<br/><em>Perfectly managed.</em></h1>
      <p>Dari pertemuan pertama hingga janji suci. Setiap detail, tim, dan angka tertata indah di satu ruang kerja.</p>
      <div className="login-stat-row"><span><strong>01</strong> Plan</span><i/><span><strong>02</strong> Execute</span><i/><span><strong>03</strong> Celebrate</span></div>
    </div><div className="ring ring-one"/><div className="ring ring-two"/><div className="login-visual-footer">MADE FOR THE MOMENTS THAT MATTER <Heart size={14}/></div></div>
    <div className="login-form-zone"><div className="login-form-wrap"><div className="auth-top"><span className="auth-mark"><Flower2 size={22}/></span><span>Welcome to Wedding-In</span></div>
      <div className="auth-copy"><span className="eyebrow">WELCOME BACK</span><h2>Selamat datang kembali.</h2><p>Masuk untuk melanjutkan pengelolaan wedding Anda.</p></div>
      <form onSubmit={submit} className="auth-form"><label>Alamat Email<div className="input-icon"><Mail size={18}/><input type="email" placeholder="email@weddingorganizer.com" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="username"/></div></label>
        <label>Password<div className="input-icon"><LockKeyhole size={18}/><input type={visible?'text':'password'} placeholder="Masukkan password Anda" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/><button type="button" onClick={()=>setVisible(!visible)} aria-label="Tampilkan password">{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>
        {error&&<div className="inline-error"><AlertCircle size={16}/>{error}</div>}<button disabled={busy} className="submit-btn" type="submit">{busy?'Menghubungkan...':'Masuk ke Workspace'}<ArrowRight size={18}/></button></form>
      <div className="demo-divider"><span>atau masuk tanpa password</span></div>
      <button type="button" className="wi-passkey-button" disabled={busy} onClick={passkeyLogin}><Fingerprint size={19}/> Masuk dengan sidik jari / Face ID</button>
      <p className="wi-security-hint">Daftarkan passkey lebih dulu di Pengaturan setelah masuk. Memerlukan HTTPS atau localhost.</p>
      <div className="demo-divider"><span>atau jelajahi UI terlebih dahulu</span></div><button className="demo-btn" onClick={enterDemo}><Sparkles size={18}/> Lihat demo interaktif</button>
      <p className="login-note"><ShieldCheck size={15}/> Demo memakai data simulasi di browser; tidak terhubung ke MySQL.</p></div>
      <div className="auth-footer">© {new Date().getFullYear()} Wedding-In · Crafted with care</div>
    </div></div>;
}

function Dashboard({onRoute,onCreate,canFinance,userName}:{onRoute:(x:string)=>void;onCreate:(x:string)=>void;canFinance:boolean;userName:string}){
  const [data,setData]=useState<AnyRecord|null>(null),[error,setError]=useState('');
  const reduceMotion=useReducedMotion();
  const {scrollY}=useScroll();
  const parallaxY=useTransform(scrollY,[0,500],[0,18]);
  useEffect(()=>{api('/dashboard').then(setData).catch((e:Error)=>setError(e.message));},[]);
  if(error)return <Empty title="Dashboard belum dapat dimuat" subtitle={error}/>;
  if(!data)return <DashboardSkeleton/>;
  const k=data.overview,events=data.upcoming||[],tasks=data.tasks||[];
  const hour=new Date().getHours(),greeting=hour<11?'Selamat pagi':hour<15?'Selamat siang':hour<18?'Selamat sore':'Selamat malam';
  const featured=events[0],daysUntil=featured?daysUntilCalendarDate(String(featured.event_date)):null;
  return <div className="page-stack"><div className="dashboard-hero"><motion.div className="wi-hero-parallax" style={reduceMotion?undefined:{y:parallaxY}} aria-hidden="true"/><div className="hero-content"><div className="eyebrow light"><span/> {new Date().toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).toUpperCase()}</div><h2>{greeting}, <em>{userName.trim()||'Pengguna'}.</em></h2>
    <p>Ada {k.active_events} wedding aktif yang sedang Anda kelola. Selamat menciptakan momen berkesan hari ini.</p>
    <button className="hero-timeline" type="button" onClick={()=>onRoute(featured?`event/${featured.id}`:'events')}><span className="hero-timeline-icon"><CalendarDays size={16}/></span><span className="hero-timeline-text"><span className="hero-timeline-label">AGENDA MENDATANG</span><strong>{featured?featured.title:'Belum ada wedding mendatang'}</strong><small>{featured?humanDate(featured.event_date):'Buka kalender dan rencanakan wedding pertama'}</small></span><ArrowUpRight size={16} className="hero-timeline-arrow"/></button></div>
    <div className="hero-actions"><Button onClick={()=>onCreate('event')} icon={Plus}>Wedding Project Baru</Button><div className="next-event-chip"><span className="next-event-icon"><CalendarCheck2 size={20}/></span><div><strong>{daysUntil===null?'Agenda kosong':`${daysUntil} hari lagi`}</strong><span>{featured?'Menuju wedding terdekat':'Siap untuk proyek baru'}</span></div></div></div></div>
    <div className="stats-grid"><Stat icon={CalendarDays} label="Active Weddings" value={String(k.active_events)} hint={`${k.total_events} total event`} tone="purple" onClick={()=>onRoute('events')}/>
      {canFinance?<><Stat icon={Wallet} label="Nilai Kontrak" value={compactRp(k.contract_value)} hint="Seluruh kontrak aktif & historis" tone="blue" onClick={()=>onRoute('finance')}/>
      <Stat icon={TrendingUp} label="Potensi Margin" value={compactRp(k.projected_margin)} hint="Proyeksi, belum laba aktual" tone="green" onClick={()=>onRoute('analytics')}/>
      <Stat icon={Landmark} label="Saldo Kas & Bank" value={compactRp(k.cash_balance)} hint={`${k.overdue_invoices} invoice lewat jatuh tempo`} tone="rose" onClick={()=>onRoute('reports')}/></>:
      <Stat icon={ClipboardList} label="Tugas Tertunda" value={String(tasks.length)} hint="Tugas yang memerlukan perhatian" tone="blue" onClick={()=>onRoute('events')}/>}</div>
    <motion.div className="dashboard-main" initial={reduceMotion?false:{opacity:.5}} whileInView={{opacity:1}} viewport={{once:true,amount:.08}} transition={{duration:.2}}><Panel heading="Wedding Terdekat" right={<SmallAction onClick={()=>onRoute('events')}>Lihat semua</SmallAction>}>
      {events.length?events.map((event:AnyRecord)=><div className="event-list-row clickable" key={event.id} onClick={()=>onRoute(`event/${event.id}`)}><div className="event-datebox"><strong>{String(event.event_date).slice(8,10)}</strong><span>{new Date(`${String(event.event_date).slice(0,10)}T12:00:00`).toLocaleDateString('id-ID',{month:'short'})}</span></div>
        <div className="event-row-main"><strong>{event.title}</strong><span><MapPin size={13}/>{event.venue||'Venue belum diisi'} · {event.city||'—'}</span></div><Badge value={event.status}/><ChevronRight size={18} className="row-chevron"/></div>):<Empty/>}</Panel>
      <Panel heading="Task Prioritas" right={<span className="tiny-count">{tasks.length} tugas</span>}>
        {tasks.length?tasks.map((task:AnyRecord)=><button className="task-small" key={task.id} onClick={()=>onRoute(`event/${task.event_id}`)}><span className={`task-check ${task.status==='progress'?'doing':''}`}><Circle size={16}/></span><span><strong>{task.title}</strong><small>{task.event_title}</small></span><span className="task-due">{humanDate(task.due_at)}</span></button>):<Empty title="Semua pekerjaan selesai"/>}</Panel></motion.div>
    <DashboardCharts canFinance={canFinance}/>
  </div>;
}
function DashboardSkeleton(){return <div className="wi-skeleton-dashboard" aria-label="Sedang memuat dashboard" aria-busy="true"><div className="wi-skeleton wi-skeleton-hero"/><div className="wi-skeleton-grid">{Array.from({length:4},(_,i)=><div className="wi-skeleton wi-skeleton-card" key={i}/>)}</div><div className="wi-skeleton-grid two">{[0,1].map(i=><div className="wi-skeleton wi-skeleton-chart" key={i}/>)}</div><span className="sr-only">Menyiapkan ringkasan workspace...</span></div>;}
function Stat({icon:Icon,label,value,hint,tone,onClick}:{icon:any;label:string;value:string;hint:string;tone:string;onClick?:()=>void}){const reduced=useReducedMotion();const content=<><div className="stat-top"><div className={`stat-icon tone-${tone}`}><Icon size={19}/></div>{onClick&&<ArrowUpRight size={17} className="stat-arrow"/>}</div><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-hint">{hint}</div><div className="stat-sparkline"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div></>;return onClick?<motion.button type="button" className={`stat-card stat-${tone} wi-stat-link wi-motion-stat`} whileHover={reduced?undefined:{scale:1.012}} whileTap={reduced?undefined:{scale:.985}} transition={{duration:.15}} onClick={onClick} aria-label={`Buka detail ${label}`}>{content}</motion.button>:<div className={`stat-card stat-${tone}`}>{content}</div>;}

function Events({onRoute,onCreate,onCancel,canEdit}:{onRoute:(x:string)=>void;onCreate:(x:string,context?:AnyRecord)=>void;onCancel:(label:string,endpoint:string)=>void;canEdit:boolean}){
  const [events,setEvents]=useState<AnyRecord[]>([]),[search,setSearch]=useState(''),[filter,setFilter]=useState('all'),[loading,setLoading]=useState(true);
  const [view,setView]=useState<'list'|'calendar'>(()=>sessionStorage.getItem('weddingin_wedding_view')==='calendar'?'calendar':'list');
  const changeView=(next:'list'|'calendar')=>{sessionStorage.setItem('weddingin_wedding_view',next);setView(next);};
  useEffect(()=>{api<{data:AnyRecord[]}>('/events').then(r=>setEvents(r.data)).finally(()=>setLoading(false));},[]);
  const matching=events.filter(e=>filter==='all'||e.status===filter);
  const viewData=useListView(matching,search,['title','code','client_name','venue'],'event_date');
  return <div className="page-stack"><div className="section-toolbar">{view==='list'?<div className="searchbox"><Search size={18}/><input placeholder="Cari nama pengantin, kode, atau venue..." value={search} onChange={e=>viewData.updateSearch(e.target.value,setSearch)}/></div>:<div className="wc-calendar-hint"><Info size={17}/> Pilih tanggal untuk melihat rincian wedding dan tugas.</div>}
    <div className="wc-view-actions"><div className="wc-view-switch" role="group" aria-label="Tampilan wedding">
      <button type="button" className={view==='list'?'active':''} onClick={()=>changeView('list')} aria-pressed={view==='list'}><ClipboardList size={16}/> Daftar</button>
      <button type="button" className={view==='calendar'?'active':''} onClick={()=>changeView('calendar')} aria-pressed={view==='calendar'}><CalendarDays size={16}/> Kalender</button>
    </div>{canEdit&&<Button onClick={()=>onCreate('event')}>Tambah Wedding</Button>}</div></div>
    {view==='calendar'?<WeddingCalendar canEdit={canEdit} onOpenEvent={id=>onRoute(`event/${id}`)}
      onOpenTasks={id=>onRoute(`event/${id}/tasks`)}
      onAddTask={(date,eventId)=>onCreate('task',{due_at:`${date}T09:00`,...(eventId?{event_id:eventId}:{})})}/>:
    <><div className="filter-row">{[['all','Semua'],['planning','Planning'],['confirmed','Confirmed'],['in_progress','Persiapan Akhir'],['completed','Selesai'],['cancelled','Batal']].map(([key,label])=><button key={key} className={`filter-pill ${filter===key?'selected':''}`} onClick={()=>setFilter(key)}>{label}</button>)}</div>
    <Panel className="table-panel"><div className="table-scroll"><table><thead><tr><SortHeading label="Wedding / Klien" column="title" {...viewData} onSort={viewData.sort}/><SortHeading label="Tanggal & Lokasi" column="event_date" {...viewData} onSort={viewData.sort}/><SortHeading label="Nilai Kontrak" column="contract_amount" {...viewData} onSort={viewData.sort}/><th>Progres</th><SortHeading label="Status" column="status" {...viewData} onSort={viewData.sort}/><th>Aksi</th></tr></thead><tbody>
      {viewData.items.map(e=><tr key={e.id} className="clickable" onClick={()=>onRoute(`event/${e.id}`)}><td><div className="table-primary">{e.title}</div><div className="table-muted">{e.code} · {e.client_name}</div></td>
        <td><div className="table-primary small">{humanDate(e.event_date)}</div><div className="table-muted">{e.venue||'Belum ditentukan'}</div></td><td className="strong-num">{formatRp(e.contract_amount)}</td>
        <td><div className="progress-cell"><div className="progress-track"><div style={{width:`${number(e.total_tasks)?Math.round(number(e.completed_tasks)/number(e.total_tasks)*100):0}%`}}/></div><small>{e.completed_tasks||0}/{e.total_tasks||0} tasks</small></div></td>
        <td><Badge value={e.status}/>{e.cancel_reason&&<div className="cancel-reason">Alasan: {e.cancel_reason}</div>}</td>
        <td>{canEdit&&e.status!=='completed'&&e.status!=='cancelled'?<RecordActions onEdit={async()=>{try{const details=await api<AnyRecord>(`/events/${e.id}`);onCreate('event',{editId:e.id,item:details.event});}catch{onRoute(`event/${e.id}`);}}} onCancel={()=>onCancel(`Batalkan wedding ${e.title}`,`/events/${e.id}/cancel`)}/>:<button type="button" className="icon-button" title="Lihat detail" onClick={ev=>{ev.stopPropagation();onRoute(`event/${e.id}`);}}><ChevronRight size={17}/></button>}</td></tr>)}</tbody></table></div>
      {!viewData.total&&<Empty title={loading?'Memuat wedding...':'Tidak ada wedding ditemukan'} subtitle="Ubah filter atau buat proyek wedding baru."/>}<Pagination {...viewData} onPage={viewData.setPage}/></Panel></>}</div>;
}

const resourceConfig:Record<string,{title:string;subtitle:string;headers:[string,string,string];icon:any;action:string}>={
  leads:{title:'Leads & calon pengantin',subtitle:'Pantau setiap peluang dari perkenalan hingga deal.',headers:['Nama & Kontak','Sumber','Status'],icon:Contact,action:'Tambah Lead'},
  vendors:{title:'Direktori vendor',subtitle:'Semua partner terpercaya dalam satu database.',headers:['Vendor','Kategori','Harga Dasar'],icon:Handshake,action:'Tambah Vendor'},
  packages:{title:'Katalog paket wedding',subtitle:'Susun layanan dan penawaran dengan konsisten.',headers:['Paket','Deskripsi','Harga Paket'],icon:Layers3,action:'Paket Baru'},
  staff:{title:'Direktori tim & crew',subtitle:'Crew yang siap membantu hari spesial.',headers:['Nama Crew','Posisi','Honor / Hari'],icon:UserRoundCheck,action:'Tambah Crew'}
};
function Directory({kind,onCreate,onCancel,canEdit}:{kind:string;onCreate:(s:string,context?:AnyRecord)=>void;onCancel:(label:string,endpoint:string)=>void;canEdit:boolean}){
  const [data,setData]=useState<AnyRecord[]>([]),[search,setSearch]=useState('');const cfg=resourceConfig[kind];
  useEffect(()=>{api<{data:AnyRecord[]}>(`/resources/${kind}`).then(r=>setData(r.data));},[kind]);
  const viewData=useListView(data,search,['name','source','status','category','position','description','phone','email','city'],'name','asc');
  const secondary=kind==='leads'?'source':kind==='vendors'?'category':kind==='staff'?'position':'description';
  const numeric=kind==='leads'?'estimated_budget':kind==='vendors'?'base_price':kind==='staff'?'daily_rate':'price';
  return <div className="page-stack"><div className="directory-intro"><div className="directory-icon"><cfg.icon size={24}/></div><div><h2>{cfg.title}</h2><p>{cfg.subtitle}</p></div><span className="directory-count">{data.length} data</span></div>
    <div className="section-toolbar"><div className="searchbox"><Search size={18}/><input placeholder={`Cari ${kind}...`} value={search} onChange={e=>viewData.updateSearch(e.target.value,setSearch)}/></div>{canEdit&&<Button onClick={()=>onCreate(kind)}>{cfg.action}</Button>}</div>
    <Panel className="table-panel"><div className="table-scroll"><table><thead><tr><SortHeading label={cfg.headers[0]} column="name" {...viewData} onSort={viewData.sort}/><SortHeading label={cfg.headers[1]} column={secondary} {...viewData} onSort={viewData.sort}/><SortHeading label={cfg.headers[2]} column={kind==='leads'?'status':numeric} {...viewData} onSort={viewData.sort}/><th>Kontak / Info</th><th>Aksi</th></tr></thead><tbody>
      {viewData.items.map(item=><tr key={item.id}><td><div className="table-primary">{item.name}</div><div className="table-muted">#{String(item.id).padStart(4,'0')} {kind==='staff'&&<Badge value={number(item.active)?'Aktif':'Nonaktif'} tone={number(item.active)?'green':'rose'}/>}</div></td>
        <td>{kind==='leads'?item.source||'—':kind==='vendors'?item.category:kind==='staff'?item.position:item.description||'—'}</td>
        <td>{kind==='leads'?<Badge value={item.status}/>:formatRp(kind==='vendors'?item.base_price:kind==='staff'?item.daily_rate:item.price)}</td>
        <td><span className="table-muted">{kind==='packages'?(Array.isArray(item.inclusions)?item.inclusions.join(' · '):'—'):item.phone||item.email||item.city||'—'}</span>{item.cancel_reason&&<div className="cancel-reason">Alasan: {item.cancel_reason}</div>}</td>
        <td>{canEdit&&<RecordActions onEdit={()=>onCreate(kind,{editId:item.id,item})} onCancel={(kind==='leads'?item.status!=='lost':number(item.active)!==0)?()=>onCancel(`${kind==='leads'?'Batalkan lead':'Nonaktifkan data'} ${item.name}`,`/resources/${kind}/${item.id}/cancel`):undefined} cancelLabel={kind==='leads'?'Batalkan':'Nonaktifkan'}/>}</td></tr>)}</tbody></table></div>
      {!viewData.total&&<Empty title="Belum ada data" subtitle={`Tambahkan ${kind} pertama untuk memulai.`}/>}<Pagination {...viewData} onPage={viewData.setPage}/></Panel></div>;
}

function EventDetail({eventId,onRoute,onCreate,onCancel,refresh,notice,canFinance,canEdit,canApprove,initialTab='overview'}:{eventId:number;onRoute:(s:string)=>void;onCreate:(type:string,context?:AnyRecord)=>void;onCancel:(label:string,endpoint:string)=>void;refresh:number;notice:(text:string,error?:boolean)=>void;canFinance:boolean;canEdit:boolean;canApprove:boolean;initialTab?:string}){
  const [data,setData]=useState<AnyRecord|null>(null),[tab,setTab]=useState(()=>initialTab==='tasks'?'tasks':sessionStorage.getItem(`wi_event_tab_${eventId}`)||initialTab),[loading,setLoading]=useState(true),[deletingId,setDeletingId]=useState<number|null>(null),[documentTask,setDocumentTask]=useState<AnyRecord|null>(null);
  const [taskSearch,setTaskSearch]=useState(''),[teamSearch,setTeamSearch]=useState('');
  const taskView=useListView(data?.tasks||[],taskSearch,['title','category','assigned_to','status'],'due_at','asc');
  const vendorView=useListView(data?.vendors||[],teamSearch,['vendor_name','category','service_name'],'vendor_name','asc');
  const crewView=useListView(data?.staff||[],teamSearch,['staff_name','position','assignment'],'staff_name','asc');
  const load=useCallback(async()=>{setLoading(true);try{
    const result=await api(`/events/${eventId}`);setData(result);
  }catch(e){notice((e as Error).message,true);}finally{setLoading(false);}},[eventId,notice]);
  useEffect(()=>{void load();},[load,refresh]);
  if(loading&&!data)return <div className="page-loading">Memuat wedding workspace...</div>;
  if(!data)return <Empty title="Detail wedding tidak ditemukan"/>;
  const event=data.event,tasks=data.tasks||[],vendors=data.vendors||[],staff=data.staff||[],invoices=data.invoices||[],bills=data.bills||[];
  const frozen=['completed','cancelled'].includes(event.status);
  const completed=tasks.filter((t:AnyRecord)=>t.status==='done').length,pct=tasks.length?Math.round(completed/tasks.length*100):0;
  async function updateTask(task:AnyRecord){try{await patch(`/tasks/${task.id}`,{status:task.status==='done'?'todo':'done'});await load();notice('Status tugas diperbarui.');}catch(e){notice((e as Error).message,true);}}
  async function removeTask(task:AnyRecord){
    if(!window.confirm(`Hapus checklist "${task.title}"? Tindakan ini tidak dapat dibatalkan.`))return;
    setDeletingId(task.id);
    try{await api(`/tasks/${task.id}`,{method:'DELETE'});await load();notice('Checklist berhasil dihapus.');}
    catch(e){notice((e as Error).message,true);}finally{setDeletingId(null);}
  }
  async function removeAssignment(kind:'vendors'|'staff',item:AnyRecord){
    const label=kind==='vendors'?'vendor':'crew';
    if(!window.confirm(`Hapus penugasan ${label} ${kind==='vendors'?item.vendor_name:item.staff_name} dari wedding ini?`))return;
    try{await api(`/events/${eventId}/${kind}/${item.id}`,{method:'DELETE'});await load();notice(`Penugasan ${label} berhasil dihapus.`);}
    catch(error){notice((error as Error).message,true);}
  }
  function openClosing(){setTab('closing');sessionStorage.setItem(`wi_event_tab_${eventId}`,'closing');}
  return <><div className="page-stack"><button className="back-link" onClick={()=>onRoute('events')}><ArrowLeft size={17}/> Kembali ke Wedding Projects</button>
    <div className="event-detail-hero"><div className="event-detail-top"><span className="event-code">{event.code}</span><Badge value={event.status}/></div><div className="event-detail-title"><div><h2>{event.title}</h2><p><CalendarDays size={16}/>{humanDate(event.event_date)} <span className="dot-separator">•</span><MapPin size={16}/>{event.venue||'Venue belum ditentukan'}, {event.city||'—'}</p></div>
      <div className="event-hero-actions">{canEdit&&event.status!=='completed'&&event.status!=='cancelled'&&<RecordActions onEdit={()=>onCreate('event',{editId:eventId,item:event})} onCancel={()=>onCancel(`Batalkan wedding ${event.title}`,`/events/${eventId}/cancel`)}/>}
      {canFinance&&event.status!=='completed'&&event.status!=='cancelled'&&<Button onClick={openClosing} icon={CheckCircle2} variant="light">Review Closing</Button>}</div></div></div>
    {event.cancel_reason&&<div className="cancel-reason event-cancel-reason"><AlertCircle size={16}/> Wedding dibatalkan: {event.cancel_reason}</div>}
    <div className="event-summary-strip"><div><span>Nilai Kontrak</span><strong>{formatRp(event.contract_amount)}</strong></div>{canFinance&&<div><span>Anggaran Biaya</span><strong>{formatRp(event.estimated_cost)}</strong></div>}<div><span>Jumlah Tamu</span><strong>{number(event.guest_count).toLocaleString('id-ID')} orang</strong></div><div><span>Progres Persiapan</span><strong>{pct}% <span className="muted-inline">({completed}/{tasks.length})</span></strong></div></div>
    <div className="tab-line">{[['overview','Overview'],['timeline','Gantt Timeline'],['tasks','Checklist Persiapan'],['guide','Data Pengantin & Panduan'],['rundown','Rundown Hari-H'],['monitor','Monitoring Hari-H'],['team','Koordinasi Tim'],['vendors','Vendor & Booking'],...(canFinance?[['vendor-payments','Pembayaran Vendor'],['finance','Keuangan & Termin'],['budget','Budget & Profit'],['changes','Change Order']]:[]),['expenses','Pengajuan Biaya'],...(canFinance?[['closing','Project Closing']]:[]),['crew','Crew']].map(([key,label])=><button key={key} className={tab===key?'active':''} onClick={()=>{setTab(key);sessionStorage.setItem(`wi_event_tab_${eventId}`,key);}}>{label}</button>)}</div>
    {tab==='timeline'&&<ProjectOperations eventId={eventId} section="timeline" canFinance={canFinance} canEdit={canEdit} canApprove={canApprove} refresh={refresh} notice={notice} onCreate={onCreate} onTimelineCommit={load}/>}
    {tab==='guide'&&<ProjectOperations eventId={eventId} section="guide" canFinance={canFinance} canEdit={canEdit} canApprove={canApprove} refresh={refresh} notice={notice} onCreate={onCreate}/>}
    {tab==='rundown'&&<ProjectOperations eventId={eventId} section="rundown" canFinance={canFinance} canEdit={canEdit} canApprove={canApprove} refresh={refresh} notice={notice} onCreate={onCreate}/>}
    {tab==='team'&&<ProjectOperations eventId={eventId} section="team" canFinance={canFinance} canEdit={canEdit} canApprove={canApprove} refresh={refresh} notice={notice} onCreate={onCreate}/>}
    {tab==='monitor'&&<ProjectOperations eventId={eventId} section="monitor" canFinance={canFinance} canEdit={canEdit} canApprove={canApprove} refresh={refresh} notice={notice} onCreate={onCreate}/>}
    {tab==='vendor-payments'&&canFinance&&<ProjectOperations eventId={eventId} section="vendor-payments" canFinance={canFinance} canEdit={canEdit} canApprove={canApprove} refresh={refresh} notice={notice} onCreate={onCreate}/>}
    {tab==='expenses'&&<ProjectOperations eventId={eventId} section="expenses" canFinance={canFinance} canEdit={canEdit} canApprove={canApprove} refresh={refresh} notice={notice} onCreate={onCreate}/>}
    {tab==='closing'&&canFinance&&<ProjectOperations eventId={eventId} section="closing" canFinance={canFinance} canEdit={canEdit} canApprove={canApprove} refresh={refresh} notice={notice} onCreate={onCreate}/>}
    {tab==='overview'&&<div className="detail-grid"><Panel heading="Informasi Pengantin"><dl className="detail-list"><div><dt>Nama Klien</dt><dd>{event.client_name}</dd></div><div><dt>Pasangan</dt><dd>{event.partner_name||'—'}</dd></div><div><dt>Nomor Kontak</dt><dd>{event.client_phone||'—'}</dd></div><div><dt>Paket</dt><dd>{event.package_name||'Custom Package'}</dd></div><div><dt>Konsep / Catatan</dt><dd>{event.notes||'Belum ada catatan'}</dd></div></dl></Panel>
      <Panel heading="Ringkasan Persiapan"><div className="completion-ring"><div className="ring-progress" style={{background:`conic-gradient(#87769b ${pct}%,#ebeaf0 0)`}}><span>{pct}%</span></div><div><strong>{completed} dari {tasks.length} task</strong><p>Selesai dikerjakan</p></div></div>
        <div className="detail-summary-list"><div><Handshake size={17}/><span>Vendor ditugaskan</span><strong>{vendors.length}</strong></div><div><UsersRound size={17}/><span>Crew ditugaskan</span><strong>{staff.length}</strong></div><div><Receipt size={17}/><span>Invoice klien</span><strong>{invoices.length}</strong></div></div></Panel>
      {canFinance&&<Panel heading="Proyeksi Profit Event"><div className="financial-summary-row"><span>Nilai Kontrak</span><strong>{formatRp(event.contract_amount)}</strong></div><div className="financial-summary-row"><span>Estimasi biaya</span><strong className="expense-text">− {formatRp(event.estimated_cost)}</strong></div><div className="financial-summary-row total"><span>Estimasi Margin</span><strong>{formatRp(number(event.contract_amount)-number(event.estimated_cost))}</strong></div><div className="hint-box"><Info size={16}/> Angka di atas adalah proyeksi. Laba aktual mengikuti jurnal keuangan dan pengakuan pendapatan.</div></Panel>}</div>}
    {tab==='overview'&&<ProjectControl eventId={eventId} section="overview" canFinance={canFinance} canEdit={canEdit} canApprove={canApprove} refresh={refresh} notice={notice} onCreate={onCreate}/>}
    {tab==='tasks'&&<Panel heading="Checklist Persiapan" right={canEdit&&!frozen?<Button onClick={()=>onCreate('task',{event_id:eventId})}>Tambah Tugas</Button>:undefined}>
      <div className="wi-list-sortbar"><div className="searchbox wi-search-compact"><Search size={15}/><input aria-label="Cari checklist" placeholder="Cari task, PIC atau kategori..." value={taskSearch} onChange={e=>taskView.updateSearch(e.target.value,setTaskSearch)}/></div>
        <button type="button" onClick={()=>taskView.sort('due_at')}>Tanggal {taskView.sortKey==='due_at'?(taskView.direction==='asc'?'↑ Terlama':'↓ Terbaru'):''}</button>
        <button type="button" onClick={()=>taskView.sort('title')}>Judul {taskView.sortKey==='title'?(taskView.direction==='asc'?'↑ A–Z':'↓ Z–A'):''}</button></div>
      <div className="task-list">{taskView.total?taskView.items.map((t:AnyRecord)=><div key={t.id} className={`task-row ${t.status==='done'?'done':''}`}><button type="button" className="task-toggle" disabled={!canEdit||frozen} onClick={()=>updateTask(t)} title="Tandai selesai / belum selesai">{t.status==='done'?<CheckCircle2 size={23}/>:<Circle size={23}/>}</button><div className="task-description"><strong>{t.title}</strong><span>{t.category||'Persiapan'} · {t.assigned_to||'Belum ditugaskan'}</span></div><span className="task-date"><Clock3 size={14}/>{humanDate(t.due_at)}</span><Badge value={t.status}/><div className="checklist-actions"><button type="button" className="checklist-action checklist-document-action" title="MoM dan foto checklist" aria-label={`MoM dan foto ${t.title}`} onClick={()=>setDocumentTask(t)}><FileText size={16}/></button>{canEdit&&!frozen&&<><button type="button" className="checklist-action" title="Edit checklist" aria-label={`Edit checklist ${t.title}`} disabled={deletingId!==null} onClick={()=>onCreate('taskEdit',{event_id:eventId,item:t})}><Pencil size={16}/></button><button type="button" className="checklist-action checklist-action-danger" title="Hapus checklist" aria-label={`Hapus checklist ${t.title}`} disabled={deletingId!==null} onClick={()=>removeTask(t)}><Trash2 size={16}/></button></>}</div></div>):<Empty title="Belum ada checklist"/>}</div><Pagination {...taskView} onPage={taskView.setPage}/></Panel>}
    {tab==='vendors'&&<Panel heading="Partner Vendor" right={canEdit&&!frozen?<Button onClick={()=>onCreate('assignVendor',{event_id:eventId})}>Tambah Vendor</Button>:undefined}>
      <div className="wi-list-sortbar"><div className="searchbox wi-search-compact"><Search size={15}/><input aria-label="Cari vendor event" placeholder="Cari vendor..." value={teamSearch} onChange={e=>vendorView.updateSearch(e.target.value,setTeamSearch)}/></div><button type="button" onClick={()=>vendorView.sort('vendor_name')}>Nama {vendorView.direction==='asc'?'↑':'↓'}</button></div>
      <div className="entity-cards">{vendorView.total?vendorView.items.map((v:AnyRecord)=><div className="entity-card" key={v.id}><div className="entity-icon"><Building2 size={21}/></div><div><strong>{v.vendor_name}</strong><span>{v.category} · {v.service_name}</span><b>{formatRp(v.agreed_price)}</b></div><Badge value={v.status}/>{canEdit&&!frozen&&<RecordActions onEdit={()=>onCreate('assignVendor',{event_id:eventId,editId:v.id,item:v})} onDelete={()=>removeAssignment('vendors',v)}/>}</div>):<Empty title="Vendor belum ditugaskan" subtitle="Tambahkan vendor yang terlibat dalam wedding ini."/>}</div><Pagination {...vendorView} onPage={vendorView.setPage}/></Panel>}
    {tab==='vendors'&&<ProjectControl eventId={eventId} section="vendors" canFinance={canFinance} canEdit={canEdit} canApprove={canApprove} refresh={refresh} notice={notice} onCreate={onCreate}/>}
    {tab==='crew'&&<Panel heading="Tim yang Bertugas" right={canEdit&&!frozen?<Button onClick={()=>onCreate('assignCrew',{event_id:eventId})}>Tugaskan Crew</Button>:undefined}>
      <div className="wi-list-sortbar"><div className="searchbox wi-search-compact"><Search size={15}/><input aria-label="Cari crew event" placeholder="Cari crew..." value={teamSearch} onChange={e=>crewView.updateSearch(e.target.value,setTeamSearch)}/></div><button type="button" onClick={()=>crewView.sort('staff_name')}>Nama {crewView.direction==='asc'?'↑':'↓'}</button></div>
      <div className="entity-cards">{crewView.total?crewView.items.map((s:AnyRecord)=><div className="entity-card" key={s.id}><div className="entity-icon"><UserRoundCheck size={21}/></div><div><strong>{s.staff_name}</strong><span>{s.position} · {s.assignment}</span><b>{formatRp(s.fee)}</b></div>{canEdit&&!frozen&&<RecordActions onEdit={()=>onCreate('assignCrew',{event_id:eventId,editId:s.id,item:s})} onDelete={()=>removeAssignment('staff',s)}/>}</div>):<Empty title="Belum ada crew ditugaskan"/>}</div><Pagination {...crewView} onPage={crewView.setPage}/></Panel>}
    {tab==='finance'&&<div className="detail-grid"><Panel heading="Invoice Klien" right={canFinance&&!frozen?<Button onClick={()=>onCreate('invoice',{event_id:eventId})}>Buat Invoice</Button>:undefined}>
      <div className="simple-lines">{invoices.map((i:AnyRecord)=><div key={i.id}><div><strong>{i.number}</strong><small>{i.description} · Jatuh tempo {humanDate(i.due_date)}</small>{i.cancel_reason&&<small className="cancel-reason">Batal: {i.cancel_reason}</small>}</div><div className="right-values"><b>{formatRp(i.amount)}</b><small>Terbayar {formatRp(i.paid)}</small>{!i.cancel_reason&&<RecordActions onEdit={()=>onCreate('invoice',{editId:i.id,item:i})} onCancel={number(i.paid)===0?()=>onCancel(`Batalkan ${i.number}`,`/finance/invoices/${i.id}/cancel`):undefined}/>}</div></div>)}{!invoices.length&&<Empty/>}</div></Panel>
      <Panel heading="Tagihan Vendor" right={canFinance&&!frozen?<Button onClick={()=>onCreate('bill',{event_id:eventId})}>Catat Tagihan</Button>:undefined}><div className="simple-lines">{bills.map((b:AnyRecord)=><div key={b.id}><div><strong>{b.description}</strong><small>{b.vendor_name||'Biaya umum'} · {b.number}</small>{b.cancel_reason&&<small className="cancel-reason">Batal: {b.cancel_reason}</small>}</div><div className="right-values"><b>{formatRp(b.amount)}</b><small>Terbayar {formatRp(b.paid)}</small>{!frozen&&!b.cancel_reason&&<RecordActions onEdit={()=>onCreate('bill',{editId:b.id,item:b})} onCancel={number(b.paid)===0?()=>onCancel(`Batalkan ${b.number}`,`/finance/bills/${b.id}/cancel`):undefined}/>}</div></div>)}{!bills.length&&<Empty/>}</div></Panel></div>}
    {tab==='finance'&&<ProjectControl eventId={eventId} section="finance" canFinance={canFinance} canEdit={canEdit} canApprove={canApprove} refresh={refresh} notice={notice} onCreate={onCreate}/>}
    {tab==='budget'&&canFinance&&<ProjectControl eventId={eventId} section="budget" canFinance={canFinance} canEdit={canEdit} canApprove={canApprove} refresh={refresh} notice={notice} onCreate={onCreate}/>}
    {tab==='changes'&&canFinance&&<ProjectControl eventId={eventId} section="changes" canFinance={canFinance} canEdit={canEdit} canApprove={canApprove} refresh={refresh} notice={notice} onCreate={onCreate}/>}
    </div>{documentTask&&<ChecklistDocuments taskId={Number(documentTask.id)} taskTitle={String(documentTask.title)} canEdit={canEdit&&!frozen} onClose={()=>setDocumentTask(null)}/>}</>;
}

function Finance({onCreate,onCancel,refresh}:{onCreate:(type:string,ctx?:AnyRecord)=>void;onCancel:(label:string,endpoint:string)=>void;refresh:number}){
  const [tab,setTab]=useState<'invoices'|'bills'>('invoices'),[data,setData]=useState<{invoices:AnyRecord[];bills:AnyRecord[]}>({invoices:[],bills:[]});
  const [expanded,setExpanded]=useState<number|null>(null),[payments,setPayments]=useState<AnyRecord[]>([]),[paymentError,setPaymentError]=useState(''),[search,setSearch]=useState('');
  useEffect(()=>{Promise.all([api<{data:AnyRecord[]}>('/finance/invoices'),api<{data:AnyRecord[]}>('/finance/bills')]).then(([a,b])=>setData({invoices:a.data,bills:b.data}));},[refresh]);
  useEffect(()=>{if(expanded===null)return;let live=true;setPayments([]);setPaymentError('');api<{data:AnyRecord[]}>(`/finance/${tab}/${expanded}/payments`)
    .then(result=>{if(live)setPayments(result.data);}).catch((error:Error)=>{if(live)setPaymentError(error.message);});return()=>{live=false;};},[tab,expanded,refresh]);
  const list=data[tab],activeList=list.filter(i=>!i.cancel_reason),amount=activeList.reduce((n,i)=>n+number(i.amount),0),paid=activeList.reduce((n,i)=>n+number(i.paid),0);
  const viewData=useListView(list,search,['number','event_title','client_name','description','vendor_name','due_date'],'due_date');
  return <div className="page-stack"><div className="stats-grid three"><Stat icon={Receipt} label={tab==='invoices'?'Total Ditagihkan':'Total Kewajiban'} value={compactRp(amount,2)} hint="Nilai total tagihan" tone="purple"/>
    <Stat icon={CheckCircle2} label={tab==='invoices'?'Sudah Diterima':'Sudah Dibayar'} value={compactRp(paid,2)} hint="Akumulasi pembayaran" tone="green"/>
    <Stat icon={WalletCards} label="Sisa Belum Lunas" value={compactRp(amount-paid,2)} hint="Saldo outstanding" tone="rose"/></div>
    <div className="section-toolbar"><div className="segment"><button className={tab==='invoices'?'active':''} onClick={()=>{setTab('invoices');setExpanded(null);}}>Invoice Klien</button><button className={tab==='bills'?'active':''} onClick={()=>{setTab('bills');setExpanded(null);}}>Tagihan Vendor</button></div><div className="searchbox wi-search-compact"><Search size={17}/><input aria-label="Cari invoice atau tagihan" placeholder="Cari dokumen, klien, vendor..." value={search} onChange={e=>viewData.updateSearch(e.target.value,setSearch)}/></div><Button onClick={()=>onCreate(tab==='invoices'?'invoice':'bill')}>{tab==='invoices'?'Buat Invoice':'Catat Tagihan'}</Button></div>
    <Panel className="table-panel"><div className="table-scroll"><table><thead><tr><SortHeading label="No. Dokumen" column="number" {...viewData} onSort={viewData.sort}/><SortHeading label={tab==='invoices'?'Wedding / Klien':'Deskripsi / Vendor'} column={tab==='invoices'?'event_title':'description'} {...viewData} onSort={viewData.sort}/><SortHeading label="Jatuh Tempo" column="due_date" {...viewData} onSort={viewData.sort}/><SortHeading label="Jumlah" column="amount" {...viewData} onSort={viewData.sort}/><SortHeading label="Terbayar" column="paid" {...viewData} onSort={viewData.sort}/><th>Status / Aksi</th><th>Kelola</th></tr></thead><tbody>
      {viewData.items.map(i=><Fragment key={i.id}><tr><td><strong className="reference">{i.number}</strong></td><td><div className="table-primary">{tab==='invoices'?i.event_title:i.description}</div><div className="table-muted">{tab==='invoices'?i.client_name:i.vendor_name||i.event_title||'Biaya umum'}</div></td>
      <td>{humanDate(i.due_date)}</td><td className="strong-num">{formatRp(i.amount)}</td><td>{formatRp(i.paid)}</td><td>{i.cancel_reason?<><Badge value="Batal" tone="rose"/><div className="cancel-reason">{i.cancel_reason}</div></>:number(i.paid)>=number(i.amount)?<Badge value="Lunas" tone="green"/>:<button className="pay-button" onClick={()=>onCreate('payment',{kind:tab,item:i})}>Bayar <ArrowRight size={14}/></button>}</td>
      <td><RecordActions onEdit={i.cancel_reason?undefined:()=>onCreate(tab==='invoices'?'invoice':'bill',{editId:i.id,item:i})} onCancel={!i.cancel_reason&&number(i.paid)===0?()=>onCancel(`Batalkan ${i.number}`,`/finance/${tab}/${i.id}/cancel`):undefined}/>{number(i.paid)>0&&!i.cancel_reason&&<small className="finance-lock-hint">Tagihan berbayar tidak dapat dibatalkan sebelum koreksi pembayaran.</small>}
        <button type="button" className="finance-history-toggle" onClick={()=>setExpanded(current=>current===i.id?null:i.id)}>{expanded===i.id?'Tutup Riwayat':'Riwayat Pembayaran'} <ChevronDown size={13}/></button></td></tr>
      {expanded===i.id&&<tr><td colSpan={7} className="payment-history-cell"><div className="payment-history"><strong>Riwayat Pembayaran · {i.number}</strong>{paymentError&&<p className="inline-error">{paymentError}</p>}
        {payments.length?payments.map(payment=><div key={payment.id} className="payment-history-item"><span>{humanDate(payment.paid_at)} · {payment.method==='cash'?'Tunai':'Transfer Bank'}<small>{payment.reference||'Tanpa referensi'}</small></span>
          <b>{formatRp(payment.amount)}</b>{payment.cancel_reason?<span className="cancel-reason">Batal: {payment.cancel_reason}</span>:<RecordActions onCancel={()=>onCancel(`Batalkan pembayaran ${formatRp(payment.amount)} · ${i.number}`,`/finance/${tab}/${i.id}/payments/${payment.id}/cancel`)}/>}</div>):<p className="table-muted">Belum ada pembayaran.</p>}
      </div></td></tr>}</Fragment>)}</tbody></table></div>
      {!viewData.total&&<Empty title="Belum ada transaksi" subtitle="Tagihan yang dibuat akan tampil di sini."/>}<Pagination {...viewData} onPage={viewData.setPage}/></Panel></div>;
}

function Journals({onCreate,onCancel,refresh}:{onCreate:(x:string)=>void;onCancel:(label:string,endpoint:string)=>void;refresh:number}){
  const [data,setData]=useState<AnyRecord[]>([]),[search,setSearch]=useState('');useEffect(()=>{api<{data:AnyRecord[]}>('/finance/journals').then(r=>setData(r.data));},[refresh]);
  const journals=useMemo(()=>{const map=new Map<number,AnyRecord>();for(const line of data){if(!map.has(line.id))map.set(line.id,{...line,lines:[]});map.get(line.id)!.lines.push(line);}return [...map.values()];},[data]);
  const viewData=useListView(journals,search,['description','entry_date','reference_type','cash_flow'],'entry_date');
  return <div className="page-stack"><div className="hint-box important"><ShieldCheck size={18}/> Setiap jurnal memiliki debit dan kredit seimbang. Jurnal yang sudah diposting tidak dapat diubah melalui aplikasi.</div>
    <div className="section-toolbar"><div className="directory-count">{journals.length} entri jurnal</div><div className="searchbox wi-search-compact"><Search size={17}/><input value={search} onChange={e=>viewData.updateSearch(e.target.value,setSearch)} placeholder="Cari jurnal atau referensi..." aria-label="Cari jurnal"/></div><Button onClick={()=>onCreate('journal')}>Jurnal Manual</Button></div>
    <div className="wi-list-sortbar"><span>Urutkan:</span><button type="button" onClick={()=>viewData.sort('entry_date')}><CalendarDays size={15}/> Tanggal {viewData.sortKey==='entry_date'?(viewData.direction==='asc'?'↑ Terlama':'↓ Terbaru'):''}</button><button type="button" onClick={()=>viewData.sort('description')}>Deskripsi {viewData.sortKey==='description'?(viewData.direction==='asc'?'↑ A–Z':'↓ Z–A'):''}</button></div>
    {viewData.total?viewData.items.map(j=><Panel key={j.id} className="journal-panel"><div className="journal-head"><div><span className="reference">JRN-{String(j.id).padStart(5,'0')}</span><h3>{j.description}</h3><small>{humanDate(j.entry_date)} · {j.reference_type}</small>{j.cancel_reason&&<div className="cancel-reason">Dibatalkan: {j.cancel_reason}</div>}</div><div className="journal-header-actions">{j.cancel_reason&&<Badge value="Batal" tone="rose"/>}<Badge value={j.cash_flow} tone="slate"/>{j.reference_type==='manual'&&!j.cancel_reason&&<RecordActions onCancel={()=>onCancel(`Batalkan jurnal JRN-${String(j.id).padStart(5,'0')}`,`/finance/journals/${j.id}/cancel`)}/>}</div></div>
      <div className="journal-line-items">{j.lines.map((line:AnyRecord,i:number)=><div key={i}><span>{line.code} · {line.account_name}</span><span>{number(line.debit)>0?formatRp(line.debit):'—'}</span><span>{number(line.credit)>0?formatRp(line.credit):'—'}</span></div>)}</div><div className="journal-footer"><span>Debit</span><strong>{formatRp(j.lines.reduce((n:number,x:AnyRecord)=>n+number(x.debit),0))}</strong><span>Kredit</span><strong>{formatRp(j.lines.reduce((n:number,x:AnyRecord)=>n+number(x.credit),0))}</strong></div></Panel>):<Panel><Empty title="Belum ada jurnal" subtitle="Jurnal otomatis dibuat saat tagihan atau pembayaran dicatat."/></Panel>}<Pagination {...viewData} onPage={viewData.setPage}/></div>;
}

function Reports(){
  const [tab,setTab]=useState('balance-sheet'),[data,setData]=useState<AnyRecord|null>(null),[loading,setLoading]=useState(true),[range,setRange]=useState({from:`${isoToday().slice(0,4)}-01-01`,to:isoToday(),as_of:isoToday()});
  const [reportSearch,setReportSearch]=useState('');
  const invalidRange=['income-statement','cash-flow'].includes(tab)&&!isValidReportPeriod(range.from,range.to);
  useEffect(()=>{if(invalidRange){setData(null);setLoading(false);return;}let live=true;setLoading(true);const query=new URLSearchParams(range).toString();
    api(`/reports/${tab}?${query}`).then(result=>{if(live)setData(result);}).catch(()=>{if(live)setData(null);}).finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;};},[tab,range,invalidRange]);
  const tabs=[['balance-sheet','Neraca'],['income-statement','Laba Rugi'],['cash-flow','Arus Kas'],['trial-balance','Neraca Saldo']];
  const trialView=useListView(data?.accounts||[],reportSearch,['code','name'],'code','asc');
  function reportList(title:string,items:AnyRecord[],field='balance'){return <ReportList title={title} items={items} field={field}/>;}
  return <div className="page-stack"><div className="report-header"><div><span className="eyebrow">FINANCIAL INTELLIGENCE</span><h2>Know your numbers.</h2><p>Transaksi tercatat secara double-entry dan disajikan dalam laporan keuangan.</p></div><div className="report-header-icon"><ChartNoAxesCombined size={31}/></div></div>
    <div className="tab-line report-tabs">{tabs.map(([key,label])=><button key={key} className={tab===key?'active':''} onClick={()=>setTab(key)}>{label}</button>)}</div>
    <div className="report-filter"><span><Filter size={17}/> Periode Laporan</span>{['income-statement','cash-flow'].includes(tab)?<><label>Dari <input type="date" aria-invalid={invalidRange} value={range.from} onChange={e=>setRange({...range,from:e.target.value})}/></label><label>Sampai <input type="date" aria-invalid={invalidRange} value={range.to} onChange={e=>setRange({...range,to:e.target.value})}/></label></>:<label>Per Tanggal <input type="date" value={range.as_of} onChange={e=>setRange({...range,as_of:e.target.value})}/></label>}</div>
    {invalidRange?<div className="hint-box important" role="alert">Periode laporan tidak valid. Tanggal awal tidak boleh melewati tanggal akhir.</div>:loading?<div className="page-loading">Menyusun laporan keuangan...</div>:!data?<Empty title="Laporan gagal dimuat" subtitle="Periksa koneksi API dan periode laporan."/>:tab==='balance-sheet'?<><div className="stats-grid three"><Stat icon={Wallet} label="Total Aset" value={compactRp(data.total_assets)} hint="Aset perusahaan" tone="blue"/><Stat icon={Receipt} label="Total Liabilitas" value={compactRp(data.total_liabilities)} hint="Kewajiban perusahaan" tone="rose"/><Stat icon={Landmark} label="Total Ekuitas" value={compactRp(data.total_equity)} hint="Termasuk laba berjalan" tone="green"/></div>
      <div className="wi-balance-overview"><div><span>AKTIVA · TOTAL ASET</span><strong>{formatRp(data.total_assets)}</strong><small>Seluruh aset perusahaan</small></div><span className="wi-balance-equals">=</span><div><span>PASIVA · LIABILITAS + EKUITAS</span><strong>{formatRp(number(data.total_liabilities)+number(data.total_equity))}</strong><small>Liabilitas {formatRp(data.total_liabilities)} + Ekuitas {formatRp(data.total_equity)}</small></div></div>
      <div className="report-grid">{reportList('Aset / Assets',data.assets)}<div className="wi-pasiva-stack">{reportList('Liabilitas / Liabilities',data.liabilities)}{reportList('Ekuitas / Equity',data.equity)}</div></div><div className={`balance-check ${data.balanced?'yes':'no'}`}><CheckCircle2 size={19}/>{data.balanced?'Neraca seimbang — Total Aktiva = Total Pasiva':`Selisih Aktiva / Pasiva ${formatRp(Math.abs(number(data.total_assets)-number(data.total_liabilities)-number(data.total_equity)))}. Audit jurnal diperlukan.`}</div></>:
    tab==='income-statement'?<><div className="stats-grid three"><Stat icon={Coins} label="Pendapatan" value={compactRp(data.revenue)} hint="Pendapatan yang diakui" tone="blue"/><Stat icon={WalletCards} label="Total Beban & HPP" value={compactRp(number(data.cogs)+number(data.operating_expense))} hint="Harga pokok + beban" tone="rose"/><Stat icon={TrendingUp} label="Laba Bersih" value={compactRp(data.net_profit)} hint="Setelah beban operasional" tone="green"/></div>
      <div className="report-grid">{reportList('Pendapatan',data.groups?.revenue,'amount')}{reportList('Harga Pokok Wedding',data.groups?.cogs,'amount')}{reportList('Beban Operasional',data.groups?.expense,'amount')}</div><Panel className="profit-hero"><span>LABA / RUGI BERSIH</span><strong>{formatRp(data.net_profit)}</strong><small>Margin kotor: {formatRp(data.gross_profit)} · Laba setelah biaya operasional</small></Panel></>:
    tab==='cash-flow'?<><div className="stats-grid three"><Stat icon={Landmark} label="Kas Awal Periode" value={compactRp(data.beginning_cash)} hint="Saldo awal kas & bank" tone="blue"/><Stat icon={ArrowUpRight} label="Perubahan Kas" value={compactRp(data.net_change)} hint="Kenaikan atau penurunan bersih" tone="rose"/><Stat icon={Wallet} label="Kas Akhir Periode" value={compactRp(data.ending_cash)} hint="Saldo setelah perubahan" tone="green"/></div><Panel heading="Arus Kas Menurut Aktivitas"><div className="cashflow-list">{[['operating','Aktivitas Operasional','Tagihan klien & pembayaran usaha'],['investing','Aktivitas Investasi','Pembelian / penjualan aset'],['financing','Aktivitas Pendanaan','Modal, pinjaman, dan pembiayaan'],['opening','Saldo Awal Dalam Periode','Jurnal pembukaan akun kas'],['none','Belum Diklasifikasi','Perlu ditinjau oleh finance']].map(([key,label,info])=><div key={key}><div><strong>{label}</strong><small>{info}</small></div><span className={number(data.movements?.[key])<0?'expense-text':''}>{formatRp(data.movements?.[key])}</span></div>)}</div></Panel></>:
    <><div className="searchbox wi-search-compact"><Search size={16}/><input placeholder="Cari kode atau nama akun..." aria-label="Cari akun neraca saldo" value={reportSearch} onChange={e=>trialView.updateSearch(e.target.value,setReportSearch)}/></div>
      <Panel className="table-panel"><div className="table-scroll"><table><thead><tr><SortHeading label="Kode Akun" column="code" {...trialView} onSort={trialView.sort}/><SortHeading label="Nama Akun" column="name" {...trialView} onSort={trialView.sort}/><SortHeading label="Saldo Debit" column="debit" {...trialView} onSort={trialView.sort}/><SortHeading label="Saldo Kredit" column="credit" {...trialView} onSort={trialView.sort}/></tr></thead><tbody>{trialView.items.map((x:AnyRecord)=><tr key={x.code}><td className="reference">{x.code}</td><td>{x.name}</td><td>{formatRp(x.debit)}</td><td>{formatRp(x.credit)}</td></tr>)}</tbody><tfoot><tr><td colSpan={2}>TOTAL SELURUH AKUN</td><td>{formatRp(data.total_debit)}</td><td>{formatRp(data.total_credit)}</td></tr></tfoot></table></div><Pagination {...trialView} onPage={trialView.setPage}/></Panel><div className={`balance-check ${data.balanced?'yes':'no'}`}>{data.balanced?'Total debit dan kredit seimbang.':'Neraca saldo tidak seimbang.'}</div></>}</div>;
}

type DialogState={kind:string;context?:AnyRecord};
type Field={key:string;label:string;type?:string;required?:boolean;options?:[string,string][];wide?:boolean;placeholder?:string};
function EditorDialog({dialog,onClose,onSaved}:{dialog:DialogState;onClose:()=>void;onSaved:(message:string)=>void}){
  const kind=dialog.kind,ctx=dialog.context||{},editing=Boolean(ctx.editId);
  const [values,setValues]=useState<AnyRecord>({event_id:ctx.event_id||'',vendor_id:ctx.vendor_id||'',description:ctx.description||'',amount:ctx.amount||'',due_at:ctx.due_at||'',category:ctx.category||'',paid_at:isoToday(),due_date:isoToday(),event_date:isoToday(),
    status:kind==='assignVendor'?'proposed':'new',method:'bank',cash_flow:'none',expense_account_code:'5000',...ctx.item?{amount:(number(ctx.item.amount)-number(ctx.item.paid)).toFixed(2)}:{},
    ...(editing?{...ctx.item,event_date:String(ctx.item?.event_date||'').slice(0,10),due_date:String(ctx.item?.due_date||'').slice(0,10),
      wedding_date:String(ctx.item?.wedding_date||'').slice(0,10),phone:ctx.item?.client_phone??ctx.item?.phone??'',
      inclusions:Array.isArray(ctx.item?.inclusions)?ctx.item.inclusions.join('\n'):'',status:ctx.item?.status||'new'}:{}),
    ...(kind==='taskEdit'?{title:ctx.item?.title||'',category:ctx.item?.category||'',assigned_to:ctx.item?.assigned_to||'',
      due_at:ctx.item?.due_at?String(ctx.item.due_at).replace(' ','T').slice(0,16):'',priority:ctx.item?.priority||'medium',status:ctx.item?.status||'todo'}:{})});
  const [lists,setLists]=useState<Record<string,AnyRecord[]>>({}),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [lines,setLines]=useState<AnyRecord[]>([{code:'1010',debit:0,credit:0},{code:'3000',debit:0,credit:0}]);
  useEffect(()=>{Promise.all([api<{data:AnyRecord[]}>('/events'),api<{data:AnyRecord[]}>('/resources/vendors'),api<{data:AnyRecord[]}>('/resources/staff'),
    api<{data:AnyRecord[]}>('/finance/accounts').catch(()=>({data:[]}))]).then(([e,v,s,a])=>setLists({events:e.data,vendors:v.data,staff:s.data,accounts:a.data})).catch(()=>{});},[]);
  const option=(arr:AnyRecord[]|undefined,label:string):[string,string][]=>(arr||[]).map(x=>[String(x.id),String(x[label])]);
  const eventOptions=option(lists.events,'title'),vendorOptions=option(lists.vendors,'name'),staffOptions=option(lists.staff,'name');
  const taskFields:Field[]=[{key:'title',label:'Judul Tugas',required:true,wide:true},{key:'category',label:'Kategori'},
    {key:'assigned_to',label:'Penanggung Jawab'},{key:'due_at',label:'Tenggat Waktu',type:'datetime-local'},
    {key:'priority',label:'Prioritas',options:[['medium','Sedang'],['high','Tinggi'],['low','Rendah']]}];
  const fields:Record<string,Field[]>={
    event:[{key:'title',label:'Nama Wedding / Project',required:true,wide:true,placeholder:'Nadia & Fajar Wedding'},
      {key:'client_name',label:'Nama Calon Pengantin',required:true},{key:'partner_name',label:'Nama Pasangan'},{key:'phone',label:'Nomor WhatsApp'},
      {key:'event_date',label:'Tanggal Wedding',type:'date',required:true},{key:'venue',label:'Venue / Lokasi Acara'},{key:'city',label:'Kota'},
      {key:'guest_count',label:'Estimasi Tamu',type:'number'},{key:'contract_amount',label:'Nilai Kontrak (Rp)',type:'number'},
      {key:'estimated_cost',label:'Estimasi Biaya (Rp)',type:'number'},{key:'notes',label:'Konsep & Catatan',type:'textarea',wide:true}],
    leads:[{key:'name',label:'Nama Klien / Pasangan',required:true},{key:'phone',label:'Nomor WhatsApp'},{key:'email',label:'Email',type:'email'},
      {key:'source',label:'Sumber Lead',options:[['Instagram','Instagram'],['Website','Website'],['Referral','Referral'],['Wedding Expo','Wedding Expo'],['Other','Lainnya']]},
      {key:'status',label:'Status',options:[['new','Baru'],['contacted','Dihubungi'],['proposal','Penawaran'],['won','Deal'],['lost','Tidak Deal']]},
      {key:'wedding_date',label:'Tanggal Rencana Wedding',type:'date'},
      {key:'estimated_budget',label:'Perkiraan Budget (Rp)',type:'number'},{key:'notes',label:'Catatan',type:'textarea',wide:true}],
    vendors:[{key:'name',label:'Nama Vendor',required:true},{key:'category',label:'Kategori Vendor',required:true},
      {key:'contact_person',label:'Nama PIC'},{key:'phone',label:'Nomor WhatsApp'},
      {key:'email',label:'Email',type:'email'},{key:'city',label:'Kota'},
      {key:'base_price',label:'Harga Dasar (Rp)',type:'number'},{key:'notes',label:'Catatan',type:'textarea',wide:true}],
    packages:[{key:'name',label:'Nama Paket',required:true},{key:'price',label:'Harga Paket (Rp)',type:'number',required:true},
      {key:'description',label:'Deskripsi',type:'textarea',wide:true},{key:'inclusions',label:'Layanan Termasuk (satu per baris)',type:'textarea',wide:true}],
    staff:[{key:'name',label:'Nama Crew',required:true},{key:'position',label:'Posisi / Jabatan'},
      {key:'phone',label:'Nomor WhatsApp'},{key:'daily_rate',label:'Honor Harian (Rp)',type:'number'}],
    task:[...(!ctx.event_id?[{key:'event_id',label:'Wedding Project',required:true,options:eventOptions,wide:true} as Field]:[]),...taskFields],
    taskEdit:[...taskFields,{key:'status',label:'Status',options:[['todo','To Do'],['progress','Dikerjakan'],['done','Selesai']]}],
    assignVendor:[...(!editing?[{key:'vendor_id',label:'Pilih Vendor',required:true,options:vendorOptions} as Field]:[]),{key:'service_name',label:'Layanan'},
      {key:'agreed_price',label:'Harga Kesepakatan (Rp)',type:'number',required:true},
      {key:'notes',label:'Catatan',type:'textarea',wide:true}],
    assignCrew:[...(!editing?[{key:'staff_id',label:'Pilih Crew',required:true,options:staffOptions} as Field]:[]),{key:'assignment',label:'Tugas / Posisi'},
      {key:'fee',label:'Honor Crew (Rp)',type:'number',required:true}],
    invoice:[...(!editing?[{key:'event_id',label:'Wedding Project',required:true,options:eventOptions} as Field,
      {key:'amount',label:'Jumlah Invoice (Rp)',type:'number',required:true} as Field]:[]),
      {key:'due_date',label:'Tanggal Jatuh Tempo',type:'date',required:true},{key:'description',label:'Keterangan',placeholder:'DP, termin, pelunasan...'}],
    bill:[...(!editing?[{key:'event_id',label:'Wedding Project (opsional)',options:[['','Biaya kantor / umum'],...eventOptions]} as Field,
      {key:'vendor_id',label:'Vendor (opsional)',options:[['','Tanpa vendor'],...vendorOptions]} as Field,
      {key:'amount',label:'Nominal Tagihan (Rp)',type:'number',required:true} as Field]:[]),
      {key:'description',label:'Deskripsi Pengeluaran',required:true,wide:true},
      {key:'due_date',label:'Tanggal Jatuh Tempo',type:'date',required:true},
      ...(!editing?[{key:'expense_account_code',label:'Kategori Akuntansi',options:[['5000','Biaya Vendor Event'],['5100','Biaya Crew Event'],['5200','Biaya Dekorasi'],['6000','Beban Operasional'],['6100','Beban Gaji'],['6200','Beban Marketing'],['1300','Uang Muka Vendor']]} as Field]:[])],
    payment:[{key:'amount',label:'Jumlah Pembayaran (Rp)',type:'number',required:true},
      {key:'paid_at',label:'Tanggal Pembayaran',type:'date',required:true},
      {key:'method',label:'Metode Pembayaran',options:[['bank','Transfer Bank'],['cash','Tunai']]},
      {key:'reference',label:'No. Referensi / Catatan'}],
    journal:[{key:'date',label:'Tanggal Jurnal',type:'date',required:true},
      {key:'description',label:'Deskripsi Jurnal',required:true,wide:true},
      {key:'cash_flow',label:'Kategori Arus Kas',options:[['none','Non Kas'],['operating','Operasional'],['investing','Investasi'],['financing','Pendanaan'],['opening','Saldo Awal']]}]
  };
  const heading:Record<string,string>={event:'Wedding Project Baru',leads:'Tambah Lead',vendors:'Partner Vendor Baru',packages:'Paket Wedding Baru',staff:'Tambah Crew',task:'Tugas Baru',taskEdit:'Edit Checklist Persiapan',
    assignVendor:'Tugaskan Vendor',assignCrew:'Tugaskan Crew',invoice:'Buat Invoice Klien',bill:'Catat Tagihan Vendor',payment:'Catat Pembayaran',journal:'Jurnal Manual'};
  useEffect(()=>{if(kind==='journal')setValues(v=>({...v,date:isoToday()}));},[kind]);
  const setField=(key:string,value:string)=>setValues(v=>({...v,[key]:value}));
  async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{
    let endpoint='',payload={...values};
    for(const k of ['event_id','vendor_id','staff_id'])if(payload[k]==='')delete payload[k];
    for(const k of ['amount','contract_amount','estimated_cost','guest_count','estimated_budget','base_price','price','daily_rate','agreed_price','fee'])if(payload[k]==='')delete payload[k];
    if(kind==='packages')payload.inclusions=String(values.inclusions||'').split('\n').map((s:string)=>s.trim()).filter(Boolean);
    if(kind==='bill'){if(!payload.event_id)payload.event_id=null;if(!payload.vendor_id)payload.vendor_id=null;}
    if((kind==='task'||kind==='taskEdit')&&payload.due_at)payload.due_at=String(payload.due_at).replace('T',' ')+':00';
    if(kind==='taskEdit'){
      await patch(`/tasks/${ctx.item.id}`,{title:payload.title,category:payload.category||'',assigned_to:payload.assigned_to||'',
        due_at:payload.due_at||null,priority:payload.priority||'medium',status:payload.status||'todo'});
      onSaved('Checklist berhasil diperbarui.');return;
    }
    if(editing){
      const editableKeys=fields[kind].map(field=>field.key);
      const update=Object.fromEntries(editableKeys.filter(key=>payload[key]!==undefined).map(key=>[key,payload[key]]));
      if(kind==='event'&&update.phone===undefined)update.phone=String(values.phone||'');
      if(kind==='leads'&&!update.wedding_date)update.wedding_date=null;
      const editEndpoint=kind==='event'?`/events/${ctx.editId}`:
        kind==='assignVendor'?`/events/${ctx.event_id}/vendors/${ctx.editId}`:
        kind==='assignCrew'?`/events/${ctx.event_id}/staff/${ctx.editId}`:
        kind==='invoice'||kind==='bill'?`/finance/${kind==='invoice'?'invoices':'bills'}/${ctx.editId}`:`/resources/${kind}/${ctx.editId}`;
      await patch(editEndpoint,update);onSaved('Data berhasil diperbarui.');return;
    }
    const taskEventId=ctx.event_id||payload.event_id;
    if(kind==='task'){if(!Number(taskEventId))throw new Error('Pilih wedding project untuk tugas ini.');delete payload.event_id;}
    if(kind==='journal'){payload.lines=lines.map(line=>({...line,debit:Number(line.debit||0),credit:Number(line.credit||0)}));}
    endpoint=kind==='event'?'/events':kind==='task'?`/events/${taskEventId}/tasks`:kind==='assignVendor'?`/events/${ctx.event_id}/vendors`:
      kind==='assignCrew'?`/events/${ctx.event_id}/staff`:kind==='invoice'?'/finance/invoices':kind==='bill'?'/finance/bills':
      kind==='payment'?`/finance/${ctx.kind}/${ctx.item.id}/pay`:kind==='journal'?'/finance/journals':`/resources/${kind}`;
    await post(endpoint,payload);onSaved('Data berhasil disimpan.');
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <motion.div className="modal-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:.13}} onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><motion.section className="editor-modal" initial={{opacity:0,scale:.987}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.987}} transition={{duration:.18,ease:'easeOut'}} role="dialog" aria-modal="true" aria-label={heading[kind]}>
    <div className="modal-head"><div><span className="eyebrow">WEDDING-IN WORKSPACE</span><h2>{editing?`Edit · ${heading[kind]}`:heading[kind]}</h2><p>{editing?'Perbarui informasi yang diperlukan.':'Lengkapi informasi untuk menyimpan data.'}</p></div><button className="icon-button" onClick={onClose} aria-label="Tutup form"><X size={20}/></button></div>
    <form onSubmit={submit}><div className="modal-content"><div className="form-grid">{(fields[kind]||[]).map(f=><label key={f.key} className={`form-field ${f.wide?'span-2':''}`}><span>{f.label}{f.required&&<b>*</b>}</span>
      {f.type==='textarea'?<textarea value={values[f.key]??''} onChange={e=>setField(f.key,e.target.value)} placeholder={f.placeholder||'Tulis detail...'} rows={3}/>:
      f.options?<select required={f.required} value={values[f.key]??''} onChange={e=>setField(f.key,e.target.value)}><option value="" disabled={f.required}>— Pilih —</option>{f.options.map(([val,label])=><option key={`${f.key}-${val}`} value={val}>{label}</option>)}</select>:
      <input required={f.required} type={f.type||'text'} min={f.type==='number'?0:undefined} step={f.type==='number'?'0.01':undefined} placeholder={f.placeholder||''} value={values[f.key]??''} onChange={e=>setField(f.key,e.target.value)}/>}
      </label>)}</div>
      {kind==='journal'&&<div className="journal-editor"><div className="panel-head"><h3>Baris Jurnal</h3><button type="button" className="small-action" onClick={()=>setLines(x=>[...x,{code:'',debit:0,credit:0}])}>+ Tambah Baris</button></div>
        {lines.map((line,i)=><div key={i} className="journal-editor-row"><select value={line.code} onChange={e=>setLines(x=>x.map((v,j)=>j===i?{...v,code:e.target.value}:v))}><option value="">Pilih Akun</option>{(lists.accounts||[]).map(a=><option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</select>
          <input aria-label="Debit" type="number" step="0.01" min="0" placeholder="Debit" value={line.debit} onChange={e=>setLines(x=>x.map((v,j)=>j===i?{...v,debit:e.target.value}:v))}/>
          <input aria-label="Kredit" type="number" step="0.01" min="0" placeholder="Kredit" value={line.credit} onChange={e=>setLines(x=>x.map((v,j)=>j===i?{...v,credit:e.target.value}:v))}/></div>)}
        <p className="helper-text">Total debit harus sama dengan kredit. Gunakan kode kas/bank yang sesuai untuk transaksi tunai.</p></div>}
      {kind==='payment'&&<div className="hint-box"><Info size={17}/> Sisa tagihan {ctx.item?.number}: {formatRp(number(ctx.item?.amount)-number(ctx.item?.paid))}. Pembayaran otomatis membuat jurnal.</div>}
      {editing&&(kind==='invoice'||kind==='bill')&&<div className="hint-box"><ShieldCheck size={16}/> Nominal yang sudah diposting ke jurnal tidak bisa diedit. Jika salah nominal, gunakan pembatalan dengan alasan (hanya sebelum ada pembayaran), lalu buat dokumen baru.</div>}
      {error&&<div className="inline-error"><AlertCircle size={16}/>{error}</div>}</div>
      <div className="modal-footer"><button type="button" className="btn btn-ghost" onClick={onClose}>Batal</button><button disabled={busy} type="submit" className="submit-inline">{busy?'Menyimpan...':'Simpan Data'}<ArrowRight size={17}/></button></div></form></motion.section></motion.div>;
}

export default function App(){
  const [user,setUser]=useState<User|null>(null),[booting,setBooting]=useState(true),[route,setRoute]=useState(()=>decodeURI(location.hash.replace(/^#\/?/,'')||'dashboard'));
  const [dialog,setDialog]=useState<DialogState|null>(null),[refresh,setRefresh]=useState(0),[toast,setToast]=useState<{text:string;error:boolean}|null>(null),
    [mobileOpen,setMobileOpen]=useState(false);
  const [reasonRequest,setReasonRequest]=useState<ReasonRequest|null>(null);
  const [theme,setTheme]=useState<'light'|'dark'>(()=>(localStorage.getItem('weddingin_theme')||localStorage.getItem('aurelia_theme'))==='dark'?'dark':'light');
  const [navExpanded,setNavExpanded]=useState(()=>localStorage.getItem('weddingin_nav_expanded')!=='false');
  const [searchOpen,setSearchOpen]=useState(false);
  const [profileOpen,setProfileOpen]=useState(false);
  const routeRef=useRef(route);
  const reduceMotion=useReducedMotion();
  const {scrollYProgress}=useScroll();
  const scrollIndicator=useTransform(scrollYProgress,[0,1],['0%','100%']);
  const routeTransitionRef=useRef<{finished:Promise<void>;skipTransition?:()=>void}|null>(null);
  const notice=useCallback((text:string,error=false)=>setToast({text,error}),[]);
  const showRoute=useCallback((to:string)=>{
    if(routeRef.current===to)return;
    routeRef.current=to;
    // Motion owns page entrance/exit; never run native View Transition in parallel.
    setRoute(to);
  },[]);
  useEffect(()=>{if(import.meta.env.VITE_PUBLIC_DEMO==='true')setDemo(true);
    api<{user:User}>('/auth/me').then(r=>setUser(r.user)).catch(()=>{}).finally(()=>setBooting(false));
    const listener=()=>showRoute(decodeURI(location.hash.replace(/^#\/?/,'')||'dashboard'));
    addEventListener('hashchange',listener);return()=>removeEventListener('hashchange',listener);},[showRoute]);
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(null),4200);return()=>clearTimeout(timer);},[toast]);
  useEffect(()=>{localStorage.setItem('weddingin_theme',theme);},[theme]);
  useEffect(()=>{localStorage.setItem('weddingin_nav_expanded',String(navExpanded));},[navExpanded]);
  const navigate=(to:string)=>{setProfileOpen(false);showRoute(to);if(location.hash!==`#/${to}`)location.hash=`/${to}`;};
  const toggleTheme=(event:ReactMouseEvent<HTMLButtonElement>)=>{
    const change=()=>flushSync(()=>setTheme(value=>value==='dark'?'light':'dark'));
    const doc=document as Document&{startViewTransition?:(callback:()=>void)=>{ready:Promise<void>;finished:Promise<void>}};
    if(!doc.startViewTransition||window.matchMedia('(prefers-reduced-motion: reduce)').matches){change();return;}
    routeTransitionRef.current?.skipTransition?.();
    document.documentElement.classList.add('wi-theme-transition');
    const rect=event.currentTarget.getBoundingClientRect();
    const x=rect.left+rect.width/2,y=rect.top+rect.height/2;
    const radius=Math.hypot(Math.max(x,innerWidth-x),Math.max(y,innerHeight-y));
    try{
      const transition=doc.startViewTransition.call(doc,change);
      void transition.ready.then(()=>document.documentElement.animate({clipPath:[`circle(0px at ${x}px ${y}px)`,`circle(${radius}px at ${x}px ${y}px)`]},
        {duration:260,easing:'cubic-bezier(.22,1,.36,1)',pseudoElement:'::view-transition-new(root)'})).catch(()=>{});
      void transition.finished.finally(()=>document.documentElement.classList.remove('wi-theme-transition')).catch(()=>{});
    }catch{document.documentElement.classList.remove('wi-theme-transition');change();}
  };
  const openCalendar=()=>{sessionStorage.setItem('weddingin_wedding_view','calendar');setRefresh(x=>x+1);navigate('events');};
  const create=(kind:string,context?:AnyRecord)=>setDialog({kind,context});
  const cancelRecord=(label:string,endpoint:string)=>setReasonRequest({label,endpoint});
  const confirmCancellation=async(reason:string)=>{if(!reasonRequest)return;await post(reasonRequest.endpoint,{reason});setReasonRequest(null);setRefresh(x=>x+1);notice('Pembatalan disimpan beserta alasannya.');};
  const saved=(text:string)=>{setDialog(null);setRefresh(x=>x+1);notice(text);};
  const logout=async()=>{try{await api('/auth/logout',{method:'POST'});}catch{}setDemo(false);setUser(null);setDialog(null);navigate('dashboard');};
  if(booting)return <div className="boot-screen"><Flower2 size={34}/> Menyiapkan Wedding-In...</div>;
  if(!user)return <Login onLogin={setUser}/>;
  const active=route.startsWith('event/')?'events':route;
  const header=titles[active]||titles.events;
  const canFinance=['owner','admin','finance'].includes(user.role);
  const canCreate=['owner','admin','planner','sales'].includes(user.role);
  const activeGroup=navGroups.find(group=>group.items.some(item=>item.key===active))?.label??'WORKSPACE';
  const financePages=['backoffice','finance','journals','reports','analytics'];
  return <div className={`app-shell theme-${theme} ${navExpanded?'wi-nav-expanded':''}`}><motion.div className="wi-scroll-progress" style={{scaleX:scrollIndicator}} aria-hidden="true"/><WorkspaceNavigation sections={navGroups.filter(group=>group.label!=='KEUANGAN'||canFinance)}
      active={active} user={user} theme={theme} mobileOpen={mobileOpen} expanded={navExpanded} searchOpen={searchOpen} canCreate={canCreate}
      onCloseMobile={()=>setMobileOpen(false)} onExpandChange={setNavExpanded} onOpenSearch={()=>setSearchOpen(true)} onCloseSearch={()=>setSearchOpen(false)}
      onRoute={navigate} onCalendar={openCalendar} onCreateWedding={()=>create('event')}
      onThemeChange={toggleTheme} onLogout={logout}/>
    <div className="main-shell"><motion.header className="topbar" initial={reduceMotion?false:{opacity:0,y:-11}}
      animate={{opacity:1,y:0}} transition={{duration:reduceMotion?0:.24,ease:[.22,1,.36,1]}}><div className="topbar-left">
      <button type="button" className="icon-button mobile-menu" aria-label="Buka navigasi" onClick={()=>setMobileOpen(true)}><Menu size={21}/></button>
      <div className="wi-topbar-breadcrumb"><span>{activeGroup.toLocaleLowerCase('id-ID')}</span><ChevronRight size={14}/><strong>{header.title}</strong></div>
      <motion.button type="button" className="wi-topbar-search" aria-label="Cari halaman atau wedding · Ctrl+K" onClick={()=>setSearchOpen(true)}
        whileHover={reduceMotion?undefined:{y:-1,scale:1.005}} whileTap={reduceMotion?undefined:{scale:.985}}
        transition={{type:'spring',stiffness:440,damping:33}}><Search size={17}/><span>Cari wedding, klien, atau halaman...</span><kbd>Ctrl K</kbd></motion.button>
      </div><div className="topbar-right">
        <motion.button type="button" className="wi-topbar-action" title="Kalender wedding" aria-label="Buka kalender wedding" onClick={openCalendar}
          whileTap={reduceMotion?undefined:{scale:.9}}><CalendarDays size={19}/></motion.button>
        <TopbarAgenda onRoute={navigate}/>
        {canCreate&&<motion.button type="button" className="wi-topbar-new" onClick={()=>create('event')}
          whileHover={reduceMotion?undefined:{y:-2,scale:1.015}} whileTap={reduceMotion?undefined:{scale:.96}}
          transition={{type:'spring',stiffness:450,damping:31}}><Plus size={17}/><span>Wedding Baru</span></motion.button>}
        <div className="wa-profile-wrap"><button type="button" className="topbar-avatar wa-profile-button" aria-expanded={profileOpen} title={`${user.name} · ${user.role}`} aria-label="Buka menu akun" onClick={()=>setProfileOpen(x=>!x)}>{user.name.slice(0,1).toUpperCase()}</button>
          {profileOpen&&<div className="wa-profile-menu"><strong>{user.name}</strong><small>{user.role}</small><button type="button" onClick={logout}><LogOut size={15}/> Keluar akun</button></div>}
        </div></div></motion.header>
      <main className="main-content"><AnimatePresence initial={false} mode="wait"><motion.div key={route} className="wi-page-stage" initial={reduceMotion?false:{opacity:0}} animate={{opacity:1}} exit={reduceMotion?undefined:{opacity:0}} transition={{duration:reduceMotion?0:.18,ease:'easeOut'}}><div className="page-heading wa-page-heading"><div><div className="eyebrow"><span/> WEDDING-IN MANAGEMENT {isDemo()&&<span className="wa-demo-eyebrow">DEMO</span>}</div><h1>{header.title}</h1><p>{header.description}</p></div>
        {canFinance&&['dashboard','analytics'].includes(active)&&<div className="wa-dashboard-switch" role="group" aria-label="Pilih tampilan dashboard"><button type="button" className={active==='dashboard'?'active':''} aria-pressed={active==='dashboard'} onClick={()=>navigate('dashboard')}><LayoutDashboard size={15}/> Overview</button><button type="button" className={active==='analytics'?'active':''} aria-pressed={active==='analytics'} onClick={()=>navigate('analytics')}><TrendingUp size={15}/> Analytics</button></div>}
      </div>
        {financePages.includes(active)&&!canFinance?<Empty title="Akses terbatas" subtitle="Hanya owner, admin, dan finance yang dapat melihat halaman keuangan."/>:
        active==='dashboard'?<Dashboard onRoute={navigate} onCreate={create} canFinance={canFinance} userName={user.name}/>:
        active==='analytics'?<AnalyticsCenter/>:
        active==='commercial'?<CommercialCenter role={user.role} onOpenWedding={id=>navigate(`event/${id}`)}/>:
        active==='backoffice'?<BackofficeCenter role={user.role} onRoute={navigate}/>:
        active==='profitability'?<ProjectProfitability onOpenWedding={id=>navigate(`event/${id}`)}/>:
        route.startsWith('event/')?<EventDetail key={`${route}-${refresh}`} eventId={Number(route.split('/')[1])} initialTab={route.split('/')[2]==='tasks'?'tasks':'overview'} onRoute={navigate} onCreate={create} onCancel={cancelRecord} refresh={refresh} notice={notice} canFinance={canFinance} canEdit={['owner','admin','planner','sales'].includes(user.role)} canApprove={['owner','admin'].includes(user.role)}/>:
        active==='events'?<Events key={refresh} onRoute={navigate} onCreate={create} onCancel={cancelRecord} canEdit={['owner','admin','planner','sales'].includes(user.role)}/>:
        ['leads','vendors','packages','staff'].includes(active)?<Directory key={`${active}-${refresh}`} kind={active} onCreate={create} onCancel={cancelRecord} canEdit={['owner','admin','planner','sales'].includes(user.role)}/>:
        active==='finance'?<Finance onCreate={create} onCancel={cancelRecord} refresh={refresh}/>:
        active==='journals'?<Journals onCreate={create} onCancel={cancelRecord} refresh={refresh}/>:
        active==='reports'?<Reports/>:
        active==='settings'?<SettingsCenter user={user}/>:
        <Dashboard onRoute={navigate} onCreate={create} canFinance={canFinance} userName={user.name}/>}</motion.div></AnimatePresence></main>
      <footer className="app-footer">Wedding-In <span>·</span> Your events, beautifully organized.</footer></div>
    <AnimatePresence>{dialog&&<EditorDialog key={`${dialog.kind}-${dialog.context?.event_id||''}`} dialog={dialog} onClose={()=>setDialog(null)} onSaved={saved}/>}</AnimatePresence>
    <AnimatePresence>{reasonRequest&&<ReasonDialog key={reasonRequest.endpoint} request={reasonRequest} onClose={()=>setReasonRequest(null)} onConfirm={confirmCancellation}/>}</AnimatePresence>
    {toast&&<div className={`toast ${toast.error?'toast-error':''}`}><span>{toast.error?<AlertCircle size={19}/>:<CheckCircle2 size={19}/>}</span>{toast.text}<button onClick={()=>setToast(null)}><X size={16}/></button></div>}</div>;
}
