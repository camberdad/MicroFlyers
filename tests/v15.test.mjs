import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/build/three.module.js';
import { Pilot, PILOT_KEY, rankFor, RANKS, UNLOCKS, PAINTS, extraUpgradeCost, extraLoadout, cleanPilot, unlocksAtRank } from '../src/progress.js';
import { Career, careerMix, roundConfig } from '../src/career.js';
import { survivalWave, enemyMix, ENEMY_TYPES, Combo, crossesRing, generateCourse, medalFor, parFromRun, pickBalloon, BALLOONS, COURSES, formatTime, MODE_ORDER } from '../src/modes.js';
import { buildRoom, ROOM_BUILDERS } from '../src/rooms.js';
import { prepareAirfield, isSafePosition } from '../src/world.js';
import { MAPS, MAP_ORDER } from '../src/maps.js';
import { planWaveSpawns, planReinforcements, planBalloons } from '../src/spawns.js';
import { validateCourse } from '../src/autopilot.js';
import { Combat, MISSILE } from '../src/combat.js';
import { createFlightState, updateFlight, FLIGHT } from '../src/flight.js';
import { Pickups, pickPowerup, POWERUPS, RingCourse } from '../src/pickups.js';

const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};};

test('ranks rise with XP; every map, mode, upgrade, lighting preset and paint is unlockable',()=>{
  assert.equal(rankFor(0).level,1);assert.equal(rankFor(299).level,1);assert.equal(rankFor(300).level,2);
  assert.equal(rankFor(1e9).level,RANKS.length);assert.equal(rankFor(1e9).progress,1);
  const all=[];for(let level=1;level<=RANKS.length;level++)all.push(...unlocksAtRank(level,level-1));
  for(const [group,items] of Object.entries(UNLOCKS))for(const id of Object.keys(items))
    assert.ok(all.some(u=>u.group===group&&u.id===id)||items[id]===1,`${group}:${id} reachable`);
  for(const paint of PAINTS)assert.ok(paint.rank<=RANKS.length);
  assert.deepEqual(Object.keys(UNLOCKS.maps).sort(),[...MAP_ORDER].sort());
  assert.deepEqual(Object.keys(UNLOCKS.modes).sort(),[...MODE_ORDER].sort());
  for(const id of ['free','career','rings'])assert.equal(UNLOCKS.modes[id],1,'core modes open from the start');
  for(const id of ['living','dining'])assert.equal(UNLOCKS.maps[id],1,'original rooms stay open');
});

test('pilot XP reports rank-ups with their unlocks and persists separately from career',()=>{
  const storage=memory(),pilot=new Pilot(storage);
  assert.equal(pilot.isUnlocked('maps','kitchen'),false);
  const up=pilot.addXP(320);
  assert.equal(up.level,2);assert.ok(up.unlocked.some(u=>u.group==='maps'&&u.id==='kitchen'));
  assert.ok(up.unlocked.some(u=>u.group==='modes'&&u.id==='blitz'));
  assert.equal(pilot.addXP(10),null);
  const again=new Pilot(storage);assert.equal(again.state.xp,330);assert.equal(again.isUnlocked('maps','kitchen'),true);
  assert.equal(storage.getItem('microflyers.career.v1'),null,'pilot data never touches the career key');
  assert.ok(storage.getItem(PILOT_KEY));
});

test('high-score tables keep the best five, ranking ring times lowest first',()=>{
  const pilot=new Pilot(memory());pilot.setCallsign('ace one!');
  assert.equal(pilot.state.callsign,'ACE ONE');
  for(const score of [500,900,100,700,300])pilot.addRecord('blitz:living',score);
  assert.equal(pilot.addRecord('blitz:living',50),-1,'too low for the table');
  assert.equal(pilot.addRecord('blitz:living',1000),0);
  assert.deepEqual(pilot.state.records['blitz:living'].map(e=>e.value),[1000,900,700,500,300]);
  assert.equal(pilot.addRecord('rings:kitchen:2',30.5),0);assert.equal(pilot.addRecord('rings:kitchen:2',28.25),0);
  assert.equal(pilot.addRecord('rings:kitchen:2',40),2);
  assert.equal(pilot.best('rings:kitchen:2').value,28.25);
  assert.equal(pilot.awardMedal('kitchen:2','bronze'),true);assert.equal(pilot.awardMedal('kitchen:2','bronze'),false);
  assert.equal(pilot.awardMedal('kitchen:2','gold'),true);assert.equal(pilot.awardMedal('kitchen:2','silver'),false);
});

