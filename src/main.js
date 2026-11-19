import * as THREE from 'three';
import { initWorld, loadAirfield, isSafePosition, applyLighting } from './world.js';
import { createJet, updateJetExhaust, paintJet } from './aircraft.js';
import { createFlightState, updateFlight, forwardVector,adjustThrottle } from './flight.js';
import { readKeyboardFlight } from './input.js';
import { Combat } from './combat.js';
import { AudioEngine } from './audio.js';
import { $, updateHUD, notify, hitMarker, flashDamage } from './ui.js';
import { LiveUpdates } from './updates.js';
import { MAPS, MAP_ORDER, PLAYER_CORE_RADIUS } from './maps.js';
import { resolveSceneryContact } from './scenery-collision.js';
import { Career, roundConfig, loadoutFor, upgradeCost, MAX_UPGRADE, careerMix } from './career.js';
import { planWaveSpawns, planReinforcements, planBalloons } from './spawns.js';
import { Pilot, PAINTS, UNLOCKS, RANKS, XP, extraUpgradeCost, extraLoadout, MAX_EXTRA_UPGRADE, unlocksAtRank } from './progress.js';
import { MODES, MODE_ORDER, COURSES, ENEMY_TYPES, BLITZ, SURVIVAL, survivalWave, pickBalloon, Combo, generateCourse, medalFor, formatTime } from './modes.js';
import { Pickups, POWERUPS, pickPowerup, RingCourse } from './pickups.js';
import { validateCourse } from './autopilot.js';
import { Leaderboard, ONLINE_SIZE } from './leaderboard.js';
import { VERSION } from './version.js';

const online = new Leaderboard();
let onlineToken = 0;
/** Post a finished run (if the pilot shares scores) and show the world top ten. */
async function showOnlineResult(board,value,detail,format) {
  const token=++onlineToken,status=$('online-status'),box=$('online-board');
  box.replaceChildren();
  if(!online.enabled){status.textContent='';status.classList.add('hidden');return;}
  status.classList.remove('hidden');
  status.textContent=pilot.state.shareOnline?'Posting your score to the world leaderboard…':'Loading the world leaderboard…';
  try{
    const rank=pilot.state.shareOnline?await online.submit(board,{name:pilot.state.callsign,value,detail,version:VERSION}):null;
    const rows=await online.top(board,{fresh:true});
    if(token!==onlineToken)return;
    status.textContent=!pilot.state.shareOnline?'Score kept on this device · sharing is off in Records.'
      :rank?`World rank #${rank} as ${pilot.state.callsign}${pilot.state.callsign==='PILOT'?' · set your callsign in Records':''}`:'Score saved locally.';
    box.replaceChildren(table(`World top ${ONLINE_SIZE}`,rows,format,rank&&rank<=ONLINE_SIZE?rank-1:-1));
  }catch(error){
    if(token!==onlineToken)return;
    console.warn('Online leaderboard unavailable:',error);
    status.textContent='World leaderboard unreachable · your score is saved on this device.';
  }
}
async function refreshOnlineRecords(map) {
  const box=$('online-records'),status=$('online-records-status');
  $('online-records-section').classList.toggle('hidden',!online.enabled);
  if(!online.enabled)return;
  status.textContent='Loading world scores…';box.replaceChildren();
  const boards=[[`survival:${map}`,'Survival'],[`blitz:${map}`,'Balloon Blitz'],...COURSES.map(c=>[`rings:${map}:${c.level}`,`Ring Race · ${c.name}`])];
  try{
    const lists=await Promise.all(boards.map(([board])=>online.top(board,{limit:5})));
    if($('records-map').value!==map)return;
    box.replaceChildren(...boards.map(([board,label],i)=>table(`World · ${label}`,lists[i],board.startsWith('rings:')?formatTime:v=>Math.round(v).toLocaleString())));
    status.textContent='Top five worldwide for this room.';
  }catch(error){status.textContent='World leaderboard unreachable right now.';console.warn(error);}
}
async function refreshWorldBest(board,format) {
  if(!online.enabled||!board)return;
  try{
    const [best]=await online.top(board,{limit:1})??[];
    if(best&&$('record-detail').dataset.board===board)$('record-detail').textContent=$('record-detail').dataset.base+` · World best ${format(best.value)} · ${best.name}`;
  }catch{/* Local records still show. */}
}

let storage;
try{storage=localStorage;}catch{/* Embedded play still works without storage. */}
const career = new Career(storage), pilot = new Pilot(storage);
let selectedMode='free', selectedCourse=1, sortie=null, shopPreviousMode=null, recordsPreviousMode=null;

let scene, camera, renderer, aircraft, world, combat, pickups, ringCourse, shieldMesh, headlight;
let player = createFlightState();
let mode = 'loading', helpPreviousMode = null, elapsed = 0, previousTime = 0;
let mouseFire = false, missileRequested = false;
let hudAccumulator = 0, simulationTime = 0, missionPending = false, shakeAmount = 0, flightXP = 0;
const airfields = new Map(), courses = new Map();
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
const previousPosition = new THREE.Vector3(), UP = new THREE.Vector3(0,1,0);
const cameraRay = new THREE.Ray(), intersection = new THREE.Vector3();
const capitalize = text => text[0].toUpperCase()+text.slice(1);

const sfx = {
  ring: i => { audio.tone(520+i*35,.16,'sine',.32); setTimeout(()=>audio.tone(800+i*35,.22,'sine',.26),70); },
  pop: m => audio.tone(780+m*140,.09,'square',.18),
  pickup: () => { audio.tone(660,.12,'triangle',.3); setTimeout(()=>audio.tone(990,.2,'triangle',.3),90); },
  rank: () => [523,659,784,1046].forEach((f,i)=>setTimeout(()=>audio.tone(f,.3,'sine',.3),i*110)),
  wave: () => { audio.tone(196,.5,'sawtooth',.22); setTimeout(()=>audio.tone(294,.5,'sawtooth',.22),180); },
};

function unlockLabel({group,id}) {
  if(group==='maps')return MAPS[id].name;
  if(group==='modes')return MODES[id].name;
  if(group==='upgrades')return `${capitalize(id)} upgrades`;
  if(group==='lighting')return `${capitalize(id)} lighting`;
  if(group==='paints')return `${PAINTS.find(p=>p.id===id).name} paint`;
  return id;
}
function rankName(level){return RANKS[level-1]?.name??'';}
function lockText(group,id){const need=UNLOCKS[group][id];return `Rank ${need} · ${rankName(need)}`;}

