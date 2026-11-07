import * as THREE from 'three';
import { initWorld, loadAirfield, isSafePosition } from './world.js';
import { createJet } from './aircraft.js';
import { createFlightState, updateFlight, forwardVector } from './flight.js';
import { Combat } from './combat.js';
import { AudioEngine } from './audio.js';
import { $, updateHUD, notify, hitMarker, flashDamage } from './ui.js';

let scene, camera, renderer, aircraft, world, combat;
let player = createFlightState();
let mode = 'loading', helpPreviousMode = null, elapsed = 0, previousTime = 0;
let mouseFlight = false, mouseFire = false, mouseX = 0, mouseY = 0;
let hudAccumulator = 0, simulationTime = 0, missionPending = false;
const keys = new Set();
const audio = new AudioEngine();
const input = { pitch: 0, roll: 0, yaw: 0, boost: false, brake: false, fire: false };
const forward = new THREE.Vector3(), cameraDesired = new THREE.Vector3(), cameraTarget = new THREE.Vector3();
const previousPosition = new THREE.Vector3(), collisionNormal = new THREE.Vector3();
const playerBox = new THREE.Box3(), cameraRay = new THREE.Ray(), intersection = new THREE.Vector3();
const playerLocalBox = new THREE.Box3(new THREE.Vector3(-.94, -.15, -1.08), new THREE.Vector3(.94, .45, .78));

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

  /** PHASE 2 — load the supplied FBX, normalize scale, build static colliders. */
  world = await loadAirfield(scene, progress => { $('load-label').textContent = `Loading airfield · ${Math.round(progress * 100)}%`; });
  if (!isSafePosition(world, world.spawn)) {
    // Clear fallback in the upper central room if an edited model obstructs the launch.
    world.spawn.set(0, 28, 32);
    if (!isSafePosition(world, world.spawn)) throw new Error('No clear launch position found in this airfield.');
  }
  combat = new Combat(scene, world, {
    shot: () => audio.tone(720, .075, 'triangle', .22),
    hit: () => { hitMarker(); audio.tone(330, .06, 'square', .14); },
    kill: count => {
      audio.tone(95, .38, 'sawtooth', .45);
      notify(`DRONE ELIMINATED  /  ${count} OF 4`);
      if (count === 4) missionPending = true;
    },
    damage: takeDamage,
  });
  combat.reset();
  aircraft.position.set(-13, 14.7, 35.5);
  aircraft.rotation.set(.04, -.15, -.15);
  $('load-label').textContent = 'Airfield ready · 4 drones on patrol';
  $('launch-label').textContent = 'Take flight'; $('launch-button').disabled = false;
  $('scene').dataset.model = 'InteriorTest.fbx'; $('scene').dataset.meshCount = String(world.meshCount);
  setMode('intro');
  requestAnimationFrame(animate);
}

function setMode(next) {
  mode = next; $('app').dataset.state = next;
  $('app').classList.toggle('playing', next !== 'intro' && next !== 'loading');
}

function resetInput() { keys.clear(); mouseFire = false; mouseX = mouseY = 0; }

function launch() {
  if (!world) return;
  player = createFlightState(world.spawn);
  combat.reset(); elapsed = 0; simulationTime = 0; missionPending = false;
  resetInput();
  for (const id of ['intro', 'scene-caption', 'intro-footer', 'room-label', 'pause-panel', 'result-panel', 'help-panel']) $(id).classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('mission-label').textContent = 'Clear the airspace'; $('mission-detail').textContent = 'Track and eliminate 4 rogue drones';
  aircraft.position.copy(player.position); aircraft.quaternion.copy(player.quaternion); aircraft.visible = true;
  camera.position.copy(player.position).add(new THREE.Vector3(0, 1.15, 4.3));
  setMode('playing');
  notify('AIRSPACE IS YOURS. HAPPY HUNTING.', 3200);
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
  else if (mode === 'won' || mode === 'lost') $('again-button').focus();
  else $('help-button').focus();
}

function finish(won) {
  if (mode !== 'playing' && mode !== 'exploring') return;
  setMode(won ? 'won' : 'lost'); resetInput();
  $('result-panel').classList.remove('hidden');
  $('result-eyebrow').textContent = won ? 'MISSION COMPLETE' : 'AIRFRAME LOST';
  $('result-title').textContent = won ? 'Airspace secured.' : 'A rough landing.';
  $('result-detail').textContent = won ? `Four drones down in ${Math.floor(elapsed / 60)}m ${Math.floor(elapsed % 60)}s. The room is yours.` : `${combat.kills} of 4 drones eliminated. Give it another go.`;
  $('explore-button').classList.toggle('hidden', !won);
  $('again-button').focus();
  if (won) audio.tone(640, .65, 'sine', .45);
}

