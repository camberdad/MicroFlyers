// GitHub administration using the user's existing Git Credential Manager session.
// Credentials are held only in process memory and never printed or written to disk.
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const owner = 'camberdad', repository = 'MicroFlyers';
const result = spawnSync('git', ['credential', 'fill'], {
  input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8',
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
  windowsHide: true,
});
if (result.status !== 0) throw new Error('No existing non-interactive GitHub sign-in is available.');
const fields = Object.fromEntries(result.stdout.trim().split(/\r?\n/).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
if (!fields.password) throw new Error('Git Credential Manager did not supply a credential.');
const headers = { Authorization: `Bearer ${fields.password}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'MicroFlyers-Publisher' };
async function api(endpoint, method = 'GET', data) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    method, headers: { ...headers, ...(data ? { 'Content-Type': 'application/json' } : {}) },
    body: data ? JSON.stringify(data) : undefined,
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}
const identity = await api('/user');
if (identity.status !== 200 || identity.body.login !== owner) throw new Error('GitHub sign-in does not match the intended owner camberdad.');
const mode = process.argv[2] || 'inspect';
const path = `/repos/${owner}/${repository}`;
let repo = await api(path);
if (mode === 'create') {
  if (repo.status === 404) {
    repo = await api('/user/repos', 'POST', { name: repository, description: 'MicroFlyers — miniature jet dogfights inside a massive living room. Three.js browser game.', private: false, auto_init: false, homepage: `https://${owner}.github.io/${repository}/`, has_wiki: false });
    if (repo.status !== 201) throw new Error(`Repository creation failed: HTTP ${repo.status}: ${repo.body.message}`);
  } else if (repo.status !== 200) throw new Error(`Repository inspection failed: HTTP ${repo.status}: ${repo.body.message}`);
} else if (mode === 'pages') {
  const existing = await api(`${path}/pages`);
  const configured = await api(`${path}/pages`, existing.status === 404 ? 'POST' : 'PUT', { build_type: 'legacy', source: { branch: 'main', path: '/' } });
  if (![200, 201, 204].includes(configured.status)) throw new Error(`Pages configuration failed: HTTP ${configured.status}: ${configured.body.message}`);
  if (existing.status !== 404) await api(`${path}/pages/builds`, 'POST');
} else if (mode === 'release') {
  const info = JSON.parse(await readFile(new URL('../release.json', import.meta.url), 'utf8'));
  const tag = `v${info.versionNumber}`;
  const existing = await api(`${path}/releases/tags/${tag}`);
  let published = existing;
  if (existing.status === 404) {
    const commit = spawnSync('git', ['rev-parse','HEAD'], {encoding:'utf8',windowsHide:true});
    if (commit.status !== 0) throw new Error('Cannot determine the tested release commit.');
    const body = `Play: ${info.gameUrl}\n\nRetained version: ${info.versionUrl}\n\n${info.changes.map(change => '- ' + change).join('\n')}\n\nAsset version: ${info.assetVersion}`;
    published = await api(`${path}/releases`, 'POST', { tag_name:tag, target_commitish:commit.stdout.trim(), name:`${info.version} — ${info.description}`, body, draft:false, prerelease:false });
    if (published.status !== 201) throw new Error(`Release creation failed: HTTP ${published.status}: ${published.body.message}`);
  } else if (existing.status !== 200) throw new Error(`Release inspection failed: HTTP ${existing.status}`);
  console.log(JSON.stringify({releaseUrl:published.body.html_url,tag:published.body.tag_name}));
} else if (mode !== 'inspect' && mode !== 'status') throw new Error(`Unknown mode: ${mode}`);
const pages = repo.status === 200 || repo.status === 201 ? await api(`${path}/pages`) : { status: 404, body: {} };
console.log(JSON.stringify({ owner: identity.body.login, repository: repo.status, url: repo.body.html_url,
  defaultBranch: repo.body.default_branch, pages: pages.status, pagesStatus: pages.body.status, gameUrl: pages.body.html_url }, null, 2));