/** XP is awarded as it is earned; rank-ups celebrate and list new unlocks. */
function gainXP(amount) {
  const gain=Math.round(amount);
  if(gain<=0)return;
  if(sortie)sortie.xp+=gain;
  const up=pilot.addXP(gain);
  if(up)celebrateRank(up);
}
let toastTimer;
function celebrateRank(info) {
  sfx.rank();
  const unlocked=info.unlocked.map(unlockLabel);
  $('rank-toast-title').textContent=`RANK ${info.level} · ${info.name.toUpperCase()}`;
  $('rank-toast-detail').textContent=unlocked.length?`Unlocked: ${unlocked.join(', ')}`:'Keep flying to unlock more.';
  $('rank-toast').classList.remove('hidden');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('rank-toast').classList.add('hidden'),6000);
  if(mode==='intro')refreshHangar();
}

function currentLoadout() {
  return {...loadoutFor(career.state),...extraLoadout(pilot.state)};
}
function currentPaint() {
  return PAINTS.find(p=>p.id===pilot.state.paint&&pilot.paintUnlocked(p.id,career.state))??PAINTS[0];
}
function lightingPreset() {
  return pilot.isUnlocked('lighting',pilot.state.lighting)?pilot.state.lighting:'day';
}
function refreshLighting() {
  headlight=applyLighting(world.map,lightingPreset());
}

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
  paintJet(aircraft,currentPaint());
  shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1.55,20,14), new THREE.MeshBasicMaterial({color:0x7fd8ff,transparent:true,opacity:.22,blending:THREE.AdditiveBlending,depthWrite:false}));
  shieldMesh.visible=false; aircraft.add(shieldMesh);
  pickups = new Pickups(scene); ringCourse = new RingCourse(scene);
  bindEvents();
  camera.position.set(-20, 16, 42); camera.lookAt(8, 10, -15);

  /** PHASE 2 — load the selected map, normalize scale, build static colliders. */
  world = await loadAirfield(scene, progress => { $('load-label').textContent = `Loading airfield · ${Math.round(progress * 100)}%`; });
  if (!isSafePosition(world, world.spawn, PLAYER_CORE_RADIUS)) throw new Error('No clear launch position found in this airfield.');
  airfields.set('living',world);
  combat = new Combat(scene, world, {
    shot: () => audio.tone(720, .075, 'triangle', .22),
    missileShot: () => { audio.tone(150, .3, 'sawtooth', .4); notify('MISSILE AWAY',1300,'Homing missile tracking the locked target.'); },
    weaponNotice: message => notify(message.startsWith('NO MISSILE') ? 'NO LOCK' : 'REARMING',1200,message),
    hit: () => { hitMarker(); audio.tone(330, .06, 'square', .14); },
    kill: onKill,
    damage: takeDamage,
  });
  refreshAirfieldUI();
  returnToHangar();
  updates.loaded();
  requestAnimationFrame(animate);
}

function refreshAirfieldUI() {
  const select=$('map-select');
  select.replaceChildren(...MAP_ORDER.map(id=>{
    const map=MAPS[id],locked=!pilot.isUnlocked('maps',id),option=document.createElement('option');
    option.value=id;option.disabled=locked;
    option.textContent=`${map.number} · ${map.name}${locked?` · 🔒 ${lockText('maps',id)}`:''}`;
    return option;
  }));
  select.value=world.map.id;
  select.disabled=switchingMap;
  $('location-name').textContent=world.map.name.toUpperCase();
  $('airfield-number').textContent=`AIRFIELD ${world.map.number}`;
  $('radar-room').textContent=`ROOM ${world.map.number}`;
  $('room-label').textContent=`${world.map.name.toUpperCase()} / ${MODES[selectedMode].name.toUpperCase()}`;
  $('intro-description').textContent=world.map.description;
  $('load-label').textContent='Airfield ready · scenery contact causes no damage';
  $('scene').dataset.model=world.map.asset;
  $('scene').dataset.map=world.map.id;
  $('scene').dataset.meshCount=String(world.meshCount);
  $('scene').setAttribute('aria-label',`Three-dimensional ${world.map.name.toLowerCase()} airfield`);
  const lighting=$('lighting-select');
  lighting.replaceChildren(...['day','sunset','night'].map(id=>{
    const locked=!pilot.isUnlocked('lighting',id),option=document.createElement('option');
    option.value=id;option.disabled=locked;option.textContent=`${capitalize(id)}${locked?` · 🔒 ${lockText('lighting',id)}`:''}`;return option;
  }));
  lighting.value=lightingPreset();
  refreshLighting();
}

function recordBrief() {
  const map=world.map.id;
  if(selectedMode==='rings'){
    const best=pilot.best(`rings:${map}:${selectedCourse}`),medal=pilot.state.medals[`${map}:${selectedCourse}`];
    let par='';
    try{const course=courseFor(world,selectedCourse);par=` · Gold ${formatTime(course.par.gold)}`;}catch{/* Shown at launch. */}
    return [`${COURSES[selectedCourse-1].name.toUpperCase()} · ${COURSES[selectedCourse-1].rings} RINGS`,best?`Best ${formatTime(best.value)}${medal?` · ${medal.toUpperCase()} MEDAL`:''}${par}`:`No time yet${par}`];
  }
  const best=pilot.best(`${selectedMode}:${map}`);
  if(selectedMode==='blitz')return [`${BLITZ.duration} SECONDS · COMBOS UP TO ×${BLITZ.maxMultiplier}`,best?`High score ${best.value.toLocaleString()} · ${best.name}`:'No high score yet'];
  if(selectedMode==='survival')return ['ENDLESS WAVES · POWER-UPS',best?`High score ${best.value.toLocaleString()} · ${best.detail}`:'No high score yet'];
  return ['ALL UNLOCKED ROOMS','No enemies, no timer, no damage'];
}

