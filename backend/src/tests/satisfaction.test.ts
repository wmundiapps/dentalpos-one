import assert from 'node:assert/strict'
import { calcNps, hashSurveyToken, isLowScore, newSurveyToken, violatesWeeklyLimit, WEEK_MS } from '../services/satisfactionRules'

assert.equal(calcNps([]), null)
assert.equal(calcNps([10, 9, 9, 10]), 100)
assert.equal(calcNps([0, 3, 6]), -100)
assert.equal(calcNps([10, 8, 7, 2]), 0)
assert.equal(calcNps([10, 10, 8, 5]), 25)

assert.ok(isLowScore(0) && isLowScore(6))
assert.ok(!isLowScore(7) && !isLowScore(10))

const now = new Date('2026-10-10T12:00:00Z')
assert.equal(violatesWeeklyLimit([], now), false)
assert.equal(violatesWeeklyLimit([new Date(now.getTime() - WEEK_MS + 1000)], now), true)
assert.equal(violatesWeeklyLimit([new Date(now.getTime() - WEEK_MS)], now), false)
assert.equal(violatesWeeklyLimit([new Date(now.getTime() + 2 * 24 * 3600 * 1000)], now), true)

const t = newSurveyToken()
assert.ok(t.length >= 30)
assert.notEqual(t, newSurveyToken())
assert.equal(hashSurveyToken(t), hashSurveyToken(t))
assert.notEqual(hashSurveyToken(t), t)
console.log('satisfaction.test OK')
