import assert from 'node:assert/strict'
import { computeTaskPoints } from '../services/pendingTaskScore'

const due = new Date('2026-10-10T00:00:00.000Z')
assert.deepEqual(computeTaskPoints('MEDIA', null, new Date()), { points: 10, onTime: true })
assert.deepEqual(computeTaskPoints('URGENTE', due, new Date('2026-10-10T20:00:00.000Z')), { points: 45, onTime: true })
assert.deepEqual(computeTaskPoints('ALTA', due, new Date('2026-10-11T04:00:00.000Z')), { points: 0, onTime: false })
assert.deepEqual(computeTaskPoints('BAIXA', due, new Date('2026-10-09T10:00:00.000Z')), { points: 8, onTime: true })
assert.equal(computeTaskPoints('XYZ', null, new Date()).points, 10)
console.log('pendingTaskScore OK')