function refreshHangar() {
  const state=career.state,config=roundConfig(state.round),rank=pilot.rank;
  for(const id of MODE_ORDER){
    const button=$(`mode-${id}`),locked=!pilot.isUnlocked('modes',id);
    button.setAttribute('aria-pressed',String(selectedMode===id));
    button.classList.toggle('locked',locked);
    button.querySelector('small').textContent=locked?`🔒 ${lockText('modes',id)}`:MODES[id].tag;
  }
  const locked=!pilot.isUnlocked('modes',selectedMode);
  $('mode-brief').textContent=locked?`Locked · reach ${lockText('modes',selectedMode)} to unlock ${MODES[selectedMode].name}.`:MODES[selectedMode].brief;
  $('career-brief').classList.toggle('hidden',selectedMode!=='career');
  $('record-brief').classList.toggle('hidden',selectedMode==='career');
  $('course-picker').classList.toggle('hidden',selectedMode!=='rings');
  const [title,detail]=recordBrief();
  $('record-title').textContent=title;$('record-detail').textContent=detail;
  const board=selectedMode==='rings'?`rings:${world.map.id}:${selectedCourse}`:['survival','blitz'].includes(selectedMode)?`${selectedMode}:${world.map.id}`:'';
  $('record-detail').dataset.board=board;$('record-detail').dataset.base=detail;
  refreshWorldBest(board,selectedMode==='rings'?formatTime:v=>Math.round(v).toLocaleString());
  $('career-progress').textContent=state.completed?'30 / 30 ROUNDS COMPLETE':`ROUND ${state.round} / 30 · WAVE ${state.wave} / ${config.waves}`;
  $('hangar-gp').textContent=`${state.gp.toLocaleString()} GP`;
  $('career-levels').textContent=`Shots ${state.shots}/5 · Armor ${state.armor}/5 · ${config.reward} GP per kill`;
  $('pilot-callsign').textContent=pilot.state.callsign;
  $('pilot-rank').textContent=`RANK ${rank.level} · ${rank.name.toUpperCase()}`;
  $('pilot-xp').textContent=rank.next?`${rank.xp.toLocaleString()} / ${rank.next.toLocaleString()} XP`:`${rank.xp.toLocaleString()} XP · MAX RANK`;
  $('pilot-xp-bar').style.width=`${Math.round(rank.progress*100)}%`;
  $('pilot-gp').textContent=`${state.gp.toLocaleString()} GP`;
  const labels={free:'Free fly',career:state.completed?'Career complete':`Fly round ${state.round}`,rings:'Start ring race',blitz:'Start balloon blitz',survival:'Start survival'};
  $('launch-label').textContent=locked?'Mode locked':labels[selectedMode];
  $('launch-button').disabled=switchingMap||locked||selectedMode==='career'&&state.completed;
  $('room-label').textContent=`${world.map.name.toUpperCase()} / ${MODES[selectedMode].name.toUpperCase()}`;
  $('save-note').textContent=career.saved&&pilot.saved?'Progress, GP and high scores auto-save in this browser.':'Session progress only · browser storage unavailable.';
}

const UPGRADE_KINDS=['shots','armor','engine','missiles'];
function upgradeInfo(kind) {
  const extra=kind==='engine'||kind==='missiles';
  const level=extra?pilot.state[kind]:career.state[kind];
  const cost=extra?extraUpgradeCost(kind,level):upgradeCost(kind,level);
  return {level,cost,max:extra?MAX_EXTRA_UPGRADE:MAX_UPGRADE,locked:!pilot.isUnlocked('upgrades',kind)};
}
function openShop() {
  if(!['intro','won','lost'].includes(mode))return;
  shopPreviousMode=mode;setMode('shop');resetInput();
  $('shop-panel').classList.remove('hidden');refreshShop();$('close-shop').focus();
}
function refreshShop() {
  $('shop-gp').textContent=`${career.state.gp.toLocaleString()} GP`;
  const loadout=currentLoadout();
  for(const kind of UPGRADE_KINDS){
    const {level,cost,max,locked}=upgradeInfo(kind),button=$(`buy-${kind}`);
    $(`${kind}-level`).textContent=locked?`🔒 ${lockText('upgrades',kind).toUpperCase()}`:`LEVEL ${level} / ${max}`;
    button.disabled=locked||cost===null||career.state.gp<cost;
    button.textContent=locked?'Locked':cost===null?'Fully upgraded':career.state.gp<cost?`Need ${cost-career.state.gp} more GP`:`Upgrade · ${cost} GP`;
    $(`${kind}-cost`).textContent=locked?'Earn XP in any mode to unlock':cost===null?'MAX LEVEL':`Next upgrade: ${cost} GP`;
    $(`upgrade-${kind}`).classList.toggle('locked',locked);
  }
  $('shots-detail').textContent=`${loadout.gunDamage} gun damage · ${loadout.missileDamage} missile damage · ${Math.round(1/loadout.gunInterval)} shots/sec`;
  $('armor-detail').textContent=`${loadout.maxHealth} hull points · +30 per upgrade`;
  $('engine-detail').textContent=`+${Math.round((loadout.speedScale-1)*100)}% top speed · +${Math.round((loadout.turnScale-1)*100)}% turn rate`;
  $('missiles-detail').textContent=`${loadout.missileCooldown.toFixed(2)}s reload · ${Math.round(loadout.missileRange/ (world?.scale??1))} cm lock range`;
  const grid=$('paint-grid');
  grid.replaceChildren(...PAINTS.map(paint=>{
    const button=document.createElement('button'),open=pilot.paintUnlocked(paint.id,career.state);
    button.className='paint-swatch';button.disabled=!open;
    button.setAttribute('aria-pressed',String(pilot.state.paint===paint.id));
    button.style.setProperty('--paint',`#${paint.body.toString(16).padStart(6,'0')}`);
    button.style.setProperty('--accent',`#${paint.accent.toString(16).padStart(6,'0')}`);
    const name=document.createElement('strong');name.textContent=paint.name;
    const note=document.createElement('small');note.textContent=open?(pilot.state.paint===paint.id?'Equipped':'Equip'):`🔒 Rank ${paint.rank}${paint.career?' or finish Career':''}`;
    button.append(document.createElement('i'),name,note);
    button.addEventListener('click',()=>{if(pilot.setPaint(paint.id,career.state)){paintJet(aircraft,paint);$('shop-feedback').textContent=`${paint.name} paint equipped.`;refreshShop();}});
    return button;
  }));
  $('shop-save').textContent=career.saved?'GP, upgrades, paint and wave progress save in this browser.':'Storage unavailable: progress lasts for this session.';
}
function buyUpgrade(kind) {
  const extra=kind==='engine'||kind==='missiles';
  const ok=extra?pilot.buy(kind,career):career.buy(kind);
  if(ok){$('shop-feedback').textContent=`${capitalize(kind)} upgraded to level ${upgradeInfo(kind).level}. Applies at your next launch.`;sfx.pickup();}
  refreshShop();refreshHangar();
}
function closeShop() {
  $('shop-panel').classList.add('hidden');setMode(shopPreviousMode||'intro');shopPreviousMode=null;
  refreshHangar();
  if((mode==='won'||mode==='lost')&&sortie?.mode==='career'){$('result-detail').textContent=sortieSummary(mode==='won');renderFlightHUD();}
  (mode==='intro'?$('shop-button'):$('result-shop')).focus();
}

