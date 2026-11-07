import * as THREE from 'three';

// Same steering model as the supplied example. Speeds use this room's normalized
// world units: 8.5 preserves the existing ~58 cm/s cruise instead of crossing the
// entire room in two seconds at 50 world units/s.
export const flightConfig = Object.freeze({
  forwardSpeed: 8.5,
  pitchSpeed: 1.5,
  rollSpeed: 2.0,
  yawSpeed: 1.0,
  autoLevelSpeed: 3.5,
  maxRoll: .6,
  maxPitch: .4,
  minSpeed: 4.5,
  boostSpeed: 19,
});
export const FLIGHT = Object.freeze({ minSpeed: flightConfig.minSpeed, cruiseSpeed: flightConfig.forwardSpeed, boostSpeed: flightConfig.boostSpeed, maxHealth: 100 });
const forward = new THREE.Vector3();
const desiredVelocity = new THREE.Vector3();
const attitude = new THREE.Euler(0, 0, 0, 'YXZ');
export function steeringCurve(value, deadzone = .025) {
  const magnitude = Math.min(1, Math.max(0, (Math.abs(value) - deadzone) / (1 - deadzone)));
  return Math.sign(value) * magnitude ** 1.1;
}

export function createFlightState(position = new THREE.Vector3(-10, 16, 42)) {
  return {
    position: position.clone(), quaternion: new THREE.Quaternion(),
    velocity: new THREE.Vector3(0, 0, -FLIGHT.cruiseSpeed),
    angular: new THREE.Vector3(), speed: FLIGHT.cruiseSpeed,
    currentPitch: 0, currentRoll: 0,
    health: FLIGHT.maxHealth, invulnerable: 0,
  };
}

/** Local aircraft axes: +X right, +Y up, -Z nose. dt is capped/substepped by the game loop. */
export function updateFlight(state, input, dt) {
  if (dt <= 0) return;
  // Recover the heading from the actual orientation, including collision bounces.
  // YXZ keeps heading independent of absolute pitch/bank; the pitch cap keeps it
  // away from the singularity. Never mix incremental Euler rotations and setters.
  attitude.setFromQuaternion(state.quaternion, 'YXZ');
  const oldPitch = attitude.x, oldRoll = attitude.z;
  const leveling = Math.exp(-flightConfig.autoLevelSpeed * dt);
  state.currentPitch = THREE.MathUtils.clamp(
    Math.abs(input.pitch) > 1e-4 ? oldPitch + input.pitch * flightConfig.pitchSpeed * dt : oldPitch * leveling,
    -flightConfig.maxPitch, flightConfig.maxPitch);
  state.currentRoll = THREE.MathUtils.clamp(
    Math.abs(input.roll) > 1e-4 ? oldRoll + input.roll * flightConfig.rollSpeed * dt : oldRoll * leveling,
    -flightConfig.maxRoll, flightConfig.maxRoll);
  // Bank into a turn automatically; Q/E add independent rudder adjustments.
  const yawRate = (state.currentRoll + input.yaw) * flightConfig.yawSpeed;
  attitude.set(state.currentPitch, attitude.y + yawRate * dt, state.currentRoll, 'YXZ');
  state.quaternion.setFromEuler(attitude).normalize();
  state.angular.set((state.currentPitch - oldPitch) / dt, yawRate, (state.currentRoll - oldRoll) / dt);
  // Keep the original acceleration, braking, minimum airspeed and velocity drift.
  const targetSpeed = input.brake ? FLIGHT.minSpeed : input.boost ? FLIGHT.boostSpeed : FLIGHT.cruiseSpeed;
  state.speed = THREE.MathUtils.lerp(state.speed, targetSpeed, 1 - Math.exp(-1.8 * dt));
  state.speed = THREE.MathUtils.clamp(state.speed, FLIGHT.minSpeed, FLIGHT.boostSpeed);
  forward.set(0, 0, -1).applyQuaternion(state.quaternion);
  desiredVelocity.copy(forward).multiplyScalar(state.speed);
  state.velocity.lerp(desiredVelocity, 1 - Math.exp(-3.2 * dt));
  // Guarantee minimum airspeed even during a hard reversal, without removing drift.
  if (state.velocity.lengthSq() < FLIGHT.minSpeed ** 2) {
    if (state.velocity.lengthSq() < 1e-8) state.velocity.copy(forward);
    state.velocity.setLength(FLIGHT.minSpeed);
  }
  state.position.addScaledVector(state.velocity, dt);
  state.invulnerable = Math.max(0, state.invulnerable - dt);
}

export function forwardVector(state, target = new THREE.Vector3()) {
  return target.set(0, 0, -1).applyQuaternion(state.quaternion);
}

/** Box3 swept broad phase plus ray/expanded-box test prevents fast bullets tunneling. */
export function segmentHitsBox(start, end, box, radius = 0) {
  const expanded = box.clone().expandByScalar(radius);
  if (expanded.containsPoint(start)) return true;
  const delta = end.clone().sub(start);
  const length = delta.length();
  if (length < 1e-8) return expanded.containsPoint(end);
  const hit = new THREE.Ray(start, delta.divideScalar(length)).intersectBox(expanded, new THREE.Vector3());
  return hit !== null && start.distanceToSquared(hit) <= length * length;
}
