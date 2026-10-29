import {useEffect,useRef,useState,type ComponentType,type MouseEventHandler} from 'react';
import {CalendarDays,ChevronRight,Flower2,LogOut,Plus,Search,Sun,Moon,X} from 'lucide-react';
import {api,type User} from '../api';
import WorkspaceRail from './WorkspaceRail';

type NavItem={key:string;name:string;icon:ComponentType<{size?:number;strokeWidth?:number}>};
export type NavSection={label:string;items:NavItem[]};
type WeddingResult={id:number;title:string;client_name?:string;code?:string;venue?:string};

type Props={
  sections:NavSection[];
  active:string;
  user:User;
  theme:'light'|'dark';
  mobileOpen:boolean;
  expanded:boolean;
  searchOpen:boolean;
  canCreate:boolean;
  onCloseMobile:()=>void;
  onExpandChange:(expanded:boolean)=>void;
  onOpenSearch:()=>void;
  onCloseSearch:()=>void;
  onRoute:(route:string)=>void;
  onCalendar:()=>void;
  onCreateWedding:()=>void;
  onThemeChange:MouseEventHandler<HTMLButtonElement>;
  onLogout:()=>void;
};

export default function WorkspaceNavigation({sections,active,user,theme,mobileOpen,expanded,searchOpen,canCreate,
  onCloseMobile,onExpandChange,onOpenSearch,onCloseSearch,onRoute,onCalendar,onCreateWedding,onThemeChange,onLogout}:Props){
  const [query,setQuery]=useState('');
  const [weddings,setWeddings]=useState<WeddingResult[]>([]);
  const [loading,setLoading]=useState(false);
  const [searchError,setSearchError]=useState('');
  const searchInput=useRef<HTMLInputElement>(null);

  const openSearch=()=>{onCloseMobile();setQuery('');onOpenSearch();};
  const openCalendar=()=>{onCloseMobile();onCalendar();};
  const openCreate=()=>{onCloseMobile();onCreateWedding();};
  const choose=(next:string)=>{onCloseSearch();onCloseMobile();onRoute(next);};

  useEffect(()=>{
    function shortcuts(event:KeyboardEvent){
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){
        event.preventDefault();if(searchOpen)onCloseSearch();else openSearch();
      }
      if(event.key==='Escape'){onCloseSearch();onCloseMobile();}
    }
    window.addEventListener('keydown',shortcuts);
    return()=>window.removeEventListener('keydown',shortcuts);
  },[searchOpen,onOpenSearch,onCloseSearch,onCloseMobile]);

  useEffect(()=>{
    if(!searchOpen)return;
    let activeRequest=true;
    searchInput.current?.focus();
    setLoading(true);setSearchError('');
    api<{data:WeddingResult[]}>('/events').then(response=>{
      if(activeRequest)setWeddings(response.data||[]);
    }).catch(()=>{
      if(activeRequest)setSearchError('Data wedding belum dapat dimuat. Pencarian menu tetap tersedia.');
    }).finally(()=>{if(activeRequest)setLoading(false);});
    return()=>{activeRequest=false;};
  },[searchOpen]);

  const text=query.trim().toLocaleLowerCase('id-ID');
  const pages=sections.flatMap(section=>section.items).filter(item=>
    !text||item.name.toLocaleLowerCase('id-ID').includes(text));
  const weddingResults=weddings.filter(item=>
    !text||[item.title,item.client_name,item.code,item.venue].join(' ').toLocaleLowerCase('id-ID').includes(text)).slice(0,6);

  return <>
    <WorkspaceRail sections={sections} active={active} user={user} theme={theme} expanded={expanded}
      canCreate={canCreate} onExpandChange={onExpandChange} onRoute={choose} onSearch={openSearch}
      onCalendar={openCalendar} onCreateWedding={openCreate} onThemeChange={onThemeChange} onLogout={onLogout}/>

    {mobileOpen&&<button type="button" className="wi-drawer-shade" aria-label="Tutup menu" onClick={onCloseMobile}/>}
    <aside className={`wi-mobile-drawer ${mobileOpen?'is-open':''}`} aria-label="Navigasi Wedding-In" aria-hidden={!mobileOpen}>
      <div className="wi-drawer-head"><div className="wi-drawer-logo"><Flower2 size={21}/></div><div><strong>Wedding-In</strong><small>Wedding Organizer ERP</small></div>
        <button type="button" className="wi-drawer-close" onClick={onCloseMobile} aria-label="Tutup navigasi"><X size={21}/></button>
      </div>
      <div className="wi-drawer-tools">
        <button type="button" onClick={openSearch}><Search size={16}/> Cari</button>
        <button type="button" onClick={openCalendar}><CalendarDays size={16}/> Kalender</button>
        {canCreate&&<button type="button" onClick={openCreate}><Plus size={17}/> Wedding Baru</button>}
      </div>
      <nav className="wi-drawer-nav">{sections.map(section=><div key={section.label} className="wi-drawer-group">
        <span className="wi-drawer-caption">{section.label}</span>
        {section.items.map(item=>{const Icon=item.icon;const selected=active===item.key;return <button type="button" key={item.key}
          onClick={()=>choose(item.key)} className={`wi-drawer-link ${selected?'active':''}`} aria-current={selected?'page':undefined}>
          <Icon size={18}/><span>{item.name}</span>{selected&&<ChevronRight size={17}/>}</button>;})}
      </div>)}</nav>
      <div className="wi-drawer-bottom">
        <button type="button" className="wi-drawer-theme" onClick={onThemeChange}>{theme==='dark'?<Sun size={18}/>:<Moon size={18}/>} {theme==='dark'?'Tema terang':'Tema gelap'}</button>
        <div className="wi-drawer-user"><span>{user.name.slice(0,1).toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.role}</small></div>
          <button type="button" onClick={onLogout} aria-label="Keluar" title="Keluar"><LogOut size={18}/></button></div>
      </div>
    </aside>

    {searchOpen&&<div className="wi-command-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)onCloseSearch();}}>
      <section className="wi-command-panel" role="dialog" aria-modal="true" aria-label="Pencarian Wedding-In">
        <div className="wi-command-input"><Search size={21}/><input ref={searchInput} value={query} onChange={event=>setQuery(event.target.value)} placeholder="Cari wedding, klien, kode, atau halaman..." aria-label="Kata kunci pencarian"/>
          <button type="button" onClick={onCloseSearch} aria-label="Tutup pencarian"><X size={19}/></button></div>
        <div className="wi-command-results">
          {pages.length>0&&<div className="wi-command-section"><span className="wi-command-label">HALAMAN</span>{pages.map(page=>{const Icon=page.icon;return <button type="button" key={page.key} onClick={()=>choose(page.key)}><Icon size={18}/><span>{page.name}</span><ChevronRight size={15}/></button>;})}</div>}
          {(weddingResults.length>0||loading||searchError)&&<div className="wi-command-section"><span className="wi-command-label">WEDDING</span>
            {loading&&<p className="wi-command-note">Memuat daftar wedding...</p>}
            {searchError&&<p className="wi-command-note">{searchError}</p>}
            {!loading&&weddingResults.map(item=><button type="button" key={item.id} onClick={()=>choose(`event/${item.id}`)}>
              <CalendarDays size={18}/><span>{item.title}<small>{[item.code,item.client_name].filter(Boolean).join(' · ')}</small></span><ChevronRight size={15}/></button>)}
          </div>}
          {!loading&&!pages.length&&!weddingResults.length&&<p className="wi-command-empty">Tidak ada hasil untuk “{query}”.</p>}
        </div>
        <div className="wi-command-footer">Tekan <kbd>Ctrl</kbd> + <kbd>K</kbd> untuk pencarian <span><kbd>Esc</kbd> untuk tutup</span></div>
      </section>
    </div>}
  </>;
}
