import * as THREE from 'three';
import { initWorld, loadAirfield, isSafePosition } from './world.js';
import { createJet } from './aircraft.js';
import { createFlightState, updateFlight, forwardVector,adjustThrottle } from './flight.js';
import { readKeyboardFlight } from './input.js';
import { Combat } from './combat.js';
import { AudioEngine } from './audio.js';
import { $, updateHUD, notify, hitMarker, flashDamage } from './ui.js';
import { LiveUpdates } from './updates.js';
import { MAPS, PLAYER_CORE_RADIUS } from './maps.js';
import { resolveSceneryContact } from './scenery-collision.js';
import { Career, roundConfig, loadoutFor, upgradeCost, MAX_UPGRADE } from './career.js';

let careerStorage;
try{careerStorage=localStorage;}catch{/* Embedded play still works without storage. */}
const career = new Career(careerStorage);
let selectedMode='free', sortie=null, shopPreviousMode=null;

let scene, camera, renderer, aircraft, world, combat;
let player = createFlightState();
let mode = 'loading', helpPreviousMode = null, elapsed = 0, previousTime = 0;
let mouseFire = false, missileRequested = false;
let hudAccumulator = 0, simulationTime = 0, missionPending = false;
const airfields = new Map();
let switchingMap = false;
const keys = new Set();
const audio = new AudioEngine();
const updates = new LiveUpdates(returnToHangar);
const controlSettings = {pitchStyle:'beginner',sensitivity:1};
try {
  const saved = JSON.parse(localStorage.getItem('microflyers.controls.v7')||'null');
  if (saved) {
    controlSettings.pitchStyle = saved.pitchStyle==='flight' ? 'flight' : 'beginner';
    controlSettings.sensitivity = THREE.MathUtils.clamp(Number(saved.sensitivity)||1,.5,1.5);
  }
} catch { /* Embedded/offline play does not require storage. */ }
const input = { pitch: 0, roll: 0, yaw: 0, boost: false, brake: false, fire: false };
const forward = new THREE.Vector3(), cameraDesired = new THREE.Vector3(), cameraTarget = new THREE.Vector3();
const cameraUp = new THREE.Vector3(), cameraRotation = new THREE.Matrix4(), cameraOrientation = new THREE.Quaternion();
const previousPosition = new THREE.Vector3();
const cameraRay = new THREE.Ray(), intersection = new THREE.Vector3();

/** PHASE 1 — scene, renderer, input, and UI. No model assumptions here. */
async function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(61, innerWidth / innerHeight, .05, 230);
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.domElement.setAttribute('aria-label', 'MicroFlyers flight view');
  renderer.domElement.setAttribute('tabindex', '0');
  $('scene').appendChild(renderer.domElement);
  initWorld(scene, renderer);
  aircraft = createJet(); scene.add(aircraft);
  bindEvents();
  camera.position.set(-20, 16, 42); camera.lookAt(8, 10, -15);

  /** PHASE 2 — load the selected map, normalize scale, build static colliders. */
  world = await loadAirfield(scene, progress => { $('load-label').textContent = `Loading airfield · ${Math.round(progress * 100)}%`; });
  if (!isSafePosition(world, world.spawn, PLAYER_CORE_RADIUS)) throw new Error('No clear launch position found in this airfield.');
  airfields.set('living',world);
  combat = new Combat(scene, world, {
    shot: () => audio.tone(720, .075, 'triangle', .22),
    missileShot: () => { audio.tone(150, .3, 'sawtooth', .4); notify('MISSILE AWAY',1300,'Homing missile tracking the locked bandit.'); },
    weaponNotice: message => notify(message.startsWith('NO MISSILE') ? 'NO LOCK' : 'REARMING',1200,message),
    hit: () => { hitMarker(); audio.tone(330, .06, 'square', .14); },
    kill: count => {
      if(mode!=='playing'||!sortie)return;
      const earned=career.recordKill(sortie.round);sortie.earned+=earned;
      audio.tone(95, .38, 'sawtooth', .45);
      notify(`+${earned} GP`,1800,`SPLASH ONE · ${count} / ${sortie.config.count} PLANES`);
      if (count === sortie.config.count) missionPending = true;
    },
    damage: takeDamage,
  });
  refreshAirfieldUI();
  returnToHangar();
  updates.loaded();
  requestAnimationFrame(animate);
}

