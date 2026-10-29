import {api} from '../../api';

type Field={key:string;label:string;value:string};
type Section={id:string;title:string;fields:Field[]};
type Entry=Record<string,any>;
const escapeHtml=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]??c));
const display=(value:unknown)=>escapeHtml(value||'—').replace(/\n/g,'<br>');
const time=(value:unknown)=>String(value??'').slice(11,16);
const segmentLabel:Record<string,string>={preparation:'PERSIAPAN ACARA',ceremony:'PROSESI AKAD / PEMBERKATAN',reception:'RESEPSI',closing:'PENUTUPAN',other:'KEGIATAN LAINNYA'};
const find=(sections:Section[],key:string)=>sections.flatMap(s=>s.fields).find(f=>f.key===key)?.value||'';
const section=(sections:Section[],id:string)=>sections.find(s=>s.id===id);
const table=(fields:Field[])=>`<table class="key-value"><tbody>${fields.map(f=>`<tr><th>${escapeHtml(f.label)}</th><td>${display(f.value)}</td></tr>`).join('')}</tbody></table>`;
const column=(title:string,fields:Field[])=>`<div class="paper-column"><h3>${escapeHtml(title)}</h3>${table(fields)}</div>`;
const page=(title:string,inner:string,footer='Wedding-In • Panduan Acara')=>`<section class="paper-page"><div class="page-head"><div class="brand">W<span>✦</span></div><div class="page-title"><small>WEDDING-IN | WEDDING EVENT GUIDE</small><h2>${escapeHtml(title)}</h2></div></div><div class="page-content">${inner}</div><footer>${escapeHtml(footer)}<span>Panduan internal • disesuaikan per wedding</span></footer></section>`;

