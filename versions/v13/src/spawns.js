import * as THREE from 'three';
import { isSafePosition } from './world.js';

export const SPAWN_RULES = Object.freeze({playerGap:20,enemyGap:9,facingCos:Math.cos(Math.PI/4),enemyFacingCos:Math.cos(Math.PI/7),clearAhead:6});
const up=new THREE.Vector3(0,1,0);
export function spawnForward(spawn,target=new THREE.Vector3()) {
  return target.set(0,0,-1).applyAxisAngle(up,spawn.heading);
}
export function randomAirPoint(world,random=Math.random) {
  const area=world.flightArea??world.bounds,size=area.getSize(new THREE.Vector3());
  return new THREE.Vector3(
    THREE.MathUtils.lerp(area.min.x+3,area.max.x-3,random()),
    THREE.MathUtils.lerp(area.min.y+size.y*.32,area.min.y+size.y*.78,random()),
    THREE.MathUtils.lerp(area.min.z+3,area.max.z-3,random()));
}
export function hasDepartureClearance(world,spawn) {
  const nose=spawnForward(spawn);
  for(let distance=0;distance<=SPAWN_RULES.clearAhead;distance+=1)
    if(!isSafePosition(world,spawn.position.clone().addScaledVector(nose,distance),1))return false;
  return true;
}

/** Plan the entire wave before launching. Reject close or initially aimed pairs;
 * never silently relax separation/safety rules when a placement is crowded.
 * Injecting random makes the same production rules reproducible in tests.
 */
export function planWaveSpawns(world,count,random=Math.random) {
  for(let layout=0;layout<80;layout++) {
    const player={position:randomAirPoint(world,random),heading:random()*Math.PI*2};
    if(!hasDepartureClearance(world,player))continue;
    const enemies=[],playerNose=spawnForward(player);
    for(let i=0;i<count;i++) {
      let chosen=null;
      for(let attempt=0;attempt<220;attempt++) {
        const candidate={position:randomAirPoint(world,random),heading:random()*Math.PI*2};
        const toEnemy=candidate.position.clone().sub(player.position),distance=toEnemy.length();
        if(distance<SPAWN_RULES.playerGap||playerNose.dot(toEnemy.divideScalar(distance))>SPAWN_RULES.facingCos)continue;
        const nose=spawnForward(candidate);
        if(nose.dot(toEnemy.negate())>SPAWN_RULES.facingCos)continue;
        if(enemies.some(other=>{
          const offset=other.position.clone().sub(candidate.position),gap=offset.length();
          if(gap<SPAWN_RULES.enemyGap)return true;
          offset.divideScalar(gap);
          return nose.dot(offset)>SPAWN_RULES.enemyFacingCos||spawnForward(other).dot(offset.negate())>SPAWN_RULES.enemyFacingCos;
        }))continue;
        if(!hasDepartureClearance(world,candidate))continue;
        chosen=candidate;break;
      }
      if(!chosen)break;
      enemies.push(chosen);
    }
    if(enemies.length===count)return {player,enemies};
  }
  throw new Error('Unable to arrange separated, clear spawns. Please try launching again.');
}
