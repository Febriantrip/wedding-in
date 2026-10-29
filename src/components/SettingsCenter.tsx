import {useEffect,useState,type FormEvent} from 'react';
import {Settings2,Landmark,UsersRound,Search,Plus,Pencil,ShieldCheck,KeyRound,Fingerprint} from 'lucide-react';
import {api,post,patch,type User} from '../api';
import {useListView,SortHeading,Pagination} from './useListView';
import PasskeyManager from './PasskeyManager';

type RecordItem=Record<string,any>;
const roles=['owner','admin','finance','planner','sales'];
const accountTypes=[['asset','Aset'],['liability','Liabilitas'],['equity','Ekuitas'],['revenue','Pendapatan'],['cogs','HPP'],['expense','Beban']];
const blankAccount={code:'',name:'',type:'asset',is_cash:false,active:true};
const blankUser={name:'',email:'',role:'planner',password:'',active:true};

export default function SettingsCenter({user}:{user:User}){
  const allowed=['owner','admin'].includes(user.role);
  const [tab,setTab]=useState<'accounts'|'users'|'security'>('accounts');
  const [accounts,setAccounts]=useState<RecordItem[]>([]),[users,setUsers]=useState<RecordItem[]>([]);
  const [search,setSearch]=useState(''),[form,setForm]=useState<RecordItem|null>(null),[editId,setEditId]=useState<number|null>(null);
  const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const data=tab==='accounts'?accounts:users;
  const view=useListView(data,search,tab==='accounts'?['code','name','type']:['name','email','role'],'id','desc');
  const load=async()=>{try{
    const [a,u]=await Promise.all([api<{data:RecordItem[]}>('/settings/accounts'),
      allowed?api<{data:RecordItem[]}>('/settings/users'):Promise.resolve({data:[]})]);
    setAccounts(a.data);setUsers(u.data);
  }catch(err){setError((err as Error).message);}};
  useEffect(()=>{void load();},[allowed]);
  const changeTab=(next:typeof tab)=>{setTab(next);setForm(null);setEditId(null);setSearch('');setError('');setMessage('');};
  const open=(record?:RecordItem)=>{setEditId(record?.id??null);setForm(record?{...record,password:''}:
    {...(tab==='accounts'?blankAccount:blankUser)});setError('');setMessage('');};
  async function save(e:FormEvent){
    e.preventDefault();if(!form)return;setBusy(true);setError('');setMessage('');
    try{
      const payload={...form};delete payload.id;delete payload.created_at;
      if(tab==='users'&&!payload.password)delete payload.password;
      const resource=tab==='accounts'?'accounts':'users';
      if(editId)await patch(`/settings/${resource}/${editId}`,payload);
      else await post(`/settings/${resource}`,payload);
      setMessage('Perubahan berhasil disimpan.');setForm(null);setEditId(null);await load();
    }catch(err){setError((err as Error).message);}finally{setBusy(false);}
  }
  async function toggle(record:RecordItem){
    const next=!Boolean(record.active);if(!window.confirm(`${next?'Aktifkan kembali':'Nonaktifkan'} ${record.name}?`))return;
    setBusy(true);setError('');setMessage('');
    try{await patch(`/settings/${tab}/${record.id}`,{active:next});await load();setMessage(next?'Data diaktifkan.':'Data dinonaktifkan dan tetap tersimpan.');}
    catch(err){setError((err as Error).message);}finally{setBusy(false);}
  }
  return <div className="wi-settings page-stack">
    <div className="wi-settings-header"><div className="wi-settings-icon"><Settings2 size={24}/></div><div><h2>Workspace Settings</h2><p>Master akun keuangan, akses pengguna, dan keamanan login.</p></div></div>
    <div className="wi-settings-tabs" role="tablist" aria-label="Pengaturan sistem">
      <button role="tab" aria-selected={tab==='accounts'} className={tab==='accounts'?'active':''} onClick={()=>changeTab('accounts')}><Landmark size={16}/> Master Akun</button>
      {allowed&&<button role="tab" aria-selected={tab==='users'} className={tab==='users'?'active':''} onClick={()=>changeTab('users')}><UsersRound size={16}/> Setting User</button>}
      <button role="tab" aria-selected={tab==='security'} className={tab==='security'?'active':''} onClick={()=>changeTab('security')}><Fingerprint size={16}/> Biometrik & Passkey</button>
    </div>
    {message&&<p className="wi-settings-message" role="status">{message}</p>}
    {error&&<p className="wi-settings-error" role="alert">{error}</p>}
    {tab==='security'?<PasskeyManager user={user}/>:
    <>
      <div className="section-toolbar"><div className="searchbox"><Search size={17}/><input aria-label="Cari master" value={search} onChange={e=>view.updateSearch(e.target.value,setSearch)} placeholder={tab==='accounts'?'Cari kode, nama, atau jenis akun...':'Cari nama, email, atau role...'}/></div>
        {allowed&&<button className="btn btn-primary" type="button" onClick={()=>open()}><Plus size={15}/>{tab==='accounts'?'Tambah Akun':'Tambah Pengguna'}</button>}</div>
      <section className="panel table-panel"><div className="table-scroll"><table><thead><tr>
        {tab==='accounts'?<><SortHeading label="Kode" column="code" {...view} onSort={view.sort}/><SortHeading label="Nama Akun" column="name" {...view} onSort={view.sort}/><SortHeading label="Kategori" column="type" {...view} onSort={view.sort}/><th>Kas / Bank</th></>:
        <><SortHeading label="Nama User" column="name" {...view} onSort={view.sort}/><SortHeading label="Email" column="email" {...view} onSort={view.sort}/><SortHeading label="Role" column="role" {...view} onSort={view.sort}/><th>Terdaftar</th></>}
        <SortHeading label="Status" column="active" {...view} onSort={view.sort}/><th>Aksi</th></tr></thead><tbody>
        {view.items.map(entry=><tr key={entry.id}>
          {tab==='accounts'?<><td className="reference">{entry.code}</td><td className="table-primary">{entry.name}</td><td>{accountTypes.find(([key])=>key===entry.type)?.[1]||entry.type}</td><td>{entry.is_cash?'Ya':'—'}</td></>:
            <><td className="table-primary">{entry.name}</td><td>{entry.email}</td><td>{entry.role}</td><td>{String(entry.created_at||'').slice(0,10)||'—'}</td></>}
          <td><span className={`badge ${entry.active?'badge-green':'badge-rose'}`}>{entry.active?'Aktif':'Nonaktif'}</span></td>
          <td>{allowed&&<div className="wi-settings-actions"><button type="button" title="Edit" onClick={()=>open(entry)}><Pencil size={15}/> Edit</button>
            <button type="button" disabled={busy||(tab==='users'&&entry.id===user.id)} onClick={()=>toggle(entry)}>{entry.active?'Nonaktifkan':'Aktifkan'}</button></div>}</td></tr>)}
        </tbody></table></div><Pagination {...view} onPage={view.setPage}/></section>
      <p className="wi-settings-note"><ShieldCheck size={15}/> Data terkait jurnal dan pengguna nonaktif tetap tercatat untuk keperluan audit.</p>
      {form&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setForm(null);}}>
        <section className="editor-modal wi-settings-dialog" role="dialog" aria-modal="true" aria-label={editId?'Edit data':'Tambah data'}>
          <div className="modal-head"><div><span className="eyebrow">MASTER DATA</span><h2>{editId?'Edit':'Tambah'} {tab==='accounts'?'Akun Keuangan':'Pengguna'}</h2></div><button type="button" className="icon-button" onClick={()=>setForm(null)}>✕</button></div>
          <form onSubmit={save}><div className="modal-content"><div className="form-grid">
            {(tab==='accounts'?[
              {key:'code',label:'Kode Akun',type:'text'}, {key:'name',label:'Nama Akun',type:'text'}]:
              [{key:'name',label:'Nama Lengkap',type:'text'},{key:'email',label:'Alamat Email',type:'email'},
              {key:'password',label:editId?'Password Baru (opsional)':'Password (min. 10 karakter)',type:'password'}])
              .map(field=><label className="form-field" key={field.key}><span>{field.label}</span><input type={field.type} required={field.key!=='password'||!editId} minLength={field.key==='password'?10:undefined}
                value={String(form[field.key]??'')} onChange={e=>setForm(old=>({...old,[field.key]:e.target.value}))}/></label>)}
            {tab==='accounts'?<><label className="form-field"><span>Kategori Akun</span><select value={form.type} onChange={e=>setForm(old=>({...old,type:e.target.value}))}>{accountTypes.map(([key,title])=><option key={key} value={key}>{title}</option>)}</select></label>
              <label className="wi-settings-checkbox"><input type="checkbox" checked={Boolean(form.is_cash)} onChange={e=>setForm(old=>({...old,is_cash:e.target.checked}))}/> Termasuk kas / bank</label></>:
              <label className="form-field"><span>Hak Akses</span><select value={form.role} onChange={e=>setForm(old=>({...old,role:e.target.value}))}>{roles.filter(role=>role!=='owner'||user.role==='owner').map(role=><option key={role} value={role}>{role}</option>)}</select></label>}
          </div>{error&&<p className="wi-settings-error">{error}</p>}</div>
          <div className="modal-footer"><button type="button" className="btn btn-ghost" onClick={()=>setForm(null)}>Batal</button><button className="submit-inline" type="submit" disabled={busy}>{busy?'Menyimpan...':'Simpan Perubahan'}</button></div></form>
        </section></div>}
    </>}</div>;
}
