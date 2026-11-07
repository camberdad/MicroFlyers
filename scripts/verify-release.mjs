// Verify the PUBLIC site against the local release manifest after Pages deploys.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const manifest = JSON.parse(await readFile(new URL('../release.json', import.meta.url), 'utf8'));
const base = new URL(process.argv[2] || manifest.gameUrl);
async function download(path) {
  const url = new URL(path, base); url.searchParams.set('verify', manifest.assetVersion);
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const current = JSON.parse((await download('version.json')).toString());
if (Number(current.version) !== manifest.versionNumber || current.release !== manifest.assetVersion) throw new Error('Public version does not match the prepared release yet.');
const publicManifest = JSON.parse((await download('release.json')).toString());
if (publicManifest.assetVersion !== manifest.assetVersion) throw new Error('Public release manifest is stale.');
const root = await download('index.html');
if (hash(root) !== hash(await readFile(new URL('../index.html', import.meta.url)))) throw new Error('Root HTML differs from the committed release.');
let completed = 0;
const queue = [...manifest.files];
async function worker() {
  while (queue.length) {
    const file = queue.shift();
    const bytes = await download(`versions/v${manifest.versionNumber}/${file.path}`);
    if (bytes.length !== file.bytes || hash(bytes) !== file.sha256) throw new Error(`Asset checksum mismatch: ${file.path}`);
    completed++;
  }
}
await Promise.all(Array.from({length:4}, worker));
await download('versions/v1/index.html');
await download('embed.html');
const result = { version:manifest.version, release:manifest.assetVersion, url:base.href, verifiedAtUtc:new Date().toISOString(),
  checksummedFiles:completed, rootHtmlMatches:true, retainedV1:true, embedAvailable:true };
await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});
await writeFile(new URL('../artifacts/public-release-verified.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
