import test from 'node:test';
import assert from 'node:assert/strict';
import { readKeyboardFlight } from '../src/input.js';

test('W climbs and S dives, with A/D bank and Q/E rudder', () => {
  for (const [key,axis,value] of [['KeyW','pitch',1],['KeyS','pitch',-1],['KeyA','roll',1],['KeyD','roll',-1],['KeyQ','yaw',1],['KeyE','yaw',-1]]) {
    assert.equal(readKeyboardFlight(new Set([key]),{})[axis],value);
  }
});
test('opposite keys cancel and unrelated keys do not steer', () => {
  const input = readKeyboardFlight(new Set(['KeyW','KeyS','KeyA','KeyD','KeyQ','KeyE','KeyM']),{});
  assert.equal(input.pitch,0); assert.equal(input.roll,0); assert.equal(input.yaw,0);
  const idle = readKeyboardFlight(new Set(['KeyM']),{});
  assert.equal(idle.pitch,0); assert.equal(idle.roll,0); assert.equal(idle.yaw,0);
});
test('either shift boosts and Space brakes without creating steering input', () => {
  for (const key of ['ShiftLeft','ShiftRight']) {
    const input = readKeyboardFlight(new Set([key,'Space']),{});
    assert.equal(input.boost,true); assert.equal(input.brake,true);
    assert.equal(input.pitch,0); assert.equal(input.roll,0);
  }
});