function refreshAirfieldUI() {
  $('map-select').value=world.map.id;
  $('map-select').disabled=false;
  $('location-name').textContent=world.map.name.toUpperCase();
  $('airfield-number').textContent=`AIRFIELD ${world.map.number}`;
  $('radar-room').textContent=`ROOM ${world.map.number}`;
  $('room-label').textContent=`${world.map.name.toUpperCase()} / FREE FLIGHT + DOGFIGHT`;
  $('intro-description').textContent=`${world.map.description} Turn the room into your playground.`;
  $('load-label').textContent='Airfield ready · scenery contact causes no damage';
  $('scene').dataset.model=world.map.asset;
  $('scene').dataset.map=world.map.id;
  $('scene').dataset.meshCount=String(world.meshCount);
  $('scene').setAttribute('aria-label',`Three-dimensional ${world.map.name.toLowerCase()} airfield`);
}

function refreshHangar() {
  const state=career.state,config=roundConfig(state.round);
  $('free-mode').setAttribute('aria-pressed',String(selectedMode==='free'));
  $('career-mode').setAttribute('aria-pressed',String(selectedMode==='career'));
  $('career-brief').classList.toggle('hidden',selectedMode!=='career');
  $('career-progress').textContent=state.completed?'30 / 30 ROUNDS COMPLETE':`ROUND ${state.round} / 30 · WAVE ${state.wave} / ${config.waves}`;
  $('hangar-gp').textContent=`${state.gp.toLocaleString()} GP`;
  $('career-levels').textContent=`Shots ${state.shots}/5 · Armor ${state.armor}/5 · ${config.reward} GP per kill`;
  $('launch-label').textContent=selectedMode==='free'?'Free fly':state.completed?'Career complete':`Fly round ${state.round}`;
  $('launch-button').disabled=switchingMap||selectedMode==='career'&&state.completed;
  $('save-note').textContent=career.saved?'Career auto-saves in this browser.':'Session progress only · browser storage unavailable.';
}

function openShop() {
  if(!['intro','won','lost'].includes(mode))return;
  shopPreviousMode=mode;setMode('shop');resetInput();
  $('shop-panel').classList.remove('hidden');refreshShop();$('close-shop').focus();
}
function refreshShop() {
  $('shop-gp').textContent=`${career.state.gp.toLocaleString()} GP`;
  const loadout=loadoutFor(career.state);
  for(const kind of ['shots','armor']) {
    const level=career.state[kind],cost=upgradeCost(kind,level),button=$(`buy-${kind}`);
    $(`${kind}-level`).textContent=`LEVEL ${level} / ${MAX_UPGRADE}`;
    button.disabled=cost===null||career.state.gp<cost;
    button.textContent=cost===null?'Fully upgraded':career.state.gp<cost?`Need ${cost-career.state.gp} more GP`:`Upgrade · ${cost} GP`;
    $(`${kind}-cost`).textContent=cost===null?'MAX LEVEL':`Next upgrade: ${cost} GP`;
  }
  $('shots-detail').textContent=`${loadout.gunDamage} gun damage · ${loadout.missileDamage} missile damage · ${Math.round(1/loadout.gunInterval)} shots/sec`;
  $('armor-detail').textContent=`${loadout.maxHealth} hull points · +30 per upgrade`;
  $('shop-save').textContent=career.saved?'GP, upgrades and wave progress save in this browser.':'Storage unavailable: progress lasts for this session.';
}
function closeShop() {
  $('shop-panel').classList.add('hidden');setMode(shopPreviousMode||'intro');shopPreviousMode=null;
  refreshHangar();
  if(mode==='won'||mode==='lost'){
    $('result-detail').textContent=sortieSummary(mode==='won');renderFlightHUD();
  }
  (mode==='intro'?$('shop-button'):$('result-shop')).focus();
}