function takeDamage(amount, reason) {
  if ((mode !== 'playing' && mode !== 'exploring') || player.invulnerable > 0) return;
  player.health = Math.max(0, player.health - amount); player.invulnerable = 1.1;
  flashDamage(); notify(reason, 1200); audio.tone(65, .2, 'sawtooth', .4);
  if (player.health <= 0) { combat.burst(player.position, 30); finish(false); }
}

function readInput() {
  input.pitch = THREE.MathUtils.clamp((keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) - (mouseFlight ? mouseY * .9 : 0), -1, 1);
  input.roll = THREE.MathUtils.clamp((keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0) - (mouseFlight ? mouseX * 1.1 : 0), -1, 1);
  input.yaw = (keys.has('KeyQ') ? 1 : 0) - (keys.has('KeyE') ? 1 : 0);
  input.boost = keys.has('ShiftLeft') || keys.has('ShiftRight'); input.brake = keys.has('Space');
  input.fire = mouseFire || keys.has('Space');
}

function updatePlayerCollision() {
  aircraft.position.copy(player.position); aircraft.quaternion.copy(player.quaternion); aircraft.updateMatrixWorld(true);
  playerBox.copy(playerLocalBox).applyMatrix4(aircraft.matrixWorld);
  const obstacle = world.colliders.find(c => c.box.intersectsBox(playerBox));
  const outside = !world.bounds.containsBox(playerBox);
  if (!obstacle && !outside) return;
  takeDamage(28, outside ? 'ROOM BOUNDARY' : 'WATCH THE FURNITURE');
  if (mode === 'lost') return;
  if (obstacle) {
    obstacle.box.clampPoint(previousPosition, intersection);
    collisionNormal.copy(previousPosition).sub(intersection);
  } else {
    world.bounds.clampPoint(player.position, intersection);
    collisionNormal.copy(intersection).sub(player.position);
  }
  if (collisionNormal.lengthSq() < .0001) collisionNormal.copy(player.velocity).negate();
  collisionNormal.normalize();
  directionAfterImpact(player, collisionNormal);
  player.position.copy(previousPosition).addScaledVector(collisionNormal, .75);
  if (!isSafePosition(world, player.position, .6)) {
    player.position.copy(world.spawn); player.quaternion.identity(); player.velocity.set(0, 0, -player.speed);
  }
}
function directionAfterImpact(state, normal) {
  state.velocity.reflect(normal).normalize().multiplyScalar(Math.max(4.5, state.speed * .7));
  state.speed = state.velocity.length();
  state.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), state.velocity.clone().normalize());
  state.angular.set(0, 0, 0);
}

