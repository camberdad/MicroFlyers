import * as THREE from 'three';
import { JET_SCALE } from './maps.js';

// Small procedural radial texture: additive glow needs no external image asset.
function exhaustGlowTexture() {
  const size=32, data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const radius=Math.hypot((x+.5-size/2)/(size/2),(y+.5-size/2)/(size/2));
    const offset=(y*size+x)*4;
    data[offset]=100; data[offset+1]=205; data[offset+2]=255;
    data[offset+3]=Math.round(255*Math.max(0,1-radius)**2);
  }
  const texture=new THREE.DataTexture(data,size,size);texture.needsUpdate=true;
  return texture;
}

function shapeMesh(points, material, thickness = .045) {
  const shape = new THREE.Shape();
  points.forEach(([x, z], i) => i ? shape.lineTo(x, -z) : shape.moveTo(x, -z));
  shape.closePath();
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .012, bevelThickness: .012 }), material);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

/** A code-built, swept-wing micro jet. No external aircraft asset required. */
export function createJet(enemy = false) {
  const jet = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: enemy ? 0xc9654c : 0xe8e9d9, roughness: .42, metalness: .32 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x243e48, roughness: .35, metalness: .5 });
  const accent = new THREE.MeshStandardMaterial({ color: enemy ? 0xffb196 : 0xd6f285, roughness: .45, metalness: .25 });
  const glow = new THREE.MeshBasicMaterial({ color: enemy ? 0xff704c : 0x9cdaff });
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(.065, .13, 1.1, 10), body);
  fuselage.rotation.x = -Math.PI / 2;
  fuselage.position.z = -.08;
  jet.add(fuselage);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(.065, .44, 10), dark);
  nose.rotation.x = -Math.PI / 2; nose.position.z = -.84; jet.add(nose);
  const wings = shapeMesh([[-.1, -.24], [-.92, .4], [-.88, .54], [-.12, .29], [.12, .29], [.88, .54], [.92, .4], [.1, -.24]], body);
  jet.add(wings);
  const leftStripe = shapeMesh([[-.55, .13], [-.7, .25], [-.68, .44], [-.53, .4]], accent, .008);
  const rightStripe = leftStripe.clone(); rightStripe.scale.x = -1;
  leftStripe.position.y = rightStripe.position.y = .04; jet.add(leftStripe, rightStripe);
  const tail = shapeMesh([[-.08, .34], [-.42, .67], [-.39, .76], [.39, .76], [.42, .67], [.08, .34]], dark, .035);
  tail.position.y = .075; jet.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(.035, .32, .32), accent);
  fin.position.set(0, .21, .5); fin.rotation.x = -.35; jet.add(fin);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(.12, 16, 10), new THREE.MeshStandardMaterial({ color: 0x426b76, roughness: .14, metalness: .65 }));
  canopy.scale.set(.7, .7, 2.1); canopy.position.set(0, .09, -.26); jet.add(canopy);
  const exhaust = new THREE.Group();
  for (const x of [-.07, .07]) {
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(.05, .06, .13, 8), dark);
    nozzle.rotation.x = Math.PI / 2; nozzle.position.set(x, -.035, .53); jet.add(nozzle);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(.052, .36, 8), glow);
    flame.rotation.x = Math.PI / 2; flame.position.set(x, -.035, .74); exhaust.add(flame);
  }
  jet.add(exhaust); jet.userData.exhaust = exhaust;
  if(!enemy) {
    const halos=new THREE.Group();halos.visible=false;
    const material=new THREE.SpriteMaterial({map:exhaustGlowTexture(),blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
    for(const x of [-.07,.07]) {
      const halo=new THREE.Sprite(material);halo.position.set(x,-.035,.69);halo.scale.set(.66,.66,1);halos.add(halo);
    }
    jet.add(halos);jet.userData.boostGlow=halos;
  }
  const navMaterial = new THREE.MeshBasicMaterial({ color: enemy ? 0xff6a46 : 0xddff9b });
  for (const x of [-.88, .88]) {
    const light = new THREE.Mesh(new THREE.SphereGeometry(.026, 6, 4), navMaterial);
    light.position.set(x, .04, .47); jet.add(light);
  }
  jet.scale.setScalar(enemy ? .68 : JET_SCALE);
  jet.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return jet;
}

/** Held boost brightens both nozzles immediately; flames remain scenery-occluded. */
export function updateJetExhaust(jet,boosting,throttle=.5,time=0) {
  const exhaust=jet.userData.exhaust;
  const pulse=1+Math.sin(time*42)*.05;
  const length=boosting ? .88*pulse : .36*(.75+throttle*.3);
  exhaust.scale.set(1,1,1);
  for(const flame of exhaust.children) {
    flame.scale.set(boosting?1.45:1,length/.36,boosting?1.45:1);
    flame.position.z=.58+length/2;
    flame.material.color.setHex(boosting?0x82e8ff:0x9cdaff);
  }
  if(jet.userData.boostGlow) jet.userData.boostGlow.visible=boosting;
}
