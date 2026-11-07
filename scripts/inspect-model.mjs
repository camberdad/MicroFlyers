import './three-node.mjs';
import { readFile } from 'node:fs/promises';
const { FBXLoader } = await import('../vendor/three/examples/jsm/loaders/FBXLoader.js');
const { Box3, Vector3, LoadingManager, Texture } = await import('../vendor/three/build/three.module.js');
const bytes = await readFile(new URL('../assets/InteriorTest.fbx', import.meta.url));
globalThis.window = { innerWidth: 1600, innerHeight: 900 };
const manager = new LoadingManager();
const textureReferences = [];
manager.addHandler(/.*/, { load(url) { textureReferences.push(url); return new Texture(); }, setPath() {}, setResourcePath() {} });
const model = new FBXLoader(manager).parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
model.updateMatrixWorld(true);
const bounds = new Box3().setFromObject(model);
const meshes = [];
model.traverse(object => {
  if (!object.isMesh) return;
  const box = new Box3().setFromObject(object);
  meshes.push({ name: object.name, vertices: object.geometry.attributes.position.count,
    min: box.min.toArray(), max: box.max.toArray(),
    material: (Array.isArray(object.material) ? object.material : [object.material]).map(m => ({ name: m.name, color: m.color?.getHexString(), map: !!m.map })) });
});
console.log(JSON.stringify({ min: bounds.min.toArray(), max: bounds.max.toArray(), size: bounds.getSize(new Vector3()).toArray(), textureReferences, meshes }, null, 2));