function openRecords() {
  if(!['intro','won','lost'].includes(mode))return;
  recordsPreviousMode=mode;setMode('records');resetInput();
  $('records-map').replaceChildren(...MAP_ORDER.map(id=>Object.assign(document.createElement('option'),{value:id,textContent:`${MAPS[id].number} · ${MAPS[id].name}`})));
  $('records-map').value=world.map.id;$('callsign-input').value=pilot.state.callsign;
  $('records-panel').classList.remove('hidden');refreshRecords();$('close-records').focus();
}
function table(title,list,format,highlight=-1) {
  const section=document.createElement('section');
  const heading=document.createElement('h3');heading.textContent=title;section.append(heading);
  if(!list?.length){const empty=document.createElement('p');empty.className='records-empty';empty.textContent='No runs yet. Be the first!';section.append(empty);return section;}
  const ol=document.createElement('ol');
  list.forEach((entry,i)=>{
    const li=document.createElement('li');if(i===highlight)li.className='highlight';
    const name=document.createElement('span');name.textContent=entry.name;
    const value=document.createElement('strong');value.textContent=format(entry.value);
    const detail=document.createElement('small');detail.textContent=[entry.detail,entry.date].filter(Boolean).join(' · ');
    li.append(name,value,detail);ol.append(li);
  });
  section.append(ol);return section;
}
function refreshRecords() {
  const map=$('records-map').value,stats=pilot.state.stats,rank=pilot.rank;
  const summary=$('pilot-summary');
  const cells=[[`Rank ${rank.level}`,rank.name],['XP',rank.xp.toLocaleString()],['GP',career.state.gp.toLocaleString()],['Flights',stats.flights],
    ['Kills',stats.kills],['Aces downed',stats.aces],['Rings',stats.rings],['Balloons',stats.pops],['Best combo',`×${stats.bestCombo}`],
    ['Waves survived',stats.wavesSurvived],['Power-ups',stats.pickups],['Flight time',`${Math.floor(stats.seconds/60)} min`]];
  summary.replaceChildren(...cells.map(([label,value])=>{const div=document.createElement('div');const s=document.createElement('span');s.textContent=label;const b=document.createElement('strong');b.textContent=String(value);div.append(s,b);return div;}));
  const body=$('records-body');
  const score=v=>Math.round(v).toLocaleString();
  const parts=[table('Survival · high scores',pilot.state.records[`survival:${map}`],score),table('Balloon Blitz · high scores',pilot.state.records[`blitz:${map}`],score)];
  for(const course of COURSES){
    const medal=pilot.state.medals[`${map}:${course.level}`];
    parts.push(table(`Ring Race · ${course.name}${medal?` · ${medal.toUpperCase()}`:''}`,pilot.state.records[`rings:${map}:${course.level}`],formatTime));
  }
  body.replaceChildren(...parts);
  $('share-online').checked=pilot.state.shareOnline;
  refreshOnlineRecords(map);
  const roadmap=$('unlock-roadmap');
  roadmap.replaceChildren(...RANKS.map((r,i)=>{
    const li=document.createElement('li'),level=i+1,items=unlocksAtRank(level,level-1).map(unlockLabel);
    li.classList.toggle('done',rank.level>=level);
    const head=document.createElement('strong');head.textContent=`${level} · ${r.name} · ${r.xp.toLocaleString()} XP`;
    const list=document.createElement('span');list.textContent=items.length?items.join(', '):level===1?'Free Fly, Career, Ring Race, Living & Dining Rooms':'—';
    li.append(head,list);return li;
  }));
}
function closeRecords() {
  $('records-panel').classList.add('hidden');setMode(recordsPreviousMode||'intro');recordsPreviousMode=null;
  refreshHangar();(mode==='intro'?$('records-button'):$('result-records')).focus();
}

async function selectAirfield() {
  if(switchingMap||mode!=='intro')return;
  const id=$('map-select').value;
  if(id===world.map.id)return;
  if(!pilot.isUnlocked('maps',id)){$('map-select').value=world.map.id;return;}
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
  resetInput(); helpPreviousMode = null; missionPending = false; sortie = null;
  for (const id of ['hud', 'pause-panel', 'result-panel', 'help-panel','shop-panel','records-panel']) $(id).classList.add('hidden');
  for (const id of ['intro', 'scene-caption', 'intro-footer', 'room-label']) $(id).classList.remove('hidden');
  player = createFlightState(world.spawn); combat.reset({count:0}); pickups.reset(); ringCourse.clear();
  shieldMesh.visible=false;
  aircraft.visible = true; aircraft.position.copy(world.showcase); aircraft.rotation.set(.04,world.heading-.15,-.15);
  camera.fov = 61; camera.updateProjectionMatrix();
  refreshHangar();
  setMode('intro'); updates.check();
  $('launch-button').focus();
}

function resetInput() {
  keys.clear(); mouseFire = false; missileRequested = false;
  player.boosting = false;
  if (aircraft) updateJetExhaust(aircraft,false,player.engineThrottle);
}

function courseFor(airfield,level) {
  const key=`${airfield.map.id}:${level}`;
  if(!courses.has(key))courses.set(key,generateCourse(airfield,airfield.map.id,level,isSafePosition,validateCourse));
  return courses.get(key);
}

