import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/build/three.module.js';
import { createFlightState, updateFlight, forwardVector, segmentHitsBox, FLIGHT, flightConfig } from '../src/flight.js';

const neutral = { pitch: 0, roll: 0, yaw: 0, boost: false, brake: false };
function fly(state, input, seconds, step = 1 / 120) {
  for (let i = 0; i < Math.round(seconds / step); i++) updateFlight(state, input, step);
}

test('neutral flight maintains cruise speed and travels along the nose', () => {
  const state = createFlightState(new THREE.Vector3()); fly(state, neutral, 10);
  assert.ok(Math.abs(state.position.z + 85) < .001);
  assert.equal(state.position.y, 0); assert.equal(state.position.x, 0);
});
test('afterburner accelerates; prolonged braking preserves minimum airspeed', () => {
  const state = createFlightState(); fly(state, { ...neutral, boost: true }, 12);
  assert.ok(state.speed > 18.99 && state.speed <= FLIGHT.boostSpeed);
  fly(state, { ...neutral, brake: true, boost: true }, 20);
  assert.ok(state.speed >= FLIGHT.minSpeed && state.speed < FLIGHT.minSpeed + .001);
  assert.ok(state.velocity.length() >= FLIGHT.minSpeed - 1e-9);
});
test('positive pitch climbs, negative pitch dives, and rudder turns in either direction', () => {
  for (const [input, axis, sign] of [[{pitch:1},'y',1],[{pitch:-1},'y',-1],[{yaw:1},'x',-1],[{yaw:-1},'x',1]]) {
    const state = createFlightState(new THREE.Vector3()); fly(state, { ...neutral, ...input }, 1);
    assert.ok(state.position[axis] * sign > .5, JSON.stringify(input));
  }
});
test('banking turns while forward velocity retains gentle drift', () => {
  const state = createFlightState(new THREE.Vector3()); fly(state, { ...neutral, roll: 1 }, 1);
  assert.ok(state.position.x < -.1);
  const nose = forwardVector(state), momentum = state.velocity.clone().normalize();
  assert.ok(nose.angleTo(momentum) > .01);
  assert.ok(nose.angleTo(momentum) < .5);
});
test('sustained steering keeps quaternions finite and airspeed above stall', () => {
  const state = createFlightState(); fly(state, { ...neutral, pitch: 1, roll: -1, yaw: .8, brake: true }, 60);
  assert.ok(state.position.toArray().every(Number.isFinite));
  assert.ok(Math.abs(state.quaternion.length() - 1) < 1e-10);
  assert.ok(state.velocity.length() >= FLIGHT.minSpeed - 1e-8);
});
test('swept projectiles hit a thin box even when both endpoints are outside', () => {
  const box = new THREE.Box3(new THREE.Vector3(-1, -1, -.01), new THREE.Vector3(1, 1, .01));
  assert.ok(segmentHitsBox(new THREE.Vector3(0, 0, 8), new THREE.Vector3(0, 0, -8), box));
  assert.ok(!segmentHitsBox(new THREE.Vector3(2, 0, 8), new THREE.Vector3(2, 0, -8), box));
  assert.ok(!segmentHitsBox(new THREE.Vector3(0, 0, 8), new THREE.Vector3(0, 0, 2), box));
  assert.ok(segmentHitsBox(new THREE.Vector3(), new THREE.Vector3(), box));
});

test('held steering reaches the configured pitch/bank caps without inverting', () => {
  const state = createFlightState(); fly(state, { ...neutral, roll:1, pitch:1 }, 6);
  assert.ok(Math.abs(state.currentRoll - flightConfig.maxRoll) < 1e-9);
  assert.ok(Math.abs(state.currentPitch - flightConfig.maxPitch) < 1e-9);
  assert.ok(new THREE.Vector3(0,1,0).applyQuaternion(state.quaternion).y > .25);
});
test('neutral inputs level both axes and settle the banking turn', () => {
  const state = createFlightState(); fly(state, { ...neutral, roll:1, pitch:-1 }, 1);
  fly(state, neutral, 3);
  const before = forwardVector(state);
  fly(state, neutral, 1);
  assert.ok(Math.abs(state.currentRoll) < .0001 && Math.abs(state.currentPitch) < .0001);
  assert.ok(before.angleTo(forwardVector(state)) < .001);
  assert.ok(new THREE.Vector3(0,1,0).applyQuaternion(state.quaternion).y > .99999);
});
test('maneuvers do not alter the cruise, afterburner or braking speed model', () => {
  const straight = createFlightState(), turning = createFlightState();
  for (const settings of [neutral, { ...neutral, boost: true }, { ...neutral, brake: true }]) {
    fly(straight, settings, 3); fly(turning, { ...settings, roll:.8, pitch:.4, yaw:.2 }, 3);
    assert.equal(straight.speed, turning.speed);
  }
});
test('a cruise-speed full-bank circle is about 50% wider than V5', () => {
  const state = createFlightState(new THREE.Vector3());
  state.quaternion.setFromEuler(new THREE.Euler(0,0,flightConfig.maxRoll,'YXZ'));
  let minX = 0, maxX = 0;
  for (let i=0;i<3360;i++) {
    updateFlight(state,{...neutral,roll:1},1/120);
    minX = Math.min(minX,state.position.x); maxX = Math.max(maxX,state.position.x);
  }
  assert.ok(maxX-minX > 62 && maxX-minX < 66, `Circle diameter ${maxX-minX}`);
});

test('automatic leveling is consistent at different frame rates', () => {
  const fast = createFlightState(), slow = createFlightState();
  fast.quaternion.setFromEuler(new THREE.Euler(.3,0,-.5,'YXZ')); slow.quaternion.copy(fast.quaternion);
  fly(fast, neutral, 2, 1/120); fly(slow, neutral, 2, 1/30);
  assert.ok(Math.abs(fast.currentPitch - slow.currentPitch) < 1e-9);
  assert.ok(Math.abs(fast.currentRoll - slow.currentRoll) < 1e-9);
  assert.ok(Math.abs(fast.currentRoll - -.5 * Math.exp(-flightConfig.autoLevelSpeed*2)) < 1e-9);
});