async function selectAirfield() {
  if(switchingMap||mode!=='intro')return;
  const id=$('map-select').value;
  if(id===world.map.id)return;
  switchingMap=true;setMode('loading');resetInput();
  $('map-select').disabled=true;$('launch-button').disabled=true;
  $('launch-label').textContent='Preparing airfield';
  try {
    let next=airfields.get(id);
    if(!next) {
      next=await loadAirfield(scene,p=>{$('load-label').textContent=`Loading ${MAPS[id].name} · ${Math.round(p*100)}%`;},id);
      if(!isSafePosition(next,next.spawn,PLAYER_CORE_RADIUS)){scene.remove(next.root);throw new Error('Launch area obstructed.');}
      airfields.set(id,next);
    }
    world.root.visible=false;world=next;world.root.visible=true;combat.world=world;
    switchingMap=false;refreshAirfieldUI();returnToHangar();
  } catch(error) {
    console.error('Airfield selection failed:',error);
    switchingMap=false;refreshAirfieldUI();returnToHangar();
    $('load-label').textContent='Map could not load. Select it again to retry.';
  } finally {switchingMap=false;}
}

function setMode(next) {
  mode = next; $('app').dataset.state = next;
  $('app').classList.toggle('playing', next !== 'intro' && next !== 'loading');
  updates.setState(next);
}

function returnToHangar() {
  if (!world || switchingMap) return;
  resetInput(); helpPreviousMode = null; missionPending = false;
  for (const id of ['hud', 'pause-panel', 'result-panel', 'help-panel','shop-panel']) $(id).classList.add('hidden');
  for (const id of ['intro', 'scene-caption', 'intro-footer', 'room-label']) $(id).classList.remove('hidden');
  player = createFlightState(world.spawn); combat.reset({count:0});
  aircraft.visible = true; aircraft.position.copy(world.showcase); aircraft.rotation.set(.04,world.heading-.15,-.15);
  camera.fov = 61; camera.updateProjectionMatrix();
  refreshHangar();
  setMode('intro'); updates.check();
  $('launch-button').focus();
}

function resetInput() {
  keys.clear(); mouseFire = false; missileRequested = false;
}

function launch() {
  if (!world || switchingMap) return;
  if(selectedMode==='career'&&career.state.completed)return;
  const upgrades=loadoutFor(career.state);
  sortie=selectedMode==='career'?{round:career.state.round,wave:career.state.wave,config:roundConfig(career.state.round),earned:0}:null;
  player = createFlightState(world.spawn);
  player.maxHealth=selectedMode==='career'?upgrades.maxHealth:100;player.health=player.maxHealth;
  player.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),world.heading);
  player.velocity.copy(forwardVector(player)).multiplyScalar(player.speed);
  combat.reset(sortie?{...sortie.config,loadout:upgrades}:{count:0}); elapsed = 0; simulationTime = 0; missionPending = false;
  resetInput();
  for (const id of ['intro', 'scene-caption', 'intro-footer', 'room-label', 'pause-panel', 'result-panel', 'help-panel','shop-panel']) $(id).classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('sortie-mode').textContent=sortie?'CAREER · 30 ROUNDS':'FREE FLY';
  $('mission-label').textContent=sortie?`Round ${sortie.round} / 30`:'The room is yours';
  $('mission-detail').textContent=sortie?`Wave ${sortie.wave} / ${sortie.config.waves} · ${sortie.config.count} ${sortie.config.count===1?'plane':'planes'} · ${sortie.config.reward} GP per kill`:'No enemies. No damage. Explore at your pace.';
  $('kill-total').textContent=sortie?` / ${String(sortie.config.count).padStart(2,'0')} · DOWN`:' · NO HOSTILES';
  $('career-hud').classList.toggle('hidden',!sortie);
  $('mission-progress').replaceChildren(...Array.from({length:sortie?.config.count??0},()=>document.createElement('i')));
  aircraft.position.copy(player.position); aircraft.quaternion.copy(player.quaternion); aircraft.visible = true;
  aircraft.userData.exhaust.scale.z = .75;
  camera.position.copy(player.position).addScaledVector(forwardVector(player),-3.2);camera.position.y+=.9;
  setMode(sortie?'playing':'exploring');
  notify(sortie?`ROUND ${sortie.round} · WAVE ${sortie.wave}`:'FREE FLY',3200,sortie?(sortie.config.attacks?'CLEAR THE WAVE · GP BANKED PER KILL':'TARGET PRACTICE · ENEMIES DO NOT FIRE'):'NO ENEMIES · EXPLORE BOTH AIRFIELDS');
  renderer.domElement.focus({ preventScroll: true });
}

function pause() {
  if (mode !== 'playing' && mode !== 'exploring') return;
  $('pause-panel').dataset.previousMode = mode;
  setMode('paused'); resetInput(); $('pause-panel').classList.remove('hidden');
  $('resume-button').focus();
}
function resume() {
  if (mode !== 'paused') return;
  $('pause-panel').classList.add('hidden'); setMode($('pause-panel').dataset.previousMode || 'playing');
  renderer.domElement.focus({ preventScroll: true });
}

