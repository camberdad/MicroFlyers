import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SurfaceIndex } from './surface-index.js';
import { MAPS } from './maps.js';

const textureCache = new Map();
const materialCache = new Map();
let noiseSeed = 173;
function noise() { noiseSeed = (noiseSeed * 1664525 + 1013904223) >>> 0; return noiseSeed / 4294967296; }

/** Procedural replacements for the image files referenced by (but absent from) the supplied FBX. */
function texture(kind) {
  if (textureCache.has(kind)) return textureCache.get(kind);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const c = canvas.getContext('2d');
  c.fillStyle = kind === 'wood' ? '#9c7650' : kind === 'rug' ? '#69776a' : kind === 'art' ? '#e9dcb9' : kind === 'screen' ? '#15282e' : '#dad8cc';
  c.fillRect(0, 0, 512, 512);
  if (kind === 'wood') {
    for (let i = 0; i < 8; i++) {
      const y = i * 64;
      c.fillStyle = `rgba(${noise() > .5 ? '237,211,160' : '76,46,25'},${.07 + noise() * .12})`; c.fillRect(0, y, 512, 63);
      c.fillStyle = '#30241c55'; c.fillRect(0, y, 512, 1); c.fillRect((i % 2) * 190 + 120, y, 1, 64);
      for (let j = 0; j < 100; j++) {
        c.fillStyle = `rgba(54,33,20,${noise() * .1})`;
        c.fillRect(noise() * 512, y + noise() * 64, 20 + noise() * 180, .5);
      }
    }
  } else if (kind === 'rug') {
    for (let i = 0; i < 512; i += 3) { c.fillStyle = i % 2 ? '#c3c6ad18' : '#1f342c22'; c.fillRect(0, i, 512, 1); c.fillRect(i, 0, 1, 512); }
    c.strokeStyle = '#d8d2b044'; c.lineWidth = 3; c.strokeRect(21, 21, 470, 470); c.strokeRect(29, 29, 454, 454);
  } else if (kind === 'art') {
    c.fillStyle = '#c86646'; c.beginPath(); c.arc(280, 210, 155, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#526964'; c.fillRect(50, 280, 275, 210);
    c.fillStyle = '#deb960'; c.beginPath(); c.arc(390, 80, 90, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#2b4741'; c.lineWidth = 7; c.beginPath(); c.moveTo(90, 430); c.bezierCurveTo(440, 260, 20, 180, 330, 30); c.stroke();
  } else if (kind === 'screen') {
    c.fillStyle = '#ddf484'; c.font = 'bold 43px sans-serif'; c.fillText('MICRO', 45, 180); c.fillText('FLYERS', 45, 232);
    c.fillStyle = '#b3c3b5'; c.font = '15px sans-serif'; c.fillText('SMALL JET. BIG ROOM.', 48, 275);
    c.strokeStyle = '#55766d'; c.lineWidth = 2; for (let i = 0; i < 6; i++) c.strokeRect(40 + i * 55, 355, 43, 65);
  } else {
    for (let i = 0; i < 14000; i++) { c.fillStyle = `rgba(70,65,50,${noise() * .035})`; c.fillRect(noise() * 512, noise() * 512, 2, 2); }
  }
  const result = new THREE.CanvasTexture(canvas); result.colorSpace = THREE.SRGBColorSpace;
  result.wrapS = result.wrapT = THREE.RepeatWrapping;
  if (kind === 'wood') result.repeat.set(3, 6);
  result.anisotropy = 4; textureCache.set(kind, result); return result;
}

function roomMaterial(original) {
  const name = original.name;
  if (materialCache.has(name)) return materialCache.get(name);
  const options = { color: original.color?.clone() ?? new THREE.Color(0xc8c7ba), roughness: .8, side: THREE.DoubleSide };
  if (/^Floor$/.test(name)) { options.color = new THREE.Color(0xd5b28c); options.map = texture('wood'); options.roughness = .62; }
  else if (/Sofa|Cusion/.test(name)) { options.color = new THREE.Color(/Kecil/.test(name) ? 0x777d61 : /Cusion/.test(name) ? 0x6d8584 : 0x3c5d61); options.roughness = .94; }
  else if (/Carpet/.test(name)) { options.color = new THREE.Color(0xd0d4b1); options.map = texture('rug'); }
  else if (/Wall Down|Side Wall/.test(name)) { options.color = new THREE.Color(0xdbd9c7); options.map = texture('plaster'); }
  else if (/^Wall$|Roof|SideTegel/.test(name)) options.color = new THREE.Color(0xe9e4d4);
  else if (/Lemari|Meja|TiangMeja/.test(name)) { options.color = new THREE.Color(/Kerangka/.test(name) ? 0x5e4939 : 0xc3a47a); options.map = texture('wood'); }
  else if (/Picture[234]?$/.test(name)) { options.color = new THREE.Color(0xffffff); options.map = texture('art'); }
  else if (/Netflix|TV/.test(name)) { options.color = new THREE.Color(0xffffff); options.map = texture('screen'); options.emissive = new THREE.Color(0x294d4b); options.emissiveIntensity = .15; }
  else if (/Tree/.test(name)) options.color = new THREE.Color(/Branch/.test(name) ? 0x626c42 : 0x526943);
  else if (/Book/.test(name)) options.color = new THREE.Color(/2/.test(name) ? 0x9e674a : 0xb8a781);
  else if (/Emmision/.test(name)) { options.color = new THREE.Color(0xfff4da); options.emissive = new THREE.Color(0xffd99b); options.emissiveIntensity = .6; }
  else if (/Aluminium|Kaca|Cermin/.test(name)) { options.color = new THREE.Color(0x7e9693); options.metalness = .6; options.roughness = .22; }
  const material = new THREE.MeshStandardMaterial(options); material.name = name;
  materialCache.set(name, material); return material;
}

export function initWorld(scene, renderer) {
  scene.background = new THREE.Color(0xd6d9ce);
  scene.fog = new THREE.Fog(0xd6d9ce, 85, 180);
  scene.add(new THREE.AmbientLight(0xfff5df, 1.1));
  scene.add(new THREE.HemisphereLight(0xdcebf0, 0x75634c, 1.5));
  const sun = new THREE.DirectionalLight(0xffefcf, 3.3);
  sun.position.set(-27, 38, 19); sun.target.position.set(5, 0, -15);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 65, bottom: -65, near: .5, far: 145 });
  sun.shadow.bias = -.0002; sun.shadow.normalBias = .035;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xd2e8eb, 1.2); fill.position.set(20, 20, -35); scene.add(fill);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

