import { demoRequest } from './demo';
export type User={id:number;name:string;email:string;role:string};
export const formatRp=(value:unknown)=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(value)||0);
export const compactRp=(value:unknown, maximumFractionDigits=1)=>{
  const n=Number(value)||0;
  const digits=Math.min(2,Math.max(0,maximumFractionDigits));
  if(Math.abs(n)>=1e9)return `Rp ${(n/1e9).toLocaleString('id-ID',{maximumFractionDigits:digits})} M`;
  if(Math.abs(n)>=1e6)return `Rp ${(n/1e6).toLocaleString('id-ID',{maximumFractionDigits:digits})} jt`;
  return formatRp(n);
};
export const humanDate=(value:unknown)=>{
  if(!value)return '—';const text=String(value).slice(0,10);
  return new Date(`${text}T12:00:00`).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});
};
export const isoToday=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export const isDemo=()=>sessionStorage.getItem('weddingin_demo')==='yes'||sessionStorage.getItem('aurelia_demo')==='yes';
export function setDemo(flag:boolean){if(flag)sessionStorage.setItem('weddingin_demo','yes');else {sessionStorage.removeItem('weddingin_demo');sessionStorage.removeItem('aurelia_demo');}}
export async function api<T=any>(path:string,options:RequestInit={}):Promise<T>{
  if(isDemo())return demoRequest(path,options) as Promise<T>;
  let response:Response;
  try{response=await fetch(`/api${path}`,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})},credentials:'include'});}
  catch{throw new Error('Tidak bisa terhubung ke API. Pastikan server backend berjalan.');}
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.message||`Permintaan gagal (${response.status})`);
  return result as T;
}
export const post=(path:string,body:unknown)=>api(path,{method:'POST',body:JSON.stringify(body)});
export const patch=(path:string,body:unknown)=>api(path,{method:'PATCH',body:JSON.stringify(body)});