function showHelp() {
  if (mode === 'loading' || mode === 'help') return;
  helpPreviousMode = mode; setMode('help'); resetInput(); $('help-panel').classList.remove('hidden');
  $('close-help').focus();
}
function closeHelp() {
  $('help-panel').classList.add('hidden'); setMode(helpPreviousMode || 'intro'); helpPreviousMode = null;
  if (mode === 'playing' || mode === 'exploring') renderer.domElement.focus({ preventScroll: true });
  else if (mode === 'paused') $('resume-button').focus();
  else if (mode === 'shop') $('close-shop').focus();
  else if (mode === 'won' || mode === 'lost') $('again-button').focus();
  else $('help-button').focus();
}

function sortieSummary(won) {
  return `Round ${sortie.round} · Wave ${sortie.wave} · ${combat.kills} / ${sortie.config.count} planes down. ${sortie.earned} GP earned; ${career.state.gp} GP banked. ${won?'Hull repaired for the next wave.':'Your GP is safe. Retry this wave with a repaired plane.'}`;
}

function finish(won) {
  if (mode !== 'playing' || !sortie) return;
  if(won)career.completeWave(sortie.round,sortie.wave);
  setMode(won ? 'won' : 'lost'); resetInput();
  $('result-panel').classList.remove('hidden');
  $('result-eyebrow').textContent=career.state.completed?'30 ROUNDS COMPLETE':won?'WAVE CLEARED':'AIRFRAME LOST';
  $('result-title').textContent=career.state.completed?'Career complete.':won?'Airspace secured.':'Ready for another run?';
  $('result-detail').textContent=sortieSummary(won);
  $('again-button').disabled=career.state.completed;
  $('again-button').textContent=career.state.completed?'Career complete':won?`Next · Round ${career.state.round}, wave ${career.state.wave}`:'Retry wave';
  $('again-button').focus();
  renderFlightHUD();
  if (won) audio.tone(640, .65, 'sine', .45);
}

function takeDamage(amount, reason) {
  if (mode !== 'playing' || player.invulnerable > 0) return;
  player.health = Math.max(0, player.health - amount); player.invulnerable = 1.1;
  flashDamage(); notify(reason,1200,`AIRFRAME ${Math.ceil(player.health)} / ${player.maxHealth} · BREAK AWAY`); audio.tone(65, .2, 'sawtooth', .4);
  if (player.health <= 0) { combat.burst(player.position, 30); finish(false); }
}

function readInput() {
  readKeyboardFlight(keys,input,controlSettings);
  input.fire = mouseFire;
}

function renderFlightHUD() {
  updateHUD(player,combat,camera,input,world,elapsed);
  $('flight-gp').textContent=`${career.state.gp} GP`;
  $('armor-points').textContent=`${Math.ceil(player.health)} / ${player.maxHealth} HP`;
}

function updatePlayerCollision() {
  resolveSceneryContact(world,player,previousPosition);
}

function updateCamera(dt) {
  forwardVector(player, forward);
  // The footage keeps the jet low in frame, with only a little camera bank.
  cameraUp.set(0,1,0).applyQuaternion(player.quaternion).multiplyScalar(.18);
  cameraUp.y += .82; cameraUp.normalize();
  cameraDesired.copy(player.position).addScaledVector(forward,-3.2); cameraDesired.y += .9;
  // Shorten the chase arm before a wall can obscure the aircraft.
  const offset = cameraDesired.clone().sub(player.position);
  let distance = offset.length();
  cameraRay.set(player.position, offset.normalize());
  for (const c of world.colliders) {
    if (c.box.containsPoint(player.position)) continue;
    if (cameraRay.intersectBox(c.box, intersection)) distance = Math.min(distance, Math.max(.7, player.position.distanceTo(intersection) - .25));
  }
  cameraDesired.copy(player.position).addScaledVector(cameraRay.direction, distance);
  camera.position.lerp(cameraDesired, 1 - Math.exp(-7 * dt));
  cameraTarget.copy(player.position).addScaledVector(forward,9); cameraTarget.y += .9;
  cameraRotation.lookAt(camera.position, cameraTarget, cameraUp);
  cameraOrientation.setFromRotationMatrix(cameraRotation);
  camera.quaternion.slerp(cameraOrientation, 1 - Math.exp(-6 * dt));
  const targetFov = player.engineThrottle>.85 && !input.brake ? 72 : 64;
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-3 * dt));
  camera.updateProjectionMatrix(); camera.updateMatrixWorld();
}

