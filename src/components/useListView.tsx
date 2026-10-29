import {useMemo, useState, type ReactNode} from 'react';
import {ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown} from 'lucide-react';

export const PAGE_SIZE = 15;

type Item = Record<string, unknown>;

function compareValues(a:unknown,b:unknown){
  const left=String(a??'').trim(),right=String(b??'').trim();
  if(left!==''&&right!==''&&Number.isFinite(Number(left))&&Number.isFinite(Number(right)))return Number(left)-Number(right);
  return left.localeCompare(right,'id-ID',{numeric:true,sensitivity:'base'});
}

export function useListView<T extends Item>(data:T[],search:string,searchFields:(keyof T)[],initialKey:string,initialDirection:'asc'|'desc'='desc'){
  const [sortKey,setSortKey]=useState(initialKey),[direction,setDirection]=useState<'asc'|'desc'>(initialDirection),[page,setPage]=useState(1);
  const filtered=useMemo(()=>{
    const needle=search.trim().toLocaleLowerCase('id-ID');
    return data.filter(item=>!needle||searchFields.some(field=>String(item[field]??'').toLocaleLowerCase('id-ID').includes(needle)))
      .sort((a,b)=>compareValues(a[sortKey],b[sortKey])*(direction==='asc'?1:-1));
  },[data,search,searchFields.join('|'),sortKey,direction]);
  const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const current=Math.min(page,pages);
  const items=filtered.slice((current-1)*PAGE_SIZE,current*PAGE_SIZE);
  const sort=(key:string)=>{setDirection(old=>key===sortKey?(old==='asc'?'desc':'asc'):'asc');setSortKey(key);setPage(1);};
  const updateSearch=(value:string,update:(value:string)=>void)=>{setPage(1);update(value);};
  return {items,total:filtered.length,pages,page:current,setPage,sort,sortKey,direction,updateSearch};
}

export function SortHeading({column,label,sortKey,direction,onSort}:{column:string;label:string;sortKey:string;direction:'asc'|'desc';onSort:(key:string)=>void}){
  const active=sortKey===column;
  return <th aria-sort={active?(direction==='asc'?'ascending':'descending'):'none'}><button type="button" className={`wi-sort-header ${active?'active':''}`} onClick={()=>onSort(column)}>{label}{active?<ChevronDown size={13} className={direction==='asc'?'up':''}/>:<ChevronsUpDown size={13}/>}</button></th>;
}

export function Pagination({page,pages,total,onPage}: {page:number;pages:number;total:number;onPage:(page:number)=>void}){
  if(total<=PAGE_SIZE)return null;
  return <div className="wi-pagination"><span>{(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE,total)} dari {total} data</span><div>
    <button type="button" aria-label="Halaman sebelumnya" disabled={page<=1} onClick={()=>onPage(page-1)}><ChevronLeft size={17}/></button>
    <span>Halaman <strong>{page}</strong> / {pages}</span>
    <button type="button" aria-label="Halaman berikutnya" disabled={page>=pages} onClick={()=>onPage(page+1)}><ChevronRight size={17}/></button>
  </div></div>;
}
