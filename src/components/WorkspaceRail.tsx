import {useEffect,useState,type MouseEventHandler} from 'react';
import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import {BriefcaseBusiness,CalendarDays,ChevronRight,Flower2,LayoutDashboard,LogOut,Moon,
  PanelLeftClose,Plus,Search,Settings2,Sun,WalletCards} from 'lucide-react';
import type {User} from '../api';
import type {NavSection} from './WorkspaceNavigation';

type Props={
  sections:NavSection[];
  active:string;
  user:User;
  theme:'light'|'dark';
  expanded:boolean;
  canCreate:boolean;
  onExpandChange:(expanded:boolean)=>void;
  onRoute:(route:string)=>void;
  onSearch:()=>void;
  onCalendar:()=>void;
  onCreateWedding:()=>void;
  onThemeChange:MouseEventHandler<HTMLButtonElement>;
  onLogout:()=>void;
};

const groupIcons:Record<string,typeof LayoutDashboard>={
  WORKSPACE:LayoutDashboard,
  OPERASIONAL:BriefcaseBusiness,
  KEUANGAN:WalletCards,
  SISTEM:Settings2,
};
const sectionDescriptions:Record<string,string>={
  WORKSPACE:'Proyek dan hubungan pelanggan',
  OPERASIONAL:'Layanan, partner, dan crew',
  KEUANGAN:'Transaksi dan pelaporan',
  SISTEM:'Preferensi dan keamanan',
};
const sectionTitles:Record<string,string>={
  WORKSPACE:'Workspace',OPERASIONAL:'Operasional',KEUANGAN:'Keuangan',SISTEM:'Pengaturan',
};

