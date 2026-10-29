import {useEffect,useState,type ChangeEvent} from 'react';
import {FileText,ImagePlus,Trash2,X,Save,LoaderCircle,Image as ImageIcon} from 'lucide-react';
import {api} from '../api';
import './checklist-documents.css';

type Photo={name:string;mime:'image/jpeg';data:string};
type Documents={mom:string;photos:Photo[]};
type Props={taskId:number;taskTitle:string;canEdit:boolean;onClose:()=>void};

function compressPhoto(file:File):Promise<Photo>{
  return new Promise((resolve,reject)=>{
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){reject(new Error('Gunakan foto JPG, PNG, atau WebP.'));return;}
    if(file.size>8*1024*1024){reject(new Error('File sumber maksimum 8 MB.'));return;}
    const img=new Image(),url=URL.createObjectURL(file);
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Foto tidak dapat dibaca.'));};
    img.onload=()=>{
      URL.revokeObjectURL(url);
      const scale=Math.min(1,1200/Math.max(img.width,img.height));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
      const ctx=canvas.getContext('2d');if(!ctx){reject(new Error('Browser tidak mendukung kompresi gambar.'));return;}
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const data=canvas.toDataURL('image/jpeg',.72);
      if(data.length>1_200_000){reject(new Error('Foto setelah dikompresi masih terlalu besar.'));return;}
      resolve({name:file.name.slice(0,140),mime:'image/jpeg',data});
    };
    img.src=url;
  });
}

export default function ChecklistDocuments({taskId,taskTitle,canEdit,onClose}:Props){
  const [doc,setDoc]=useState<Documents>({mom:'',photos:[]});
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  useEffect(()=>{
    let active=true;
    api<Documents>(`/tasks/${taskId}/documents`).then(data=>{if(active)setDoc(data);})
      .catch((e:Error)=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[taskId]);
  useEffect(()=>{
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};
    window.addEventListener('keydown',escape);
    return()=>window.removeEventListener('keydown',escape);
  },[onClose]);
  async function addFiles(e:ChangeEvent<HTMLInputElement>){
    const files=Array.from(e.target.files||[]);e.target.value='';if(!files.length)return;
    if(doc.photos.length+files.length>4){setError('Maksimum empat foto untuk satu checklist.');return;}
    setBusy(true);setError('');setSaved(false);
    try{const next=await Promise.all(files.map(compressPhoto));setDoc(x=>({...x,photos:[...x.photos,...next]}));}
    catch(err){setError((err as Error).message);}finally{setBusy(false);}
  }
  async function save(){
    setBusy(true);setError('');setSaved(false);
    try{await api(`/tasks/${taskId}/documents`,{method:'PUT',body:JSON.stringify(doc)});setSaved(true);}
    catch(err){const message=(err as Error).message;setError(message.includes('quota')?'Penyimpanan browser penuh. Kurangi jumlah foto.':message);}
    finally{setBusy(false);}
  }
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}>
    <section className="editor-modal cdoc-modal" role="dialog" aria-modal="true" aria-label={`MoM dan foto ${taskTitle}`}>
      <div className="modal-head"><div><span className="eyebrow">DOKUMENTASI CHECKLIST</span><h2><FileText size={20}/> MoM & Lampiran</h2><p>{taskTitle}</p></div>
        <button className="icon-button" aria-label="Tutup dokumentasi" disabled={busy} onClick={onClose}><X size={20}/></button></div>
      <div className="modal-content cdoc-content">{loading?<div className="cdoc-loading"><LoaderCircle size={19}/> Memuat dokumentasi...</div>:<>
        <label className="form-field"><span>Minutes of Meeting (MoM)</span><textarea rows={7} maxLength={20000} disabled={!canEdit||busy}
          placeholder="Tuliskan hasil rapat, keputusan, PIC, dan tindak lanjut..." value={doc.mom}
          onChange={e=>{setDoc(x=>({...x,mom:e.target.value}));setSaved(false);}}/></label>
        <div className="cdoc-photo-head"><div><strong>Foto dokumentasi</strong><small>{doc.photos.length}/4 foto terlampir</small></div>
          {canEdit&&<label className="cdoc-photo-add"><ImagePlus size={16}/> Tambah Foto<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addFiles} disabled={busy||doc.photos.length===4}/></label>}</div>
        <div className="cdoc-photos">{doc.photos.map((photo,index)=><div className="cdoc-photo" key={`${photo.name}-${index}`}>
          <img src={photo.data} alt={`Lampiran ${index+1}: ${photo.name}`}/><span title={photo.name}>{photo.name}</span>
          {canEdit&&<button type="button" aria-label={`Hapus foto ${photo.name}`} title="Hapus lampiran" disabled={busy}
            onClick={()=>{setDoc(x=>({...x,photos:x.photos.filter((_,i)=>i!==index)}));setSaved(false);}}><Trash2 size={15}/></button>}</div>)}
          {!doc.photos.length&&<div className="cdoc-photo-empty"><ImageIcon size={26}/><span>Belum ada foto yang dilampirkan</span></div>}</div>
      </>}
      {error&&<div className="inline-error" role="alert">{error}</div>}
      {saved&&<div className="cdoc-saved" role="status">MoM dan foto berhasil disimpan.</div>}</div>
      <div className="modal-footer"><button className="btn btn-ghost" type="button" disabled={busy} onClick={onClose}>Tutup</button>
        {canEdit&&<button type="button" className="submit-inline" disabled={busy||loading} onClick={save}><Save size={16}/>{busy?'Menyimpan...':'Simpan Dokumentasi'}</button>}</div>
    </section></div>;
}