function spawnBalloons(count) {
  const avoid=combat.drones.filter(d=>d.alive).map(d=>d.base??d.mesh.position);
  avoid.push(Object.assign(player.position.clone(),{isPlayer:true}));
  const points=planBalloons(world,count,avoid);
  combat.addDrones(points,points.map(()=>pickBalloon()));
}

function launch() {
  if (!world || switchingMap) return;
  const selected=selectedMode;
  if(!pilot.isUnlocked('modes',selected)){notify('MODE LOCKED',2500,`Reach ${lockText('modes',selected)} to unlock ${MODES[selected].name}.`);return;}
  if(selected==='career'&&career.state.completed)return;
  const loadout=currentLoadout();
  let spawns=null,course=null;
  try{
    if(selected==='career')spawns=planWaveSpawns(world,roundConfig(career.state.round).count);
    if(selected==='survival')spawns=planWaveSpawns(world,survivalWave(1).count);
    if(selected==='rings')course=courseFor(world,selectedCourse);
  }catch(error){notify('TAKEOFF DELAYED',4000,error.message);return;}
  pickups.reset();ringCourse.clear();
  sortie=selected==='free'?null:{mode:selected,map:world.map.id,xp:0,score:0,earned:0,combo:new Combo(selected==='survival'?4:BLITZ.comboWindow)};
  if(selected==='career')Object.assign(sortie,{round:career.state.round,wave:career.state.wave,config:roundConfig(career.state.round)});
  if(selected==='survival')Object.assign(sortie,{wave:1,config:survivalWave(1),breather:0});
  if(selected==='blitz')Object.assign(sortie,{timeLeft:BLITZ.duration,respawn:[]});
  if(selected==='rings')Object.assign(sortie,{course,level:selectedCourse});
  player = createFlightState(spawns?.player.position??world.spawn);
  const armored=selected==='career'||selected==='survival';
  player.maxHealth=armored?loadout.maxHealth:100;player.health=player.maxHealth;player.shield=0;
  player.speedScale=loadout.speedScale;player.turnScale=loadout.turnScale;
  player.quaternion.setFromAxisAngle(UP,spawns?.player.heading??world.heading);
  player.velocity.copy(forwardVector(player)).multiplyScalar(player.speed);
  if(selected==='career')combat.reset({...sortie.config,spawns:spawns.enemies,types:careerMix(sortie.round,sortie.wave),loadout});
  else if(selected==='survival')combat.reset({...sortie.config,spawns:spawns.enemies,loadout});
  else if(selected==='blitz'){combat.reset({count:0,balloons:true,attacks:false,planes:false,loadout});spawnBalloons(BLITZ.alive);}
  else combat.reset({count:0,loadout});
  if(course)ringCourse.load(course);
  elapsed = 0; simulationTime = 0; missionPending = false; shakeAmount = 0;
  resetInput();
  for (const id of ['intro', 'scene-caption', 'intro-footer', 'room-label', 'pause-panel', 'result-panel', 'help-panel','shop-panel','records-panel']) $(id).classList.add('hidden');
  $('hud').classList.remove('hidden');
  setupMissionHUD();
  aircraft.position.copy(player.position); aircraft.quaternion.copy(player.quaternion); aircraft.visible = true;
  updateJetExhaust(aircraft,false,player.engineThrottle);
  camera.position.copy(player.position).addScaledVector(forwardVector(player),-3.2);camera.position.y+=.9;
  camera.lookAt(player.position.clone().addScaledVector(forwardVector(player),9));camera.updateMatrixWorld();
  setMode(sortie?'playing':'exploring');
  pilot.addStat('flights');pilot.save();
  const banner={
    free:()=>['FREE FLY','NO ENEMIES · EXPLORE EVERY UNLOCKED ROOM'],
    career:()=>[`ROUND ${sortie.round} · WAVE ${sortie.wave}`,sortie.config.attacks?'SCATTERED START · ENEMY GUNS FIRE FORWARD':'RANDOM DROP · NO ENEMY FIRE'],
    rings:()=>[course.name.toUpperCase(),`${course.rings.length} RINGS · GOLD ${formatTime(course.par.gold)} · GO!`],
    blitz:()=>['BALLOON BLITZ',`${BLITZ.duration} SECONDS · CHAIN POPS FOR COMBOS`],
    survival:()=>['SURVIVAL · WAVE 1','HOW LONG CAN YOU LAST?'],
  }[selected]();
  notify(banner[0],3200,banner[1]);
  renderer.domElement.focus({ preventScroll: true });
}

function setupMissionHUD() {
  const m=sortie?.mode??'free';
  $('sortie-mode').textContent=({free:'FREE FLY',career:'CAREER · 30 ROUNDS',rings:`RING RACE · COURSE ${sortie?.level}`,blitz:'BALLOON BLITZ',survival:'SURVIVAL'})[m];
  $('career-hud').classList.toggle('hidden',!(m==='career'||m==='survival'));
  $('score-hud').classList.toggle('hidden',!(m==='blitz'||m==='survival'));
  let pips=0;
  if(m==='career'){
    $('mission-label').textContent=`Round ${sortie.round} / 30`;
    $('mission-detail').textContent=`Wave ${sortie.wave} / ${sortie.config.waves} · ${sortie.config.count} ${sortie.config.count===1?'plane':'planes'} · ${sortie.config.reward} GP per kill`;
    $('kill-total').textContent=` / ${String(sortie.config.count).padStart(2,'0')} · DOWN`;pips=sortie.config.count;
  }else if(m==='rings'){
    const best=pilot.best(`rings:${sortie.map}:${sortie.level}`);
    $('mission-label').textContent=sortie.course.name;
    $('mission-detail').textContent=`Gold ${formatTime(sortie.course.par.gold)} · Silver ${formatTime(sortie.course.par.silver)}${best?` · Best ${formatTime(best.value)}`:''}`;
    $('kill-total').textContent=` / ${String(sortie.course.rings.length).padStart(2,'0')} · RINGS`;pips=sortie.course.rings.length;
  }else if(m==='blitz'){
    const best=pilot.best(`blitz:${sortie.map}`);
    $('mission-label').textContent='Pop every balloon';
    $('mission-detail').textContent=`Red 100 · Blue 150 · Gold 500 · Green +${BLITZ.timeBonus}s${best?` · Best ${best.value.toLocaleString()}`:''}`;
    $('kill-total').textContent=' · POPPED';
  }else if(m==='survival'){
    $('mission-label').textContent='Wave 1';
    $('mission-detail').textContent='Survive. Grab power-ups from wrecks.';
    $('kill-total').textContent=' · DOWN';
  }else{
    $('mission-label').textContent='The room is yours';
    $('mission-detail').textContent='No enemies. No damage. Explore at your pace.';
    $('kill-total').textContent=' · NO HOSTILES';
  }
  $('mission-progress').replaceChildren(...Array.from({length:Math.min(pips,16)},()=>document.createElement('i')));
}

