import * as THREE from 'three';
import { PLAYER_CORE_RADIUS } from './maps.js';

const sphere = new THREE.Sphere(new THREE.Vector3(),PLAYER_CORE_RADIUS);
const step = new THREE.Vector3(), position = new THREE.Vector3(), before = new THREE.Vector3();
const closest = new THREE.Vector3(), normal = new THREE.Vector3(), planeNormal = new THREE.Vector3();
const candidates = [];

/** Small center core, tested against actual surfaces rather than furniture boxes.
 * Contact only separates/slides the aircraft. Health, speed, heading, throttle
 * and momentum stay intact; no damage, bounce, sound, shake or spawn reset.
 */
export function resolveSceneryContact(world,state,previous) {
  const radius = PLAYER_CORE_RADIUS;
  step.copy(state.position).sub(previous);
  const steps = Math.max(1,Math.ceil(step.length()/(radius*.7)));
  step.divideScalar(steps); position.copy(previous);
  for(let i=0;i<steps;i++) {
    before.copy(position); position.add(step);
    for(let pass=0;pass<3;pass++) {
      sphere.center.copy(position); candidates.length=0;
      world.surfaceTree.getSphereTriangles(sphere,candidates);
      let nearest=null,nearestDistance=radius;
      for(const triangle of candidates) {
        triangle.closestPointToPoint(position,closest);
        const distance=position.distanceTo(closest);
        if(distance<nearestDistance){nearest=triangle;nearestDistance=distance;}
      }
      if(nearest) {
        // Resolve the nearest surface first: adjacent triangle edges must not
        // nudge the aircraft sideways when a flat face already covers the point.
        nearest.closestPointToPoint(position,closest);
        normal.copy(position).sub(closest);
        nearest.getNormal(planeNormal);
        const priorSide=planeNormal.dot(before)-planeNormal.dot(nearest.a);
        const side=planeNormal.dot(position)-planeNormal.dot(nearest.a);
        if(priorSide*side<0) {
          // Stay on the approached side even when crossing a paper-thin surface.
          normal.copy(planeNormal).multiplyScalar(priorSide<0?-1:1);
          position.addScaledVector(normal,radius+Math.abs(side)+.0001);
        } else {
          if(nearestDistance>.000001)normal.divideScalar(nearestDistance);
          else normal.copy(planeNormal).multiplyScalar(priorSide<0?-1:1);
          position.addScaledVector(normal,radius-nearestDistance+.0001);
        }
      }
      if(!nearest)break;
    }
    for(const axis of ['x','y','z'])position[axis]=THREE.MathUtils.clamp(position[axis],world.bounds.min[axis]+radius,world.bounds.max[axis]-radius);
  }
  state.position.copy(position);
}
