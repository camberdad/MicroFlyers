import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {planWaveSpawns,spawnForward,SPAWN_RULES,hasDepartureClearance} from '../src/spawns.js';
export function seededRandom(seed){return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
export function assertSpawnPlan(world,plan){
  assert.ok(hasDepartureClearance(world,plan.player));
  for(const [i,enemy] of plan.enemies.entries()){
    assert.ok(hasDepartureClearance(world,enemy));
    const offset=enemy.position.clone().sub(plan.player.position),gap=offset.length();
    assert.ok(gap>=SPAWN_RULES.playerGap);
    offset.divideScalar(gap);
    assert.ok(spawnForward(plan.player).dot(offset)<=SPAWN_RULES.facingCos);
    assert.ok(spawnForward(enemy).dot(offset.negate())<=SPAWN_RULES.facingCos);
    for(const other of plan.enemies.slice(0,i)){
      const delta=other.position.clone().sub(enemy.position),distance=delta.length();
      assert.ok(distance>=SPAWN_RULES.enemyGap);delta.divideScalar(distance);
      assert.ok(spawnForward(enemy).dot(delta)<=SPAWN_RULES.enemyFacingCos);
      assert.ok(spawnForward(other).dot(delta.negate())<=SPAWN_RULES.enemyFacingCos);
    }
  }
}
test('randomized layouts keep every pair separated and out of initial firing directions',()=>{
  const world={bounds:new THREE.Box3(new THREE.Vector3(-40,0,-60),new THREE.Vector3(40,40,60)),colliders:[]};
  const layouts=Array.from({length:25},(_,i)=>planWaveSpawns(world,8,seededRandom(i+1)));
  for(const plan of layouts)assertSpawnPlan(world,plan);
  assert.ok(layouts[0].player.position.distanceTo(layouts[1].player.position)>1);
  assert.notEqual(layouts[0].player.heading,layouts[1].player.heading);
});
test('a crowded room fails explicitly instead of dropping spawn separation rules',()=>{
  const world={bounds:new THREE.Box3(new THREE.Vector3(-4,0,-4),new THREE.Vector3(4,8,4)),colliders:[]};
  assert.throws(()=>planWaveSpawns(world,8,seededRandom(1)),/Unable to arrange/);
});
