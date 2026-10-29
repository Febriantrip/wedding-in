export type AnalyticsPeriod='7d'|'30d'|'90d'|'12m';
export type AnalyticsSegment='all'|'active'|'completed';

export type AnalyticsEvent={
  id:number;
  title:string;
  event_date:string;
  status:string;
  contract_amount?:number|string|null;
  estimated_cost?:number|string|null;
  total_tasks?:number|string|null;
  completed_tasks?:number|string|null;
};

export type AnalyticsSummary={
  totalContract:number;
  weddings:number;
  averageContract:number;
  marginPercent:number;
  taskPercent:number;
  totalTasks:number;
  doneTasks:number;
};

export type AnalyticsPoint={
  label:string;
  current:number;
  previous:number;
  count:number;
  average:number;
  margin:number;
  tasks:number;
};

const DAY=86400000;
const nonCancelled=(event:AnalyticsEvent)=>event.status!=='cancelled';
const active=(event:AnalyticsEvent)=>['planning','confirmed','in_progress'].includes(event.status);
const money=(value:unknown)=>Number(value)||0;
const iso=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const midnight=(date:Date)=>new Date(date.getFullYear(),date.getMonth(),date.getDate());
const dateOf=(value:string)=>new Date(`${String(value).slice(0,10)}T12:00:00`);
const inRange=(event:AnalyticsEvent,start:string,end:string)=>String(event.event_date).slice(0,10)>=start&&String(event.event_date).slice(0,10)<=end;
const selectSegment=(event:AnalyticsEvent,segment:AnalyticsSegment)=>segment==='all'||segment==='active'&&active(event)||segment==='completed'&&event.status==='completed';

function dates(period:AnalyticsPeriod,reference:Date){
  const today=midnight(reference);
  const start=period==='12m'?new Date(today.getFullYear(),today.getMonth()-11,1):
    new Date(today.getFullYear(),today.getMonth(),today.getDate()-(period==='7d'?6:period==='30d'?29:89));
  const previousEnd=new Date(start.getFullYear(),start.getMonth(),start.getDate()-1);
  const previousStart=period==='12m'?new Date(start.getFullYear(),start.getMonth()-12,1):
    new Date(previousEnd.getFullYear(),previousEnd.getMonth(),previousEnd.getDate()-(period==='7d'?6:period==='30d'?29:89));
  return {start,end:today,previousStart,previousEnd};
}

function summary(events:AnalyticsEvent[]):AnalyticsSummary{
  const totalContract=events.reduce((sum,event)=>sum+money(event.contract_amount),0);
  const estimatedCost=events.reduce((sum,event)=>sum+money(event.estimated_cost),0);
  const totalTasks=events.reduce((sum,event)=>sum+money(event.total_tasks),0);
  const doneTasks=events.reduce((sum,event)=>sum+money(event.completed_tasks),0);
  return {
    totalContract,weddings:events.length,averageContract:events.length?totalContract/events.length:0,
    marginPercent:totalContract?((totalContract-estimatedCost)/totalContract)*100:0,
    taskPercent:totalTasks?doneTasks/totalTasks*100:0,totalTasks,doneTasks
  };
}

export function getAnalytics(events:AnalyticsEvent[],period:AnalyticsPeriod,segment:AnalyticsSegment='all',reference=new Date()){
  const range=dates(period,reference);
  const candidates=events.filter(event=>nonCancelled(event)&&selectSegment(event,segment));
  const selected=candidates.filter(event=>inRange(event,iso(range.start),iso(range.end)));
  const previous=candidates.filter(event=>inRange(event,iso(range.previousStart),iso(range.previousEnd)));
  const count=period==='7d'?7:period==='30d'?10:period==='90d'?13:12;
  const buckets:{current:AnalyticsEvent[];previous:AnalyticsEvent[];label:string}[]=Array.from({length:count},(_,index)=>({
    current:[],previous:[],label:period==='12m'?new Date(range.start.getFullYear(),range.start.getMonth()+index,1).toLocaleDateString('id-ID',{month:'short'}):''
  }));
  function distribute(list:AnalyticsEvent[],start:Date,end:Date,key:'current'|'previous'){
    const startTime=dateOf(iso(start)).getTime();
    const duration=dateOf(iso(end)).getTime()-startTime+DAY;
    for(const event of list){
      const offset=dateOf(event.event_date).getTime()-startTime;
      let index=period==='12m'?((dateOf(event.event_date).getFullYear()-start.getFullYear())*12+dateOf(event.event_date).getMonth()-start.getMonth()):
        Math.floor(offset/duration*count);
      index=Math.max(0,Math.min(count-1,index));
      buckets[index][key].push(event);
    }
  }
  distribute(selected,range.start,range.end,'current');
  distribute(previous,range.previousStart,range.previousEnd,'previous');
  const totalDays=(dateOf(iso(range.end)).getTime()-dateOf(iso(range.start)).getTime())/DAY+1;
  const series:AnalyticsPoint[]=buckets.map((bucket,index)=>{
    const current=summary(bucket.current),prior=summary(bucket.previous);
    const offset=Math.floor(index*totalDays/count);
    const from=new Date(range.start.getFullYear(),range.start.getMonth(),range.start.getDate()+offset);
    return {label:bucket.label||from.toLocaleDateString('id-ID',{day:'numeric',month:'short'}),
      current:current.totalContract,previous:prior.totalContract,count:current.weddings,
      average:current.averageContract,margin:current.marginPercent,tasks:current.taskPercent};
  });
  return {current:summary(selected),previous:summary(previous),series,events:selected,range:{start:iso(range.start),end:iso(range.end)},
    active:selected.filter(active),completed:selected.filter(event=>event.status==='completed')};
}

export function changePercent(value:number,previous:number):number|null{
  if(previous===0)return value===0?0:null;
  return (value-previous)/Math.abs(previous)*100;
}