function maybeDrop(drone,stats) {
  if(!sortie||!drone)return;
  let chance=sortie.mode==='survival'?.22:sortie.mode==='career'&&sortie.round>=3?.15:0;
  if(type(drone)==='gunship')chance*=2;if(stats.boss)chance=1;
  if(Math.random()<chance)pickups.spawn(drone.mesh.position.clone(),pickPowerup());
}
const type=drone=>drone?.type??'fighter';

function onKill(count,drone) {
  if(mode!=='playing'||!sortie)return;
  if(drone?.balloon)return onPop(drone);
  const stats=drone?.stats??ENEMY_TYPES.fighter;
  pilot.addStat('kills');if(stats.boss)pilot.addStat('aces');
  gainXP(stats.boss?XP.aceKill:XP.kill);
  shake(stats.boss?.9:.35);maybeDrop(drone,stats);
  audio.tone(95, .38, 'sawtooth', .45);
  const label=stats.boss?'ACE DOWN':type(drone)==='fighter'?'SPLASH ONE':`${stats.name.toUpperCase()} DOWN`;
  if(sortie.mode==='career'){
    let earned=career.recordKill(sortie.round);
    if(stats.gp>1)earned+=career.addGP(Math.round(sortie.config.reward*(stats.gp-1)));
    sortie.earned+=earned;
    notify(`+${earned} GP`,1800,`${label} · ${count} / ${sortie.config.count} PLANES`);
    if (count === sortie.config.count) missionPending = true;
  }else if(sortie.mode==='survival'){
    const multiplier=sortie.combo.hit();pilot.maxStat('bestCombo',sortie.combo.count);
    const points=Math.round(stats.points*multiplier*(1+(sortie.wave-1)*.1));sortie.score+=points;
    const gp=career.addGP(Math.round(sortie.config.reward*stats.gp));sortie.earned+=gp;
    notify(`+${points.toLocaleString()}${multiplier>1?` ×${multiplier}`:''}`,1500,`${label} · +${gp} GP`);
  }
}

function onPop(drone) {
  const multiplier=sortie.combo.hit();pilot.addStat('pops');pilot.maxStat('bestCombo',sortie.combo.count);
  const points=drone.spec.points*multiplier;sortie.score+=points;
  sfx.pop(multiplier);
  if(drone.spec.time){sortie.timeLeft+=drone.spec.time;notify(`+${drone.spec.time}s TIME`,1100,`+${points} · COMBO ×${multiplier}`);}
  else notify(`+${points}`,900,multiplier>1?`COMBO ×${multiplier}`:`${drone.balloon.toUpperCase()} BALLOON`);
  sortie.respawn.push(.45+Math.random()*.6);
}

function applyPowerup(kind) {
  const spec=POWERUPS[kind];
  if(kind==='repair')player.health=Math.min(player.maxHealth,player.health+35);
  if(kind==='rapid')combat.powerups.rapid=spec.duration;
  if(kind==='spread')combat.powerups.spread=spec.duration;
  if(kind==='shield')player.shield=spec.duration;
  if(kind==='missile')combat.missileCooldown=0;
  pilot.addStat('pickups');sfx.pickup();notify(spec.name,1600,spec.detail);
}

function onRing() {
  const passed=ringCourse.index,total=sortie.course.rings.length;
  pilot.addStat('rings');gainXP(XP.ring);sfx.ring(passed);
  if(ringCourse.finished){finishSortie(true);return;}
  notify(`RING ${passed} / ${total}`,900,formatTime(elapsed));
}

/** Per-frame rules for timed and endless modes. */
function updateSortie(dt) {
  player.shield=Math.max(0,(player.shield||0)-dt);
  shieldMesh.visible=player.shield>0&&(player.shield>1.5||Math.sin(simulationTime*25)>0);
  if(mode==='exploring'||mode==='playing'){
    flightXP+=dt*XP.flightSecond;pilot.state.stats.seconds+=dt;
    if(flightXP>=5){gainXP(Math.floor(flightXP));flightXP-=Math.floor(flightXP);}
  }
  if(!sortie||mode!=='playing')return;
  sortie.combo.update(dt);
  for(const kind of pickups.update(dt,player))applyPowerup(kind);
  if(sortie.mode==='blitz'){
    sortie.timeLeft-=dt;
    for(let i=sortie.respawn.length-1;i>=0;i--){sortie.respawn[i]-=dt;if(sortie.respawn[i]<=0){sortie.respawn.splice(i,1);spawnBalloons(1);}}
    if(sortie.timeLeft<=0){sortie.timeLeft=0;finishSortie(true);}
  }
  if(sortie.mode==='survival'){
    if(!sortie.breather&&combat.alive===0){
      const bonus=SURVIVAL.waveBonus*sortie.wave;sortie.score+=bonus;
      player.health=Math.min(player.maxHealth,player.health+SURVIVAL.repair);
      pilot.addStat('wavesSurvived');gainXP(XP.survivalWave);
      sortie.breather=SURVIVAL.breather;sfx.wave();
      notify(`WAVE ${sortie.wave} CLEARED`,2600,`+${bonus.toLocaleString()} BONUS · +${SURVIVAL.repair} HULL · NEXT WAVE IN ${SURVIVAL.breather}s`);
      $('mission-detail').textContent='Breather · grab any power-ups now.';
    }else if(sortie.breather>0){
      sortie.breather-=dt;
      if(sortie.breather<=0){
        sortie.breather=0;sortie.wave++;sortie.config=survivalWave(sortie.wave);
        let spawns=planReinforcements(world,player.position,sortie.config.count);
        if(!spawns.length)spawns=planReinforcements(world,player.position,sortie.config.count,Math.random,{minPlayerGap:8,gap:4});
        const {types,...overrides}=sortie.config;
        combat.addDrones(spawns,types,overrides);
        $('mission-label').textContent=`Wave ${sortie.wave}`;
        $('mission-detail').textContent=`${spawns.length} hostiles${types.includes('ace')?' · ACE INBOUND':''}${types.includes('gunship')?' · gunships':''}`;
        notify(`WAVE ${sortie.wave}`,2400,types.includes('ace')?'ACE INBOUND · BRING IT DOWN':'HOSTILES INBOUND');
        sfx.wave();
      }
    }
  }
}

