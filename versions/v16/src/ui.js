import * as THREE from 'three';
import { forwardVector, FLIGHT } from './flight.js';
import { compassHeading,cardinalForHeading,enemyIndicator,spreadEdgeIndicators } from './hud-math.js';

export const $ = id => document.getElementById(id);
const projected = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const delta = new THREE.Vector3();
const cameraPoint = new THREE.Vector3();
const radar = $('radar').getContext('2d');
let noticeTimeout, hitTimeout;
// Marker pools grow on demand: Survival and Blitz can field more than eight contacts.
const contactPool = [], directionPool = [];
function contactMarker(i) {
  while (contactPool.length <= i) {
    const marker = document.createElement('div'); marker.className = 'contact-marker hidden';
    marker.appendChild(document.createElement('span')); $('contacts').appendChild(marker); contactPool.push(marker);
  }
  return contactPool[i];
}
function directionMarker(i) {
  while (directionPool.length <= i) {
    const marker=document.createElement('div');marker.className='enemy-direction hidden';
    const arrow=document.createElement('i');arrow.textContent='➤';
    const label=document.createElement('span');const rear=document.createElement('small');
    marker.append(arrow,label,rear);$('enemy-directions').appendChild(marker);directionPool.push(marker);
  }
  return directionPool[i];
}
for (let i = 0; i < 8; i++) { contactMarker(i); directionMarker(i); }
const objective = document.createElement('div'); objective.className = 'objective-marker hidden';
objective.append(document.createElement('i'), document.createElement('span')); $('hud').appendChild(objective);
const objectiveArrow = document.createElement('div'); objectiveArrow.className = 'enemy-direction objective-direction hidden';
objectiveArrow.append(Object.assign(document.createElement('i'), {textContent:'➤'}), document.createElement('span'), document.createElement('small'));
$('enemy-directions').appendChild(objectiveArrow);
const MAX_EDGE_ARROWS = 6;

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
export function updateHUD(state, combat, camera, input, world, elapsed, extra = {}) {
  $('speed').textContent = String(Math.round(state.velocity.length() / world.scale)).padStart(3, '0');
  $('speed-bar').style.width = `${state.speed / FLIGHT.boostSpeed * 100}%`;
  $('altitude').innerHTML = `${(state.position.y / world.scale / 100).toFixed(1)}<small> M</small>`;
  $('flight-mode').textContent = input.brake ? 'AIRBRAKE' : state.boosting ? 'ROCKET BOOST' : state.engineThrottle>.85 ? 'HIGH THROTTLE' : state.throttle<.25 ? 'IDLE' : 'CRUISE';
  const healthPercent=state.health/(state.maxHealth??100)*100;
  $('health-label').textContent = `${Math.ceil(healthPercent)}%`;
  $('health-bar').style.width = `${healthPercent}%`;
  $('health-bar').style.background = healthPercent < 35 ? '#ff9773' : '#a8e4d7';
  $('hull-detail').textContent = healthPercent < 35 ? 'AIRFRAME CRITICAL' : state.invulnerable > 0 ? 'RECOVERING' : 'SYSTEMS NOMINAL';
  $('kills').textContent = String(combat.kills).padStart(2, '0');
  const clock = extra.clock ?? elapsed;
  $('timer').textContent = extra.clockText ?? `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(Math.floor(clock % 60)).padStart(2, '0')}`;
  $('timer').classList.toggle('urgent', Boolean(extra.urgent));
  [...$('mission-progress').children].forEach((el, i) => el.classList.toggle('done', i < combat.kills));
  const locked = combat.getMissileTarget(state);
  const rearming = combat.missileCooldown > 0;
  const targetWord = locked?.balloon ? 'TARGET' : 'BANDIT';
  $('missile-status').textContent = rearming ? `REARM ${combat.missileCooldown.toFixed(1)}s` : locked ? `${targetWord} ${String(combat.drones.indexOf(locked)+1).padStart(2,'0')} · ${Math.round(locked.mesh.position.distanceTo(state.position)/world.scale)} CM` : 'KEEP A BANDIT AHEAD';
  $('seeker-state').textContent = rearming ? 'REARM' : locked ? 'LOCK' : 'SEARCH';
  $('seeker-detail').textContent = rearming ? 'Missile rack rearming…' : locked ? 'RIGHT CLICK · HOMING MISSILE READY' : 'Face a drone with a clear line of sight.';
  $('seeker-bar').style.width = `${rearming ? (1-combat.missileCooldown/(combat.loadout.missileCooldown||1.8))*100 : locked ? 100 : 0}%`;
  if(extra.idle){
    $('missile-status').textContent=extra.idle.status;
    $('seeker-state').textContent=extra.idle.state;
    $('seeker-detail').textContent=extra.idle.detail;
  }
  const boss = combat.drones.find(d=>d.alive&&d.stats?.boss);
  $('boss-bar').classList.toggle('hidden',!boss);
  if(boss){$('boss-health').style.width=`${boss.health/boss.maxHealth*100}%`;$('boss-label').textContent=`ACE · ${Math.ceil(boss.health)} / ${boss.maxHealth}`;}
  const powers=[];
  if(combat.powerups.rapid>0)powers.push(`RAPID ${combat.powerups.rapid.toFixed(0)}s`);
  if(combat.powerups.spread>0)powers.push(`TRIPLE ${combat.powerups.spread.toFixed(0)}s`);
  if(state.shield>0)powers.push(`SHIELD ${state.shield.toFixed(0)}s`);
  $('powerup-status').textContent=powers.join(' · ');
  $('powerup-status').classList.toggle('hidden',!powers.length);
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
  const marker = $('target-marker');
  marker.classList.toggle('locked', Boolean(locked));
  marker.classList.add('hidden');
  contactPool.forEach(contact=>contact.classList.add('hidden'));
  directionPool.forEach(contact=>contact.classList.add('hidden'));
  const width=innerWidth,height=innerHeight;let edges=[];
  combat.drones.forEach((drone,i)=>{
    if(!drone.alive)return;
    cameraPoint.copy(drone.mesh.position).applyMatrix4(camera.matrixWorldInverse);
    const position=enemyIndicator(cameraPoint,{width,height,fov:camera.fov,near:camera.near,far:camera.far});
    const id=String(i+1).padStart(2,'0'),distance=Math.round(drone.mesh.position.distanceTo(state.position)/world.scale);
    if(position.onScreen){
      const contact=drone===locked?marker:contactMarker(i);
      contact.classList.toggle('balloon',Boolean(drone.balloon));contact.classList.toggle('boss',Boolean(drone.stats?.boss));
      contact.classList.remove('hidden');contact.style.left=`${position.x}px`;contact.style.top=`${position.y}px`;
      // Keep text readable at the viewport edges while the ring stays on target.
      const label=contact.querySelector('span');
      label.textContent=drone.balloon?`${drone.spec.points} PTS · ${distance} CM`:`${drone===locked?'BANDIT':drone.stats?.boss?'ACE':'CONTACT'} ${id} · ${distance} CM`;
      label.style.marginLeft=`${Math.max(90-position.x,Math.min(0,width-90-position.x))}px`;
      label.style.top=position.y<32?'calc(100% + 8px)':'-24px';
      if(drone===locked){
        const status=$('target-lock-state');status.textContent=rearming?'TRACKING · REARMING':'LOCKED · RMB FIRE';
        status.style.top=position.y>height-95?'-46px':position.y<32?'calc(100% + 30px)':'calc(100% + 7px)';
      }
    }else edges.push({...position,index:i,id,distance,locked:drone===locked});
  });
  if(edges.length>MAX_EDGE_ARROWS)edges=edges.sort((a,b)=>a.distance-b.distance).slice(0,MAX_EDGE_ARROWS);
  updateObjective(extra.objective,camera,state,world,width,height,edges);
  for(const position of spreadEdgeIndicators(edges,width,height)){
    if(position.objective)continue;
    const arrow=directionMarker(position.index);arrow.classList.remove('hidden');
    arrow.classList.toggle('locked',position.locked);arrow.dataset.edge=position.edge;
    arrow.style.left=`${position.x}px`;arrow.style.top=`${position.y}px`;
    arrow.children[0].style.transform=`rotate(${position.angle}rad)`;
    arrow.children[1].textContent=`${position.locked?(rearming?'TRACK ':'LOCK '):''}${position.id} · ${position.distance} CM`;
    arrow.children[2].textContent=position.behind?'BEHIND':'';
  }
  drawRadar(state,combat,locked,heading,extra.objective?.position);
}

