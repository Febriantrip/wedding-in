import {rows, type DbConn} from '../../db.js';
import {moneyCents} from '../../accounting.js';

export type Fulfillment='internal'|'managed_vendor'|'client_direct';
export type Context={service_id?:number;vendor_service_id?:number;event_type_id?:number|null;city?:string;guest_count:number;event_date:string;quantity?:string};
export type Priced={title:string;unit:string;fulfillment:Fulfillment;unit_sell:string;unit_cost:string;source_rule_id:number|null;service_id:number|null;vendor_service_id:number|null;source:string};
export const cents=(x:unknown)=>BigInt(moneyCents(x));
export function toMoney(value:bigint){const abs=value<0n?-value:value;return (value<0n?'-':'')+`${abs/100n}.${String(abs%100n).padStart(2,'0')}`;}
export function quantityMilli(value:unknown):bigint{
  const s=String(value??'');if(!/^(?:[1-9]\d{0,7}|0)(?:\.\d{1,3})?$/.test(s))throw new Error('Qty tidak valid (maksimal 3 desimal).');
  const [whole,frac='']=s.split('.'),n=BigInt(whole)*1000n+BigInt(frac.padEnd(3,'0'));
  if(n<=0n)throw new Error('Qty harus lebih dari nol.');return n;
}
export const multiply=(qty:bigint,amount:bigint)=>(qty*amount+500n)/1000n;
const maxDatabaseCents=999999999999999999n;
const dateKey=(value:unknown)=>value instanceof Date?value.toISOString().slice(0,10):String(value??'').slice(0,10);
const dateValid=(start:unknown,end:unknown,date:string)=>dateKey(start)<=date&&(!end||dateKey(end)>=date);
const span=(n:number,min:number|null,max:number|null)=>(min==null||n>=min)&&(max==null||n<=max);
export async function resolvePrice(ctx:Context,conn?:DbConn):Promise<Priced>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(ctx.event_date)||!Number.isSafeInteger(ctx.guest_count)||ctx.guest_count<0)
    throw new Error('Tanggal event atau jumlah tamu tidak valid.');
  let serviceId=ctx.service_id??null, vendorCost:string|null=null, title='',unit='event',fulfillment:Fulfillment='internal';
  if(ctx.vendor_service_id){
    const [v]=await rows<any>('SELECT vs.*,v.active vendor_active FROM vendor_services vs JOIN vendors v ON v.id=vs.vendor_id WHERE vs.id=? AND vs.active=1',[ctx.vendor_service_id],conn);
    if(!v||!v.vendor_active)throw new Error('Jasa vendor tidak aktif.');
    title=v.title;unit=v.unit;serviceId=serviceId??v.service_id;fulfillment='managed_vendor';
    const rates=await rows<any>('SELECT * FROM vendor_service_rates WHERE vendor_service_id=? AND active=1 ORDER BY effective_from DESC,id ASC',[v.id],conn);
    const match=rates.find(r=>dateValid(r.effective_from,r.effective_to,ctx.event_date)&&
      (!r.city||r.city.toLocaleLowerCase('id-ID')===(ctx.city||'').toLocaleLowerCase('id-ID'))&&
      span(Number(ctx.quantity??'1'),Number(r.min_qty),r.max_qty==null?null:Number(r.max_qty)));
    if(rates.length&&!match)throw new Error('Tarif vendor tidak berlaku untuk event ini.');
    vendorCost=match?.cost_unit??null;
  }
  let cost:string|null=null,sell:string|null=null,sourceRule:number|null=null;
  if(serviceId){
    const [s]=await rows<any>('SELECT * FROM services WHERE id=? AND active=1',[serviceId],conn);
    if(!s)throw new Error('Master layanan tidak ditemukan.');
    title=title||s.name;unit=ctx.vendor_service_id?unit:s.unit;
    if(!ctx.vendor_service_id)fulfillment=s.default_fulfillment;
    cost=s.default_cost;sell=s.default_sell;
    const day=new Date(`${ctx.event_date}T12:00:00Z`).getUTCDay(),weekend=(day===0||day===6)?'weekend':'weekday';
    const rules=await rows<any>('SELECT * FROM service_price_rules WHERE service_id=? AND active=1',[serviceId],conn);
    const validRules=rules.filter(r=>dateValid(r.valid_from,r.valid_to,ctx.event_date)&&
      (r.event_type_id==null||Number(r.event_type_id)===Number(ctx.event_type_id))&&
      (!r.city||r.city.toLocaleLowerCase('id-ID')===(ctx.city||'').toLocaleLowerCase('id-ID'))&&
      span(ctx.guest_count,r.min_guests,r.max_guests)&&(!r.day_type||r.day_type===weekend));
    const specificity=(r:any)=>[r.event_type_id,r.city,r.min_guests,r.max_guests,r.day_type].filter(x=>x!==null&&x!==undefined&&x!=='').length;
    validRules.sort((a,b)=>specificity(b)-specificity(a)||b.priority-a.priority||
      dateKey(b.valid_from).localeCompare(dateKey(a.valid_from))||a.id-b.id);
    if(validRules.length){
      const a=validRules[0],b=validRules[1];
      if(b&&specificity(a)===specificity(b)&&a.priority===b.priority&&dateKey(a.valid_from)===dateKey(b.valid_from)&&
        (String(a.cost_unit)!==String(b.cost_unit)||String(a.sell_unit)!==String(b.sell_unit)))
        throw new Error('Ada konflik aturan harga master. Periksa tarif.');
      cost=a.cost_unit;sell=a.sell_unit;sourceRule=a.id;
    }
  }
  cost=vendorCost??cost;
  sell=fulfillment==='client_direct'?(vendorCost??sell):(sell??vendorCost);
  if(!title||cost==null||sell==null)throw new Error('Harga master belum lengkap.');
  return {title,unit,fulfillment,unit_sell:toMoney(cents(sell)),unit_cost:toMoney(cents(cost)),
    source_rule_id:sourceRule,service_id:serviceId,vendor_service_id:ctx.vendor_service_id??null,
    source:sourceRule?'price_rule':vendorCost?'vendor_rate':'default'};
}
export type DraftLine={service_id?:number;vendor_service_id?:number;quantity:string;fulfillment?:Fulfillment;
  unit_sell_override?:string;unit_cost_override?:string;discount_amount?:string;override_reason?:string};