test('corrupt or hostile pilot saves are cleaned into valid state',()=>{
  const clean=cleanPilot({schema:1,xp:-5,engine:99,missiles:'x',paint:'hack',callsign:'<script>',lighting:'disco',
    stats:{kills:-1,pops:5},records:{'blitz:living':[{value:5},{value:'nope'}],'evil':[{value:1}],'rings:living:2':[{value:999999}]},medals:{'living:1':'platinum','living:2':'gold'}});
  assert.equal(clean.xp,0);assert.equal(clean.engine,0);assert.equal(clean.missiles,0);assert.equal(clean.paint,'classic');
  assert.equal(clean.callsign,'SCRIPT');assert.equal(clean.lighting,'day');assert.equal(clean.stats.kills,0);assert.equal(clean.stats.pops,5);
  assert.deepEqual(Object.keys(clean.records),['blitz:living']);assert.deepEqual(clean.medals,{'living:2':'gold'});
  assert.equal(cleanPilot({schema:2,xp:500}).xp,0);
  const broken=memory();broken.setItem(PILOT_KEY,'{oops');assert.equal(new Pilot(broken).state.xp,0);
  const blocked=new Pilot({getItem(){throw Error();},setItem(){throw Error();}});
  assert.equal(blocked.saved,false);blocked.addXP(400);assert.equal(blocked.rank.level,2);
});

test('engine and missile upgrades spend shared career GP, respect rank locks and change real values',()=>{
  const storage=memory(),career=new Career(storage),pilot=new Pilot(storage);
  career.addGP(10000);
  assert.equal(pilot.buy('engine',career),false,'engine locked at rank 1');
  pilot.addXP(RANKS[3].xp);
  assert.equal(pilot.buy('engine',career),true);assert.equal(career.state.gp,10000-extraUpgradeCost('engine',0));
  assert.equal(pilot.buy('missiles',career),true);
  for(let i=0;i<10;i++)pilot.buy('engine',career);
  assert.equal(pilot.state.engine,5);assert.equal(extraUpgradeCost('engine',5),null);
  const loadout=extraLoadout(pilot.state);
  assert.ok(loadout.speedScale>1.15&&loadout.turnScale>1.1);assert.ok(loadout.missileCooldown<MISSILE.cooldown);
  assert.equal(new Career(storage).state.gp,career.state.gp,'GP spent on extras is saved');
  assert.equal(career.spend(-5),false);assert.equal(career.spend(1e12),false);
});

test('career keeps harmless plain-fighter openings, adds new enemy types later and aces on rounds 10/20/30',()=>{
  for(const round of [1,2,3,4,5])for(let wave=1;wave<=roundConfig(round).waves;wave++)assert.ok(careerMix(round,wave).every(t=>t==='fighter'));
  assert.ok(careerMix(8,1).includes('interceptor'));assert.ok(careerMix(14,1).includes('gunship'));
  for(const round of [10,20,30]){const last=roundConfig(round).waves;assert.ok(careerMix(round,last).includes('ace'));if(last>1)assert.ok(!careerMix(round,1).includes('ace'));}
  for(let round=1;round<=30;round++)assert.equal(careerMix(round,1).length,roundConfig(round).count);
});

