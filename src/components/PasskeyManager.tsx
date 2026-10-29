import {useEffect,useState} from 'react';
import {Fingerprint,ShieldCheck,KeyRound,Trash2} from 'lucide-react';
import {startRegistration,WebAuthnError} from '@simplewebauthn/browser';
import {api,isDemo,post,type User} from '../api';

type KeyRow={id:number;label:string;created_at:string;last_used_at:string|null};
export default function PasskeyManager({user}:{user:User}){
  const [keys,setKeys]=useState<KeyRow[]>([]),[label,setLabel]=useState('Perangkat utama'),[password,setPassword]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const demo=isDemo(),supported=typeof window!=='undefined'&&Boolean(window.PublicKeyCredential)&&window.isSecureContext;
  const load=async()=>{if(demo)return;try{const result=await api<{data:KeyRow[]}>('/passkeys');setKeys(result.data);}catch(err){setError((err as Error).message);}};
  useEffect(()=>{void load();},[]);
  async function register(){
    setBusy(true);setError('');setMessage('');
    try{
      if(!password)throw new Error('Isi password akun untuk mengaktifkan biometrik.');
      const options=await post('/passkeys/register-options',{password});
      const response=await startRegistration({optionsJSON:options});
      await post(`/passkeys/register-verify?label=${encodeURIComponent(label.trim()||'Passkey')}`,response);
      setPassword('');setMessage('Passkey berhasil didaftarkan. Login berikutnya bisa memakai sidik jari, wajah, atau kunci perangkat.');
      await load();
    }catch(err){setError(err instanceof WebAuthnError?err.message:(err as Error).message);}
    finally{setBusy(false);}
  }
  async function remove(id:number){
    if(!window.confirm('Hapus passkey perangkat ini? Anda tetap bisa masuk dengan email dan password.'))return;
    setBusy(true);setError('');
    try{await api(`/passkeys/${id}`,{method:'DELETE'});setMessage('Passkey dihapus.');await load();}
    catch(err){setError((err as Error).message);}finally{setBusy(false);}
  }
  return <div className="wi-passkey-center">
    <div className="wi-passkey-heading"><div><Fingerprint size={25}/></div><section><h3>Masuk lebih cepat dengan biometrik</h3>
      <p>Gunakan sidik jari, Face ID, Windows Hello, atau passkey perangkat. Data biometrik tidak disimpan Wedding-In.</p></section></div>
    <div className="wi-passkey-notice"><ShieldCheck size={19}/><span>Passkey hanya berfungsi pada <strong>HTTPS</strong> atau <strong>localhost</strong>, dengan server API dan MySQL aktif. Password tetap tersedia sebagai metode pemulihan.</span></div>
    {(demo||!supported)&&<div className="wi-settings-error">{demo?'Pendaftaran passkey tidak tersedia di mode demo. Masuk memakai akun MySQL untuk mengaktifkannya.':'Browser atau origin ini belum mendukung WebAuthn. Gunakan HTTPS/localhost dengan browser dan perangkat kompatibel.'}</div>}
    {!demo&&supported&&<div className="wi-passkey-form"><label>Nama perangkat<input value={label} maxLength={100} onChange={e=>setLabel(e.target.value)} placeholder="Laptop kantor / HP pribadi"/></label>
      <label>Konfirmasi password akun<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Masukkan password Anda"/></label>
      <button type="button" className="submit-inline" disabled={busy} onClick={register}><Fingerprint size={17}/>{busy?'Memverifikasi...':'Daftarkan sidik jari / Face ID'}</button></div>}
    {error&&<p role="alert" className="wi-settings-error">{error}</p>}
    {message&&<p role="status" className="wi-settings-message">{message}</p>}
    <h3 className="wi-passkey-list-title">Perangkat terdaftar · {keys.length}</h3>
    {keys.map(key=><div className="wi-passkey-row" key={key.id}><KeyRound size={18}/><div><strong>{key.label}</strong><small>Terdaftar {String(key.created_at).slice(0,10)}{key.last_used_at?` · Digunakan ${String(key.last_used_at).slice(0,10)}`:''}</small></div>
      <button type="button" title="Hapus passkey" disabled={busy} onClick={()=>remove(key.id)}><Trash2 size={17}/></button></div>)}
    {!keys.length&&<p className="wi-settings-note">Belum ada passkey tersimpan untuk {user.email}.</p>}
  </div>;
}