/** PHASE 3 — requestAnimationFrame loop. Cap wall time and substep fast motion. */
function animate(timestamp) {
  requestAnimationFrame(animate);
  const dt = previousTime ? Math.min((timestamp - previousTime) / 1000, .05) : 1 / 60;
  previousTime = timestamp;
  const active = mode === 'playing' || mode === 'exploring';
  if (active) {
    readInput(); elapsed += dt; simulationTime += dt;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120))), step = dt / steps;
    for (let i = 0; i < steps; i++) {
      if (mode !== 'playing' && mode !== 'exploring') break;
      previousPosition.copy(player.position); updateFlight(player, input, step);
      updatePlayerCollision();
      if (mode !== 'playing' && mode !== 'exploring') break;
      if (input.fire) combat.shoot(player);
      if (missileRequested) { combat.fireMissile(player); missileRequested = false; }
      combat.update(step, player, true);
      if (missionPending && mode === 'playing') { missionPending = false; finish(true); }
    }
    aircraft.position.copy(player.position); aircraft.quaternion.copy(player.quaternion);
    aircraft.visible = !player.invulnerable || Math.sin(simulationTime * 35) > -.3;
    aircraft.userData.exhaust.scale.z = player.engineThrottle>.85 && !input.brake ? 2 : .75+player.engineThrottle*.3;
    updateCamera(dt);
    hudAccumulator += dt;
    if (hudAccumulator > 1 / 30) { renderFlightHUD(); hudAccumulator = 0; }
  } else if (mode === 'intro' && world) {
    combat.update(dt, player, false);
    aircraft.position.y = world.showcase.y + Math.sin(timestamp * .0008) * .09;
    aircraft.rotation.z = -.15 + Math.sin(timestamp * .00055) * .045;
    camera.position.copy(world.overview);camera.position.x+=Math.sin(timestamp*.00008)*.6;
    camera.lookAt(world.overviewTarget);
  }
  audio.update(player.speed, active);
  renderer.render(scene, camera);
}

