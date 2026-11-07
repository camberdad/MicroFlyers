import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/build/three.module.js';
import { createFlightState, updateFlight, forwardVector, segmentHitsBox, FLIGHT, flightConfig, adjustThrottle, throttleToSpeed } from '../src/flight.js';

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

test('held steering reaches the pitch limit and banks deeply without inverting', () => {
  const state = createFlightState(); fly(state, { ...neutral, roll:1, pitch:1 }, 6);
  assert.ok(state.currentRoll > 1 && state.currentRoll <= flightConfig.maxRoll);
  assert.ok(Math.abs(state.currentPitch - flightConfig.maxPitch) < 1e-9);
  assert.ok(new THREE.Vector3(0,1,0).applyQuaternion(state.quaternion).y > 0);
});
test('release levels the wings, holds pitch and settles the turn', () => {
  const state = createFlightState(); fly(state, { ...neutral, roll:1, pitch:.5 }, .8);
  fly(state, neutral, 3);
  const before = forwardVector(state);
  const pitch = state.currentPitch;
  fly(state, neutral, 1);
  assert.ok(Math.abs(state.currentRoll) < .0001 && state.currentPitch > .2);
  assert.ok(Math.abs(state.currentPitch-pitch) < 1e-9);
  assert.ok(before.angleTo(forwardVector(state)) < .001);
});
test('maneuvers do not alter the cruise, afterburner or braking speed model', () => {
  const straight = createFlightState(), turning = createFlightState();
  for (const settings of [neutral, { ...neutral, boost: true }, { ...neutral, brake: true }]) {
    fly(straight, settings, 3); fly(turning, { ...settings, roll:.8, pitch:.4, yaw:.2 }, 3);
    assert.equal(straight.speed, turning.speed);
  }
});
test('heading responds before bank finishes building', () => {
  const state = createFlightState();
  fly(state,{...neutral,roll:1},.1);
  assert.ok(forwardVector(state).x < -.03);
  assert.ok(state.currentRoll > 0 && state.currentRoll < .3);
});

test('a bank without turn input levels without continuing to change heading', () => {
  const state = createFlightState();
  state.quaternion.setFromEuler(new THREE.Euler(0,.4,1,'YXZ'));
  const before = forwardVector(state);
  fly(state,neutral,2);
  assert.ok(before.angleTo(forwardVector(state)) < 1e-7);
  assert.ok(Math.abs(state.currentRoll) < .001);
});

test('wing leveling and pitch hold are consistent at different frame rates', () => {
  const fast = createFlightState(), slow = createFlightState();
  fast.quaternion.setFromEuler(new THREE.Euler(.3,0,-.2,'YXZ')); slow.quaternion.copy(fast.quaternion);
  fly(fast, neutral, 2, 1/120); fly(slow, neutral, 2, 1/30);
  assert.ok(Math.abs(fast.currentPitch - slow.currentPitch) < 1e-9);
  assert.ok(Math.abs(fast.currentRoll - slow.currentRoll) < 1e-9);
  assert.ok(Math.abs(fast.currentPitch-.3) < 1e-9);
  assert.ok(Math.abs(fast.currentRoll - -.2 * Math.exp(-flightConfig.bankResponse*2)) < 1e-9);
});

test('throttle holds on release and the engine spools toward the selected speed', () => {
  const state = createFlightState();
  fly(state,{...neutral,boost:true},.5);
  assert.ok(Math.abs(state.throttle-.85) < 1e-9);
  fly(state,neutral,3);
  assert.ok(Math.abs(state.throttle-.85) < 1e-9);
  assert.ok(state.speed > 15 && state.speed < throttleToSpeed(.85));
  fly(state,{...neutral,brake:true},.25);
  assert.ok(Math.abs(state.throttle-.65) < 1e-9);
  const brakedSpeed = state.speed;
  fly(state,neutral,3);
  assert.ok(Math.abs(state.throttle-.65) < 1e-9 && state.speed > brakedSpeed);
});

test('fine throttle adjustments persist and clamp to safe limits', () => {
  const state = createFlightState();
  adjustThrottle(state,.04); fly(state,neutral,1);
  assert.equal(state.throttle,.54);
  adjustThrottle(state,5); assert.equal(state.throttle,1);
  adjustThrottle(state,NaN); assert.equal(state.throttle,1);
  adjustThrottle(state,-5); assert.equal(state.throttle,0);
  fly(state,neutral,10);
  assert.ok(state.speed >= FLIGHT.minSpeed && state.speed < FLIGHT.minSpeed+.001);
});
