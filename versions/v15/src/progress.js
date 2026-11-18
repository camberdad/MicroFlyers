/** Offline pilot profile: XP ranks, unlocks, extra upgrades, paints, lifetime
 * stats and local high-score tables. Stored separately from the V9 career save
 * (microflyers.career.v1) so older releases never strip these fields.
 * No accounts, network services or real-money purchases.
 */
export const PILOT_KEY = 'microflyers.pilot.v1';
export const MAX_EXTRA_UPGRADE = 5;
export const RECORD_SLOTS = 5;

export const RANKS = Object.freeze([
  {name:'Cadet',xp:0},
  {name:'Flight Student',xp:300},
  {name:'Wingman',xp:800},
  {name:'Pilot',xp:1600},
  {name:'Flight Lead',xp:2800},
  {name:'Squadron Leader',xp:4500},
  {name:'Ace',xp:7000},
  {name:'Double Ace',xp:10000},
  {name:'Wing Commander',xp:14000},
  {name:'Sky Marshal',xp:20000},
].map(Object.freeze));

/** Everything a player can unlock, and the pilot rank that unlocks it. */
export const UNLOCKS = Object.freeze({
  maps:Object.freeze({living:1,dining:1,kitchen:2,bedroom:3,garage:4,library:6}),
  modes:Object.freeze({free:1,career:1,rings:1,blitz:2,survival:3}),
  upgrades:Object.freeze({shots:1,armor:1,engine:2,missiles:4}),
  lighting:Object.freeze({day:1,sunset:3,night:5}),
});

export const PAINTS = Object.freeze([
  {id:'classic',name:'Classic Ivory',rank:1,body:0xe8e9d9,accent:0xd6f285,dark:0x243e48,glow:0x9cdaff},
  {id:'racer',name:'Acid Racer',rank:2,body:0xd7f26a,accent:0x1e2a20,dark:0x26322a,glow:0xc8ff7a},
  {id:'arctic',name:'Arctic Blue',rank:3,body:0xcfe9f7,accent:0x3aa0d8,dark:0x1f3a52,glow:0x8be3ff},
  {id:'crimson',name:'Crimson Arrow',rank:5,body:0xc8343a,accent:0xf4efe4,dark:0x2a1a1d,glow:0xffa07a},
  {id:'midnight',name:'Midnight Stealth',rank:7,body:0x2b3340,accent:0x7d5cff,dark:0x10141b,glow:0xb69bff},
  {id:'tiger',name:'Tiger Stripe',rank:8,body:0xf09a2a,accent:0x1a1a1a,dark:0x2c2218,glow:0xffd36b},
  {id:'gold',name:'Gold Ace',rank:10,body:0xe6c25a,accent:0xfff1b8,dark:0x4a3a12,glow:0xffe28a,career:true},
].map(Object.freeze));

/** XP awarded for each activity. Kept small and readable for balancing. */
export const XP = Object.freeze({kill:20,aceKill:120,wave:60,ring:8,courseFinish:120,
  medal:Object.freeze({gold:150,silver:80,bronze:40}),survivalWave:50,blitzPoints:.05,flightSecond:.2});

const integer=(value,min,max,fallback)=>Number.isInteger(value)&&value>=min&&value<=max?value:fallback;
const finite=(value,min,max,fallback)=>Number.isFinite(value)&&value>=min&&value<=max?value:fallback;
const STAT_KEYS=['flights','kills','aces','rings','courses','pops','wavesSurvived','bestCombo','pickups','seconds'];

export function rankFor(xp) {
  let index=0;
  for(let i=0;i<RANKS.length;i++)if(xp>=RANKS[i].xp)index=i;
  const next=RANKS[index+1]??null;
  return {level:index+1,name:RANKS[index].name,xp,floor:RANKS[index].xp,next:next?.xp??null,
    progress:next?(xp-RANKS[index].xp)/(next.xp-RANKS[index].xp):1};
}

export function extraUpgradeCost(kind,level) {
  if(!['engine','missiles'].includes(kind)||!Number.isInteger(level)||level<0||level>=MAX_EXTRA_UPGRADE)return null;
  return (kind==='engine'?30:35)*(level+1)**2;
}

/** Engine improves speed/turning a little per level; missiles reload faster and track harder. */
export function extraLoadout(state) {
  const engine=state?.engine??0,missiles=state?.missiles??0;
  return {speedScale:1+engine*.04,turnScale:1+engine*.03,
    missileCooldown:1.8*(1-missiles*.12),missileTurn:3.5*(1+missiles*.1),missileRange:65*(1+missiles*.08)};
}

function cleanEntry(raw,lowerIsBetter) {
  if(!raw||typeof raw!=='object')return null;
  const value=finite(raw.value,0,lowerIsBetter?86_400:1_000_000_000,null);
  if(value===null)return null;
  return {value,name:cleanCallsign(raw.name),detail:typeof raw.detail==='string'?raw.detail.slice(0,60):'',
    date:typeof raw.date==='string'?raw.date.slice(0,10):''};
}
export function cleanCallsign(value) {
  const text=typeof value==='string'?value.toUpperCase().replace(/[^A-Z0-9 _-]/g,'').trim().slice(0,12):'';
  return text||'PILOT';
}
export const lowerIsBetter=key=>key.startsWith('rings:');