/** Asset loading is isolated from init() and the animation loop. */
export async function loadAirfield(scene, onProgress = () => {}, mapId = 'living') {
  const map = MAPS[mapId];
  if (!map) throw new Error('Unknown airfield.');
  const manager = new THREE.LoadingManager();
  // These source textures were not included with InteriorTest.fbx. Resolve them
  // locally to a generated swatch; roomMaterial supplies the finished materials.
  const placeholder = texture('plaster');
  manager.addHandler(/.*/, { load: () => placeholder, setPath() {}, setResourcePath() {} });
  const progress = e => onProgress(e.total ? e.loaded/e.total : .5);
  const room = mapId==='dining'
    ? (await new GLTFLoader().loadAsync(new URL('../assets/dining-room.glb',import.meta.url).href,progress)).scene
    : await new FBXLoader(manager).loadAsync(new URL('../assets/InteriorTest.fbx',import.meta.url).href,progress);
  // Discard exported cameras and lights; use the predictable browser lighting rig.
  const remove = [];
  room.traverse(o => { if (o.isCamera || o.isLight) remove.push(o); });
  remove.forEach(o => o.removeFromParent());
  if(mapId==='living')room.traverse(o=>{if(o.isMesh)o.material=Array.isArray(o.material)?o.material.map(roomMaterial):roomMaterial(o.material);});
  const world = prepareAirfield(room,mapId);
  scene.add(world.root);
  addRunway(world.root, world);
  return world;
}

