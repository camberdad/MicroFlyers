/** Compass heading from a horizontal forward vector: north=-Z, east=+X. */
export function compassHeading(x,z) {
  return (Math.atan2(x,-z)*180/Math.PI+360)%360;
}
export function cardinalForHeading(degrees) {
  return ['N','NE','E','SE','S','SW','W','NW'][Math.round(((degrees%360)+360)%360/45)%8];
}

export function indicatorMargins(width,height) {
  return {x:Math.min(44,width*.1),top:Math.min(88,height*.18),bottom:Math.min(82,height*.17)};
}

/** Camera-space -Z is forward. Dividing by |depth| keeps behind-camera targets
 * on the correct left/right side instead of mirroring perspective projection.
 * An exactly rearward contact gets a right-turn arrow and a BEHIND label.
 */
export function enemyIndicator(point,{width,height,fov,near=.05,far=230}) {
  const depth=-point.z,behind=depth<0,tan=Math.tan(fov*Math.PI/360);
  const divisor=Math.max(Math.abs(depth),.0001);
  const nx=point.x/(divisor*tan*(width/height)),ny=point.y/(divisor*tan);
  const onScreen=depth>near&&depth<far&&Math.abs(nx)<=1&&Math.abs(ny)<=1;
  if(onScreen)return {onScreen:true,x:(nx*.5+.5)*width,y:(.5-ny*.5)*height,behind:false};
  let dx=nx*width*.5,dy=-ny*height*.5;
  if(Math.abs(dx)+Math.abs(dy)<.00001){dx=behind?1:0;dy=behind?0:-1;}
  const margin=indicatorMargins(width,height),cx=width/2,cy=height/2;
  const tx=Math.abs(dx)>.000001?(cx-margin.x)/Math.abs(dx):Infinity;
  const ty=Math.abs(dy)>.000001?(dy<0?cy-margin.top:cy-margin.bottom)/Math.abs(dy):Infinity;
  const scale=Math.min(tx,ty);
  return {onScreen:false,x:cx+dx*scale,y:cy+dy*scale,angle:Math.atan2(dy,dx),behind,
    edge:tx<ty?(dx<0?'left':'right'):(dy<0?'top':'bottom')};
}

/** Spread crowded edge contacts without changing their actual bearing arrows. */
export function spreadEdgeIndicators(indicators,width,height) {
  const margin=indicatorMargins(width,height);
  for(const edge of ['left','right','top','bottom']){
    const list=indicators.filter(i=>i.edge===edge),vertical=edge==='left'||edge==='right',axis=vertical?'y':'x';
    if(list.length<2)continue;
    const min=vertical?margin.top:margin.x,max=vertical?height-margin.bottom:width-margin.x;
    const gap=Math.min(44,(max-min)/(list.length-1));
    list.sort((a,b)=>a[axis]-b[axis]);
    for(let i=1;i<list.length;i++)list[i][axis]=Math.max(list[i][axis],list[i-1][axis]+gap);
    if(list.at(-1)[axis]>max){const shift=list.at(-1)[axis]-max;for(const item of list)item[axis]-=shift;}
    for(let i=list.length-2;i>=0;i--)list[i][axis]=Math.min(list[i][axis],list[i+1][axis]-gap);
    if(list[0][axis]<min){const shift=min-list[0][axis];for(const item of list)item[axis]+=shift;}
  }
  return indicators;
}
