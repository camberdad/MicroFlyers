// Run AFTER testing and adding CHANGELOG.md notes for a new integer version.
import { readFile, writeFile, mkdir, readdir, cp, access } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { VERSION } from '../src/version.js';

const version = VERSION, folder = `versions/v${version}`;
const live = 'https://camberdad.github.io/MicroFlyers/';
const title = `MicroFlyers V${version} — Small jet. Big room.`;
const changes = await readFile('CHANGELOG.md', 'utf8');
const section = changes.split(`## V${version} — `)[1]?.split(/\n## /)[0];
if (!section) throw new Error(`Add a V${version} section to CHANGELOG.md first.`);
const description = section.split('\n')[0].trim();
const changeList = [...section.matchAll(/^- (.+)$/gm)].map(match => match[1]);
if (!changeList.length) throw new Error('A release needs a concrete change list.');
try { await access(folder); throw new Error(`${folder} already exists. Preserve it and increment src/version.js for the next release.`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

let html = await readFile('index.html', 'utf8');
html = html.replaceAll(/\.\/versions\/v\d+\/(src|vendor|assets)\//g, './$1/').replaceAll(/\.\/versions\/v\d+\/styles\.css/g, './styles.css');
html = html.replace(/<title>[^<]+<\/title>/, `<title>${title}</title>`).replace(/id="version-label">V\d+</, `id="version-label">V${version}<`);
await mkdir(folder, { recursive: true });
for (const directory of ['assets', 'src', 'vendor']) await cp(directory, path.join(folder, directory), { recursive: true });
await cp('styles.css', path.join(folder, 'styles.css'));
await cp('.nojekyll', path.join(folder, '.nojekyll'));
await writeFile(path.join(folder, 'index.html'), html);
async function listFiles(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(path.join(directory, entry.name), name + '/'));
    else if (entry.isFile()) files.push(name);
  }
  return files.sort();
}
const files = [];
for (const name of await listFiles(folder)) {
  const bytes = await readFile(path.join(folder, name));
  files.push({ path: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const hash = createHash('sha256').update(files.map(file => file.sha256).join('')).digest('hex').slice(0, 12);
const release = { version: `V${version}`, versionNumber: version, assetVersion: `v${version}-${hash}`, publishedAtUtc: new Date().toISOString(),
  gameUrl: live, versionUrl: `${live}${folder}/`, description, changes: changeList, files };
const versionInfo = { version, label: `V${version}`, release: release.assetVersion };
await writeFile('release.json', JSON.stringify(release, null, 2) + '\n');
await writeFile('version.json', JSON.stringify(versionInfo, null, 2) + '\n');
await writeFile(path.join(folder, 'release.json'), JSON.stringify({ ...release, gameUrl: release.versionUrl, currentGameUrl: live }, null, 2) + '\n');
await writeFile(path.join(folder, 'version.json'), JSON.stringify(versionInfo, null, 2) + '\n');
const rootHtml = html.replaceAll(/\.\/(src|vendor|assets)\//g, `./${folder}/$1/`).replace('./styles.css', `./${folder}/styles.css`);
await writeFile('index.html', rootHtml);
console.log(JSON.stringify({ version: release.version, release: release.assetVersion, files: files.length, retained: folder, url: live }, null, 2));
