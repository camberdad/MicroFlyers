import * as THREE from 'three';
import { forwardVector } from './flight.js';

export const $ = id => document.getElementById(id);
const projected = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const delta = new THREE.Vector3();
const radar = $('radar').getContext('2d');
let noticeTimeout, hitTimeout;

export function notify(message, duration = 2000) {
  $('notification').textContent = message;
  clearTimeout(noticeTimeout); noticeTimeout = setTimeout(() => { $('notification').textContent = ''; }, duration);
}
export function hitMarker() {
  $('hit-marker').classList.remove('hidden');
  clearTimeout(hitTimeout); hitTimeout = setTimeout(() => $('hit-marker').classList.add('hidden'), 110);
}
export function flashDamage() {
  $('damage-flash').style.opacity = '.7';
  setTimeout(() => { $('damage-flash').style.opacity = '0'; }, 160);
}
export function updateHUD(state, combat, camera, input, world, elapsed) {
  $('speed').textContent = String(Math.round(state.velocity.length() / world.scale)).padStart(3, '0');
  $('speed-bar').style.width = `${state.speed / 19 * 100}%`;
  $('altitude').innerHTML = `${(state.position.y / world.scale / 100).toFixed(1)}<small> M</small>`;
  $('flight-mode').textContent = input.brake ? 'AIRBRAKE' : input.boost ? 'AFTERBURNER' : 'CRUISE';
  $('health-label').textContent = `${Math.ceil(state.health)}%`;
  $('health-bar').style.width = `${state.health}%`;
  $('health-bar').style.background = state.health < 35 ? '#ff9773' : 'var(--acid)';
  $('hull-detail').textContent = state.health < 35 ? 'AIRFRAME CRITICAL' : state.invulnerable > 0 ? 'RECOVERING' : 'SYSTEMS NOMINAL';
  $('kills').textContent = String(combat.kills).padStart(2, '0');
  $('timer').textContent = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(Math.floor(elapsed % 60)).padStart(2, '0')}`;
  [...$('mission-progress').children].forEach((el, i) => el.classList.toggle('done', i < combat.kills));
  const locked = combat.getMissileTarget(state);
  $('missile-status').textContent = combat.missileCooldown > 0 ? `REARM ${combat.missileCooldown.toFixed(1)}s` : locked ? 'LOCK READY' : 'SEARCHING';

  // Project the actual gun line; screen center alone would miss due to chase-camera parallax.
  forwardVector(state, forward);
  projected.copy(state.position).addScaledVector(forward, 30).project(camera);
  $('reticle').style.left = `${(projected.x * .5 + .5) * 100}%`;
  $('reticle').style.top = `${(-projected.y * .5 + .5) * 100}%`;
  $('reticle').classList.toggle('hidden', projected.z > 1 || projected.z < -1);
  let best = null, bestScore = -1;
  for (const drone of combat.drones) {
    if (!drone.alive) continue;
    delta.copy(drone.mesh.position).sub(state.position);
    const score = delta.clone().normalize().dot(forward);
    if (score > bestScore) { bestScore = score; best = drone; }
  }
  const marker = $('target-marker');
  if (locked) best = locked;
  marker.classList.toggle('locked', Boolean(locked));
  marker.classList.add('hidden');
  if (best && bestScore > .15) {
    projected.copy(best.mesh.position).project(camera);
    if (Math.abs(projected.x) < .92 && Math.abs(projected.y) < .82 && projected.z > -1 && projected.z < 1) {
      marker.classList.remove('hidden'); marker.style.left = `${(projected.x * .5 + .5) * 100}%`; marker.style.top = `${(-projected.y * .5 + .5) * 100}%`;
      $('target-distance').textContent = `${locked ? 'LOCK' : 'DRONE'} ${Math.round(best.mesh.position.distanceTo(state.position) / world.scale)} CM`;
    }
  }
  drawRadar(state, combat);
}

function drawRadar(state, combat) {
  const c = radar, size = 240, mid = 120, radius = 105, range = 55;
  c.clearRect(0, 0, size, size);
  c.save(); c.translate(mid, mid);
  c.fillStyle = '#17292bc0'; c.beginPath(); c.arc(0, 0, radius, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#d7e6c333'; c.lineWidth = 1;
  for (const r of [radius / 2, radius]) { c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke(); }
  c.beginPath(); c.moveTo(-radius, 0); c.lineTo(radius, 0); c.moveTo(0, -radius); c.lineTo(0, radius); c.stroke();
  c.save(); c.beginPath(); c.arc(0, 0, radius - 2, 0, Math.PI * 2); c.clip();
  c.fillStyle = '#ddf48408'; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, radius, -Math.PI * .71, -Math.PI * .29); c.closePath(); c.fill();
  forward.set(0, 0, -1).applyQuaternion(state.quaternion); forward.y = 0;
  if (forward.lengthSq() < .001) forward.set(0, 0, -1); forward.normalize();
  right.set(-forward.z, 0, forward.x);
  for (const drone of combat.drones) {
    if (!drone.alive) continue;
    delta.copy(drone.mesh.position).sub(state.position);
    const x = delta.dot(right) / range * radius, y = -delta.dot(forward) / range * radius;
    c.fillStyle = '#ff9e78'; c.shadowColor = '#ff9e78'; c.shadowBlur = 8;
    c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill();
  }
  c.restore();
  c.fillStyle = '#ddf484'; c.beginPath(); c.moveTo(0, -8); c.lineTo(5, 6); c.lineTo(0, 3); c.lineTo(-5, 6); c.closePath(); c.fill();
  c.fillStyle = '#dbe4ce'; c.font = '12px sans-serif'; c.textAlign = 'center'; c.fillText('FWD', 0, -91);
  c.restore();
}
