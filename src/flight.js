import * as THREE from 'three';

export const FLIGHT = Object.freeze({ minSpeed: 4.5, cruiseSpeed: 8.5, boostSpeed: 19, maxHealth: 100 });
export const CONTROL = Object.freeze({ pitchRate: 2.1, rollRate: 3.8, yawRate: 1.2, response: 14 });
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const turn = new THREE.Quaternion();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const desiredVelocity = new THREE.Vector3();
export function steeringCurve(value, deadzone = .025) {
  const magnitude = Math.min(1, Math.max(0, (Math.abs(value) - deadzone) / (1 - deadzone)));
  return Math.sign(value) * magnitude ** 1.1;
}

export function createFlightState(position = new THREE.Vector3(-10, 16, 42)) {
  return {
    position: position.clone(), quaternion: new THREE.Quaternion(),
    velocity: new THREE.Vector3(0, 0, -FLIGHT.cruiseSpeed),
    angular: new THREE.Vector3(), speed: FLIGHT.cruiseSpeed,
    health: FLIGHT.maxHealth, invulnerable: 0,
  };
}

/** Local aircraft axes: +X right, +Y up, -Z nose. dt is capped/substepped by the game loop. */
export function updateFlight(state, input, dt) {
  if (dt <= 0) return;
  // Direct angular-rate control, with no attitude limits or horizon correction.
  // Centering the cursor stops rotation; it never rolls the wings back to level.
  const response = 1 - Math.exp(-CONTROL.response * dt);
  state.angular.x = THREE.MathUtils.lerp(state.angular.x, input.pitch * CONTROL.pitchRate, response);
  state.angular.z = THREE.MathUtils.lerp(state.angular.z, input.roll * CONTROL.rollRate, response);
  state.angular.y = THREE.MathUtils.lerp(state.angular.y, input.yaw * CONTROL.yawRate, response);
  state.quaternion.multiply(turn.setFromAxisAngle(X, state.angular.x * dt));
  state.quaternion.multiply(turn.setFromAxisAngle(Z, state.angular.z * dt));
  state.quaternion.multiply(turn.setFromAxisAngle(Y, state.angular.y * dt));

  // Coordinated banking adds a gentle world-space turn. Inertia lags the nose.
  right.copy(X).applyQuaternion(state.quaternion);
  up.copy(Y).applyQuaternion(state.quaternion);
  const bankTurn = THREE.MathUtils.clamp(right.y, -1, 1) * 0.75 * Math.max(0, up.y);
  state.quaternion.premultiply(turn.setFromAxisAngle(Y, bankTurn * dt)).normalize();
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
