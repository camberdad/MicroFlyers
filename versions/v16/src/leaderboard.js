import { ONLINE_LEADERBOARD } from './online-config.js';
import { cleanCallsign, lowerIsBetter } from './progress.js';

/** Online world leaderboard on Google Firebase (Firestore + anonymous Auth),
 * using the plain REST APIs so no SDK download is needed.
 *  - boards/{board}/entries/{uid}: one best entry per anonymous player per board.
 *  - firestore.rules lets anyone read, but only a signed-in player may write
 *    their own entry, with validated fields, plausibility limits, a 5-second
 *    rate limit and improvements only.
 * Every failure is non-fatal: local high scores always keep working.
 */
export const ONLINE_SIZE = 10;
const TIMEOUT = 8000, CACHE_MS = 30000;
const BOARD = /^(survival|blitz|rings):[a-z]+(?::[1-3])?$/;
const SESSION_KEY = 'microflyers.online.v1';

const num = field => field ? Number(field.doubleValue ?? field.integerValue) : NaN;
const str = field => typeof field?.stringValue === 'string' ? field.stringValue : '';

export class Leaderboard {
  constructor(config = globalThis.MICROFLYERS_ONLINE ?? ONLINE_LEADERBOARD, fetchImpl = globalThis.fetch?.bind(globalThis), storage = safeStorage()) {
    this.apiKey = String(config?.apiKey || '').trim();
    this.projectId = String(config?.projectId || '').trim();
    this.firestore = String(config?.firestoreUrl || 'https://firestore.googleapis.com').replace(/\/+$/, '');
    this.identity = String(config?.identityUrl || 'https://identitytoolkit.googleapis.com').replace(/\/+$/, '');
    this.tokens = String(config?.tokenUrl || 'https://securetoken.googleapis.com').replace(/\/+$/, '');
    this.fetch = fetchImpl; this.storage = storage; this.cache = new Map(); this.session = null;
  }
  get enabled() { return Boolean(this.apiKey && /^[a-z0-9-]{4,40}$/.test(this.projectId) && this.fetch); }
  get documents() { return `${this.firestore}/v1/projects/${this.projectId}/databases/(default)/documents`; }
  boardPath(board) { return `boards/${encodeURIComponent(board)}`; }

  async call(url, options = {}) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const response = await this.fetch(url, { ...options, signal: controller.signal });
      const text = await response.text();
      const body = text ? JSON.parse(text) : null;
      if (!response.ok) throw new Error(`Leaderboard request failed (${response.status}) ${body?.error?.message ?? ''}`.trim());
      return body;
    } finally { clearTimeout(timer); }
  }
  json(body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    return { method: 'POST', headers, body: JSON.stringify(body) };
  }

  /** Anonymous Firebase sign-in, reused across visits via a stored refresh token. */
  async signIn() {
    const now = Date.now();
    if (this.session?.idToken && this.session.expires > now + 60000) return this.session;
    let saved = null;
    try { saved = JSON.parse(this.storage?.getItem(SESSION_KEY) || 'null'); } catch { /* fresh sign-in */ }
    let result;
    if (saved?.refreshToken && saved.projectId === this.projectId) {
      try {
        const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: saved.refreshToken });
        const refreshed = await this.call(`${this.tokens}/v1/token?key=${this.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
        result = { idToken: refreshed.id_token, refreshToken: refreshed.refresh_token, uid: refreshed.user_id, expiresIn: refreshed.expires_in };
      } catch { result = null; }
    }
    if (!result) {
      const created = await this.call(`${this.identity}/v1/accounts:signUp?key=${this.apiKey}`, this.json({ returnSecureToken: true }));
      result = { idToken: created.idToken, refreshToken: created.refreshToken, uid: created.localId, expiresIn: created.expiresIn };
    }
    if (!result.idToken || !result.uid) throw new Error('Anonymous sign-in failed');
    this.session = { ...result, expires: now + Number(result.expiresIn || 3600) * 1000 };
    try { this.storage?.setItem(SESSION_KEY, JSON.stringify({ projectId: this.projectId, refreshToken: result.refreshToken, uid: result.uid })); } catch { /* session only */ }
    return this.session;
  }

  /** Public top scores for a board, best first. Cached briefly to stay light on the free tier. */
  async top(board, { limit = ONLINE_SIZE, fresh = false } = {}) {
    if (!this.enabled || !BOARD.test(board)) return null;
    const cached = this.cache.get(board);
    if (!fresh && cached && cached.limit >= limit && Date.now() - cached.time < CACHE_MS) return cached.rows.slice(0, limit);
    const query = { structuredQuery: { from: [{ collectionId: 'entries' }],
      orderBy: [{ field: { fieldPath: 'value' }, direction: lowerIsBetter(board) ? 'ASCENDING' : 'DESCENDING' }], limit } };
    const results = await this.call(`${this.documents}/${this.boardPath(board)}:runQuery?key=${this.apiKey}`, this.json(query));
    const rows = (Array.isArray(results) ? results : []).filter(r => r.document).map(({ document: { fields = {} } }) => ({
      name: cleanCallsign(str(fields.name)), value: num(fields.value), detail: str(fields.detail).slice(0, 60),
      date: String(fields.updatedAt?.timestampValue ?? '').slice(0, 10),
    })).filter(row => Number.isFinite(row.value));
    this.cache.set(board, { time: Date.now(), rows, limit });
    return rows;
  }

  /** 1-based world rank of a value on a board (count of strictly better entries + 1). */
  async rank(board, value) {
    const query = { structuredAggregationQuery: { aggregations: [{ alias: 'better', count: {} }], structuredQuery: {
      from: [{ collectionId: 'entries' }],
      where: { fieldFilter: { field: { fieldPath: 'value' }, op: lowerIsBetter(board) ? 'LESS_THAN' : 'GREATER_THAN', value: { doubleValue: value } } } } } };
    const [result] = await this.call(`${this.documents}/${this.boardPath(board)}:runAggregationQuery?key=${this.apiKey}`, this.json(query));
    return 1 + Number(result?.result?.aggregateFields?.better?.integerValue ?? 0);
  }

  /** Submit a score; only improvements are written. Returns the player's world rank. */
  async submit(board, { name, value, detail = '', version = 0 }) {
    if (!this.enabled || !BOARD.test(board) || !Number.isFinite(value) || value < 0) return null;
    const session = await this.signIn();
    const path = `${this.boardPath(board)}/entries/${session.uid}`;
    const low = lowerIsBetter(board), score = Math.round(value * 1000) / 1000;
    let best = NaN;
    try {
      const existing = await this.call(`${this.documents}/${path}?key=${this.apiKey}`, { headers: { Authorization: `Bearer ${session.idToken}` } });
      best = num(existing?.fields?.value);
    } catch (error) { if (!/\(404\)/.test(error.message)) throw error; }
    const improved = !Number.isFinite(best) || (low ? score < best : score > best);
    if (improved) {
      const name_ = `projects/${this.projectId}/databases/(default)/documents/boards/${board}/entries/${session.uid}`;
      const write = { update: { name: name_, fields: {
        board: { stringValue: board }, name: { stringValue: cleanCallsign(name) }, value: { doubleValue: score },
        detail: { stringValue: String(detail).slice(0, 60) }, uid: { stringValue: session.uid }, version: { integerValue: String(version) } } },
        updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }] };
      await this.call(`${this.documents}:commit?key=${this.apiKey}`, this.json({ writes: [write] }, session.idToken));
      this.cache.delete(board);
    }
    return this.rank(board, improved ? score : best);
  }
}

function safeStorage() { try { return globalThis.localStorage ?? null; } catch { return null; } }
