import * as THREE from 'three';

/** Game-mode catalog plus the pure rules behind each mode. */
export const MODES = Object.freeze({
  free:Object.freeze({id:'free',name:'Free Fly',tag:'Explore · no enemies',brief:'No enemies, no damage. Explore every unlocked room at your own pace.'}),
  career:Object.freeze({id:'career',name:'Career',tag:'30 rounds · earn GP',brief:'Thirty rounds of enemy-plane waves with interceptors, gunships and aces.'}),
  rings:Object.freeze({id:'rings',name:'Ring Race',tag:'Time trial · medals',brief:'Thread glowing rings in order against the clock. Three courses per room.'}),
  blitz:Object.freeze({id:'blitz',name:'Balloon Blitz',tag:'75s score attack',brief:'Pop balloons before time runs out. Chain pops for combo multipliers.'}),
  survival:Object.freeze({id:'survival',name:'Survival',tag:'Endless waves',brief:'Endless, escalating enemy waves. Grab power-ups and set a high score.'}),
});
export const MODE_ORDER = Object.freeze(['free','career','rings','blitz','survival']);

/** Enemy archetypes. Multipliers apply to the round/wave base config. */
export const ENEMY_TYPES = Object.freeze({
  fighter:Object.freeze({name:'Fighter',health:1,speed:1,turn:1,fire:1,scale:1,body:0xc9654c,accent:0xffb196,points:100,gp:1}),
  interceptor:Object.freeze({name:'Interceptor',health:.6,speed:1.45,turn:1.4,fire:1.35,scale:.82,body:0xe2c044,accent:0x2b2b2b,points:150,gp:1.2}),
  gunship:Object.freeze({name:'Gunship',health:2.4,speed:.72,turn:.8,fire:.6,scale:1.25,body:0x6a4c8c,accent:0xd8b5ff,points:250,gp:1.6}),
  ace:Object.freeze({name:'Ace',health:6,speed:1.2,turn:1.35,fire:.55,scale:1.15,body:0x1d1d22,accent:0xffd34d,points:1000,gp:5,boss:true}),
});

/** Enemy-type list for one wave. Deterministic for a given round/wave so retries match. */
export function enemyMix(count,{interceptors=0,gunships=0,ace=false}={}) {
  const list=Array.from({length:count},()=> 'fighter');
  let slot=count-1;
  if(ace&&slot>=0)list[slot--]='ace';
  for(let i=0;i<gunships&&slot>=0;i++)list[slot--]='gunship';
  for(let i=0;i<interceptors&&slot>=0;i++)list[slot--]='interceptor';
  return list;
}

/** Endless survival: each wave is harder; aces every fifth wave. */
export function survivalWave(value) {
  const n=Math.max(1,Math.floor(Number(value)||1));
  const count=Math.min(10,1+Math.ceil(n*.7));
  return Object.freeze({wave:n,count,health:1+Math.floor((n-1)/3),patrolSpeed:Math.min(.2,.045+n*.011),
    attacks:true,fireInterval:Math.max(1.5,6.2-n*.33),bulletSpeed:Math.min(40,17+n*1.8),damage:Math.min(16,4+n),
    aimError:Math.max(.25,3.2-n*.2),reward:10+3*Math.floor(n/2),planes:true,
    types:enemyMix(count,{interceptors:n>=3?Math.floor((n-1)/2):0,gunships:n>=5?Math.floor((n-3)/3):0,ace:n%5===0})});
}
export const SURVIVAL = Object.freeze({breather:4,repair:25,waveBonus:250});

export const BLITZ = Object.freeze({duration:75,alive:14,comboWindow:3,maxMultiplier:5,timeBonus:5});
export const BALLOONS = Object.freeze({
  red:Object.freeze({points:100,color:0xff5a4f,size:.5,weight:70,bob:1}),
  blue:Object.freeze({points:150,color:0x4fa6ff,size:.45,weight:20,bob:2.2,drift:true}),
  gold:Object.freeze({points:500,color:0xffd24a,size:.34,weight:7,bob:1.4,drift:true}),
  clock:Object.freeze({points:50,color:0x7dffb0,size:.42,weight:3,bob:1,time:BLITZ.timeBonus}),
});
export function pickBalloon(random=Math.random) {
  const total=Object.values(BALLOONS).reduce((sum,b)=>sum+b.weight,0);
  let roll=random()*total;
  for(const [kind,b] of Object.entries(BALLOONS)){roll-=b.weight;if(roll<0)return kind;}
  return 'red';
}

/** Combo tracker shared by Blitz and Survival. */
export class Combo {
  constructor(window=BLITZ.comboWindow,max=BLITZ.maxMultiplier){this.window=window;this.max=max;this.reset();}
  reset(){this.count=0;this.timer=0;this.best=0;}
  get multiplier(){return Math.min(this.max,1+Math.floor(this.count/2));}
  hit(){this.count++;this.timer=this.window;this.best=Math.max(this.best,this.count);return this.multiplier;}
  update(dt){if(this.timer>0){this.timer-=dt;if(this.timer<=0){this.count=0;this.timer=0;}}}
}