test('survival waves escalate forever with aces every fifth wave; combos build and decay',()=>{
  let previous=survivalWave(1);
  for(let n=2;n<=40;n++){
    const wave=survivalWave(n);
    for(const key of ['count','health','patrolSpeed','bulletSpeed','damage','reward'])assert.ok(wave[key]>=previous[key],`${key} at ${n}`);
    assert.ok(wave.fireInterval<=previous.fireInterval);assert.equal(wave.types.length,wave.count);
    assert.equal(wave.types.includes('ace'),n%5===0);previous=wave;
  }
  assert.ok(survivalWave(40).count<=10);
  assert.deepEqual(enemyMix(3,{ace:true,gunships:1,interceptors:5}),['interceptor','gunship','ace']);
  const combo=new Combo(3,5);assert.equal(combo.hit(),1);assert.equal(combo.hit(),2);
  for(let i=0;i<20;i++)combo.hit();assert.equal(combo.multiplier,5);
  combo.update(3.1);assert.equal(combo.count,0);assert.equal(combo.best,22);
  const counts={};for(let i=0;i<4000;i++){const k=pickBalloon();counts[k]=(counts[k]||0)+1;}
  assert.ok(Object.keys(BALLOONS).every(k=>counts[k]>0));assert.ok(counts.red>counts.gold);
  const powerCounts={};for(let i=0;i<2000;i++){const k=pickPowerup();powerCounts[k]=(powerCounts[k]||0)+1;}
  assert.ok(Object.keys(POWERUPS).every(k=>powerCounts[k]>0));
});

test('ring crossing needs the swept path through the disc; medals follow par times',()=>{
  const ring={position:new THREE.Vector3(0,10,0),normal:new THREE.Vector3(0,0,-1),radius:1.5};
  assert.ok(crossesRing(new THREE.Vector3(.5,10,1),new THREE.Vector3(.5,10,-1),ring));
  assert.ok(crossesRing(new THREE.Vector3(.5,10,-1),new THREE.Vector3(.5,10,1),ring),'either direction counts');
  assert.ok(!crossesRing(new THREE.Vector3(2,10,1),new THREE.Vector3(2,10,-1),ring),'outside the radius');
  assert.ok(!crossesRing(new THREE.Vector3(0,10,5),new THREE.Vector3(0,10,3),ring),'not yet reached');
  const par=parFromRun(20);assert.equal(medalFor(par.gold,par),'gold');assert.equal(medalFor(par.silver,par),'silver');
  assert.equal(medalFor(par.bronze,par),'bronze');assert.equal(medalFor(par.bronze+1,par),null);
  assert.equal(formatTime(75.25),'01:15.3');
});

test('four generated rooms build with safe launches, career spawns, balloons and completable ring courses',()=>{
  assert.equal(MAP_ORDER.length,6);
  for(const id of Object.keys(ROOM_BUILDERS)){
    assert.equal(MAPS[id].generator,id);
    const world=prepareAirfield(buildRoom(id),id);
    assert.ok(world.meshCount>100,`${id} has real furniture`);
    assert.ok(Math.abs(new THREE.Box3().setFromObject(world.room).getSize(new THREE.Vector3()).z-120)<.01);
    assert.ok(isSafePosition(world,world.spawn,.13),`${id} launch clear`);
    assert.ok(world.bounds.containsPoint(world.showcase)&&world.bounds.containsPoint(world.overview));
    planWaveSpawns(world,8);
    assert.ok(planReinforcements(world,world.spawn,6).length>=4);
    const balloons=planBalloons(world,14,[Object.assign(world.spawn.clone(),{isPlayer:true})]);
    assert.ok(balloons.length>=12);assert.ok(balloons.every(b=>isSafePosition(world,b.position,.9)));
    for(const {level} of COURSES){
      const course=generateCourse(world,id,level,isSafePosition,validateCourse);
      assert.equal(course.rings.length,COURSES[level-1].rings);
      assert.ok(validateCourse(world,course).finished,`${id} course ${level} is completable`);
      assert.deepEqual(generateCourse(world,id,level,isSafePosition).rings.map(r=>r.position.toArray()),generateCourse(world,id,level,isSafePosition).rings.map(r=>r.position.toArray()),'courses are deterministic');
    }
  }
});

