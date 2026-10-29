export function shiftLocalDateTime(input:string,days:number):string|null{
  const text=input.slice(0,19).replace(' ','T');
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)||!Number.isInteger(days)||Math.abs(days)>365)return null;
  const date=new Date(`${text.length===16?text+':00':text}Z`);
  if(!Number.isFinite(date.getTime()))return null;
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,19).replace('T',' ');
}
