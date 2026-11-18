import { ONLINE_LEADERBOARD } from './online-config.js';
import { cleanCallsign, lowerIsBetter } from './progress.js';

/** Online world leaderboard backed by Supabase's REST API (PostgREST).
 * Reads public top-N tables and submits scores through the validating
 * submit_score() database function. Every failure is non-fatal: local high
 * scores always keep working offline or when no project is configured.
 */
export const ONLINE_SIZE = 10;
const TIMEOUT = 6000, CACHE_MS = 30000;
const BOARD = /^(survival|blitz|rings):[a-z]+(?::[1-3])?$/;

export class Leaderboard {
  constructor(config = globalThis.MICROFLYERS_ONLINE ?? ONLINE_LEADERBOARD, fetchImpl = globalThis.fetch?.bind(globalThis)) {
    this.url = String(config?.url || '').trim().replace(/\/+$/, '');
    this.key = String(config?.key || '').trim();
    this.fetch = fetchImpl; this.cache = new Map();
  }
  /** HTTPS only, except a localhost test server. */
  get enabled() {
    return Boolean(this.key && this.fetch) && (/^https:\/\/[^/]+$/.test(this.url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(this.url));
  }
  headers(json = false) {
    const headers = { apikey: this.key, Accept: 'application/json' };
    // Legacy anon keys are JWTs and also go in Authorization; new publishable keys do not.
    if (this.key.startsWith('eyJ')) headers.Authorization = `Bearer ${this.key}`;
    if (json) headers['Content-Type'] = 'application/json';
    return headers;
  }
  async request(path, options = {}) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const response = await this.fetch(`${this.url}/rest/v1/${path}`, { ...options, signal: controller.signal });
      if (!response.ok) throw new Error(`Leaderboard request failed (${response.status})`);
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    } finally { clearTimeout(timer); }
  }
  /** Public top scores for a board, best first. Cached briefly to stay light on the free tier. */
  async top(board, { limit = ONLINE_SIZE, fresh = false } = {}) {
    if (!this.enabled || !BOARD.test(board)) return null;
    const cached = this.cache.get(board);
    if (!fresh && cached && cached.limit >= limit && Date.now() - cached.time < CACHE_MS) return cached.rows.slice(0, limit);
    const order = lowerIsBetter(board) ? 'value.asc' : 'value.desc';
    const rows = await this.request(`scores?select=name,value,detail,updated_at&board=eq.${encodeURIComponent(board)}&order=${order},updated_at.asc&limit=${limit}`, { headers: this.headers() });
    const clean = (Array.isArray(rows) ? rows : []).map(row => ({
      name: cleanCallsign(row?.name), value: Number(row?.value),
      detail: String(row?.detail ?? '').slice(0, 60), date: String(row?.updated_at ?? '').slice(0, 10),
    })).filter(row => Number.isFinite(row.value));
    this.cache.set(board, { time: Date.now(), rows: clean, limit });
    return clean;
  }
  /** Submit a score; returns the player's 1-based world rank on that board. */
  async submit(board, { name, value, detail = '', player, version = 0 }) {
    if (!this.enabled || !BOARD.test(board) || !Number.isFinite(value) || value < 0 || !player) return null;
    const rank = await this.request('rpc/submit_score', {
      method: 'POST', headers: this.headers(true),
      body: JSON.stringify({ p_board: board, p_name: cleanCallsign(name), p_value: Math.round(value * 1000) / 1000,
        p_detail: String(detail).slice(0, 60), p_player: player, p_version: version }),
    });
    this.cache.delete(board);
    return Number.isInteger(rank) && rank > 0 ? rank : null;
  }
}
