import test from 'node:test';
import assert from 'node:assert/strict';
import { compassHeading,cardinalForHeading } from '../src/hud-math.js';

test('HUD compass follows the world axes and wraps north without negative headings',()=>{
  assert.equal(compassHeading(0,-1),0); assert.equal(compassHeading(1,0),90);
  assert.equal(compassHeading(0,1),180); assert.equal(compassHeading(-1,0),270);
  assert.ok(compassHeading(-.001,-1)>359 && compassHeading(.001,-1)<1);
});
test('HUD cardinal labels remain correct on either side of north',()=>{
  assert.equal(cardinalForHeading(359),'N'); assert.equal(cardinalForHeading(1),'N');
  assert.equal(cardinalForHeading(45),'NE'); assert.equal(cardinalForHeading(90),'E');
  assert.equal(cardinalForHeading(225),'SW'); assert.equal(cardinalForHeading(-45),'NW');
});
