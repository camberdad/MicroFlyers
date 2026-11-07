import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/build/three.module.js';
import { createFlightState, updateFlight, forwardVector, segmentHitsBox, FLIGHT, CONTROL, steeringCurve } from '../src/flight.js';

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
test('W climbs, S dives, Q yaws left, E yaws right', () => {
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
test('sustained aerobatics keep quaternions finite and airspeed above stall', () => {
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

test('held roll completes a full barrel roll in under two seconds without an angle cap', () => {
  const state = createFlightState(); let total = 0, inverted = false;
  for (let i = 0; i < 216; i++) {
    updateFlight(state, { ...neutral, roll: 1 }, 1 / 120);
    total += state.angular.z / 120;
    if (new THREE.Vector3(0,1,0).applyQuaternion(state.quaternion).y < -.8) inverted = true;
  }
  assert.ok(total > Math.PI * 2); assert.ok(inverted);
  assert.ok(Math.abs(state.angular.z - CONTROL.rollRate) < .001);
});
test('centering the controls stops roll rate and preserves inverted flight without leveling', () => {
  const state = createFlightState(); fly(state, { ...neutral, roll: 1 }, .8);
  fly(state, neutral, 1);
  const upBefore = new THREE.Vector3(0,1,0).applyQuaternion(state.quaternion).y;
  fly(state, neutral, 3);
  const upAfter = new THREE.Vector3(0,1,0).applyQuaternion(state.quaternion).y;
  assert.ok(upBefore < -.8 && upAfter < -.8);
  assert.ok(Math.abs(upAfter - upBefore) < 1e-5);
  assert.ok(Math.abs(state.angular.z) < 1e-8);
});
test('maneuvers do not alter the cruise, afterburner or braking speed model', () => {
  const straight = createFlightState(), turning = createFlightState();
  for (const settings of [neutral, { ...neutral, boost: true }, { ...neutral, brake: true }]) {
    fly(straight, settings, 3); fly(turning, { ...settings, roll:.8, pitch:.4, yaw:.2 }, 3);
    assert.equal(straight.speed, turning.speed);
  }
});
test('mouse steering has a quiet center and fine symmetric control without reducing full travel', () => {
  assert.equal(steeringCurve(.02), 0); assert.equal(steeringCurve(1), 1); assert.equal(steeringCurve(-1), -1);
  assert.ok(steeringCurve(.2) > .12 && steeringCurve(.2) < .2); assert.equal(steeringCurve(-.2), -steeringCurve(.2));
});

test('held pitch can fly a complete loop and remains pitched after release', () => {
  const state = createFlightState(); let rotation = 0;
  for (let i = 0; i < 420; i++) { updateFlight(state, { ...neutral, pitch:1 }, 1/120); rotation += state.angular.x/120; }
  assert.ok(rotation > Math.PI * 2);
  state.quaternion.setFromAxisAngle(new THREE.Vector3(1,0,0), .7); state.angular.set(0,0,0);
  fly(state, neutral, 3);
  assert.ok(Math.abs(forwardVector(state).y - Math.sin(.7)) < 1e-8);
});
