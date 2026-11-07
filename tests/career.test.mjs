import test from 'node:test';
import assert from 'node:assert/strict';
import {Career,roundConfig,loadoutFor,upgradeCost,SAVE_KEY,cleanSave} from '../src/career.js';
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};};

test('all 30 rounds progress gradually, with harmless opening practice and tougher later waves',()=>{
  const rounds=Array.from({length:30},(_,i)=>roundConfig(i+1));
  assert.equal(rounds[0].count,1);assert.equal(rounds[0].health,1);
  assert.equal(rounds[0].attacks,false);assert.equal(rounds[1].attacks,false);
  assert.equal(rounds[2].attacks,true);assert.equal(rounds[29].waves,3);assert.equal(rounds[29].count,8);
  for(let i=1;i<30;i++){
    for(const key of ['count','waves','health','patrolSpeed','bulletSpeed','damage','reward'])assert.ok(rounds[i][key]>=rounds[i-1][key],key);
    assert.ok(rounds[i].fireInterval<=rounds[i-1].fireInterval);
    assert.ok(rounds[i].aimError<=rounds[i-1].aimError);
  }
});
test('a complete campaign visits every wave, banks kills and stops after exactly 30 rounds',()=>{
  const career=new Career(memory());let waves=0,kills=0,gp=0;
  while(!career.state.completed){
    const {round,wave}=career.state,config=roundConfig(round);
    for(let i=0;i<config.count;i++){gp+=career.recordKill(round);kills++;}
    assert.equal(career.completeWave(round,wave),true);waves++;
    assert.equal(career.completeWave(round,wave),false);
  }
  assert.equal(waves,60);assert.equal(career.state.round,30);assert.equal(career.state.kills,kills);assert.equal(career.state.gp,gp);
  assert.equal(career.completeWave(30,3),false);
});
test('kills survive reload or a failed sortie; only a cleared wave advances progress',()=>{
  const storage=memory(),career=new Career(storage);
  career.recordKill(1);
  const resumed=new Career(storage);assert.equal(resumed.state.gp,25);assert.equal(resumed.state.round,1);
  resumed.completeWave(1,1);
  const next=new Career(storage);assert.equal(next.state.round,2);assert.equal(next.state.wave,1);assert.equal(next.state.gp,25);
});
test('upgrades spend GP once, persist and change real weapon and armor values',()=>{
  const storage=memory(),career=new Career(storage);
  assert.equal(career.buy('shots'),false);career.recordKill(1);
  assert.equal(career.buy('shots'),true);assert.equal(career.state.gp,0);assert.equal(career.buy('shots'),false);
  const next=new Career(storage);assert.equal(next.state.shots,1);assert.equal(loadoutFor(next.state).gunDamage,2);
  assert.equal(loadoutFor(next.state).missileDamage,4);
  assert.ok(loadoutFor(next.state).gunInterval<.105);
  next.state.gp=10000;
  for(let i=0;i<5;i++)assert.equal(next.buy('armor'),true);
  assert.equal(loadoutFor(next.state).maxHealth,250);
  const gp=next.state.gp;assert.equal(next.buy('armor'),false);assert.equal(next.state.gp,gp);
  assert.equal(upgradeCost('armor',5),null);assert.equal(next.buy('anything'),false);
});
test('corrupt, incompatible and unavailable saves cannot create invalid progression or currency',()=>{
  const storage=memory();storage.setItem(SAVE_KEY,'broken');const career=new Career(storage);assert.equal(career.state.round,1);
  assert.equal(cleanSave({schema:1,round:900,gp:-1,shots:9,armor:NaN,wave:9}).gp,0);
  assert.equal(cleanSave({schema:1,round:30,wave:4,completed:true}).wave,1);
  assert.equal(cleanSave({schema:2,gp:9000}).gp,0);
  const blocked=new Career({getItem(){throw Error();},setItem(){throw Error();}});
  assert.equal(blocked.saved,false);blocked.recordKill(1);assert.equal(blocked.state.gp,25);
});
