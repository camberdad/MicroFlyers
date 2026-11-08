import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SurfaceIndex } from '../src/surface-index.js';
import { resolveSceneryContact } from '../src/scenery-collision.js';
import { createFlightState } from '../src/flight.js';
import { createJet } from '../src/aircraft.js';
import { JET_SCALE, PLAYER_CORE_RADIUS } from '../src/maps.js';
import { createJet as createPreviousJet } from '../versions/v10/src/aircraft.js';

function worldFor(root) {
  return {surfaceTree:new SurfaceIndex(root),bounds:new THREE.Box3(new THREE.Vector3(-20,-20,-20),new THREE.Vector3(20,20,20))};
}
test('V11 jet is exactly half the V10 dimensions and retains a proportional central core',()=>{
  const jet=createJet();assert.ok(Math.abs(jet.scale.x-.204)<1e-12);assert.equal(JET_SCALE,jet.scale.x);
  jet.remove(jet.userData.boostGlow); // The transparent boost halo is an effect, not the airframe.
  const size=new THREE.Box3().setFromObject(jet).getSize(new THREE.Vector3());
  const previousSize=new THREE.Box3().setFromObject(createPreviousJet()).getSize(new THREE.Vector3());
  for(const axis of ['x','y','z'])assert.ok(Math.abs(size[axis]*2-previousSize[axis])<1e-9);
  assert.equal(PLAYER_CORE_RADIUS,.065);
  assert.ok(PLAYER_CORE_RADIUS*2 < size.x/2);
});
test('repeated wall contact slides without health loss, speed loss, bounce or teleport',()=>{
  const wall=new THREE.Mesh(new THREE.PlaneGeometry(10,10));const world=worldFor(wall);
  const state=createFlightState(new THREE.Vector3(0,0,1));state.speed=19;state.throttle=1;
  const velocity=state.velocity.clone(),orientation=state.quaternion.clone();
  for(let i=0;i<300;i++){
    const previous=state.position.clone();state.position.add(new THREE.Vector3(.002,0,-.15));resolveSceneryContact(world,state,previous);
  }
  assert.equal(state.health,100);assert.equal(state.speed,19);assert.equal(state.throttle,1);
  assert.ok(state.velocity.equals(velocity)&&state.quaternion.equals(orientation));
  assert.ok(state.position.z>=PLAYER_CORE_RADIUS-.001&&state.position.z<.15);
  assert.ok(Math.abs(state.position.x-.6)<.001);
});
test('thin surfaces block the core from either direction even across a longer step',()=>{
  const world=worldFor(new THREE.Mesh(new THREE.PlaneGeometry(10,10)));
  for(const side of [-1,1]){
    const state=createFlightState(new THREE.Vector3(0,0,-side));
    resolveSceneryContact(world,state,new THREE.Vector3(0,0,side));
    assert.ok(state.position.z*side>=PLAYER_CORE_RADIUS-.001);
  }
});
test('a combined table mesh leaves its empty underside flyable',()=>{
  const geometry=new THREE.BoxGeometry(6,.2,6);geometry.translate(0,2,0);
  const world=worldFor(new THREE.Mesh(geometry));
  const state=createFlightState(new THREE.Vector3(0,1,-4));
  resolveSceneryContact(world,state,new THREE.Vector3(0,1,4));
  assert.ok(state.position.distanceTo(new THREE.Vector3(0,1,-4))<1e-6);
});
test('close passes outside the small core remain clear; room bounds cause no damage',()=>{
  const world=worldFor(new THREE.Mesh(new THREE.PlaneGeometry(10,10)));
  const state=createFlightState(new THREE.Vector3(1,0,.2));
  resolveSceneryContact(world,state,new THREE.Vector3(0,0,.2));assert.equal(state.position.z,.2);
  const previous=new THREE.Vector3(19,0,1);state.position.set(21,0,1);resolveSceneryContact(world,state,previous);
  assert.ok(state.position.x<=20-PLAYER_CORE_RADIUS);assert.equal(state.health,100);
});
