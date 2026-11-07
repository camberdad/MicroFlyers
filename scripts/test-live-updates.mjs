// Browser integration fixture for the REAL updater. Never deployed as a game version.
// node scripts/test-live-updates.mjs; change artifacts/update-fixture.json to promote.
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const statePath = new URL('../artifacts/update-fixture.json', import.meta.url);
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
await writeFile(statePath, JSON.stringify({ deployed: 2, available: 2 }));
http.createServer(async (req, res) => {
  try {
    const state = JSON.parse(await readFile(statePath));
    const path = new URL(req.url, 'http://localhost').pathname;
    res.setHeader('Cache-Control', 'no-store');
    if (path === '/version.json') { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({version:state.available})); return; }
    if (path === '/styles.css') { res.setHeader('Content-Type','text/css'); res.end(await readFile(new URL('../styles.css',import.meta.url))); return; }
    const module = path.match(/^\/v([23])\/(updates|update-policy|version)\.js$/);
    if (module) {
      res.setHeader('Content-Type','text/javascript');
      res.end(module[2] === 'version' ? `export const VERSION=${module[1]}; export const VERSION_LABEL='V${module[1]}';` : await readFile(new URL(`../src/${module[2]}.js`,import.meta.url)));
      return;
    }
    if (path !== '/') { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type','text/html');
    res.end(`<!doctype html><html><head><title>MicroFlyers update integration fixture</title><link rel="stylesheet" href="/styles.css"></head><body><main id="app" style="padding:50px"><h1 style="font-size:40px">Live update verification</h1><p>Real MicroFlyers updater · simulated release</p><div class="version-badge"><strong id="version-label">V${state.deployed}</strong><span id="update-status">CHECKING</span></div><p id="flight-state">Hangar</p><button class="primary-button" id="launch-button">Enter flight</button><button class="secondary-button" style="width:220px" id="check-button">Check for update</button><aside id="update-notice" class="update-notice hidden" role="status"><span id="update-message"></span><button id="update-action" class="hidden"></button><div id="update-progress" class="hidden"><i></i></div></aside></main><script type="module">import {LiveUpdates} from '/v${state.deployed}/updates.js'; const u=new LiveUpdates(()=>{document.getElementById('flight-state').textContent='Hangar';u.setState('intro')});u.setState('intro');u.loaded();document.getElementById('launch-button').onclick=()=>{document.getElementById('flight-state').textContent='Flight active';u.setState('playing')};document.getElementById('check-button').onclick=()=>u.check();</script></body></html>`);
  } catch { res.writeHead(500); res.end('Fixture error'); }
}).listen(4174,'127.0.0.1',()=>console.log('Update fixture: http://localhost:4174/'));