export function renderRundownDocument(event:Entry,sections:Section[],items:Entry[]){
  const title=String(event.title||'Acara Pernikahan');
  const date=String(event.event_date||'').slice(0,10);
  const dateLabel=date?new Date(`${date}T12:00:00Z`).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}):'—';
  const bride=find(sections,'bride_name'),groom=find(sections,'groom_name');
  const couple=section(sections,'couple')?.fields??[];
  const committee=section(sections,'committee')?.fields??[];
  const vendors=section(sections,'vendors')?.fields??[];
  const info=section(sections,'info')?.fields??[];
  const family=section(sections,'family')?.fields??[];
  const vip=section(sections,'vip')?.fields??[];
  const pages:string[]=[];
  pages.push(`<section class="paper-page cover"><div class="cover-inner"><div class="cover-monogram">W<span>✦</span></div><p class="cover-kicker">WEDDING-IN · THE WEDDING GUIDE</p><h1>PANDUAN ACARA<br>PERNIKAHAN</h1><div class="cover-rule"></div><h2>${display(bride||'Nama CPW')} <i>&amp;</i> ${display(groom||'Nama CPP')}</h2><p class="cover-details">${escapeHtml(dateLabel)}<span>•</span>${display(find(sections,'venue')||event.venue)}</p><p class="cover-note">Rundown &amp; panduan koordinasi keluarga, crew, dan vendor</p></div><footer>Wedding-In <span>Private event document</span></footer></section>`);
  pages.push(page('DATA CALON PENGANTIN',`<div class="paper-columns">${column('CALON PENGANTIN WANITA',couple.filter(f=>f.key.startsWith('bride_')))}${column('CALON PENGANTIN PRIA',couple.filter(f=>f.key.startsWith('groom_')))}</div>`));
  pages.push(page('KEPANITIAAN ACARA',`<div class="paper-columns">${column('SUSUNAN PANITIA AKAD & RESEPSI',committee)}${column('DAFTAR VENDOR & PARTNER',vendors)}</div>`));
  pages.push(page('INFORMASI & PERLENGKAPAN ACARA',`<div class="paper-columns">${column('DETAIL ACARA & KEBUTUHAN',info)}${column('KOORDINASI KELUARGA',family)}</div>`));
  const sorted=[...items].sort((a,b)=>String(a.planned_start).localeCompare(String(b.planned_start))||Number(a.id)-Number(b.id));
  const chunks:Entry[][]=[];
  // Enam kegiatan per halaman memberi ruang untuk huruf lebih besar dan catatan teknis.
  for(let i=0;i<sorted.length;i+=6)chunks.push(sorted.slice(i,i+6));
  if(!chunks.length)chunks.push([]);
  for(const [chunkIndex,chunk] of chunks.entries()){
    const headers='<thead><tr><th class="c-time">WAKTU</th><th class="c-duration">DURASI</th><th class="c-title">ACARA / KEGIATAN</th><th>DETAIL ACARA</th><th class="c-pic">PIC</th><th>CATATAN TEKNIS</th></tr></thead>';
    const body=chunk.map(item=>{
      const start=new Date(String(item.planned_start).replace(' ','T')+'+07:00');
      const end=new Date(String(item.planned_end).replace(' ','T')+'+07:00');
      const mins=Math.max(0,Math.round((end.getTime()-start.getTime())/60000));
      const details=item.run_detail||item.notes||'',pic=item.pic_text||item.crew_name||item.vendor_name||'';
      return `<tr><td>${escapeHtml(time(item.planned_start))}–${escapeHtml(time(item.planned_end))}</td><td>${mins} mnt</td><td><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(segmentLabel[String(item.segment)]??'KEGIATAN')}</small></td><td>${display(details)}</td><td>${display(pic)}</td><td>${display(item.technical_note)}</td></tr>`;
    }).join('');
    pages.push(page(`RANGKAIAN ACARA · ${chunkIndex+1}`,`<div class="schedule-heading"><b>${escapeHtml(title)}</b><span>${escapeHtml(dateLabel)}</span></div><table class="schedule">${headers}<tbody>${body}</tbody></table><p class="schedule-note">Urutan kegiatan bersifat panduan dan dapat disesuaikan melalui Rundown Hari-H Wedding-In.</p>`));
  }
  pages.push(page('DAFTAR TAMU VIP',`<div class="vip-grid">${vip.map(f=>`<article><h3>${escapeHtml(f.label)}</h3><div>${display(f.value)}</div></article>`).join('')}</div>`));
  const styles=`@page{size:A4 landscape;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#ece9e7;color:#332b33;font-family:Arial,'Helvetica Neue',sans-serif;font-size:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact}.paper-page{width:297mm;height:210mm;background:white;margin:0 auto 14px;padding:14mm 16mm 11mm;position:relative;page-break-after:always;overflow:hidden;display:flex;flex-direction:column}.page-head{display:flex;align-items:center;gap:14px;border-bottom:1px solid #d2c2a6;padding-bottom:10px;margin-bottom:13px}.brand,.cover-monogram{font-family:Georgia,serif;font-size:31px;color:#916d44;font-weight:bold}.brand span,.cover-monogram span{font-size:18px;color:#be9e6b}.page-title small{letter-spacing:2px;color:#928371;font-size:9.5px}.page-title h2{font:normal 25px Georgia,serif;color:#6b4b35;margin:2px 0}.page-content{flex:1;min-height:0}footer{display:flex;justify-content:space-between;border-top:1px solid #d2c2a6;padding-top:8px;color:#7c6b59;letter-spacing:.3px;margin-top:auto;font-size:10.5px}.paper-columns{display:grid;grid-template-columns:1fr 1fr;gap:19px}.paper-column{min-width:0}.paper-column h3{font-size:13px;color:#856043;margin:0 0 9px;letter-spacing:.5px}.key-value{border-collapse:collapse;width:100%;font-size:12px}.key-value th,.key-value td{padding:6px 8px;border:1px solid #e2ddd4;text-align:left;vertical-align:top;line-height:1.4}.key-value th{width:43%;background:#f6f3ef;color:#5e5149;font-weight:600}.key-value td{word-break:break-word}.cover{background:linear-gradient(140deg,#fffdfa,#faf5eb)}.cover-inner{margin:auto;text-align:center;width:90%}.cover-monogram{font-size:66px}.cover-monogram span{font-size:32px}.cover-kicker{letter-spacing:3.4px;color:#927c63;margin:18px 0}.cover h1{font:normal 40px/1.17 Georgia,serif;color:#765d43;letter-spacing:2px}.cover-rule{height:1px;background:#bda37f;width:130px;margin:22px auto}.cover h2{font:normal 27px Georgia,serif;color:#5a4944}.cover h2 i{font-size:22px;color:#b4976f}.cover-details{font-size:15px;margin:16px 0;color:#785c4a}.cover-details span{margin:0 12px}.cover-note{font-size:12px;letter-spacing:1px;margin-top:26px;color:#a09383}.schedule-heading{display:flex;justify-content:space-between;font-size:13px;margin-bottom:10px;color:#7e6245}.schedule{width:100%;border-collapse:collapse;table-layout:fixed;font-size:11.6px}.schedule th{background:#d3b888;color:#3f342a;font-size:10.5px;text-align:left;letter-spacing:.35px}.schedule td,.schedule th{border:1px solid #cbbfae;padding:9px 8px;vertical-align:top;line-height:1.43;overflow-wrap:anywhere}.schedule tr:nth-child(even) td{background:#faf8f5}.schedule td strong{display:block;color:#46372e}.schedule td small{display:block;color:#8f806f;font-size:9.5px;margin-top:5px}.schedule .c-time{width:13%}.schedule .c-duration{width:8%}.schedule .c-title{width:18%}.schedule .c-pic{width:14%}.schedule-note{font-size:10.5px;color:#948575;margin-top:11px}.vip-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px}.vip-grid article{border:1px solid #e2d7ca;background:#f9f7f3;min-height:90px;padding:15px;font-size:12.5px}.vip-grid h3{color:#8a6e4a;font-size:13px;margin:0 0 11px}.vip-grid article div{line-height:1.75;white-space:normal}@media screen{.paper-page{box-shadow:0 12px 36px #251d1e30}body{padding:12px}}@media print{body{background:white;padding:0}.paper-page{margin:0;box-shadow:none}.paper-page:last-child{page-break-after:auto}}`;
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Panduan Acara - ${escapeHtml(title)}</title><style>${styles}</style></head><body>${pages.join('')}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),350))<\/script></body></html>`;
}

export async function printRundownGuide(eventId:number){
  const popup=window.open('','_blank');
  if(!popup)throw new Error('Izinkan pop-up browser untuk mengekspor panduan sebagai PDF.');
  try{
    popup.document.write('<title>Memuat panduan Wedding-In...</title><p style="font-family:sans-serif;padding:24px">Menyiapkan PDF…</p>');
    const [eventResult,rundownResult,profileResult]=await Promise.all([
      api<any>(`/events/${eventId}`),api<any>(`/projects/${eventId}/rundown`),api<any>(`/projects/${eventId}/rundown-profile`)]);
    const profile=profileResult.profile;
    if(!profile)throw new Error('Lengkapi Data Pengantin & Panduan Acara dengan menyalin master terlebih dahulu.');
    popup.document.open();popup.document.write(renderRundownDocument(eventResult.event,profile.sections,rundownResult.items));popup.document.close();
  }catch(e){popup.close();throw e;}
}
