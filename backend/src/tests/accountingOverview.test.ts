import assert from 'node:assert/strict'
import { buildAccountingOverview, monthRange } from '../services/accountingOverview'

const d = (s: string) => new Date(s + 'T12:00:00Z')
const base = { personName: 'X', description: 'd', accountingStatus: 'PENDING', status: 'PAID' }
const empty = buildAccountingOverview([], [], '2026-09', d('2026-10-10'))
assert.equal(empty.revenue, 0); assert.equal(empty.result, 0); assert.equal(empty.readyToClose, false)
assert.equal(monthRange('2026-13'), null)
assert.throws(() => buildAccountingOverview([], [], 'x'))

const r = buildAccountingOverview([
  { ...base, id: '1', type: 'INCOME', amount: 1000, netAmount: 950, dueDate: d('2026-09-05'), documentNumber: '1', accountingStatus: 'REVIEWED' },
  { ...base, id: '2', type: 'INCOME', amount: 500, dueDate: d('2026-09-10') },
  { ...base, id: '3', type: 'EXPENSE', amount: 300, dueDate: d('2026-09-12'), fiscalDocumentType: 'NFE', accountingStatus: 'REVIEWED' },
  { ...base, id: '4', type: 'EXPENSE', amount: 99, dueDate: d('2026-09-20'), status: 'CANCELLED' },
  { ...base, id: '5', type: 'EXPENSE', amount: 80, dueDate: d('2026-09-02'), status: 'PENDING' },
  { ...base, id: '6', type: 'INCOME', amount: 700, dueDate: d('2026-10-02') },
], [
  { id: 'o1', name: 'DAS', competence: '2026-09', dueDate: d('2026-10-20'), estimatedValue: 100, status: 'TO_CALCULATE' },
  { id: 'o2', name: 'ISS', competence: '2026-09', dueDate: d('2026-10-10'), estimatedValue: 50, finalValue: 60, status: 'PAID' },
  { id: 'o3', name: 'DAS', competence: '2026-08', dueDate: d('2026-09-20'), estimatedValue: 999, status: 'PAID' },
], '2026-09', d('2026-10-10'))
assert.equal(r.revenue, 1450); assert.equal(r.expenses, 380); assert.equal(r.result, 1070)
assert.equal(r.entryCount, 4)
assert.equal(r.pendingDocuments, 1); assert.equal(r.pendingReview, 2); assert.equal(r.overdue, 1)
assert.equal(r.taxEstimated, 160); assert.equal(r.taxOpen, 100); assert.equal(r.openObligations, 1)
assert.equal(r.readyToClose, false); assert.equal(r.blockers.length, 4)
console.log('accountingOverview OK')
