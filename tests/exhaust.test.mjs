import test from 'node:test';
import assert from 'node:assert/strict';
import {createJet,updateJetExhaust} from '../src/aircraft.js';

test('both rocket plumes and glow activate only during held boost and reset on release',()=>{
  const jet=createJet(),exhaust=jet.userData.exhaust,glow=jet.userData.boostGlow;
  updateJetExhaust(jet,false,.5);
  const normalLength=exhaust.children[0].scale.y;
  assert.equal(glow.visible,false);
  updateJetExhaust(jet,true,.5,1);
  assert.equal(glow.visible,true);assert.equal(glow.children.length,2);
  for(const flame of exhaust.children)assert.ok(flame.scale.y>normalLength*2);
  for(const halo of glow.children){assert.equal(halo.material.depthWrite,false);assert.equal(halo.material.depthTest,true);}
  updateJetExhaust(jet,false,.5);
  assert.equal(glow.visible,false);
  for(const flame of exhaust.children)assert.equal(flame.scale.y,normalLength);
});