function sortieSummary(won) {
  return `Round ${sortie.round} · Wave ${sortie.wave} · ${combat.kills} / ${sortie.config.count} planes down. ${sortie.earned} GP earned; ${career.state.gp} GP banked. ${won?'Hull repaired for the next wave.':'Your GP is safe. Retry this wave with a repaired plane.'}`;
}

/** Results for every mode: summary, record placement, XP and the local top five. */
function finishSortie(won) {
  if (mode !== 'playing' || !sortie) return;
  setMode(won ? 'won' : 'lost'); resetInput();
  const m=sortie.mode,map=sortie.map,stats=[];let recordKey=null,recordValue=0,recordDetail='',place=-1,format=v=>Math.round(v).toLocaleString();
  let eyebrow,title,detail,again='Fly again',badge='';
  if(m==='career'){
    if(won){career.completeWave(sortie.round,sortie.wave);gainXP(XP.wave);}
    eyebrow=career.state.completed?'30 ROUNDS COMPLETE':won?'WAVE CLEARED':'AIRFRAME LOST';
    title=career.state.completed?'Career complete.':won?'Airspace secured.':'Ready for another run?';
    detail=sortieSummary(won);
    again=career.state.completed?'Career complete':won?`Next · Round ${career.state.round}, wave ${career.state.wave}`:'Retry wave';
    stats.push(['GP earned',`+${sortie.earned}`],['GP banked',career.state.gp.toLocaleString()]);
  }else if(m==='survival'){
    recordKey=`survival:${map}`;recordValue=sortie.score;recordDetail=`Wave ${sortie.wave} · ${combat.kills} kills`;place=pilot.addRecord(recordKey,recordValue,recordDetail);
    eyebrow='SHOT DOWN';title=`You reached wave ${sortie.wave}.`;
    detail=`${combat.kills} enemies destroyed · longest kill chain ${sortie.combo.best}. Your GP is banked.`;
    stats.push(['Score',sortie.score.toLocaleString()],['Wave',sortie.wave],['GP earned',`+${sortie.earned}`]);
  }else if(m==='blitz'){
    const gp=career.addGP(Math.floor(sortie.score/150));sortie.earned+=gp;gainXP(sortie.score*XP.blitzPoints);
    recordKey=`blitz:${map}`;recordValue=sortie.score;recordDetail=`${combat.kills} pops · best combo ${sortie.combo.best}`;place=pilot.addRecord(recordKey,recordValue,recordDetail);
    eyebrow='TIME!';title=`${sortie.score.toLocaleString()} points.`;
    detail=`${combat.kills} balloon${combat.kills===1?"":"s"} popped. Longest chain: ${sortie.combo.best} in a row.`;
    stats.push(['Score',sortie.score.toLocaleString()],['Popped',combat.kills],['GP earned',`+${gp}`]);
  }else if(m==='rings'){
    const time=elapsed,course=sortie.course,medal=medalFor(time,course.par),key=`${map}:${sortie.level}`;
    const improved=pilot.awardMedal(key,medal);pilot.addStat('courses');
    gainXP(XP.courseFinish+(medal?XP.medal[medal]*(improved?1:.25):0));
    recordKey=`rings:${map}:${sortie.level}`;format=formatTime;recordValue=time;recordDetail=medal?`${medal} medal`:'finished';place=pilot.addRecord(recordKey,recordValue,recordDetail);
    eyebrow=medal?`${medal.toUpperCase()} MEDAL`:'COURSE COMPLETE';title=formatTime(time);
    detail=`${course.name}: ${course.rings.length} rings. Gold ${formatTime(course.par.gold)} · Silver ${formatTime(course.par.silver)} · Bronze ${formatTime(course.par.bronze)}.${improved&&medal?` New ${medal} medal!`:''}`;
    again='Race again';stats.push(['Time',formatTime(time)],['Medal',medal?capitalize(medal):'—']);
  }
  if(place>=0)badge=place===0?'★ NEW HIGH SCORE':`NEW TOP 5 · #${place+1}`;
  stats.push(['XP earned',`+${sortie.xp}`]);
  pilot.save();
  $('result-panel').classList.remove('hidden');
  $('result-eyebrow').textContent=eyebrow;$('result-title').textContent=title;$('result-detail').textContent=detail;
  $('result-badge').textContent=badge;$('result-badge').classList.toggle('hidden',!badge);
  $('result-stats').replaceChildren(...stats.map(([label,value])=>{const div=document.createElement('div');const s=document.createElement('span');s.textContent=label;const b=document.createElement('strong');b.textContent=String(value);div.append(s,b);return div;}));
  const rank=pilot.rank;
  $('result-rank').textContent=`RANK ${rank.level} · ${rank.name.toUpperCase()} · ${rank.next?`${(rank.next-rank.xp).toLocaleString()} XP to next rank`:'MAX RANK'}`;
  $('result-board').replaceChildren(...(recordKey?[table('Your top 5 · this room',pilot.state.records[recordKey],format,place)]:[]));
  if(recordKey)showOnlineResult(recordKey,recordValue,recordDetail,format);else{onlineToken++;$('online-board').replaceChildren();$('online-status').classList.add('hidden');}
  $('again-button').disabled=m==='career'&&career.state.completed;
  $('again-button').firstChild.textContent=again+' ';
  $('again-button').focus();
  renderFlightHUD();
  if (won) audio.tone(640, .65, 'sine', .45);
}

function takeDamage(amount, reason) {
  if (mode !== 'playing' || player.invulnerable > 0) return;
  if (player.shield > 0) { notify('SHIELD HELD',700,'Incoming fire absorbed'); return; }
  player.health = Math.max(0, player.health - amount); player.invulnerable = 1.1; shake(.5);
  flashDamage(); notify(reason,1200,`AIRFRAME ${Math.ceil(player.health)} / ${player.maxHealth} · BREAK AWAY`); audio.tone(65, .2, 'sawtooth', .4);
  if (player.health <= 0) { combat.burst(player.position, 30, true); finishSortie(false); }
}
function shake(amount){shakeAmount=Math.min(1.2,shakeAmount+amount);}