test('enemy types change toughness and size; balloons pop with their kind reported to scoring',()=>{
  const scene=new THREE.Scene(),world={bounds:new THREE.Box3(new THREE.Vector3(-100,0,-100),new THREE.Vector3(100,80,100)),colliders:[]};
  const kills=[];const combat=new Combat(scene,world,{kill:(n,d)=>kills.push(d)});
  const spawns=[0,1,2,3].map(i=>({position:new THREE.Vector3(i*12-18,20,-20),heading:0}));
  combat.reset({...roundConfig(16),count:4,spawns,types:['fighter','interceptor','gunship','ace']});
  const [fighter,interceptor,gunship,ace]=combat.drones;
  assert.ok(interceptor.health<=fighter.health&&gunship.health>fighter.health&&ace.health>gunship.health);
  assert.ok(gunship.size.x>fighter.size.x);assert.equal(ace.stats.boss,true);
  combat.reset({count:0,balloons:true,attacks:false,planes:false});
  combat.addDrones([{position:new THREE.Vector3(0,16,0)}],['gold'])[0].phase=0; // pin the drift for a deterministic shot
  const player=createFlightState(new THREE.Vector3(0,16,10));
  combat.shoot(player);for(let i=0;i<10;i++)combat.update(.02,player);
  assert.equal(kills.length,1);assert.equal(kills[0].balloon,'gold');assert.equal(combat.kills,1);
  combat.addDrones([{position:new THREE.Vector3(0,16,0)}],['red']);
  assert.equal(combat.drones.length,1,'popped balloons are pruned');assert.equal(combat.kills,1,'kills survive reinforcements');
  for(const drone of combat.drones)assert.equal(combat.tryEnemyShot(drone,player),false,'balloons never shoot');
});

test('power-ups: triple shot fires three rounds, rapid fire shortens the interval, pickups collect',()=>{
  const scene=new THREE.Scene(),world={bounds:new THREE.Box3(new THREE.Vector3(-100,0,-100),new THREE.Vector3(100,80,100)),colliders:[]};
  const combat=new Combat(scene,world,{});combat.reset({count:0});
  const player=createFlightState(new THREE.Vector3(0,16,10));
  combat.powerups.spread=5;combat.shoot(player);assert.equal(combat.bullets.length,3);
  combat.reset({count:0});combat.powerups.rapid=5;combat.shoot(player);assert.ok(combat.fireCooldown<combat.loadout.gunInterval);
  combat.update(6,player);assert.equal(combat.powerups.rapid,0);
  const pickups=new Pickups(scene);pickups.spawn(new THREE.Vector3(0,16,9.5),'shield');
  assert.deepEqual(pickups.update(.016,player),['shield']);assert.equal(pickups.items.length,0);
  pickups.spawn(new THREE.Vector3(30,16,0),'repair');pickups.update(20,player);assert.equal(pickups.items.length,0,'uncollected items expire');
  const course={rings:[{position:new THREE.Vector3(0,16,0),normal:new THREE.Vector3(0,0,-1),radius:1.5}]};
  const rings=new RingCourse(scene);rings.load(course);
  assert.equal(rings.update(.016,new THREE.Vector3(0,16,1),new THREE.Vector3(0,16,-1)),true);assert.equal(rings.finished,true);
});

test('engine upgrades raise top speed and turn rate without changing the stock flight model',()=>{
  const fly=scale=>{const state=createFlightState();state.throttle=state.engineThrottle=1;state.speedScale=scale;state.turnScale=scale;
    for(let i=0;i<1200;i++)updateFlight(state,{pitch:0,roll:0,yaw:0,boost:true,brake:false},1/120);return state.speed;};
  assert.ok(Math.abs(fly(1)-FLIGHT.boostSpeed)<.05,'stock boost speed unchanged');
  assert.ok(fly(1.2)>FLIGHT.boostSpeed*1.15);
});
