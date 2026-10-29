export type ProjectRow=Record<string,any>;

export type ProjectTotals={
  contract_amount:string;estimated_cost:string;direct_budget:string;client_budget:string;
  estimated_profit:string;invoice_total:string;invoice_paid:string;invoice_balance:string;
  bill_total:string;bill_paid:string;bill_balance:string;vendor_committed:string;
  actual_cost:string;recognized_revenue:string;recognized_profit:string;
};

export type ProjectControlData={
  project:ProjectRow;vendors:ProjectRow[];terms:ProjectRow[];changes:ProjectRow[];
  budget_lines:ProjectRow[];contract_revisions:ProjectRow[];audits:ProjectRow[];
  invoices:ProjectRow[];bills:ProjectRow[];totals:ProjectTotals|null;
};

export type SectionProps={
  eventId:number;data:ProjectControlData;canFinance:boolean;canEdit:boolean;canApprove:boolean;
  locked:boolean;reload:()=>Promise<void>;notice:(message:string,error?:boolean)=>void;
  onCreate:(type:string,context?:ProjectRow)=>void;
};

export const amount=(value:unknown)=>Number(value)||0;
export const digits=(value:unknown)=>Number(value||0).toFixed(2);
