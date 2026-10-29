import assert from 'node:assert/strict';
import {test} from 'node:test';
import {compactRp} from '../src/api';
import {daysUntilCalendarDate,isValidReportPeriod} from '../src/date-periods';

test('countdown uses calendar dates rather than fractional hours',()=>{
  assert.equal(daysUntilCalendarDate('2026-11-06',new Date(2026,9,29,7,30)),8);
  assert.equal(daysUntilCalendarDate('2026-11-06',new Date(2026,9,29,23,30)),8);
  assert.equal(daysUntilCalendarDate('2026-10-28',new Date(2026,9,29,7,30)),0);
});

test('financial reports reject reversed and incomplete date ranges',()=>{
  assert.equal(isValidReportPeriod('2026-12-31','2026-10-29'),false);
  assert.equal(isValidReportPeriod('2026-10-01','2026-10-29'),true);
  assert.equal(isValidReportPeriod('','2026-10-29'),false);
});

test('finance cards retain two decimal places for reconciliation',()=>{
  assert.equal(compactRp(844_600_000,2),'Rp 844,6 jt');
  assert.equal(compactRp(709_350_000,2),'Rp 709,35 jt');
  assert.equal(compactRp(135_250_000,2),'Rp 135,25 jt');
});
