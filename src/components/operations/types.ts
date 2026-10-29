export type Row=Record<string,any>;
export type OpsSection='timeline'|'guide'|'rundown'|'team'|'monitor'|'vendor-payments'|'expenses'|'closing';
export type OpsProps={
  eventId:number;data:any;locked:boolean;canFinance:boolean;canEdit:boolean;canApprove:boolean;
  reload:()=>Promise<void>;notice:(message:string,error?:boolean)=>void;
  onCreate:(kind:string,context?:Row)=>void;
  onTimelineCommit?:()=>void|Promise<void>;
};
