// Pin the entire loader graph to one Three.js release. Runtime has no CDN dependency.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = 'https://cdn.jsdelivr.net/npm/three@0.180.0/';
const seen = new Set();
async function download(relative) {
  if (seen.has(relative)) return;
  seen.add(relative);
  const response = await fetch(new URL(relative, base));
  if (!response.ok) throw new Error(`${relative}: HTTP ${response.status}`);
  const source = await response.text();
  const destination = path.join('vendor', 'three', relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, source);
  const dependencies = [...source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)]
    .map(match => match[1]).filter(name => name.startsWith('.'));
  await Promise.all(dependencies.map(name => download(path.posix.normalize(path.posix.join(path.posix.dirname(relative), name)))));
  console.log(`Vendored ${relative}`);
}
await Promise.all([
  download('build/three.module.js'),
  download('examples/jsm/loaders/FBXLoader.js'),
  download('examples/jsm/loaders/GLTFLoader.js'),
  download('examples/jsm/math/OBB.js'),
  download('LICENSE'),
]);
// FFlate is bundled by Three.js; preserve its complete MIT license as well.
const fflateLicense = await fetch('https://cdn.jsdelivr.net/npm/fflate@0.8.2/LICENSE');
if (!fflateLicense.ok) throw new Error(`FFlate license: HTTP ${fflateLicense.status}`);
await writeFile('vendor/three/examples/jsm/libs/fflate.LICENSE', await fflateLicense.text());
