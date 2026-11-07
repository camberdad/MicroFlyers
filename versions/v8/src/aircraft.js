import * as THREE from 'three';
import { JET_SCALE } from './maps.js';

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
  const navMaterial = new THREE.MeshBasicMaterial({ color: enemy ? 0xff6a46 : 0xddff9b });
  for (const x of [-.88, .88]) {
    const light = new THREE.Mesh(new THREE.SphereGeometry(.026, 6, 4), navMaterial);
    light.position.set(x, .04, .47); jet.add(light);
  }
  jet.scale.setScalar(enemy ? .68 : JET_SCALE);
  jet.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return jet;
}
