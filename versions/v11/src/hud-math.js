/** Compass heading from a horizontal forward vector: north=-Z, east=+X. */
export function compassHeading(x,z) {
  return (Math.atan2(x,-z)*180/Math.PI+360)%360;
}
export function cardinalForHeading(degrees) {
  return ['N','NE','E','SE','S','SW','W','NW'][Math.round(((degrees%360)+360)%360/45)%8];
}
