import {useState} from 'react';
import {Search} from 'lucide-react';
import {formatRp} from '../api';
import {useListView,Pagination} from './useListView';

type Entry=Record<string,any>;
export default function ReportList({title,items,field='balance'}:{title:string;items:Entry[];field?:string}){
  const [search,setSearch]=useState('');
  const view=useListView(items||[],search,['code','name'],'code','asc');
  return <section className="panel wi-report-list"><div className="panel-head"><h3>{title}</h3><span className="tiny-count">{items?.length||0} akun</span></div>
    {(items||[]).length>8&&<div className="wi-report-list-tools"><div className="searchbox"><Search size={15}/><input aria-label={`Cari akun ${title}`} value={search} onChange={e=>view.updateSearch(e.target.value,setSearch)} placeholder="Cari akun..."/></div>
      <button type="button" onClick={()=>view.sort('name')}>Nama {view.sortKey==='name'?(view.direction==='asc'?'↑':'↓'):''}</button>
      <button type="button" onClick={()=>view.sort(field)}>Saldo {view.sortKey===field?(view.direction==='asc'?'↑':'↓'):''}</button></div>}
    <div className="report-lines">{view.items.map((item,i)=><div key={item.code??i}><span><small>{item.code}</small>{item.name}</span><strong>{formatRp(item[field]??item.amount)}</strong></div>)}
      {!view.total&&<div className="empty-report">Belum ada akun sesuai pencarian.</div>}</div>
    <Pagination {...view} onPage={view.setPage}/></section>;
}
