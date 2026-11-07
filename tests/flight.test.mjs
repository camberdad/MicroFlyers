import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/build/three.module.js';
import { createFlightState, updateFlight, forwardVector, segmentHitsBox, FLIGHT, ASSIST, steeringCurve } from '../src/flight.js';

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

test('assisted flight holds a bounded bank and climb instead of rolling or looping indefinitely', () => {
  const state = createFlightState(); fly(state, { ...neutral, assist: true, pitch: 1, roll: 1 }, 12);
  const attitude = new THREE.Euler().setFromQuaternion(state.quaternion, 'YXZ');
  assert.ok(Math.abs(attitude.x - ASSIST.maxPitch) < .005);
  assert.ok(Math.abs(attitude.z - ASSIST.maxBank) < .005);
});
test('releasing assisted controls levels the wings and nose without continued turning', () => {
  const state = createFlightState(); fly(state, { ...neutral, assist: true, pitch: .8, roll: -.8 }, 2);
  fly(state, { ...neutral, assist: true }, 2);
  const before = forwardVector(state); fly(state, { ...neutral, assist: true }, 1);
  const attitude = new THREE.Euler().setFromQuaternion(state.quaternion, 'YXZ');
  assert.ok(Math.abs(attitude.x) < .005); assert.ok(Math.abs(attitude.z) < .005);
  assert.ok(before.angleTo(forwardVector(state)) < THREE.MathUtils.degToRad(1));
});
test('assistance preserves straight-line speed, boost, brake and momentum integration', () => {
  const manual = createFlightState(), assisted = createFlightState();
  for (const settings of [neutral, { ...neutral, boost: true }, { ...neutral, brake: true }]) {
    fly(manual, settings, 3); fly(assisted, { ...settings, assist: true }, 3);
    assert.ok(manual.position.distanceTo(assisted.position) < 1e-9);
    assert.ok(manual.velocity.distanceTo(assisted.velocity) < 1e-9);
    assert.equal(manual.speed, assisted.speed);
  }
});
test('mouse steering has a quiet center and fine symmetric control without reducing full travel', () => {
  assert.equal(steeringCurve(.03), 0); assert.equal(steeringCurve(1), 1); assert.equal(steeringCurve(-1), -1);
  assert.ok(steeringCurve(.2) < .06); assert.equal(steeringCurve(-.2), -steeringCurve(.2));
});