export const COURSES = Object.freeze([
  Object.freeze({level:1,name:'Sunday Cruise',rings:8,radius:1.9,minGap:9,maxGap:15,turn:34,climb:12}),
  Object.freeze({level:2,name:'Weekend Racer',rings:12,radius:1.5,minGap:8,maxGap:14,turn:50,climb:20}),
  Object.freeze({level:3,name:'Rooftop Pro',rings:16,radius:1.15,minGap:8,maxGap:13,turn:66,climb:26}),
]);

export function seededRandom(text) {
  let seed=2166136261;
  for(const char of String(text)){seed^=char.charCodeAt(0);seed=Math.imul(seed,16777619)>>>0;}
  return ()=>{seed=(seed+0x6D2B79F5)>>>0;let t=seed;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
}

/** Build a deterministic, flyable ring course for a map/level. Every ring is
 * clear of surfaces and every leg between rings is sampled for clearance, so
 * the course can always be completed. Same map + level = same course, which
 * keeps local best times comparable. With a validate(world, course) callback
 * (the autopilot), a course is only accepted once it has actually been flown to
 * the finish with the real flight model, and medal times come from that run.
 */
export function generateCourse(world,mapId,level,isSafe,validate=null) {
  const spec=COURSES[level-1]??COURSES[0];
  const area=world.flightArea??world.bounds;
  const inside=point=>area.containsPoint(point);
  const clearLeg=(a,b)=>{
    const length=a.distanceTo(b);
    for(let d=0;d<=length;d+=.8)if(!isSafe(world,a.clone().lerp(b,d/length),.45))return false;
    return true;
  };
  for(let attempt=0;attempt<12;attempt++){
    const random=seededRandom(`${mapId}:${level}:${attempt}`);
    const up=new THREE.Vector3(0,1,0);
    let position=world.spawn.clone(),heading=world.heading,pitch=0;
    const rings=[];let failed=false;
    for(let i=0;i<spec.rings&&!failed;i++){
      let placed=null;
      for(let tries=0;tries<260&&!placed;tries++){
        const widen=Math.min(1,tries/180);
        const turn=(random()*2-1)*THREE.MathUtils.degToRad(spec.turn+widen*40);
        const climb=(random()*2-1)*THREE.MathUtils.degToRad(spec.climb);
        const gap=THREE.MathUtils.lerp(spec.minGap,spec.maxGap,random());
        const h=heading+(i===0?turn*.25:turn),p=THREE.MathUtils.clamp(pitch*.4+climb,-.6,.6);
        const direction=new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(1,0,0),p).applyAxisAngle(up,h);
        const candidate=position.clone().addScaledVector(direction,gap);
        if(!inside(candidate)||!isSafe(world,candidate,spec.radius+.35))continue;
        if(rings.some(r=>r.position.distanceTo(candidate)<5))continue;
        if(!clearLeg(position,candidate))continue;
        placed={position:candidate,direction,heading:h,pitch:p};
      }
      if(!placed){failed=true;break;}
      rings.push({index:i,position:placed.position,normal:placed.direction.clone(),radius:spec.radius});
      position=placed.position;heading=placed.heading;pitch=placed.pitch;
    }
    if(failed)continue;
    let length=world.spawn.distanceTo(rings[0].position);
    for(let i=1;i<rings.length;i++)length+=rings[i-1].position.distanceTo(rings[i].position);
    const course={map:mapId,level,name:spec.name,rings,length,par:parTimes(length)};
    if(validate){
      const run=validate(world,course);
      if(!run?.finished)continue;
      course.par=parFromRun(run.time);course.botTime=run.time;
    }
    return course;
  }
  throw new Error('This room is too crowded for that course. Try another course.');
}

export function parTimes(length) {
  return {gold:Math.round(length/8.6*10)/10,silver:Math.round(length/6.6*10)/10,bronze:Math.round(length/4.9*10)/10};
}
/** Gold needs a faster-than-cruise run (boost on straights); bronze is forgiving. */
export function parFromRun(seconds) {
  return {gold:Math.round(seconds*.82*10)/10,silver:Math.round(seconds*1.05*10)/10,bronze:Math.round(seconds*1.45*10)/10};
}
export function medalFor(time,par) {
  return time<=par.gold?'gold':time<=par.silver?'silver':time<=par.bronze?'bronze':null;
}

/** True if a swept segment crosses the ring disc (plane crossing within radius),
 * or passes very close to its center. Forgiving for a tiny, fast jet.
 */
export function crossesRing(start,end,ring) {
  const a=start.clone().sub(ring.position).dot(ring.normal),b=end.clone().sub(ring.position).dot(ring.normal);
  if(a<=0&&b>=0||a>=0&&b<=0){
    const t=Math.abs(a-b)<1e-9?0:a/(a-b);
    const hit=start.clone().lerp(end,t);
    if(hit.distanceTo(ring.position)<=ring.radius)return true;
  }
  return end.distanceTo(ring.position)<ring.radius*.45;
}

export function formatTime(seconds) {
  if(!Number.isFinite(seconds))return '--:--.-';
  const m=Math.floor(seconds/60),s=seconds-m*60;
  return `${String(m).padStart(2,'0')}:${s.toFixed(1).padStart(4,'0')}`;
}
