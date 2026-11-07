// Offline conversion of the user's large OBJ into a compact, indexed glTF binary.
// Usage: node scripts/prepare-dining-room.mjs <path/to/room.obj>
// The source stays untouched. Cluster sub-centimeter detail, preserve hard edges,
// triangulate polygons, remove collapsed triangles, and keep named source objects.
import fs from 'node:fs';
import readline from 'node:readline';
import { createHash } from 'node:crypto';
import { MeshoptSimplifier } from './vendor/meshopt_simplifier.module.js';
await MeshoptSimplifier.ready;
const source = process.argv[2];
if (!source) throw new Error('Supply the original room.obj path.');
const positions = [], normals = [], objects = [];
let object = null, sourceTriangles = 0;
const inspection = [];
function start(name) {
  object = { name, faces:[], min:[Infinity,Infinity,Infinity], max:[-Infinity,-Infinity,-Infinity] };
  objects.push(object);
}
for await (const raw of readline.createInterface({input:fs.createReadStream(source)})) {
  const line = raw.trim();
  if (line.startsWith('v ')) positions.push(line.split(/\s+/).slice(1,4).map(Number));
  else if (line.startsWith('vn ')) normals.push(line.split(/\s+/).slice(1,4).map(Number));
  else if (line.startsWith('o ')) start(line.slice(2));
  else if (line.startsWith('f ')) {
    if (!object) start('room');
    const face = line.slice(2).trim().split(/\s+/).map(value=> {
      const [v,,n] = value.split('/').map(Number);
      const vertex = v>0 ? v-1 : positions.length+v;
      const normal = n ? (n>0 ? n-1 : normals.length+n) : -1;
      positions[vertex].forEach((x,i)=>{object.min[i]=Math.min(object.min[i],x);object.max[i]=Math.max(object.max[i],x);});
      return [vertex,normal];
    });
    for(let i=1;i<face.length-1;i++) {object.faces.push([face[0],face[i],face[i+1]]);sourceTriangles++;}
  }
}
const document = {asset:{version:'2.0',generator:'MicroFlyers OBJ preparation'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],accessors:[],bufferViews:[],buffers:[{byteLength:0}]};
const chunks = [], materialIndices = new Map();
let byteLength = 0, triangles = 0;
function accessor(array,type,componentType,min,max) {
  const bytes = Buffer.from(array.buffer,array.byteOffset,array.byteLength);
  const view = document.bufferViews.push({buffer:0,byteOffset:byteLength,byteLength:bytes.length})-1;
  chunks.push(bytes);byteLength+=bytes.length;
  if(byteLength%4){const pad=Buffer.alloc(4-byteLength%4);chunks.push(pad);byteLength+=pad.length;}
  return document.accessors.push({bufferView:view,componentType,count:array.length/(type==='VEC3'?3:1),type,...(min?{min,max}:{})})-1;
}
function palette(name,index) {
  if(/^Muro|^muro|^Techo/i.test(name))return ['plaster',0xe4dfcf,.92];
  if(name==='piso')return ['oak floor',0xab8c69,.75];
  if(/^ventana/i.test(name))return ['window',0xa6c1c6,.27];
  if(/carp|Shelf|^rama|^Box|^box|Rectangle/.test(name))return ['walnut',0x826047,.64];
  if(/Carpet/.test(name))return ['sage rug',0x718274,.96];
  if(/succulent|leaf|^Object0(?:11|13|19|21|34|35|36)$/.test(name))return ['foliage',0x55764c,.95];
  if(index>=23&&index<=33)return ['linen sofa',index>=30?0xbda880:0x71898b,.94];
  if(index>=186&&index<=196)return ['armchair',0xb78964,.9];
  if(/^Plane01[3-8]/.test(name))return ['chair upholstery',0xc2b494,.94];
  if(/Book|ChamferBox/.test(name))return ['book '+index,[0x5d7978,0xae7154,0xd1bf91][index%3],.85];
  if(/Picture/.test(name))return ['artwork',0xc58d65,.8];
  if(/ice_cream|Vase|Decor|Goods/.test(name))return ['ceramic',0xded8c4,.45];
  return ['graphite',0x535e5b,.6];
}
for(const [objectIndex,o] of objects.entries()) {
  // Plane001 is a remote export backdrop outside the architectural floor.
  if(o.max[2]>-400 || !o.faces.length) continue;
  const span=Math.max(...o.max.map((v,i)=>v-o.min[i]));
  const grid=Math.min(.75,Math.max(.08,span/28));
  const clustered=new Map(), vertices=[], sums=[], ns=[], counts=[], indices=[], seen=new Set();
  function vertex([pi,ni]) {
    const p=positions[pi], n=normals[ni]||[0,1,0];
    const key=p.map(x=>Math.round(x/grid)).concat(n.map(x=>Math.round(x*4))).join(',');
    let i=clustered.get(key);
    if(i===undefined){i=vertices.length;clustered.set(key,i);vertices.push(p);sums.push([0,0,0]);ns.push([0,0,0]);counts.push(0);}
    for(let axis=0;axis<3;axis++){sums[i][axis]+=p[axis];ns[i][axis]+=n[axis];}counts[i]++;return i;
  }
  for(const face of o.faces){
    const ids=face.map(vertex);
    if(new Set(ids).size!==3)continue;
    const key=[...ids].sort((a,b)=>a-b).join(',');if(seen.has(key))continue;seen.add(key);indices.push(...ids);
  }
  if(!indices.length)continue;
  const points=new Float32Array(vertices.length*3), directions=new Float32Array(points.length);
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<vertices.length;i++)for(let axis=0;axis<3;axis++){
    const p=sums[i][axis]/counts[i];points[i*3+axis]=p;min[axis]=Math.min(min[axis],p);max[axis]=Math.max(max[axis],p);
    directions[i*3+axis]=ns[i][axis]/(Math.hypot(...ns[i])||1);
  }
  const [name,color,roughness]=palette(o.name,objectIndex);
  if(!materialIndices.has(name)){
    // glTF factors are linear, whereas the curated palette is specified in sRGB.
    const linear=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
    const rgb=[color>>16&255,color>>8&255,color&255].map(v=>linear(v/255));
    materialIndices.set(name,document.materials.push({name,doubleSided:true,pbrMetallicRoughness:{baseColorFactor:[...rgb,1],roughnessFactor:roughness,metallicFactor:0}})-1);
  }
  let simplified=new Uint32Array(indices);
  if(simplified.length>900) [simplified]=MeshoptSimplifier.simplify(simplified,points,3,Math.max(300,Math.floor(simplified.length*.2/3)*3),.012,['Prune']);
  const [remap,count]=MeshoptSimplifier.compactMesh(simplified);
  const compactPoints=new Float32Array(count*3), compactNormals=new Float32Array(count*3);
  for(let i=0;i<remap.length;i++)if(remap[i]!==0xffffffff){compactPoints.set(points.subarray(i*3,i*3+3),remap[i]*3);compactNormals.set(directions.subarray(i*3,i*3+3),remap[i]*3);}
  const indexArray=count>65535?simplified:new Uint16Array(simplified);
  const primitive={attributes:{POSITION:accessor(compactPoints,'VEC3',5126,min,max),NORMAL:accessor(compactNormals,'VEC3',5126)},indices:accessor(indexArray,'SCALAR',count>65535?5125:5123),material:materialIndices.get(name)};
  const mesh=document.meshes.push({name:o.name,primitives:[primitive]})-1;
  document.scenes[0].nodes.push(document.nodes.push({name:o.name,mesh})-1);
  triangles+=simplified.length/3;inspection.push({name:o.name,triangles:simplified.length/3,min,max});
}
document.buffers[0].byteLength=byteLength;
let json=Buffer.from(JSON.stringify(document));if(json.length%4)json=Buffer.concat([json,Buffer.alloc(4-json.length%4,32)]);
const binary=Buffer.concat(chunks), header=Buffer.alloc(20), binHeader=Buffer.alloc(8);
header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+json.length+8+binary.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
binHeader.writeUInt32LE(binary.length,0);binHeader.writeUInt32LE(0x004e4942,4);
fs.mkdirSync('assets',{recursive:true});fs.writeFileSync('assets/dining-room.glb',Buffer.concat([header,json,binHeader,binary]));
const info={source:'room.obj',sourceBytes:fs.statSync(source).size,sourceSha256:createHash('sha256').update(fs.readFileSync(source)).digest('hex'),sourceTriangles,triangles,meshes:inspection.length,bytes:fs.statSync('assets/dining-room.glb').size,units:'source centimeters',preparation:'Indexed mesh, sub-centimeter clustering, meshoptimizer simplification (1.2% relative error limit), remote export backdrop excluded; curated materials because the MTL contains wire colors and no textures.',objects:inspection};
fs.writeFileSync('assets/dining-room-info.json',JSON.stringify(info,null,2)+'\n');
console.log(JSON.stringify({...info,objects:undefined},null,2));
