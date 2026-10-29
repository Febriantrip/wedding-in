import {useEffect,useState} from 'react';
import {AnimatePresence,motion,useReducedMotion} from 'motion/react';
import {BookOpen,Download,FilePenLine,LockKeyhole,Save,Sparkles} from 'lucide-react';
import {api,patch,post} from '../../api';
import type {OpsProps} from './types';
import {printRundownGuide} from './rundown-print';

type Field={key:string;label:string;value:string};
type Section={id:string;title:string;fields:Field[]};
type TemplateOption={id:number;code:string;title:string;version_no:number};

export default function WeddingGuide({eventId,data,locked,canEdit,reload,notice}:OpsProps){
  const reduced=useReducedMotion();
  const [templates,setTemplates]=useState<TemplateOption[]>([]);
  const [templateId,setTemplateId]=useState('');
  const [sections,setSections]=useState<Section[]>([]),[active,setActive]=useState('couple'),[saving,setSaving]=useState(false),[dirty,setDirty]=useState(false);
  const profile=data?.profile as {sections:Section[];template_title:string;template_version:number}|null|undefined;
  useEffect(()=>{let alive=true;api<{templates:TemplateOption[]}>('/projects/rundown-templates')
    .then(r=>{if(!alive)return;setTemplates(r.templates);setTemplateId(String(r.templates[0]?.id??''));})
    .catch((e:Error)=>{if(alive)notice(e.message,true);});return()=>{alive=false;};},[notice]);
  useEffect(()=>{setSections(profile?.sections?structuredClone(profile.sections):[]);setDirty(false);},[profile]);
  useEffect(()=>{if(sections.length&&!sections.some(s=>s.id===active))setActive(sections[0].id);},[sections,active]);
  async function applyTemplate(){
    if(!templateId)return;
    if(!window.confirm('Salin master ke wedding ini? Akan dibuat kegiatan rundown dan formulir panduan yang terpisah dari master.'))return;
    setSaving(true);try{const result=await post(`/projects/${eventId}/rundown/apply-template`,{template_id:Number(templateId)}) as {preserved_existing?:boolean};
      await reload();notice(result.preserved_existing?'Formulir panduan tersalin. Rundown wedding lama tetap dipertahankan.':
        'Master tersalin. Sekarang isi data pengantin, lalu sesuaikan rundown Hari-H.');}
    catch(e){notice((e as Error).message,true);}finally{setSaving(false);}
  }
  async function save(){setSaving(true);try{
    await patch(`/projects/${eventId}/rundown-profile`,{sections});await reload();setDirty(false);
    notice('Data pengantin dan panduan acara berhasil disimpan pada wedding ini. Master tidak berubah.');
  }catch(e){notice((e as Error).message,true);}finally{setSaving(false);}}
  async function print(){try{
    if(dirty){notice('Simpan perubahan formulir sebelum ekspor PDF.',true);return;}
    await printRundownGuide(eventId);
  }catch(e){notice((e as Error).message,true);}}
  function change(sectionId:string,key:string,value:string){setSections(current=>current.map(section=>section.id!==sectionId?section:{...section,
    fields:section.fields.map(field=>field.key!==key?field:{...field,value})}));setDirty(true);}
  const selected=sections.find(s=>s.id===active)??sections[0];
  const filled=sections.flatMap(s=>s.fields).filter(f=>f.value.trim()).length;
  const all=sections.flatMap(s=>s.fields).length;
  return <section className="pc-card guide-root"><div className="pc-head"><div><span className="pc-kicker">WEDDING-IN · CLIENT EVENT GUIDE</span>
    <h3>Data Pengantin & Panduan Acara</h3><p>Isi halaman biodata, panitia, vendor, informasi acara, keluarga dan daftar VIP dari referensi PDF. Data ini otomatis masuk ke ekspor rundown.</p></div>
    <span className="guide-master-badge"><LockKeyhole size={14}/> Master terkunci</span></div>
    {!profile?<div className="guide-intro"><div className="guide-intro-icon"><BookOpen size={27}/></div><h4>Mulai dengan template standar</h4>
      <p>Salin template untuk wedding ini. Kegiatan dan formulir bisa diedit bebas setelah disalin; template acuan tidak akan berubah untuk klien lain.</p>
      <div className="guide-start"><select aria-label="Pilih template rundown" value={templateId} onChange={e=>setTemplateId(e.target.value)}>
        {templates.map(t=><option key={t.id} value={t.id}>{t.title} · v{t.version_no}</option>)}</select>
        {canEdit&&!locked&&<button className="pc-btn" disabled={saving||!templateId} onClick={()=>void applyTemplate()}><Sparkles size={15}/> {saving?'Menyalin...':'Salin template ke wedding'}</button>}</div>
      {locked&&<p className="pc-error">Wedding terkunci atau mode demo. Masuk dengan akun database untuk mengisi data.</p>}</div>:
    <><div className="guide-status-row"><span>Master: <b>{profile.template_title} (v{profile.template_version})</b></span>
      <span><b>{filled} / {all}</b> field terisi</span><span className={dirty?'guide-unsaved':'guide-saved'}>{dirty?'Perubahan belum disimpan':'Data tersimpan'}</span>
      <div className="guide-actions">{canEdit&&!locked&&<button className="pc-btn" type="button" disabled={saving||!dirty} onClick={()=>void save()}><Save size={15}/> {saving?'Menyimpan...':'Simpan data'}</button>}
      <button className="pc-btn ghost" type="button" disabled={saving} onClick={()=>void print()}><Download size={15}/> Ekspor PDF</button></div></div>
      <div className="guide-workspace"><nav className="guide-nav" aria-label="Bagian data panduan">{sections.map(section=><button key={section.id} type="button"
        className={active===section.id?'is-active':''} onClick={()=>setActive(section.id)}><span>{section.title}</span>
        <small>{section.fields.filter(f=>f.value.trim()).length}/{section.fields.length}</small></button>)}</nav>
      <div className="guide-fields"><AnimatePresence mode="wait" initial={false}>{selected&&<motion.div key={selected.id}
        initial={reduced?false:{opacity:0,y:5}} animate={{opacity:1,y:0}} exit={reduced?undefined:{opacity:0}}
        transition={{duration:reduced?0:.16}}><div className="guide-section-head"><div><FilePenLine size={18}/><h4>{selected.title}</h4></div>
        <span>{selected.fields.length} data</span></div><div className="guide-form-grid">{selected.fields.map(field=><label key={field.key} className={field.key.includes('address')||field.key.includes('siblings')||field.key.startsWith('vip_')?'guide-full':''}>
          <span>{field.label}</span>{field.key.includes('address')||field.key.includes('siblings')||field.key.startsWith('vip_')?
          <textarea rows={2} disabled={!canEdit||locked} maxLength={1200} value={field.value} placeholder={`Isi ${field.label.toLowerCase()}`}
            onChange={e=>change(selected.id,field.key,e.target.value)}/>:
          <input disabled={!canEdit||locked} maxLength={1200} value={field.value} placeholder={`Isi ${field.label.toLowerCase()}`}
            onChange={e=>change(selected.id,field.key,e.target.value)}/>}</label>)}</div></motion.div>}</AnimatePresence></div></div>
      <p className="gantt-help"><LockKeyhole size={13}/> Field yang diubah hanya memengaruhi wedding ini. Setelah disimpan, halaman 1–4 dan daftar VIP pada PDF otomatis mengikuti isian terbaru.</p></>}
  </section>;
}
