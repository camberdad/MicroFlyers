import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/build/three.module.js';
import { Combat, MISSILE, ENEMY_GUN } from '../src/combat.js';
import { createFlightState } from '../src/flight.js';
import {roundConfig,loadoutFor} from '../src/career.js';

function setup(colliders = []) {
  const scene = new THREE.Scene();
  const world = { bounds: new THREE.Box3(new THREE.Vector3(-100, 0, -100), new THREE.Vector3(100, 80, 100)), colliders };
  const events = { hits: 0, kills: 0, damage: 0 };
  const combat = new Combat(scene, world, { hit: () => events.hits++, kill: n => events.kills = n, damage: n => events.damage += n });
  combat.reset();
  combat.patrolPosition = (drone, _time, target) => target.copy(drone.mesh.position);
  combat.updateEnemyFlight=()=>{};
  combat.drones.forEach((drone, i) => {
    drone.mesh.position.set(i ? 80 : 0, 16 + i * 2, 0); drone.cooldown = 100;
    drone.box.setFromCenterAndSize(drone.mesh.position, new THREE.Vector3(1.05, .8, 1.05));
  });
  const player = createFlightState(new THREE.Vector3(0, 16, 10));
  return { combat, player, events, scene };
}
test('a fast shot crosses and damages a drone; three hits produce one elimination', () => {
  const { combat, player, events } = setup();
  for (let i = 0; i < 3; i++) { combat.shoot(player); combat.update(.15, player); }
  assert.equal(events.hits, 3); assert.equal(events.kills, 1); assert.equal(combat.kills, 1);
  assert.equal(combat.gunHits,3);
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

test('enemy guns refuse side/rear targets and fire from the nose along its actual heading',()=>{
  const {combat,player}=setup(),enemy=combat.drones[0];
  enemy.mesh.quaternion.identity();enemy.velocity.set(0,0,0);enemy.cooldown=0;
  for(const offset of [[0,0,10],[10,0,0],[-10,0,0],[0,10,0]]){
    player.position.copy(enemy.mesh.position).add(new THREE.Vector3(...offset));
    assert.equal(combat.tryEnemyShot(enemy,player),false);assert.equal(combat.bullets.length,0);
  }
  player.position.copy(enemy.mesh.position).add(new THREE.Vector3(.5,0,-10));
  assert.equal(combat.tryEnemyShot(enemy,player),true);
  const bullet=combat.bullets[0],nose=new THREE.Vector3(0,0,-1).applyQuaternion(enemy.mesh.quaternion);
  assert.ok(bullet.mesh.position.distanceTo(enemy.mesh.position.clone().addScaledVector(nose,ENEMY_GUN.noseOffset))<1e-10);
  assert.ok(bullet.velocity.clone().normalize().distanceTo(nose)<1e-10);
  assert.ok(Math.abs(bullet.velocity.x)<1e-10,'does not aim a turret at off-center targets');
});

test('enemy nose-fire gating follows rotated/pitched orientation, furniture and cooldown',()=>{
  const {combat,player}=setup(),enemy=combat.drones[0];
  enemy.mesh.quaternion.setFromEuler(new THREE.Euler(.3,1.1,0,'YXZ'));enemy.cooldown=0;
  const nose=new THREE.Vector3(0,0,-1).applyQuaternion(enemy.mesh.quaternion);
  player.position.copy(enemy.mesh.position).addScaledVector(nose,15);
  combat.world.colliders.push({box:new THREE.Box3().setFromCenterAndSize(enemy.mesh.position.clone().addScaledVector(nose,7),new THREE.Vector3(2,2,2))});
  assert.equal(combat.tryEnemyShot(enemy,player),false);
  combat.world.colliders=[];assert.equal(combat.tryEnemyShot(enemy,player),true);
  assert.equal(combat.tryEnemyShot(enemy,player),false);
  assert.ok(combat.bullets[0].velocity.clone().normalize().angleTo(nose)<1e-7);
});

test('career planes turn gradually and move forward instead of snapping around to shoot',()=>{
  const {combat,player}=setup();combat.reset({...roundConfig(30),count:1});
  const enemy=combat.drones[0];enemy.mesh.position.set(0,30,0);enemy.mesh.quaternion.identity();enemy.age=5;enemy.waypoint.set(0,30,-20);enemy.retarget=2;
  player.position.set(0,30,30);const before=enemy.mesh.quaternion.clone(),position=enemy.mesh.position.clone();
  Combat.prototype.updateEnemyFlight.call(combat,enemy,player,1/120,true);
  assert.ok(before.angleTo(enemy.mesh.quaternion)<.02);
  const nose=new THREE.Vector3(0,0,-1).applyQuaternion(enemy.mesh.quaternion);
  assert.ok(enemy.mesh.position.clone().sub(position).normalize().angleTo(nose)<1e-7);
  enemy.cooldown=0;assert.equal(combat.tryEnemyShot(enemy,player),false);
});

test('an enemy can turn around, acquire a target and then shoot only along its nose',()=>{
  const {combat,player}=setup();combat.reset({...roundConfig(30),count:1});
  const enemy=combat.drones[0];enemy.mesh.position.set(0,30,0);enemy.mesh.quaternion.identity();enemy.age=5;enemy.retarget=2;enemy.waypoint.set(0,30,-20);enemy.cooldown=0;
  player.position.set(0,30,30);player.velocity.set(0,0,0);
  let shots=0;
  combat.addBullet=(origin,velocity,hostile)=>{
    assert.equal(hostile,true);shots++;
    const nose=new THREE.Vector3(0,0,-1).applyQuaternion(enemy.mesh.quaternion);
    const toward=player.position.clone().sub(enemy.mesh.position).normalize();
    assert.ok(nose.dot(toward)>=ENEMY_GUN.coneCos);
    assert.ok(velocity.clone().normalize().angleTo(nose)<1e-7);
    assert.ok(origin.distanceTo(enemy.mesh.position.clone().addScaledVector(nose,ENEMY_GUN.noseOffset))<1e-7);
  };
  for(let i=0;i<1200;i++){
    Combat.prototype.updateEnemyFlight.call(combat,enemy,player,1/120,true);
    enemy.cooldown-=1/120;combat.tryEnemyShot(enemy,player);
  }
  assert.ok(shots>0,'forward-only gating must still allow an acquired target to be attacked');
});

test('touching a drone causes no contact damage and shots can miss the smaller player core',()=>{
  const {combat,player,events}=setup();
  player.position.copy(combat.drones[0].mesh.position);combat.update(1/120,player);
  assert.equal(events.damage,0);
  player.position.set(0,16,10);
  combat.addBullet(new THREE.Vector3(.3,16,0),new THREE.Vector3(0,0,85),true);
  combat.update(.15,player);assert.equal(events.damage,0);
});

test('Free Fly has no enemies and career practice planes never shoot',()=>{
  const {combat,player,events}=setup();combat.reset({count:0});combat.update(60,player);
  assert.equal(combat.drones.length,0);assert.equal(combat.bullets.length,0);assert.equal(events.damage,0);
  combat.reset(roundConfig(1));assert.equal(combat.drones.length,1);assert.equal(combat.drones[0].ring,null);
  combat.drones[0].cooldown=0;combat.update(10,player);assert.equal(combat.bullets.length,0);
});

test('career loadouts change actual shot damage; eliminated planes reward exactly once',()=>{
  const {combat,player,events}=setup();
  combat.reset({...roundConfig(9),count:1,loadout:loadoutFor({shots:1,armor:0})});
  const drone=combat.drones[0];drone.mesh.position.set(0,16,0);drone.health=2;drone.cooldown=100;
  combat.shoot(player);combat.update(.15,player);
  assert.equal(events.kills,1);assert.equal(drone.alive,false);
  combat.shoot(player);combat.update(.15,player);assert.equal(events.kills,1);
});
test('fire cooldown limits rate; restart removes old bullets, effects, and drones', () => {
  const { combat, player, scene } = setup();
  combat.shoot(player); combat.shoot(player); assert.equal(combat.bullets.length, 1);
  assert.equal(combat.fireMissile(player),true);
  const trail = combat.bullets.find(b=>b.missile).trail;
  combat.burst(player.position, 5); combat.kills = 2;
  combat.reset();
  assert.equal(combat.bullets.length, 0); assert.equal(combat.particles.length, 0);
  assert.equal(combat.kills, 0); assert.equal(combat.drones.length, 4); assert.equal(scene.children.length, 4);
  assert.ok(combat.drones.every(d => d.alive && d.health === 3));
  assert.equal(trail.parent,null); assert.equal(combat.missileCooldown,0);
  assert.equal(combat.gunHits,0); assert.equal(combat.gunActivity,0);
});

test('a missile locks ahead, starts a cooldown and cannot be spammed', () => {
  const {combat,player} = setup();
  assert.equal(combat.getMissileTarget(player),combat.drones[0]);
  assert.equal(combat.fireMissile(player),true);
  assert.equal(combat.fireMissile(player),false);
  assert.equal(combat.bullets.filter(b=>b.missile).length,1);
  assert.equal(combat.missileCooldown,MISSILE.cooldown);
});
test('a homing missile bends toward an off-axis target and destroys it on impact', () => {
  const {combat,player,events} = setup(); combat.drones[0].mesh.position.x = 3;
  assert.equal(combat.fireMissile(player),true);
  const missile = combat.bullets[0];
  combat.update(1/120,player);
  assert.ok(missile.velocity.x > 0);
  assert.ok(new THREE.Vector3(0,0,-1).angleTo(missile.velocity.clone().normalize()) <= MISSILE.turnRate/120+1e-6);
  for (let i=0;i<150 && combat.drones[0].alive;i++) combat.update(1/120,player);
  assert.equal(events.kills,1); assert.equal(combat.drones[0].alive,false);
  assert.equal(combat.gunHits,0);
  assert.equal(combat.bullets.filter(b=>b.missile).length,0);
});
test('furniture blocks a missile lock and does not consume the reload', () => {
  const box = new THREE.Box3(new THREE.Vector3(-20,0,4.99),new THREE.Vector3(20,40,5.01));
  const {combat,player} = setup([{box}]);
  assert.equal(combat.getMissileTarget(player),null); assert.equal(combat.fireMissile(player),false);
  assert.equal(combat.missileCooldown,0); assert.equal(combat.bullets.length,0);
});
test('a missile hits newly encountered thin furniture before the drone, even across a long frame', () => {
  const {combat,player,events} = setup(); combat.fireMissile(player);
  combat.world.colliders.push({box:new THREE.Box3(new THREE.Vector3(-2,14,4.99),new THREE.Vector3(2,18,5.01))});
  combat.update(.5,player);
  assert.equal(events.kills,0); assert.equal(combat.drones[0].health,3);
  assert.equal(combat.bullets.length,0);
});
test('behind/out-of-range targets are not locked, and missiles expire safely after target loss', () => {
  const {combat,player,events} = setup();
  combat.drones[0].mesh.position.z = 20; assert.equal(combat.getMissileTarget(player),null);
  combat.drones[0].mesh.position.z = -100; assert.equal(combat.getMissileTarget(player),null);
  combat.drones[0].mesh.position.z = 0; combat.fireMissile(player);
  const trail = combat.bullets[0].trail;
  combat.drones[0].alive = false; combat.update(MISSILE.life+.1,player);
  assert.equal(combat.bullets.length,0); assert.equal(trail.parent,null); assert.equal(events.kills,0);
});
