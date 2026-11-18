import * as THREE from 'three';
import { crossesRing } from './modes.js';

/** Floating power-ups dropped by destroyed enemies in Survival and Career. */
export const POWERUPS = Object.freeze({
  repair:Object.freeze({name:'REPAIR KIT',detail:'+35 hull',color:0x7dffb0,weight:34}),
  rapid:Object.freeze({name:'RAPID FIRE',detail:'Gun fires 80% faster · 8s',color:0xffd24a,weight:24,duration:8}),
  spread:Object.freeze({name:'TRIPLE SHOT',detail:'Three-way gun spread · 8s',color:0xff8c42,weight:22,duration:8}),
  shield:Object.freeze({name:'SHIELD',detail:'Immune to fire · 6s',color:0x7fd8ff,weight:14,duration:6}),
  missile:Object.freeze({name:'MISSILE RELOAD',detail:'Missile rack instantly rearmed',color:0xffffff,weight:6}),
});
export function pickPowerup(random=Math.random) {
  const total=Object.values(POWERUPS).reduce((n,p)=>n+p.weight,0);
  let roll=random()*total;
  for(const [kind,p] of Object.entries(POWERUPS)){roll-=p.weight;if(roll<0)return kind;}
  return 'repair';
}

const coreGeometry = new THREE.OctahedronGeometry(.28, 0);
const ringGeometry = new THREE.TorusGeometry(.45, .035, 6, 24);
const haloGeometry = new THREE.SphereGeometry(.55, 12, 8);
export const PICKUP_RADIUS = 1.1;

export class Pickups {
  constructor(scene){this.scene=scene;this.items=[];}
  reset(){for(const item of this.items)this.remove(item);this.items=[];}
  remove(item){item.group.removeFromParent();item.materials.forEach(m=>m.dispose());}
  spawn(position,kind) {
    const spec=POWERUPS[kind]??POWERUPS.repair,group=new THREE.Group();
    const core=new THREE.MeshStandardMaterial({color:spec.color,emissive:spec.color,emissiveIntensity:.9,roughness:.3,metalness:.2});
    const glow=new THREE.MeshBasicMaterial({color:spec.color,transparent:true,opacity:.18,depthWrite:false,blending:THREE.AdditiveBlending});
    group.add(new THREE.Mesh(coreGeometry,core));
    const ring=new THREE.Mesh(ringGeometry,core);ring.rotation.x=Math.PI/2;group.add(ring);
    group.add(new THREE.Mesh(haloGeometry,glow));
    group.position.copy(position);this.scene.add(group);
    const item={kind,spec,group,ring,base:position.clone(),age:0,life:16,materials:[core,glow]};
    this.items.push(item);return item;
  }
  /** Returns the kinds collected this step. Items blink before expiring. */
  update(dt,player) {
    const collected=[];
    for(let i=this.items.length-1;i>=0;i--){
      const item=this.items[i];item.age+=dt;
      item.group.position.y=item.base.y+Math.sin(item.age*2.4)*.18;
      item.group.rotation.y+=dt*2.2;item.ring.rotation.y+=dt*3;
      item.group.visible=item.life-item.age>3||Math.sin(item.age*18)>-.2;
      if(player&&item.group.position.distanceTo(player.position)<PICKUP_RADIUS){collected.push(item.kind);this.remove(item);this.items.splice(i,1);continue;}
      if(item.age>=item.life){this.remove(item);this.items.splice(i,1);}
    }
    return collected;
  }
}

/** Visible ring course for Ring Race. The current ring glows; the next is dimmer. */
const raceRing = new THREE.TorusGeometry(1, .07, 10, 48);
const raceMaterials = {
  current:new THREE.MeshStandardMaterial({color:0xddf484,emissive:0xddf484,emissiveIntensity:1.1,roughness:.3}),
  next:new THREE.MeshStandardMaterial({color:0x9fe2d8,emissive:0x9fe2d8,emissiveIntensity:.45,roughness:.4,transparent:true,opacity:.7}),
  later:new THREE.MeshStandardMaterial({color:0xffffff,emissive:0x9fb8c0,emissiveIntensity:.15,roughness:.5,transparent:true,opacity:.28,depthWrite:false}),
  done:new THREE.MeshBasicMaterial({color:0xddf484,transparent:true,opacity:.08,depthWrite:false}),
};
const noseAxis = new THREE.Vector3(0,0,1);

export class RingCourse {
  constructor(scene){this.scene=scene;this.meshes=[];this.course=null;this.index=0;}
  load(course) {
    this.clear();this.course=course;this.index=0;
    for(const ring of course.rings){
      const mesh=new THREE.Mesh(raceRing,raceMaterials.later);
      mesh.scale.setScalar(ring.radius);mesh.position.copy(ring.position);
      mesh.quaternion.setFromUnitVectors(noseAxis,ring.normal);
      this.scene.add(mesh);this.meshes.push(mesh);
    }
    this.paint();
  }
  clear(){for(const mesh of this.meshes)mesh.removeFromParent();this.meshes=[];this.course=null;this.index=0;}
  get current(){return this.course?.rings[this.index]??null;}
  get finished(){return Boolean(this.course)&&this.index>=this.course.rings.length;}
  paint() {
    this.meshes.forEach((mesh,i)=>{
      mesh.material=i<this.index?raceMaterials.done:i===this.index?raceMaterials.current:i===this.index+1?raceMaterials.next:raceMaterials.later;
    });
  }
  /** Advance when the jet's swept path crosses the current ring. */
  update(dt,start,end) {
    const ring=this.current;
    const mesh=this.meshes[this.index];
    if(mesh){const pulse=1+Math.sin(performance.now()*.008)*.05;mesh.scale.setScalar(ring.radius*pulse);}
    if(!ring||!crossesRing(start,end,ring))return false;
    if(mesh)mesh.scale.setScalar(ring.radius);
    this.index++;this.paint();return true;
  }
}
