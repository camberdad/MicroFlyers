import * as THREE from 'three';

// Independent implementation of Toyborne-style Arrow controls, scaled to our room.
// Turn input controls heading directly; bank is the visual response to that turn.
export const flightConfig = Object.freeze({
  forwardSpeed: 5.95,
  pitchSpeed: 1.04,
  rollSpeed: 2.4,
  yawSpeed: 1.2,
  inputResponse: 8,
  releaseResponse: 12,
  bankResponse: 6,
  bankGravity: 3.3,
  maxRoll: Math.PI*85/180,
  maxPitch: Math.PI*78/180,
  throttleUpRate: .7,
  throttleDownRate: .8,
  engineResponse: 3,
  minSpeed: 3.15,
  boostSpeed: 13.3,
});
export const FLIGHT = Object.freeze({ minSpeed: flightConfig.minSpeed, cruiseSpeed: flightConfig.forwardSpeed, boostSpeed: flightConfig.boostSpeed, maxHealth: 100 });
const forward = new THREE.Vector3();
const desiredVelocity = new THREE.Vector3();
const attitude = new THREE.Euler(0, 0, 0, 'YXZ');

export function createFlightState(position = new THREE.Vector3(-10, 16, 42)) {
  return {
    position: position.clone(), quaternion: new THREE.Quaternion(),
    velocity: new THREE.Vector3(0, 0, -FLIGHT.cruiseSpeed),
    angular: new THREE.Vector3(), speed: FLIGHT.cruiseSpeed,
    currentPitch: 0, currentRoll: 0,
    pitchControl:0, turnControl:0, throttle:.5, engineThrottle:.5,
    health: FLIGHT.maxHealth, invulnerable: 0,
  };
}

export function throttleToSpeed(throttle) {
  const value = THREE.MathUtils.clamp(throttle,0,1);
  return value <= .5 ? THREE.MathUtils.lerp(FLIGHT.minSpeed,FLIGHT.cruiseSpeed,value*2)
    : THREE.MathUtils.lerp(FLIGHT.cruiseSpeed,FLIGHT.boostSpeed,(value-.5)*2);
}

export function adjustThrottle(state,amount) {
  if (Number.isFinite(amount)) state.throttle = THREE.MathUtils.clamp(state.throttle+amount,0,1);
}

/** Local axes: +X right, +Y up, -Z nose. The game loop caps/substeps dt. */
export function updateFlight(state, input, dt) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const sensitivity = THREE.MathUtils.clamp(input.sensitivity ?? 1,.5,1.5);
  const pitchInput = THREE.MathUtils.clamp(input.pitch,-1,1);
  const turnInput = THREE.MathUtils.clamp(input.roll+input.yaw*.45,-1,1);
  state.pitchControl = THREE.MathUtils.lerp(state.pitchControl,pitchInput,1-Math.exp(-(pitchInput ? flightConfig.inputResponse : flightConfig.releaseResponse)*dt));
  state.turnControl = THREE.MathUtils.lerp(state.turnControl,turnInput,1-Math.exp(-(turnInput ? flightConfig.inputResponse : flightConfig.releaseResponse)*dt));
  attitude.setFromQuaternion(state.quaternion, 'YXZ');
  const oldPitch = attitude.x, oldRoll = attitude.z;
  // Like Arrow mode, releasing pitch holds the selected nose attitude. Releasing
  // turn input stops heading change and returns only the wings to level.
  state.currentPitch = THREE.MathUtils.clamp(oldPitch+state.pitchControl*flightConfig.pitchSpeed*sensitivity*dt,-flightConfig.maxPitch,flightConfig.maxPitch);
  const yawRate = state.turnControl*flightConfig.yawSpeed*sensitivity;
  const desiredBank = THREE.MathUtils.clamp(Math.atan2(state.speed*yawRate,flightConfig.bankGravity),-flightConfig.maxRoll,flightConfig.maxRoll);
  const bankStep = (desiredBank-oldRoll)*(1-Math.exp(-flightConfig.bankResponse*dt));
  state.currentRoll = oldRoll+THREE.MathUtils.clamp(bankStep,-flightConfig.rollSpeed*sensitivity*dt,flightConfig.rollSpeed*sensitivity*dt);
  attitude.set(state.currentPitch, attitude.y + yawRate * dt, state.currentRoll, 'YXZ');
  state.quaternion.setFromEuler(attitude).normalize();
  state.angular.set((state.currentPitch - oldPitch) / dt, yawRate, (state.currentRoll - oldRoll) / dt);
  // Persistent throttle lever with engine spool. Space raises it, Shift lowers
  // it and deploys the airbrake. The lever stays where it was on key release.
  adjustThrottle(state,((input.boost?flightConfig.throttleUpRate:0)-(input.brake?flightConfig.throttleDownRate:0))*dt);
  state.engineThrottle = THREE.MathUtils.lerp(state.engineThrottle,state.throttle,1-Math.exp(-flightConfig.engineResponse*dt));
  const targetSpeed = input.brake ? FLIGHT.minSpeed : throttleToSpeed(state.engineThrottle);
  state.speed = THREE.MathUtils.lerp(state.speed,targetSpeed,1-Math.exp(-(input.brake?4:1.8)*dt));
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
