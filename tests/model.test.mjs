import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../vendor/three/build/three.module.js';
import { FBXLoader } from '../vendor/three/examples/jsm/loaders/FBXLoader.js';
import { isSafePosition,prepareAirfield } from '../src/world.js';
import { GLTFLoader } from '../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import {Combat} from '../src/combat.js';
import {roundConfig} from '../src/career.js';
import {createFlightState} from '../src/flight.js';

function checkCareerSpawns(world){
  const combat=new Combat(new THREE.Scene(),world,{});
  combat.reset(roundConfig(1));
  const player=createFlightState(world.spawn);player.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),world.heading);
  assert.ok(combat.getMissileTarget(player),'opening practice target is visible from takeoff');
  combat.reset(roundConfig(30));assert.equal(combat.drones.length,8);
  assert.ok(combat.drones.every(d=>isSafePosition(world,d.mesh.position,.6)),'final-round planes spawn clear');
  combat.reset({count:0});
}

test('the actual supplied FBX parses, normalizes, and has a clear launch position', async () => {
  globalThis.window = { innerWidth: 1100, innerHeight: 800 };
  const manager = new THREE.LoadingManager();
  manager.addHandler(/.*/, { load: () => new THREE.Texture(), setPath() {}, setResourcePath() {} });
  const buffer = await readFile(new URL('../assets/InteriorTest.fbx', import.meta.url));
  const model = new FBXLoader(manager).parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '');
  const discard = []; model.traverse(o => { if (o.isCamera || o.isLight) discard.push(o); }); discard.forEach(o => o.removeFromParent());
  model.updateMatrixWorld(true);
  const original = new THREE.Box3().setFromObject(model), size = original.getSize(new THREE.Vector3()), center = original.getCenter(new THREE.Vector3());
  const scale = 120 / Math.max(size.x, size.z);
  model.scale.setScalar(scale); model.position.set(-center.x * scale, -original.min.y * scale, -center.z * scale); model.updateMatrixWorld(true);
  const colliders = []; model.traverse(o => { if (o.isMesh) colliders.push({ box: new THREE.Box3().setFromObject(o).expandByScalar(.025) }); });
  const world = { colliders, bounds: new THREE.Box3(new THREE.Vector3((-249-center.x)*scale,.25,(-399-center.z)*scale),new THREE.Vector3((249-center.x)*scale,298*scale,(399-center.z)*scale)) };
  assert.equal(colliders.length, 231);
  assert.ok(Math.abs(new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).z - 120) < .01);
  assert.ok(isSafePosition(world, new THREE.Vector3(-10, 16, 42)));
  assert.ok(!isSafePosition(world, new THREE.Vector3(0, -.1, 0)));
  assert.ok(!isSafePosition(world, new THREE.Vector3(1000, 20, 0)));
  // Exercise the actual new surface-based setup on the original FBX as well.
  model.scale.setScalar(1);model.position.set(0,0,0);
  const prepared=prepareAirfield(model,'living');
  assert.ok(isSafePosition(prepared,prepared.spawn,.13));
  assert.equal(prepared.meshCount,231);
  checkCareerSpawns(prepared);
});

test('prepared dining OBJ retains its room and furniture with safe launch and drone patrols',async()=>{
  const buffer=await readFile(new URL('../assets/dining-room.glb',import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'');
  const world=prepareAirfield(gltf.scene,'dining');
  assert.equal(world.meshCount,236);assert.ok(buffer.length<6_000_000);
  assert.ok(Math.abs(new THREE.Box3().setFromObject(world.room).getSize(new THREE.Vector3()).x-120)<.01);
  assert.ok(isSafePosition(world,world.spawn));
  assert.ok(world.bounds.containsPoint(world.patrol.center));
  checkCareerSpawns(world);
  for(let phase=0;phase<Math.PI*2;phase+=.25){
    const position=world.patrol.center.clone().add(new THREE.Vector3(Math.sin(phase)*19,Math.sin(phase*1.7)*1.5,Math.cos(phase)*18));
    assert.ok(isSafePosition(world,position,.6),`patrol phase ${phase}`);
  }
});
