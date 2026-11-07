import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/build/three.module.js';
import { Combat } from '../src/combat.js';
import { createFlightState } from '../src/flight.js';

function setup(colliders = []) {
  const scene = new THREE.Scene();
  const world = { bounds: new THREE.Box3(new THREE.Vector3(-100, 0, -100), new THREE.Vector3(100, 80, 100)), colliders };
  const events = { hits: 0, kills: 0, damage: 0 };
  const combat = new Combat(scene, world, { hit: () => events.hits++, kill: n => events.kills = n, damage: n => events.damage += n });
  combat.reset();
  combat.patrolPosition = (drone, _time, target) => target.copy(drone.mesh.position);
  combat.drones.forEach((drone, i) => {
    drone.mesh.position.set(i ? 50 : 0, 16 + i * 2, 0); drone.cooldown = 100;
    drone.box.setFromCenterAndSize(drone.mesh.position, new THREE.Vector3(1.05, .8, 1.05));
  });
  const player = createFlightState(new THREE.Vector3(0, 16, 10));
  return { combat, player, events, scene };
}
test('a fast shot crosses and damages a drone; three hits produce one elimination', () => {
  const { combat, player, events } = setup();
  for (let i = 0; i < 3; i++) { combat.shoot(player); combat.update(.15, player); }
  assert.equal(events.hits, 3); assert.equal(events.kills, 1); assert.equal(combat.kills, 1);
  assert.equal(combat.drones[0].alive, false); assert.equal(combat.bullets.length, 0);
});
test('furniture between the jet and a drone blocks damage, regardless of endpoint distance', () => {
  const box = new THREE.Box3(new THREE.Vector3(-1, 15, 4.99), new THREE.Vector3(1, 17, 5.01));
  const { combat, player, events } = setup([{ box }]);
  combat.shoot(player); combat.update(.15, player);
  assert.equal(events.hits, 0); assert.equal(combat.drones[0].health, 3); assert.equal(combat.bullets.length, 0);
});
test('enemy shots damage the player using swept collision', () => {
  const { combat, player, events } = setup();
  combat.addBullet(new THREE.Vector3(0, 16, 0), new THREE.Vector3(0, 0, 85), true);
  combat.update(.15, player);
  assert.equal(events.damage, 10); assert.equal(combat.bullets.length, 0);
});
test('fire cooldown limits rate; restart removes old bullets, effects, and drones', () => {
  const { combat, player, scene } = setup();
  combat.shoot(player); combat.shoot(player); assert.equal(combat.bullets.length, 1);
  combat.burst(player.position, 5); combat.kills = 2;
  combat.reset();
  assert.equal(combat.bullets.length, 0); assert.equal(combat.particles.length, 0);
  assert.equal(combat.kills, 0); assert.equal(combat.drones.length, 4); assert.equal(scene.children.length, 4);
  assert.ok(combat.drones.every(d => d.alive && d.health === 3));
});