export default function WorkspaceRail({sections,active,user,theme,expanded,canCreate,onExpandChange,
  onRoute,onSearch,onCalendar,onCreateWedding,onThemeChange,onLogout}:Props){
  const reduced=useReducedMotion();
  const activeSection=sections.find(section=>section.items.some(item=>item.key===active));
  const [selectedLabel,setSelectedLabel]=useState(activeSection?.label??sections[0]?.label??'WORKSPACE');

  useEffect(()=>{
    if(activeSection)setSelectedLabel(activeSection.label);
  },[active]);

  const selectedSection=sections.find(section=>section.label===selectedLabel)??sections[0];
  const chooseSection=(label:string)=>{
    if(selectedLabel===label&&expanded){onExpandChange(false);return;}
    setSelectedLabel(label);
    onExpandChange(true);
  };

  return <>
    <nav className="wi-nav-rail" aria-label="Grup menu Wedding-In">
      <motion.button type="button" className="wi-nav-identity" onClick={()=>onRoute('dashboard')} title="Wedding-In · Dashboard" aria-label="Buka dashboard Wedding-In"
        whileHover={reduced?undefined:{rotate:-7,scale:1.055}} whileTap={reduced?undefined:{scale:.92}}
        transition={{type:'spring',stiffness:470,damping:30}}>
        <Flower2 size={25} strokeWidth={1.8}/>
      </motion.button>
      <div className="wi-nav-rail-groups">
        {sections.map(section=>{
          const Icon=groupIcons[section.label]??LayoutDashboard;
          const selected=selectedSection?.label===section.label;
          return <motion.button type="button" key={section.label} className={`wi-nav-rail-button ${selected?'selected':''}`}
            data-tip={sectionTitles[section.label]??section.label} aria-label={`Menu ${section.label.toLocaleLowerCase('id-ID')}`}
            aria-controls="wi-nav-panel" aria-expanded={selected&&expanded}
            whileHover={reduced?undefined:{scale:1.075,y:-2}} whileTap={reduced?undefined:{scale:.91}}
            transition={{type:'spring',stiffness:440,damping:31}} onClick={()=>chooseSection(section.label)}>
            {selected&&<motion.span layoutId="wi-rail-highlight" className="wi-nav-rail-highlight"
              transition={reduced?{duration:0}:{type:'spring',stiffness:470,damping:37}}/>}
            <Icon size={21} strokeWidth={1.85}/>
          </motion.button>;
        })}
      </div>
      <div className="wi-nav-rail-tools">
        <motion.button type="button" className="wi-nav-rail-button" data-tip="Cari · Ctrl+K" aria-label="Cari wedding atau halaman" onClick={onSearch}
          whileHover={reduced?undefined:{scale:1.07,y:-2}} whileTap={reduced?undefined:{scale:.92}}><Search size={20}/></motion.button>
        <motion.button type="button" className="wi-nav-rail-button" data-tip="Kalender" aria-label="Buka kalender wedding" onClick={onCalendar}
          whileHover={reduced?undefined:{scale:1.07,y:-2}} whileTap={reduced?undefined:{scale:.92}}><CalendarDays size={20}/></motion.button>
        <motion.button type="button" className="wi-nav-rail-button" data-tip={theme==='dark'?'Tema terang':'Tema gelap'} aria-label={theme==='dark'?'Gunakan tema terang':'Gunakan tema gelap'} onClick={onThemeChange}
          whileHover={reduced?undefined:{scale:1.07,rotate:10}} whileTap={reduced?undefined:{scale:.92}}>
          {theme==='dark'?<Sun size={20}/>:<Moon size={20}/>}</motion.button>
        <span className="wi-nav-rail-avatar" title={`${user.name} · ${user.role}`}>{user.name.slice(0,1).toUpperCase()}</span>
      </div>
    </nav>

    <aside id="wi-nav-panel" className={`wi-nav-panel ${expanded?'is-expanded':''}`} aria-label="Submenu Wedding-In"
      aria-hidden={!expanded} inert={!expanded}>
      <div className="wi-nav-panel-head">
        <div><span className="wi-nav-kicker">WEDDING-IN ERP</span><AnimatePresence initial={false} mode="wait"><motion.strong key={selectedSection?.label}
          initial={reduced?false:{opacity:0,y:4}} animate={{opacity:1,y:0}} exit={reduced?undefined:{opacity:0,y:-4}}
          transition={{duration:reduced?0:.15}}>{sectionTitles[selectedSection?.label??'WORKSPACE']??'Workspace'}</motion.strong></AnimatePresence></div>
        <motion.button type="button" className="wi-nav-collapse" onClick={()=>onExpandChange(false)} title="Sembunyikan submenu" aria-label="Sembunyikan submenu"
          whileHover={reduced?undefined:{x:-2,scale:1.06}} whileTap={reduced?undefined:{scale:.93}}><PanelLeftClose size={19}/></motion.button>
      </div>
      <div className="wi-nav-panel-body">
        <AnimatePresence initial={false} mode="wait">
          {selectedSection&&<motion.div key={selectedSection.label} className="wi-nav-section"
            initial={reduced?false:{opacity:0,x:7}} animate={{opacity:1,x:0}}
            exit={reduced?undefined:{opacity:0,x:-5}} transition={{duration:reduced?0:.16}}>
            <div className="wi-nav-section-heading"><span>{selectedSection.label}</span><p>{sectionDescriptions[selectedSection.label]??'Navigasi Wedding-In'}</p></div>
            <div className="wi-nav-section-links">
              {selectedSection.items.map(item=>{
                const Icon=item.icon;const current=active===item.key;
                return <motion.button type="button" key={item.key} className={`wi-nav-page-link ${current?'is-active':''}`}
                  aria-current={current?'page':undefined} onClick={()=>onRoute(item.key)}
                  whileHover={reduced?undefined:{x:2}} whileTap={reduced?undefined:{scale:.98}}
                  transition={{type:'spring',stiffness:440,damping:34}}>
                  {current&&<motion.span layoutId={`wi-panel-highlight-${selectedSection.label}`} className="wi-nav-page-highlight"
                    transition={reduced?{duration:0}:{type:'spring',stiffness:450,damping:39}}/>}
                  <Icon size={18} strokeWidth={1.85}/><span>{item.name}</span>{current&&<ChevronRight size={16} className="wi-nav-current-chevron"/>}
                </motion.button>;
              })}
            </div>
          </motion.div>}
        </AnimatePresence>
        {canCreate&&<motion.button type="button" className="wi-nav-create" onClick={onCreateWedding}
          whileHover={reduced?undefined:{y:-2}} whileTap={reduced?undefined:{scale:.98}}><Plus size={17}/> Wedding Baru</motion.button>}
      </div>
      <div className="wi-nav-panel-footer">
        <div className="wi-nav-account"><span>{user.name.slice(0,1).toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.role}</small></div>
          <button type="button" onClick={onLogout} title="Keluar" aria-label="Keluar akun"><LogOut size={18}/></button>
        </div>
      </div>
    </aside>
  </>;
}