function updateCamera(dt) {
  forwardVector(player, forward);
  cameraDesired.copy(player.position).addScaledVector(forward, -4.3); cameraDesired.y += 1.15;
  // Shorten the chase arm before a wall can obscure the aircraft.
  const offset = cameraDesired.clone().sub(player.position);
  let distance = offset.length();
  cameraRay.set(player.position, offset.normalize());
  for (const c of world.colliders) {
    if (c.box.containsPoint(player.position)) continue;
    if (cameraRay.intersectBox(c.box, intersection)) distance = Math.min(distance, Math.max(.7, player.position.distanceTo(intersection) - .25));
  }
  cameraDesired.copy(player.position).addScaledVector(cameraRay.direction, distance);
  camera.position.lerp(cameraDesired, 1 - Math.exp(-8 * dt));
  cameraTarget.copy(player.position).addScaledVector(forward, 7); cameraTarget.y += .35;
  camera.up.set(0, 1, 0); camera.lookAt(cameraTarget);
  const targetFov = input.boost && !input.brake ? 70 : 61;
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
      combat.update(step, player, true);
      if (missionPending && mode === 'playing') { missionPending = false; finish(true); }
    }
    aircraft.position.copy(player.position); aircraft.quaternion.copy(player.quaternion);
    aircraft.visible = !player.invulnerable || Math.sin(simulationTime * 35) > -.3;
    aircraft.userData.exhaust.scale.z = input.boost && !input.brake ? 2 : .75;
    updateCamera(dt);
    hudAccumulator += dt;
    if (hudAccumulator > 1 / 30) { updateHUD(player, combat, camera, input, world, elapsed); hudAccumulator = 0; }
  } else if (mode === 'intro') {
    combat.update(dt, player, false);
    aircraft.position.y = 14.7 + Math.sin(timestamp * .0008) * .14;
    aircraft.rotation.z = -.15 + Math.sin(timestamp * .00055) * .045;
    camera.position.set(-20 + Math.sin(timestamp * .00008) * .6, 16, 42);
    camera.lookAt(8, 10, -15);
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
function toggleMouse() {
  mouseFlight = !mouseFlight; mouseX = mouseY = 0;
  $('mouse-button').innerHTML = `MOUSE FLIGHT <b>${mouseFlight ? 'ON' : 'OFF'}</b>`;
  $('mouse-button').setAttribute('aria-pressed', String(mouseFlight));
  notify(mouseFlight ? 'MOUSE FLIGHT ON · MOVE FROM CENTER TO STEER' : 'KEYBOARD FLIGHT');
  renderer.domElement.focus({ preventScroll: true });
}

function bindEvents() {
  $('launch-button').addEventListener('click', launch);
  $('pause-button').addEventListener('click', pause); $('resume-button').addEventListener('click', resume);
  $('restart-button').addEventListener('click', launch); $('again-button').addEventListener('click', launch);
  $('explore-button').addEventListener('click', () => {
    $('result-panel').classList.add('hidden'); setMode('exploring'); resetInput();
    $('mission-label').textContent = 'The room is yours'; $('mission-detail').textContent = 'Free flight · explore every corner';
    renderer.domElement.focus({ preventScroll: true });
  });
  $('help-button').addEventListener('click', showHelp); $('close-help').addEventListener('click', closeHelp); $('help-done').addEventListener('click', closeHelp);
  $('sound-button').addEventListener('click', toggleSound); $('fullscreen-button').addEventListener('click', fullscreen);
  $('mouse-button').addEventListener('click', toggleMouse);
  const flightCodes = new Set(['KeyW','KeyS','KeyA','KeyD','KeyQ','KeyE','ShiftLeft','ShiftRight','Space']);
  addEventListener('keydown', event => {
    if (event.code === 'Tab') {
      const dialogs = [...document.querySelectorAll('.modal-backdrop:not(.hidden)')];
      const dialog = dialogs.at(-1);
      if (dialog) {
        const controls = [...dialog.querySelectorAll('button:not(:disabled)')].filter(el => !el.classList.contains('hidden'));
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
      if (mode === 'help') closeHelp(); else if (mode === 'paused') resume(); else pause();
      return;
    }
    if (event.repeat) return;
    // Preserve Space/Enter activation and tab navigation on actual interface buttons.
    if (event.target instanceof HTMLElement && ['BUTTON','A','INPUT','SELECT','TEXTAREA'].includes(event.target.tagName)) return;
    const active = mode === 'playing' || mode === 'exploring';
    if (active && flightCodes.has(event.code)) { event.preventDefault(); keys.add(event.code); }
    if (event.code === 'KeyM' && active) toggleMouse();
    if (event.code === 'KeyR' && world && mode !== 'loading') launch();
    if (event.code === 'KeyF') fullscreen(); if (event.code === 'KeyV') toggleSound();
  });
  addEventListener('keyup', event => { keys.delete(event.code); });
  renderer.domElement.addEventListener('pointerdown', event => {
    if (event.button !== 0 || (mode !== 'playing' && mode !== 'exploring')) return;
    event.preventDefault(); renderer.domElement.focus({ preventScroll: true }); mouseFire = true;
  });
  addEventListener('pointerup', () => { mouseFire = false; });
  addEventListener('pointercancel', () => { mouseFire = false; });
  renderer.domElement.addEventListener('pointermove', event => {
    if (!mouseFlight) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouseX = THREE.MathUtils.clamp(((event.clientX - rect.left) / rect.width - .5) * 2, -1, 1);
    mouseY = THREE.MathUtils.clamp(((event.clientY - rect.top) / rect.height - .5) * 2, -1, 1);
    if (Math.abs(mouseX) < .06) mouseX = 0; if (Math.abs(mouseY) < .06) mouseY = 0;
  });
  renderer.domElement.addEventListener('pointerleave', () => { mouseX = mouseY = 0; mouseFire = false; });
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
