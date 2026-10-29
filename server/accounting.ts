import { rows, execSql, type DbConn } from './db.js';
export type JournalLineInput = { code: string; debit?: number; credit?: number; event_id?: number | null };
export type JournalInput = { date: string; description: string; reference_type: string; reference_id?: number | null;
  cash_flow: 'operating' | 'investing' | 'financing' | 'opening' | 'none'; user_id?: number | null; lines: JournalLineInput[] };
export function moneyCents(value: unknown): number {
  const input = String(value ?? '');
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(input)) throw new Error('Nominal tidak valid (maksimal 2 desimal).');
  const [integer, fraction = ''] = input.split('.');
  const cents = Number(integer) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) throw new Error('Nominal terlalu besar.'); return cents;
}
export function decimal(cents: number): string { return (cents / 100).toFixed(2); }
export function validateJournalLines(lines: JournalLineInput[]): number {
  if (lines.length < 2) throw new Error('Jurnal harus memiliki minimal 2 baris.');
  let debit = 0, credit = 0;
  for (const line of lines) { const d = moneyCents(line.debit ?? 0), c = moneyCents(line.credit ?? 0);
    if ((d > 0 && c > 0) || (d === 0 && c === 0)) throw new Error('Baris jurnal harus debit atau kredit.'); debit += d; credit += c;
  }
  if (debit !== credit || debit === 0) throw new Error('Jurnal tidak seimbang.');
  return debit;
}
export async function postJournal(conn: DbConn, input: JournalInput): Promise<number> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('Tanggal jurnal tidak valid.');
  validateJournalLines(input.lines);
  const codes = [...new Set(input.lines.map(x => x.code))];
  const accounts = await rows<{ id: number; code: string }>(`SELECT id,code FROM accounts WHERE active=1 AND code IN (${codes.map(() => '?').join(',')})`, codes, conn);
  const byCode = new Map(accounts.map(x => [x.code, x.id]));
  for (const code of codes) if (!byCode.has(code)) throw new Error(`Akun ${code} tidak ditemukan/aktif.`);
  const entry = await execSql('INSERT INTO journals (entry_date,description,reference_type,reference_id,cash_flow,created_by) VALUES (?,?,?,?,?,?)',
    [input.date,input.description,input.reference_type,input.reference_id ?? null,input.cash_flow,input.user_id ?? null],conn);
  for (const line of input.lines) await execSql('INSERT INTO journal_lines (journal_id,account_id,event_id,debit,credit) VALUES (?,?,?,?,?)',
    [entry.insertId,byCode.get(line.code)!,line.event_id ?? null,decimal(moneyCents(line.debit ?? 0)),decimal(moneyCents(line.credit ?? 0))],conn);
  return entry.insertId;
}
type AccountBalance = { code: string; name: string; type: string; balance: number };
const round = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
export async function balanceSheet(asOf: string) {
  const records = await rows<{ code:string;name:string;type:string;balance:string }>(`
    SELECT a.code,a.name,a.type,COALESCE(SUM(CASE WHEN j.entry_date<=? THEN l.debit-l.credit ELSE 0 END),0) balance
    FROM accounts a LEFT JOIN journal_lines l ON l.account_id=a.id LEFT JOIN journals j ON j.id=l.journal_id
    GROUP BY a.id,a.code,a.name,a.type ORDER BY a.code`, [asOf]);
  const all: AccountBalance[] = records.map(x=>({...x,balance:round(Number(x.balance)*(['liability','equity','revenue'].includes(x.type)?-1:1))}));
  const group=(type:string)=>all.filter(x=>x.type===type),sum=(items:AccountBalance[])=>round(items.reduce((n,x)=>n+x.balance,0));
  const assets=group('asset'),liabilities=group('liability'),equity=group('equity');
  const earnings=round(sum(group('revenue'))-sum(group('cogs'))-sum(group('expense')));
  return {as_of:asOf,assets,liabilities,equity:[...equity,{code:'3999',name:'Laba ditahan & berjalan',type:'equity',balance:earnings}],
    total_assets:sum(assets),total_liabilities:sum(liabilities),total_equity:round(sum(equity)+earnings),
    balanced:Math.abs(sum(assets)-sum(liabilities)-sum(equity)-earnings)<0.01};
}
export async function incomeStatement(from:string,to:string,eventId?:number) {
  const extra=eventId?'AND l.event_id=?':'';
  const records=await rows<{code:string;name:string;type:string;balance:string}>(`
    SELECT a.code,a.name,a.type,SUM(l.credit-l.debit) balance FROM journal_lines l
    JOIN journals j ON j.id=l.journal_id JOIN accounts a ON a.id=l.account_id
    WHERE j.entry_date BETWEEN ? AND ? AND a.type IN ('revenue','cogs','expense') ${extra}
    GROUP BY a.id,a.code,a.name,a.type ORDER BY a.code`,eventId?[from,to,eventId]:[from,to]);
  const types=['revenue','cogs','expense'] as const;
  const groups=Object.fromEntries(types.map(t=>[t,records.filter(x=>x.type===t).map(x=>({code:x.code,name:x.name,amount:round(Number(x.balance)*(t==='revenue'?1:-1))}))]));
  const total=(t:typeof types[number])=>round((groups[t] as {amount:number}[]).reduce((n,x)=>n+x.amount,0));
  const revenue=total('revenue'),cogs=total('cogs'),expense=total('expense');
  return {from,to,event_id:eventId??null,groups,revenue,cogs,gross_profit:round(revenue-cogs),operating_expense:expense,net_profit:round(revenue-cogs-expense)};
}
export async function cashFlow(from:string,to:string) {
  const [start]=await rows<{balance:string}>(`SELECT COALESCE(SUM(l.debit-l.credit),0) balance FROM journal_lines l
    JOIN accounts a ON a.id=l.account_id AND a.is_cash=1 JOIN journals j ON j.id=l.journal_id WHERE j.entry_date<?`,[from]);
  const movements=await rows<{category:string;amount:string}>(`SELECT j.cash_flow category,SUM(l.debit-l.credit) amount FROM journal_lines l
    JOIN accounts a ON a.id=l.account_id AND a.is_cash=1 JOIN journals j ON j.id=l.journal_id
    WHERE j.entry_date BETWEEN ? AND ? GROUP BY j.cash_flow`,[from,to]);
  const by=Object.fromEntries(['operating','investing','financing','opening','none'].map(key=>[key,round(Number(movements.find(x=>x.category===key)?.amount??0))]));
  const beginning_cash=Number(start?.balance??0),total=Object.values(by).reduce((n,x)=>n+x,0);
  return {from,to,beginning_cash:round(beginning_cash),movements:by,net_change:round(total),ending_cash:round(beginning_cash+total)};
}
export async function trialBalance(asOf:string) {
  const result=await rows<{code:string;name:string;debit:string;credit:string}>(`
    SELECT a.code,a.name,COALESCE(SUM(CASE WHEN j.entry_date<=? THEN l.debit ELSE 0 END),0) debit,
    COALESCE(SUM(CASE WHEN j.entry_date<=? THEN l.credit ELSE 0 END),0) credit
    FROM accounts a LEFT JOIN journal_lines l ON l.account_id=a.id LEFT JOIN journals j ON j.id=l.journal_id
    GROUP BY a.id,a.code,a.name ORDER BY a.code`,[asOf,asOf]);
  const accounts=result.map(x=>{const n=round(Number(x.debit)-Number(x.credit));return {code:x.code,name:x.name,debit:Math.max(0,n),credit:Math.max(0,-n)};});
  const debit=round(accounts.reduce((n,x)=>n+x.debit,0)),credit=round(accounts.reduce((n,x)=>n+x.credit,0));
  return {as_of:asOf,accounts,total_debit:debit,total_credit:credit,balanced:Math.abs(debit-credit)<0.01};
}
