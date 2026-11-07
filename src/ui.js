import * as THREE from 'three';
import { forwardVector } from './flight.js';
import { compassHeading,cardinalForHeading } from './hud-math.js';

export const $ = id => document.getElementById(id);
const projected = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const delta = new THREE.Vector3();
const radar = $('radar').getContext('2d');
let noticeTimeout, hitTimeout;
const contactMarkers = Array.from({length:8},()=>{
  const marker = document.createElement('div'); marker.className = 'contact-marker hidden';
  marker.appendChild(document.createElement('span')); $('contacts').appendChild(marker); return marker;
});

export function notify(message, duration = 2000, detail = '') {
  $('notification-title').textContent = message; $('notification-detail').textContent = detail;
  clearTimeout(noticeTimeout); noticeTimeout = setTimeout(() => {
    $('notification-title').textContent = ''; $('notification-detail').textContent = '';
  }, duration);
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
  $('flight-mode').textContent = input.brake ? 'AIRBRAKE' : state.engineThrottle>.85 ? 'AFTERBURNER' : state.throttle<.25 ? 'IDLE' : 'CRUISE';
  const healthPercent=state.health/(state.maxHealth??100)*100;
  $('health-label').textContent = `${Math.ceil(healthPercent)}%`;
  $('health-bar').style.width = `${healthPercent}%`;
  $('health-bar').style.background = healthPercent < 35 ? '#ff9773' : '#a8e4d7';
  $('hull-detail').textContent = healthPercent < 35 ? 'AIRFRAME CRITICAL' : state.invulnerable > 0 ? 'RECOVERING' : 'SYSTEMS NOMINAL';
  $('kills').textContent = String(combat.kills).padStart(2, '0');
  $('timer').textContent = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(Math.floor(elapsed % 60)).padStart(2, '0')}`;
  [...$('mission-progress').children].forEach((el, i) => el.classList.toggle('done', i < combat.kills));
  const locked = combat.getMissileTarget(state);
  const rearming = combat.missileCooldown > 0;
  $('missile-status').textContent = rearming ? `REARM ${combat.missileCooldown.toFixed(1)}s` : locked ? `BANDIT ${String(combat.drones.indexOf(locked)+1).padStart(2,'0')} · ${Math.round(locked.mesh.position.distanceTo(state.position)/world.scale)} CM` : 'KEEP A BANDIT AHEAD';
  $('seeker-state').textContent = rearming ? 'REARM' : locked ? 'LOCK' : 'SEARCH';
  $('seeker-detail').textContent = rearming ? 'Missile rack rearming…' : locked ? 'RIGHT CLICK · HOMING MISSILE READY' : 'Face a drone with a clear line of sight.';
  $('seeker-bar').style.width = `${rearming ? (1-combat.missileCooldown/1.8)*100 : locked ? 100 : 0}%`;
  if(combat.config.count===0){
    $('missile-status').textContent='FREE FLY · NO HOSTILES';
    $('seeker-state').textContent='SAFE';
    $('seeker-detail').textContent='Explore the room. Career adds enemy waves.';
  }
  $('bank-angle').textContent = `${Math.round(Math.abs(state.currentRoll)*180/Math.PI)}°`;
  $('throttle-value').textContent = `${Math.round(state.throttle*100)}%`;
  $('gun-status').textContent = input.fire ? 'FIRING' : 'READY';
  $('gun-activity').style.width = `${combat.gunActivity*100}%`;
  $('gun-hits').textContent = String(combat.gunHits);
  const living = combat.drones.filter(d=>d.alive).length;
  $('radar-contacts').textContent = `${String(living).padStart(2,'0')} CONTACTS`;
  $('radar-range').textContent = `±${Math.round(55/world.scale)} CM`;
  const incoming = combat.bullets.some(b=>b.hostile && b.mesh.position.distanceToSquared(state.position)<100 && b.velocity.dot(delta.copy(state.position).sub(b.mesh.position))>0);
  $('threat-alert').classList.toggle('hidden',!incoming);

  // Project the actual gun line; screen center alone would miss due to chase-camera parallax.
  forwardVector(state, forward);
  const heading = compassHeading(forward.x,forward.z);
  $('heading').textContent = `${String(Math.round(heading)%360).padStart(3,'0')}°`;
  $('heading-cardinal').textContent = cardinalForHeading(heading);
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
      $('target-distance').textContent = `BANDIT ${String(combat.drones.indexOf(best)+1).padStart(2,'0')} / ${Math.round(best.mesh.position.distanceTo(state.position) / world.scale)} CM`;
    }
  }
  contactMarkers.forEach(contact=>contact.classList.add('hidden'));
  combat.drones.forEach((drone,i)=>{
    const contact = contactMarkers[i]; contact.classList.add('hidden');
    if (!drone.alive || drone===best) return;
    projected.copy(drone.mesh.position).project(camera);
    if (Math.abs(projected.x)>.9 || Math.abs(projected.y)>.8 || projected.z<-1 || projected.z>1) return;
    contact.classList.remove('hidden');
    contact.style.left = `${(projected.x*.5+.5)*100}%`; contact.style.top = `${(-projected.y*.5+.5)*100}%`;
    contact.firstChild.textContent = `BANDIT ${String(i+1).padStart(2,'0')} / ${Math.round(drone.mesh.position.distanceTo(state.position)/world.scale)} CM`;
  });
  drawRadar(state,combat,locked,heading);
}

function drawRadar(state,combat,locked,heading) {
  const c = radar, size = c.canvas.width, mid = size/2, radius = size*.45, range = 55;
  c.clearRect(0, 0, size, size);
  c.save(); c.translate(mid, mid);
  c.fillStyle = '#03182055'; c.beginPath(); c.arc(0, 0, radius, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#9cd7cd55'; c.lineWidth = 1;
  for (const r of [radius / 2, radius]) { c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke(); }
  c.beginPath(); c.moveTo(-radius, 0); c.lineTo(radius, 0); c.moveTo(0, -radius); c.lineTo(0, radius); c.stroke();
  c.save(); c.beginPath(); c.arc(0, 0, radius - 2, 0, Math.PI * 2); c.clip();
  c.fillStyle = '#9fe2d80b'; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, radius, -Math.PI * .71, -Math.PI * .29); c.closePath(); c.fill();
  forward.set(0, 0, -1).applyQuaternion(state.quaternion); forward.y = 0;
  if (forward.lengthSq() < .001) forward.set(0, 0, -1); forward.normalize();
  right.set(-forward.z, 0, forward.x);
  for (const drone of combat.drones) {
    if (!drone.alive) continue;
    delta.copy(drone.mesh.position).sub(state.position);
    const x = delta.dot(right) / range * radius, y = -delta.dot(forward) / range * radius;
    c.fillStyle = drone===locked ? '#9fe2d8' : '#e8b286'; c.shadowColor = c.fillStyle; c.shadowBlur = 6;
    c.save(); c.translate(x,y); c.rotate(Math.PI/4); c.fillRect(-3,-3,6,6); c.restore();
    if (drone===locked) { c.strokeStyle = '#9fe2d8'; c.strokeRect(x-8,y-8,16,16); }
  }
  c.restore();
  c.fillStyle = '#d6f2e8'; c.beginPath(); c.moveTo(0,-8); c.lineTo(5,6); c.lineTo(0,3); c.lineTo(-5,6); c.closePath(); c.fill();
  c.fillStyle = '#bad7cb'; c.font = '14px sans-serif'; c.textAlign = 'center';
  for (const [label,angle] of [['N',0],['E',90],['S',180],['W',270]]) {
    const a = (angle-heading)*Math.PI/180;
    c.fillText(label,Math.sin(a)*(radius-16),-Math.cos(a)*(radius-16)+5);
  }
  c.restore();
}
