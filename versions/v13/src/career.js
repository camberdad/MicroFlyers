/** Offline career rules. No accounts, purchases or network services required. */
export const CAREER_ROUNDS = 30;
export const SAVE_KEY = 'microflyers.career.v1';
export const MAX_UPGRADE = 5;
const integer = (value,min,max,fallback) => Number.isInteger(value)&&value>=min&&value<=max?value:fallback;

export function roundConfig(value) {
  const round=integer(value,1,CAREER_ROUNDS,1), t=(round-1)/(CAREER_ROUNDS-1);
  return Object.freeze({round,waves:1+Math.floor((round-1)/10),count:1+Math.floor((round-1)/4),
    health:1+Math.floor((round-1)/8),patrolSpeed:.035+t*.13,
    attacks:round>=3,fireInterval:7-t*5,bulletSpeed:16+t*22,
    damage:4+Math.floor(t*10),aimError:3.5*(1-t)+.2,
    reward:25+5*Math.floor((round-1)/5),planes:true});
}
export function upgradeCost(kind,level) {
  if(!['shots','armor'].includes(kind)||!Number.isInteger(level)||level<0||level>=MAX_UPGRADE)return null;
  return (kind==='shots'?25:40)*(level+1)**2;
}
export function loadoutFor(state) {
  return {gunDamage:1+state.shots,gunInterval:.105*(1-state.shots*.08),missileDamage:3+state.shots,maxHealth:100+state.armor*30};
}
export function cleanSave(raw) {
  const input=raw?.schema===1?raw:{};
  const round=integer(input.round,1,30,1);
  const wave=integer(input.wave,1,roundConfig(round).waves,1);
  return {schema:1,round,wave,
    completed:input.completed===true&&round===30&&wave===3,
    gp:integer(input.gp,0,1_000_000_000,0),kills:integer(input.kills,0,100_000_000,0),
    shots:integer(input.shots,0,MAX_UPGRADE,0),armor:integer(input.armor,0,MAX_UPGRADE,0)};
}
export class Career {
  constructor(storage) {
    this.storage=storage;this.saved=Boolean(storage);
    try{this.state=cleanSave(JSON.parse(storage?.getItem(SAVE_KEY)||'null'));}
    catch{this.state=cleanSave(null);}
    this.save();
  }
  save() {
    try{if(!this.storage)throw new Error('No storage');this.storage.setItem(SAVE_KEY,JSON.stringify(this.state));this.saved=true;}
    catch{this.saved=false;}return this.saved;
  }
  recordKill(round) {
    const reward=roundConfig(round).reward;
    this.state.gp=Math.min(1_000_000_000,this.state.gp+reward);this.state.kills=Math.min(100_000_000,this.state.kills+1);
    this.save();return reward;
  }
  buy(kind) {
    const cost=upgradeCost(kind,this.state[kind]);
    if(cost===null||this.state.gp<cost)return false;
    this.state.gp-=cost;this.state[kind]++;this.save();return true;
  }
  completeWave(round,wave) {
    // Duplicate callbacks or stale sorties must never skip career stages.
    const state=this.state;
    if(state.completed||state.round!==round||state.wave!==wave)return false;
    if(state.wave<roundConfig(round).waves)state.wave++;
    else if(round<CAREER_ROUNDS){state.round++;state.wave=1;}
    else state.completed=true;
    this.save();return true;
  }
}
