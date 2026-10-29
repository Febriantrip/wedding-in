import {decimal,moneyCents} from '../../accounting.js';
import {quantityMilli} from '../commercial/pricing.js';

export type ChangeLine={
  title:string;
  action:'add'|'remove';
  fulfillment:'internal'|'managed_vendor'|'client_direct';
  quantity:string;
  unit_sell:string;
  unit_cost:string;
};

export type CalculatedLine=ChangeLine&{delta_sell:string;delta_cost:string};

export function signedMoney(cents:number):string{
  if(!Number.isSafeInteger(cents))throw new Error('Nilai perubahan terlalu besar.');
  return `${cents<0?'-':''}${decimal(Math.abs(cents))}`;
}

function extendedCents(quantity:string,unitAmount:string):number{
  const milli=quantityMilli(quantity),unit=moneyCents(unitAmount);
  const result=(BigInt(milli)*BigInt(unit)+500n)/1000n;
  if(result>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Nilai perubahan terlalu besar.');
  return Number(result);
}

export function calculateChange(lines:ChangeLine[]){
  if(!lines.length||lines.length>30)throw new Error('Perubahan harus terdiri dari 1-30 layanan.');
  let contract=0,direct=0,cost=0;
  const calculated:CalculatedLine[]=lines.map(line=>{
    if(!line.title.trim()||line.title.trim().length>200)throw new Error('Nama layanan harus diisi (maksimal 200 karakter).');
    if(!['add','remove'].includes(line.action))throw new Error('Aksi perubahan tidak valid.');
    if(!['internal','managed_vendor','client_direct'].includes(line.fulfillment))throw new Error('Kategori pemenuhan tidak valid.');
    const sign=line.action==='remove'?-1:1;
    const sell=sign*extendedCents(line.quantity,line.unit_sell);
    const costLine=line.fulfillment==='client_direct'?0:sign*extendedCents(line.quantity,line.unit_cost);
    if(line.fulfillment==='client_direct')direct+=sell;
    else {contract+=sell;cost+=costLine;}
    return {...line,delta_sell:signedMoney(sell),delta_cost:signedMoney(costLine)};
  });
  if(![contract,direct,cost].every(Number.isSafeInteger))throw new Error('Total perubahan terlalu besar.');
  return {lines:calculated,delta_contract:signedMoney(contract),delta_direct:signedMoney(direct),delta_cost:signedMoney(cost)};
}

export function applyApprovedChange(current:{contract:string;cost:string;direct:string},change:{delta_contract:string;delta_cost:string;delta_direct:string}){
  const before=[current.contract,current.cost,current.direct].map(moneyCents);
  const sign=(value:string)=>value.startsWith('-')?-moneyCents(value.slice(1)):moneyCents(value);
  const result=[sign(change.delta_contract)+before[0],sign(change.delta_cost)+before[1],sign(change.delta_direct)+before[2]];
  if(result.some(v=>v<0||!Number.isSafeInteger(v)))throw new Error('Perubahan menghasilkan nilai kontrak/anggaran negatif atau terlalu besar.');
  return {contract:decimal(result[0]),cost:decimal(result[1]),direct:decimal(result[2])};
}
