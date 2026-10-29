export function isValidDateTime(value:string){
  const m=/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if(!m)return false;
  const [y,mo,d,h,mi,s]=m.slice(1).map(Number);
  if(y<2000||y>2100||h>23||mi>59||s>59)return false;
  const date=new Date(Date.UTC(y,mo-1,d,h,mi,s));
  return date.getUTCFullYear()===y&&date.getUTCMonth()===mo-1&&date.getUTCDate()===d&&
    date.getUTCHours()===h&&date.getUTCMinutes()===mi&&date.getUTCSeconds()===s;
}
export function dateTimeMillis(value:string){return new Date(value.replace(' ','T')+'Z').getTime();}
export function validWindow(start:string,end:string,maxHours=24){
  if(!isValidDateTime(start)||!isValidDateTime(end))return false;
  const duration=dateTimeMillis(end)-dateTimeMillis(start);
  return duration>0&&duration<=maxHours*60*60*1000;
}
export function wouldCycle(taskId:number,predecessor:number|null,links:Map<number,number|null>){
  let current=predecessor;const visited=new Set<number>([taskId]);
  while(current!==null){if(visited.has(current))return true;visited.add(current);current=links.get(current)??null;}
  return false;
}
export function shiftLocalDateTime(value:string,days:number){
  if(!isValidDateTime(value)||!Number.isInteger(days)||Math.abs(days)>365)return null;
  const shifted=new Date(dateTimeMillis(value)+days*86400000);
  return shifted.toISOString().slice(0,19).replace('T',' ');
}
