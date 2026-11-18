import * as THREE from 'three';
import { createFlightState, updateFlight, flightConfig } from './flight.js';
import { resolveSceneryContact } from './scenery-collision.js';
import { crossesRing } from './modes.js';

const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

/** A simple autopilot that flies a ring course with the real flight model and
 * scenery contact, using only player inputs (turn, pitch, boost, airbrake,
 * throttle). Tests use it to prove every generated course can be completed and
 * that medal par times are reachable.
 */
export function flyCourse(world, course, { throttle = .5, limit = Math.max(40, course.length / 2.5), boost = true } = {}) {
  const player = createFlightState(world.spawn);
  player.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), world.heading);
  player.throttle = player.engineThrottle = throttle;
  const input = { pitch: 0, roll: 0, yaw: 0, boost: false, brake: false, sensitivity: 1 };
  const previous = new THREE.Vector3(), attitude = new THREE.Euler(0, 0, 0, 'YXZ');
  const dt = 1 / 120;
  let index = 0, time = 0, extend = 0;
  while (index < course.rings.length && time < limit) {
    const ring = course.rings[index];
    const distance = ring.position.distanceTo(player.position);
    const aim = ring.position.clone().addScaledVector(ring.normal, -Math.min(2.5, distance * .3));
    const direction = aim.sub(player.position).normalize();
    attitude.setFromQuaternion(player.quaternion, 'YXZ');
    const yawError = wrap(Math.atan2(-direction.x, -direction.z) - attitude.y);
    const radius = player.speed / flightConfig.yawSpeed;
    // A ring inside the turning circle cannot be reached by turning: extend, then come back.
    if (extend <= 0 && Math.abs(yawError) > 1 && distance < radius * 1.6) extend = .9;
    extend -= dt;
    input.roll = extend > 0 ? 0 : THREE.MathUtils.clamp(yawError * 3, -1, 1);
    input.pitch = THREE.MathUtils.clamp((Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1)) - attitude.x) * 4, -1, 1);
    input.boost = boost && Math.abs(yawError) < .2 && extend <= 0;
    input.brake = extend <= 0 && Math.abs(yawError) > .7;
    player.throttle = Math.abs(yawError) > .4 ? .35 : throttle;
    previous.copy(player.position);
    updateFlight(player, input, dt);
    resolveSceneryContact(world, player, previous);
    if (crossesRing(previous, player.position, ring)) { index++; extend = 0; }
    time += dt;
  }
  return { finished: index >= course.rings.length, time, rings: index };
}

/** Course validator: cruise run first, then a slower, tighter-turning run. */
export function validateCourse(world, course) {
  const cruise = flyCourse(world, course);
  if (cruise.finished) return cruise;
  const careful = flyCourse(world, course, { throttle: .3 });
  return careful.finished ? { ...careful, time: careful.time * .85 } : careful;
}