async function fullscreen() {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('app').requestFullscreen(); }
  catch { notify('FULLSCREEN UNAVAILABLE IN THIS EMBED'); }
  if (mode === 'playing' || mode === 'exploring') renderer.domElement.focus({ preventScroll: true });
}
async function toggleSound() {
  try {
    const enabled = await audio.toggle(); $('sound-label').textContent = enabled ? 'ON' : 'OFF';
    $('sound-button').setAttribute('aria-label', enabled ? 'Mute sound' : 'Enable sound');
    $('sound-button').setAttribute('aria-pressed', String(enabled));
  } catch { notify('AUDIO UNAVAILABLE IN THIS BROWSER'); }
  if (mode === 'playing' || mode === 'exploring') renderer.domElement.focus({ preventScroll: true });
}
function bindEvents() {
  for(const [id,value] of [['free-mode','free'],['career-mode','career']])$(id).addEventListener('click',()=>{selectedMode=value;refreshHangar();});
  $('shop-button').addEventListener('click',openShop);$('result-shop').addEventListener('click',openShop);
  $('close-shop').addEventListener('click',closeShop);$('shop-done').addEventListener('click',closeShop);
  for(const kind of ['shots','armor'])$(`buy-${kind}`).addEventListener('click',()=>{if(career.buy(kind)){$('shop-feedback').textContent=`${kind==='shots'?'Shots':'Armor'} upgraded to level ${career.state[kind]}. Applies next wave.`;}refreshShop();refreshHangar();});
  $('map-select').addEventListener('change',selectAirfield);
  $('pitch-style').value = controlSettings.pitchStyle;
  $('flight-sensitivity').value = String(controlSettings.sensitivity);
  $('sensitivity-value').textContent = controlSettings.sensitivity.toFixed(2);
  const saveControls = () => {
    controlSettings.pitchStyle = $('pitch-style').value;
    controlSettings.sensitivity = Number($('flight-sensitivity').value);
    $('sensitivity-value').textContent = controlSettings.sensitivity.toFixed(2);
    try { localStorage.setItem('microflyers.controls.v7',JSON.stringify(controlSettings)); } catch { /* Settings still apply for this session. */ }
  };
  $('pitch-style').addEventListener('change',saveControls);
  $('flight-sensitivity').addEventListener('input',saveControls);
  $('launch-button').addEventListener('click', launch);
  $('pause-button').addEventListener('click', pause); $('resume-button').addEventListener('click', resume);
  $('restart-button').addEventListener('click', launch); $('again-button').addEventListener('click', launch);
  $('hangar-button').addEventListener('click', returnToHangar);
  $('result-hangar-button').addEventListener('click', returnToHangar);
  document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); returnToHangar(); });
  $('explore-button').addEventListener('click', () => {
    selectedMode='free';launch();
  });
  $('help-button').addEventListener('click', showHelp); $('close-help').addEventListener('click', closeHelp); $('help-done').addEventListener('click', closeHelp);
  $('sound-button').addEventListener('click', toggleSound); $('fullscreen-button').addEventListener('click', fullscreen);
  const flightCodes = new Set(['KeyW','KeyS','KeyA','KeyD','KeyQ','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','Space']);
  addEventListener('keydown', event => {
    if (event.code === 'Tab') {
      const dialogs = [...document.querySelectorAll('.modal-backdrop:not(.hidden)')];
      const dialog = dialogs.at(-1);
      if (dialog) {
        const controls = [...dialog.querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled)')].filter(el => !el.classList.contains('hidden'));
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
          event.preventDefault(); first?.focus();
        }
      }
      return;
    }
    if (event.code === 'Escape') {
      if (mode === 'help') closeHelp();else if(mode==='shop')closeShop(); else if (mode === 'paused') resume(); else pause();
      return;
    }
    if (event.repeat) return;
    // Preserve Space/Enter activation and tab navigation on actual interface buttons.
    if (event.target instanceof HTMLElement && ['BUTTON','A','INPUT','SELECT','TEXTAREA'].includes(event.target.tagName)) return;
    const active = mode === 'playing' || mode === 'exploring';
    if (active && flightCodes.has(event.code)) { event.preventDefault(); keys.add(event.code); }
    if (event.code === 'KeyR' && world && ['playing','exploring','paused','lost'].includes(mode)) launch();
    if (event.code === 'KeyF') fullscreen(); if (event.code === 'KeyV') toggleSound();
  });
  addEventListener('keyup', event => { keys.delete(event.code); });
  renderer.domElement.addEventListener('pointerdown', event => {
    if ((event.button !== 0 && event.button !== 2) || (mode !== 'playing' && mode !== 'exploring')) return;
    event.preventDefault(); renderer.domElement.focus({ preventScroll: true });
    if (event.button === 0) mouseFire = true;
    else missileRequested = true;
  });
  renderer.domElement.addEventListener('contextmenu', event => {
    event.preventDefault();
  });
  addEventListener('pointerup', event => { if (event.button === 0) mouseFire = false; });
  addEventListener('pointercancel', () => { mouseFire = false; missileRequested = false; });
  renderer.domElement.addEventListener('pointerleave', () => { mouseFire = false; });
  renderer.domElement.addEventListener('wheel',event=>{
    if (mode!=='playing' && mode!=='exploring') return;
    event.preventDefault();
    adjustThrottle(player,-Math.sign(event.deltaY)*.04);
  },{passive:false});
  addEventListener('blur', () => { resetInput(); pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { resetInput(); pause(); } });
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); pause(); notify('GRAPHICS CONTEXT LOST · RELOAD TO RECOVER', 120000);
  });
}

init().catch(error => {
  console.error('MicroFlyers initialization failed:', error);
  $('load-label').textContent = 'Airfield could not load';
  const box = document.createElement('div'); box.className = 'fatal-error';
  const title = document.createElement('strong'); title.textContent = 'The airfield could not start.';
  const detail = document.createElement('p'); detail.textContent = `${error.message} Serve this folder over HTTP with Node.js: node scripts/serve.mjs, then open http://localhost:4173. A WebGL 2 capable browser is required.`;
  const retry = document.createElement('button'); retry.className = 'primary-button'; retry.textContent = 'Reload airfield'; retry.onclick = () => location.reload();
  box.append(title, detail, retry); $('app').append(box); $('app').dataset.state = 'error';
});