/** Pure normalization/collision setup shared by browser loading and model tests. */
export function prepareAirfield(room,mapId='living') {
  const map = MAPS[mapId];
  room.updateMatrixWorld(true);
  const sourceBounds = new THREE.Box3().setFromObject(room);
  const size = sourceBounds.getSize(new THREE.Vector3());
  const center = sourceBounds.getCenter(new THREE.Vector3());
  const scale = 120 / Math.max(size.x, size.z);
  room.scale.setScalar(scale);
  const floor = mapId==='dining' ? 0 : sourceBounds.min.y;
  room.position.set(-center.x * scale, -floor * scale, -center.z * scale);
  room.updateMatrixWorld(true);
  const colliders = [];
  let meshCount = 0;
  room.traverse(o => {
    if (!o.isMesh) return;
    meshCount++;
    o.castShadow = true; o.receiveShadow = true;
    // Per-mesh boxes, never the room's enclosing Box3 (which would collide everywhere).
    const box = new THREE.Box3().setFromObject(o);
    colliders.push({ box, mesh: o });
  });
  const sourcePoint=(x,y,z)=>new THREE.Vector3((x-center.x)*scale,(y-floor)*scale,(z-center.z)*scale);
  const bounds = new THREE.Box3(sourcePoint(...map.sourceBounds[0]),sourcePoint(...map.sourceBounds[1]));
  const surfaceTree = new SurfaceIndex(room);
  const root = new THREE.Group();root.add(room);
  return {map,root,room,colliders,bounds,scale,meshCount,surfaceTree,
    flightArea:mapId==='dining'?new THREE.Box3(sourcePoint(390,0,-1035),sourcePoint(1000,297,-600)):bounds.clone(),
    spawn:mapId==='dining'?sourcePoint(720,150,-990):new THREE.Vector3(-10,16,42),
    heading:mapId==='dining'?Math.PI:0,
    showcase:mapId==='dining'?sourcePoint(730,135,-890):new THREE.Vector3(-13,14.7,35.5),
    overview:mapId==='dining'?sourcePoint(740,170,-1020):new THREE.Vector3(-20,16,42),
    overviewTarget:mapId==='dining'?sourcePoint(680,70,-780):new THREE.Vector3(8,10,-15),
    patrol:mapId==='dining'?{center:sourcePoint(700,160,-800),radiusX:19,radiusZ:18,vertical:1.5}:null,
  };
}

function addRunway(scene, world) {
  const runway = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.6, .06, 18), new THREE.MeshStandardMaterial({ color: 0x2f3e3c, roughness: .85 }));
  deck.receiveShadow = true; runway.add(deck);
  const paint = new THREE.MeshBasicMaterial({ color: 0xdce6b6 });
  for (let i = 0; i < 8; i++) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(.1, .65), paint);
    dash.rotation.x = -Math.PI / 2; dash.position.set(0, .034, -7 + i * 2); runway.add(dash);
  }
  for (const x of [-1.65, 1.65]) for (let z = -8; z <= 8; z += 2) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(.055, 6, 4), new THREE.MeshBasicMaterial({ color: 0xd6f58b }));
    lamp.position.set(x, .09, z); runway.add(lamp);
  }
  runway.position.copy(world.spawn); runway.position.y=world.bounds.min.y+.12; scene.add(runway);
  world.runway = runway;
}

export function isSafePosition(world, position, halfSize = .7) {
  const box = new THREE.Box3().setFromCenterAndSize(position, new THREE.Vector3(halfSize * 2, halfSize * 2, halfSize * 2));
  if(!world.bounds.containsBox(box))return false;
  if(!world.surfaceTree)return !world.colliders.some(c=>c.box.intersectsBox(box));
  const sphere=new THREE.Sphere(position,halfSize),triangles=[],closest=new THREE.Vector3();
  world.surfaceTree.getSphereTriangles(sphere,triangles);
  return !triangles.some(t=>t.closestPointToPoint(position,closest).distanceToSquared(position)<halfSize*halfSize);
}