export type CalculatedLine={fulfillment:Fulfillment;sell_net:string;cost_total:string;discount_amount:string};
export function aggregateQuote(lines:CalculatedLine[]){
  let managed=0n,direct=0n,costSum=0n,discountSum=0n;
  for(const line of lines){
    if(line.fulfillment==='client_direct')direct+=cents(line.sell_net);
    else{managed+=cents(line.sell_net);costSum+=cents(line.cost_total);}
    discountSum+=cents(line.discount_amount);
  }
  return {subtotal_managed:toMoney(managed),subtotal_direct:toMoney(direct),
    discount_total:toMoney(discountSum),contract_total:toMoney(managed),client_budget_total:toMoney(managed+direct),
    cost_est_total:toMoney(costSum),gross_profit_est:toMoney(managed-costSum),
    margin_pct:managed?Number((managed-costSum)*10000n/managed)/100:null};
}
export async function priceLines(items:DraftLine[],ctx:Omit<Context,'service_id'|'vendor_service_id'|'quantity'>,
  canOverrideCost:boolean,conn?:DbConn){
  if(!items.length||items.length>100)throw new Error('Quotation perlu 1 sampai 100 item.');
  const lines=[];
  for(const [index,item] of items.entries()){
    const qty=quantityMilli(item.quantity),p=await resolvePrice({...ctx,service_id:item.service_id,
      vendor_service_id:item.vendor_service_id,quantity:item.quantity},conn);
    const fulfill=item.fulfillment??p.fulfillment;
    if(fulfill==='internal'&&item.vendor_service_id)throw new Error('Jasa vendor tidak boleh ditandai internal.');
    if(!item.vendor_service_id&&fulfill!==p.fulfillment&&!canOverrideCost)
      throw new Error('Perubahan skema layanan internal membutuhkan persetujuan owner/admin.');
    const sell=item.unit_sell_override==null?p.unit_sell:toMoney(cents(item.unit_sell_override));
    const cost=item.unit_cost_override==null?p.unit_cost:toMoney(cents(item.unit_cost_override));
    const changed=sell!==p.unit_sell||cost!==p.unit_cost;
    if(changed&&(!item.override_reason||item.override_reason.trim().length<8))throw new Error('Alasan perubahan harga wajib minimal 8 karakter.');
    if(cost!==p.unit_cost&&!canOverrideCost)throw new Error('Perubahan modal memerlukan otorisasi finance.');
    const gross=multiply(qty,cents(sell)),discount=cents(item.discount_amount??'0');
    if(discount>gross)throw new Error('Diskon tidak boleh melebihi harga item.');
    const net=gross-discount,expense=fulfill==='client_direct'?0n:multiply(qty,cents(cost));
    if(gross>maxDatabaseCents||expense>maxDatabaseCents)
      throw new Error('Nilai item melampaui batas nominal yang dapat disimpan.');
    lines.push({line_no:index+1,service_id:p.service_id,vendor_service_id:p.vendor_service_id,
      title_snapshot:p.title,unit_snapshot:p.unit,fulfillment:fulfill,quantity:item.quantity,
      unit_sell:sell,unit_cost:cost,discount_amount:toMoney(discount),sell_net:toMoney(net),
      cost_total:toMoney(expense),price_rule_id:p.source_rule_id,overridden:changed,
      override_reason:item.override_reason?.trim()||null,original_sell:p.unit_sell,original_cost:p.unit_cost});
  }
  return {lines,totals:aggregateQuote(lines)};
}