function readInput() {
  readKeyboardFlight(keys,input,controlSettings);
  input.fire = mouseFire;
}

function renderFlightHUD() {
  const m=sortie?.mode??'free',extra={};
  if(m==='free')extra.idle={status:'FREE FLY · NO HOSTILES',state:'SAFE',detail:'Explore. Other modes add rings, balloons and enemies.'};
  if(m==='rings'){
    const ring=ringCourse.current,total=sortie.course.rings.length;
    extra.idle={status:ring?`RING ${ringCourse.index+1} / ${total}`:'FINISHED',state:'RACE',detail:'Fly through the glowing ring. R restarts.'};
    if(ring)extra.objective={position:ring.position,label:`RING ${ringCourse.index+1}`};
    extra.clockText=formatTime(elapsed);
  }
  if(m==='blitz'){extra.clock=Math.max(0,sortie.timeLeft);extra.urgent=sortie.timeLeft<10;}
  updateHUD(player,combat,camera,input,world,elapsed,extra);
  if(m==='rings'){
    $('kills').textContent=String(ringCourse.index).padStart(2,'0');
    [...$('mission-progress').children].forEach((el,i)=>el.classList.toggle('done',i<ringCourse.index));
  }
  if(sortie){
    $('score-value').textContent=`${sortie.score.toLocaleString()} PTS`;
    $('combo-value').textContent=sortie.combo.count>1?`COMBO ×${sortie.combo.multiplier} · ${sortie.combo.count} CHAIN`:'';
  }
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
  if(shakeAmount>.01){
    camera.position.x+=(Math.random()-.5)*shakeAmount*.14;camera.position.y+=(Math.random()-.5)*shakeAmount*.14;
    shakeAmount*=Math.exp(-6*dt);
  }
  cameraTarget.copy(player.position).addScaledVector(forward,9); cameraTarget.y += .9;
  cameraRotation.lookAt(camera.position, cameraTarget, cameraUp);
  cameraOrientation.setFromRotationMatrix(cameraRotation);
  camera.quaternion.slerp(cameraOrientation, 1 - Math.exp(-6 * dt));
  const targetFov = player.boosting ? 68 : 64;
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
      if (sortie?.mode==='rings' && ringCourse.update(step, previousPosition, player.position)) { onRing(); if (mode !== 'playing') break; }
      if (input.fire) combat.shoot(player);
      if (missileRequested) { combat.fireMissile(player); missileRequested = false; }
      combat.update(step, player, true);
      if (missionPending && mode === 'playing') { missionPending = false; finishSortie(true); }
    }
    if (mode === 'playing' || mode === 'exploring') updateSortie(dt);
    aircraft.position.copy(player.position); aircraft.quaternion.copy(player.quaternion);
    aircraft.visible = !player.invulnerable || Math.sin(simulationTime * 35) > -.3;
    updateJetExhaust(aircraft,player.boosting,player.engineThrottle,simulationTime);
    if (headlight) headlight.position.copy(player.position).addScaledVector(forwardVector(player, forward), 1.2);
    updateCamera(dt);
    hudAccumulator += dt;
    if (hudAccumulator > 1 / 30) { renderFlightHUD(); hudAccumulator = 0; }
  } else if (mode === 'intro' && world) {
    combat.update(dt, player, false);
    aircraft.position.y = world.showcase.y + Math.sin(timestamp * .0008) * .09;
    aircraft.rotation.z = -.15 + Math.sin(timestamp * .00055) * .045;
    if (headlight) headlight.position.copy(aircraft.position).add(new THREE.Vector3(0,.6,-1));
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
  for(const id of MODE_ORDER)$(`mode-${id}`).addEventListener('click',()=>{selectedMode=id;refreshHangar();});
  for(const course of COURSES)$(`course-${course.level}`).addEventListener('click',()=>{
    selectedCourse=course.level;
    for(const c of COURSES)$(`course-${c.level}`).setAttribute('aria-pressed',String(c.level===selectedCourse));
    refreshHangar();
  });
  $('shop-button').addEventListener('click',openShop);$('result-shop').addEventListener('click',openShop);
  $('close-shop').addEventListener('click',closeShop);$('shop-done').addEventListener('click',closeShop);
  for(const kind of UPGRADE_KINDS)$(`buy-${kind}`).addEventListener('click',()=>buyUpgrade(kind));
  $('records-button').addEventListener('click',openRecords);$('result-records').addEventListener('click',openRecords);
  $('close-records').addEventListener('click',closeRecords);$('records-done').addEventListener('click',closeRecords);
  $('records-map').addEventListener('change',refreshRecords);
  $('share-online').addEventListener('change',()=>pilot.setShareOnline($('share-online').checked));
  $('callsign-save').addEventListener('click',()=>{$('callsign-input').value=pilot.setCallsign($('callsign-input').value);refreshRecords();refreshHangar();});
  $('callsign-input').addEventListener('keydown',event=>{if(event.key==='Enter')$('callsign-save').click();});
  $('map-select').addEventListener('change',selectAirfield);
  $('lighting-select').addEventListener('change',()=>{pilot.setLighting($('lighting-select').value);refreshLighting();});
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
      if (mode === 'help') closeHelp();else if(mode==='shop')closeShop();else if(mode==='records')closeRecords(); else if (mode === 'paused') resume(); else pause();
      return;
    }
    if (event.repeat) return;
    // Preserve Space/Enter activation and tab navigation on actual interface buttons.
    if (event.target instanceof HTMLElement && ['BUTTON','A','INPUT','SELECT','TEXTAREA'].includes(event.target.tagName)) return;
    const active = mode === 'playing' || mode === 'exploring';
    if (active && flightCodes.has(event.code)) { event.preventDefault(); keys.add(event.code); }
    if (event.code === 'KeyR' && world && ['playing','exploring','paused','lost','won'].includes(mode)) launch();
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
  else if (mode === 'records') $('close-records').focus();
  else if (mode === 'won' || mode === 'lost') $('again-button').focus();
  else $('help-button').focus();
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
