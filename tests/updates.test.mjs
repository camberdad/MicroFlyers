import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVersion, updateDecision } from '../src/update-policy.js';

test('version manifests accept positive integers and reject malformed values', () => {
  assert.equal(parseVersion({ version: 3 }), 3);
  assert.equal(parseVersion({ version: '3' }), 3);
  assert.equal(parseVersion({ version: 'V3', versionNumber: 3 }), 3);
  for (const info of [null, {}, { version: 0 }, { version: -2 }, { version: 2.4 }, { version: 'new' }]) assert.equal(parseVersion(info), null);
});
test('updates wait for asset readiness and never interrupt a flight', () => {
  const state = { current: 2, latest: 3, ready: false, home: true, attempted: 0 };
  assert.equal(updateDecision(state), 'none');
  assert.equal(updateDecision({ ...state, ready: true, home: false }), 'pending');
  assert.equal(updateDecision({ ...state, ready: true }), 'apply');
});
test('same/older versions do not reload and a failed attempt does not cause a reload loop', () => {
  const state = { current: 2, latest: 2, ready: true, home: true, attempted: 0 };
  assert.equal(updateDecision(state), 'none');
  assert.equal(updateDecision({ ...state, latest: 1 }), 'none');
  assert.equal(updateDecision({ ...state, latest: 3, attempted: 3 }), 'retry');
  assert.equal(updateDecision({ ...state, latest: 4, attempted: 3 }), 'apply');
});