export function cleanPilot(raw) {
  const input=raw?.schema===1?raw:{};
  const stats={};
  for(const key of STAT_KEYS)stats[key]=finite(input.stats?.[key],0,1_000_000_000,0);
  const records={};
  if(input.records&&typeof input.records==='object')for(const [key,list] of Object.entries(input.records)){
    if(!/^(survival|blitz|rings):[a-z]+(?::[1-3])?$/.test(key)||!Array.isArray(list))continue;
    const low=lowerIsBetter(key);
    const clean=list.map(entry=>cleanEntry(entry,low)).filter(Boolean)
      .sort((a,b)=>low?a.value-b.value:b.value-a.value).slice(0,RECORD_SLOTS);
    if(clean.length)records[key]=clean;
  }
  const medals={};
  if(input.medals&&typeof input.medals==='object')for(const [key,medal] of Object.entries(input.medals))
    if(/^[a-z]+:[1-3]$/.test(key)&&['gold','silver','bronze'].includes(medal))medals[key]=medal;
  const paint=PAINTS.some(p=>p.id===input.paint)?input.paint:'classic';
  return {schema:1,callsign:cleanCallsign(input.callsign),xp:integer(input.xp,0,100_000_000,0),
    engine:integer(input.engine,0,MAX_EXTRA_UPGRADE,0),missiles:integer(input.missiles,0,MAX_EXTRA_UPGRADE,0),
    paint,lighting:['day','sunset','night'].includes(input.lighting)?input.lighting:'day',stats,records,medals};
}

const MEDAL_ORDER={bronze:1,silver:2,gold:3};

export class Pilot {
  constructor(storage) {
    this.storage=storage;this.saved=Boolean(storage);
    try{this.state=cleanPilot(JSON.parse(storage?.getItem(PILOT_KEY)||'null'));}
    catch{this.state=cleanPilot(null);}
    this.save();
  }
  save() {
    try{if(!this.storage)throw new Error('No storage');this.storage.setItem(PILOT_KEY,JSON.stringify(this.state));this.saved=true;}
    catch{this.saved=false;}return this.saved;
  }
  get rank(){return rankFor(this.state.xp);}
  /** Returns newly reached rank info (or null) so the UI can celebrate unlocks. */
  addXP(amount) {
    const gain=Math.max(0,Math.round(Number(amount)||0));
    if(!gain)return null;
    const before=this.rank.level;
    this.state.xp=Math.min(100_000_000,this.state.xp+gain);this.save();
    const after=this.rank;
    return after.level>before?{...after,unlocked:unlocksAtRank(after.level,before)}:null;
  }
  addStat(key,amount=1) {
    if(!STAT_KEYS.includes(key))return;
    this.state.stats[key]=Math.min(1_000_000_000,(this.state.stats[key]||0)+amount);
  }
  maxStat(key,value) {
    if(STAT_KEYS.includes(key)&&value>this.state.stats[key])this.state.stats[key]=value;
  }
  isUnlocked(group,id,career) {
    const need=UNLOCKS[group]?.[id];
    if(need===undefined)return group==='paints'?this.paintUnlocked(id,career):false;
    return this.rank.level>=need;
  }
  paintUnlocked(id,career) {
    const paint=PAINTS.find(p=>p.id===id);
    if(!paint)return false;
    return this.rank.level>=paint.rank||Boolean(paint.career&&career?.completed);
  }
  setPaint(id,career){if(!this.paintUnlocked(id,career))return false;this.state.paint=id;this.save();return true;}
  setLighting(id){if(!UNLOCKS.lighting[id]||!this.isUnlocked('lighting',id))return false;this.state.lighting=id;this.save();return true;}
  setCallsign(value){this.state.callsign=cleanCallsign(value);this.save();return this.state.callsign;}
  /** Insert a score into a local top-5 table. Returns its 0-based place or -1. */
  addRecord(key,value,detail='') {
    const low=lowerIsBetter(key);
    if(!Number.isFinite(value)||value<0)return -1;
    const list=this.state.records[key]??[];
    const entry={value:Math.round(value*1000)/1000,name:this.state.callsign,detail:String(detail).slice(0,60),date:new Date().toISOString().slice(0,10)};
    list.push(entry);list.sort((a,b)=>low?a.value-b.value:b.value-a.value);
    const place=list.indexOf(entry);
    this.state.records[key]=list.slice(0,RECORD_SLOTS);this.save();
    return place<RECORD_SLOTS?place:-1;
  }
  best(key){return this.state.records[key]?.[0]??null;}
  awardMedal(key,medal) {
    const current=this.state.medals[key];
    if(!medal||current&&MEDAL_ORDER[current]>=MEDAL_ORDER[medal])return false;
    this.state.medals[key]=medal;this.save();return true;
  }
  buy(kind,career) {
    const cost=extraUpgradeCost(kind,this.state[kind]);
    if(cost===null||!this.isUnlocked('upgrades',kind)||!career||career.state.gp<cost)return false;
    if(!career.spend(cost))return false;
    this.state[kind]++;this.save();return true;
  }
}

export function unlocksAtRank(level,previous=level-1) {
  const list=[];
  for(const [group,items] of Object.entries(UNLOCKS))
    for(const [id,need] of Object.entries(items))if(need>previous&&need<=level)list.push({group,id});
  for(const paint of PAINTS)if(paint.rank>previous&&paint.rank<=level)list.push({group:'paints',id:paint.id});
  return list;
}
