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
test('Space requests held rocket boost and either Shift brakes without steering', () => {
  const throttle = readKeyboardFlight(new Set(['Space']),{});
  assert.equal(throttle.boost,true); assert.equal(throttle.brake,false);
  for (const key of ['ShiftLeft','ShiftRight']) {
    const input = readKeyboardFlight(new Set([key]),{});
    assert.equal(input.boost,false); assert.equal(input.brake,true);
    assert.equal(input.pitch,0); assert.equal(input.roll,0);
  }
});

test('arrows match WASD, without doubling combined inputs', () => {
  for (const [arrow,key,axis] of [['ArrowUp','KeyW','pitch'],['ArrowDown','KeyS','pitch'],['ArrowLeft','KeyA','roll'],['ArrowRight','KeyD','roll']]) {
    const expected = readKeyboardFlight(new Set([key]),{})[axis];
    assert.equal(readKeyboardFlight(new Set([arrow]),{})[axis],expected);
    assert.equal(readKeyboardFlight(new Set([arrow,key]),{})[axis],expected);
  }
});

test('Flight pitch style reverses both W/S and arrow pitch; sensitivity is bounded', () => {
  assert.equal(readKeyboardFlight(new Set(['KeyW']),{},{pitchStyle:'flight'}).pitch,-1);
  assert.equal(readKeyboardFlight(new Set(['ArrowDown']),{},{pitchStyle:'flight'}).pitch,1);
  assert.equal(readKeyboardFlight(new Set(),{},{sensitivity:9}).sensitivity,1.5);
  assert.equal(readKeyboardFlight(new Set(),{},{sensitivity:-1}).sensitivity,.5);
});
