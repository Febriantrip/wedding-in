export type ClosingCounts={openTasks:number;pendingChanges:number;pendingExpenses:number;reversedExpenses:number;pendingBackoffice:number;
  unissuedTerms:number;invoiceGap:number;invoiceOutstanding:number;billOutstanding:number;unbilledVendors:number;
  unfinishedRundown?:number;openIncidents?:number};

export function closingBlockers(counts:ClosingCounts):string[]{
  const issues:string[]=[];
  if(counts.openTasks>0)issues.push(`${counts.openTasks} checklist/milestone belum selesai.`);
  if((counts.unfinishedRundown??0)>0)issues.push(`${counts.unfinishedRundown} kegiatan rundown belum selesai/dibatalkan.`);
  if((counts.openIncidents??0)>0)issues.push(`${counts.openIncidents} kendala lapangan belum diselesaikan.`);
  if(counts.pendingChanges>0)issues.push(`${counts.pendingChanges} Change Order masih menunggu keputusan.`);
  if(counts.pendingExpenses>0)issues.push(`${counts.pendingExpenses} pengajuan pengeluaran masih menunggu penyelesaian.`);
  if(counts.reversedExpenses>0)issues.push(`${counts.reversedExpenses} pengajuan terhubung ke transaksi yang telah dibalik.`);
  if(counts.pendingBackoffice>0)issues.push(`${counts.pendingBackoffice} transaksi Backoffice masih draft atau menunggu posting.`);
  if(counts.unissuedTerms>0)issues.push(`${counts.unissuedTerms} termin belum diterbitkan atau invoice-nya dibatalkan.`);
  if(counts.invoiceGap>0)issues.push('Total invoice aktif belum mencakup nilai kontrak WO.');
  if(counts.invoiceOutstanding>0)issues.push('Masih ada piutang invoice klien yang belum lunas.');
  if(counts.billOutstanding>0)issues.push('Masih ada tagihan vendor/biaya yang belum lunas.');
  if(counts.unbilledVendors>0)issues.push(`${counts.unbilledVendors} vendor terkonfirmasi belum tertagih penuh sesuai harga booking.`);
  return issues;
}