/** Ring Race waypoint: a diamond on screen, or an edge arrow when off screen. */
function updateObjective(target,camera,state,world,width,height,edges) {
  objective.classList.add('hidden');objectiveArrow.classList.add('hidden');
  if(!target)return;
  cameraPoint.copy(target.position).applyMatrix4(camera.matrixWorldInverse);
  const position=enemyIndicator(cameraPoint,{width,height,fov:camera.fov,near:camera.near,far:camera.far});
  const distance=Math.round(target.position.distanceTo(state.position)/world.scale);
  if(position.onScreen){
    objective.classList.remove('hidden');objective.style.left=`${position.x}px`;objective.style.top=`${position.y}px`;
    objective.children[1].textContent=`${target.label} · ${distance} CM`;
  }else{
    const [spread]=spreadEdgeIndicators([{...position,objective:true}],width,height);
    objectiveArrow.classList.remove('hidden');objectiveArrow.dataset.edge=spread.edge;
    objectiveArrow.style.left=`${spread.x}px`;objectiveArrow.style.top=`${spread.y}px`;
    objectiveArrow.children[0].style.transform=`rotate(${spread.angle}rad)`;
    objectiveArrow.children[1].textContent=`${target.label} · ${distance} CM`;
    objectiveArrow.children[2].textContent=spread.behind?'BEHIND':'';
  }
}

function drawRadar(state,combat,locked,heading,objectivePoint) {
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
    c.fillStyle = drone===locked ? '#9fe2d8' : drone.balloon ? `#${drone.spec.color.toString(16).padStart(6,'0')}` : drone.stats?.boss ? '#ffd34d' : '#e8b286'; c.shadowColor = c.fillStyle; c.shadowBlur = 6;
    c.save(); c.translate(x,y); c.rotate(Math.PI/4); c.fillRect(-3,-3,6,6); c.restore();
    if (drone===locked) { c.strokeStyle = '#9fe2d8'; c.strokeRect(x-8,y-8,16,16); }
  }
  if (objectivePoint) {
    delta.copy(objectivePoint).sub(state.position);
    let x = delta.dot(right) / range * radius, y = -delta.dot(forward) / range * radius;
    const length = Math.hypot(x, y); if (length > radius - 6) { x *= (radius - 6) / length; y *= (radius - 6) / length; }
    c.strokeStyle = '#ddf484'; c.lineWidth = 2; c.shadowColor = '#ddf484'; c.shadowBlur = 8;
    c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.stroke();
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
