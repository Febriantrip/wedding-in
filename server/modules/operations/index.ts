import {Router} from 'express';
import {registerVendorPayments} from './vendor-payments.js';
import {registerExpenseRequests} from './expense-requests.js';
import {registerClosings} from './closing.js';
import {registerProfitability} from './profitability.js';
import {registerExecutionTimeline} from './timeline.js';
import {registerRundown} from './rundown.js';
import {registerRundownTemplates} from './rundown-templates.js';
import {registerFieldMonitor} from './field-monitor.js';

export const operationsRouter=Router();
registerProfitability(operationsRouter);
registerVendorPayments(operationsRouter);
registerExpenseRequests(operationsRouter);
registerClosings(operationsRouter);
registerExecutionTimeline(operationsRouter);
registerRundownTemplates(operationsRouter);
registerRundown(operationsRouter);
registerFieldMonitor(operationsRouter);
