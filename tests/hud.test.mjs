import test from 'node:test';
import assert from 'node:assert/strict';
import { compassHeading,cardinalForHeading,enemyIndicator,spreadEdgeIndicators,indicatorMargins } from '../src/hud-math.js';

test('HUD compass follows the world axes and wraps north without negative headings',()=>{
  assert.equal(compassHeading(0,-1),0); assert.equal(compassHeading(1,0),90);
  assert.equal(compassHeading(0,1),180); assert.equal(compassHeading(-1,0),270);
  assert.ok(compassHeading(-.001,-1)>359 && compassHeading(.001,-1)<1);
});

const viewport={width:1280,height:720,fov:64};
test('enemy circles project onto the actual visible aircraft location',()=>{
  const center=enemyIndicator({x:0,y:0,z:-10},viewport);
  assert.equal(center.onScreen,true);assert.equal(center.x,640);assert.equal(center.y,360);
  const rightUp=enemyIndicator({x:2,y:1,z:-10},viewport);
  assert.ok(rightUp.onScreen&&rightUp.x>640&&rightUp.y<360);
});
test('offscreen arrows point to all four edges and stay inside safe margins',()=>{
  for(const [point,edge] of [[{x:30,y:0,z:-10},'right'],[{x:-30,y:0,z:-10},'left'],[{x:0,y:20,z:-10},'top'],[{x:0,y:-20,z:-10},'bottom']]){
    const result=enemyIndicator(point,viewport),margin=indicatorMargins(1280,720);
    assert.equal(result.onScreen,false);assert.equal(result.edge,edge);
    assert.ok(result.x>=margin.x-.001&&result.x<=1280-margin.x+.001);
    assert.ok(result.y>=margin.top-.001&&result.y<=720-margin.bottom+.001);
    assert.ok(Number.isFinite(result.angle));
  }
});
test('behind-camera bearings keep left/right correct, with a deterministic turn hint directly aft',()=>{
  assert.equal(enemyIndicator({x:10,y:0,z:10},viewport).edge,'right');
  assert.equal(enemyIndicator({x:-10,y:0,z:10},viewport).edge,'left');
  const rear=enemyIndicator({x:0,y:0,z:10},viewport);
  assert.equal(rear.behind,true);assert.equal(rear.edge,'right');
  const near=enemyIndicator({x:1,y:1,z:0},viewport);
  assert.ok([near.x,near.y,near.angle].every(Number.isFinite));
});
test('edge bearings support narrow viewports, wide FOV and targets outside clipping planes',()=>{
  for(const config of [{width:360,height:640,fov:72},{width:1600,height:500,fov:61}]){
    for(const point of [{x:30,y:20,z:-10},{x:-30,y:-20,z:10},{x:0,y:0,z:-300},{x:0,y:0,z:-.001}]){
      const p=enemyIndicator(point,config);
      assert.equal(p.onScreen,false);assert.ok([p.x,p.y,p.angle].every(Number.isFinite));
    }
  }
});
test('eight clustered edge arrows are separated without leaving the viewport',()=>{
  for(const edge of ['left','right','top','bottom']){
    const items=Array.from({length:8},(_,i)=>({edge,index:i,x:edge==='left'?44:edge==='right'?1236:600,y:edge==='top'?88:edge==='bottom'?638:300,angle:.4}));
    spreadEdgeIndicators(items,1280,720);
    const axis=edge==='left'||edge==='right'?'y':'x';
    for(let i=1;i<items.length;i++)assert.ok(items[i][axis]-items[i-1][axis]>=43.99);
    for(const item of items){assert.ok(item.x>=44&&item.x<=1236&&item.y>=88&&item.y<=638);assert.equal(item.angle,.4);}
  }
});
test('HUD cardinal labels remain correct on either side of north',()=>{
  assert.equal(cardinalForHeading(359),'N'); assert.equal(cardinalForHeading(1),'N');
  assert.equal(cardinalForHeading(45),'NE'); assert.equal(cardinalForHeading(90),'E');
  assert.equal(cardinalForHeading(225),'SW'); assert.equal(cardinalForHeading(-45),'NW');
});
