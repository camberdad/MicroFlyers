import { VERSION, VERSION_LABEL } from './version.js';
import { parseVersion, updateDecision } from './update-policy.js';

/** Check for releases every 30s/focus. Flights are never interrupted by automatic reloads. */
export class LiveUpdates {
  constructor(returnHome) {
    this.returnHome = returnHome; this.ready = false; this.home = false;
    this.latest = VERSION; this.checking = false; this.applying = false;
    this.attemptKey = `microflyers.updateAttempt:${new URL('.', location.href).pathname}`;
    this.notice = document.getElementById('update-notice');
    this.status = document.getElementById('update-status');
    document.getElementById('version-label').textContent = VERSION_LABEL;
    document.getElementById('app').dataset.version = VERSION_LABEL;
    document.getElementById('update-action').addEventListener('click', () => {
      if (!this.home) this.returnHome();
      else { this.clearAttempt(); this.apply(); }
    });
    this.checkOnFocus = () => this.check();
    addEventListener('focus', this.checkOnFocus);
    document.addEventListener('visibilitychange', this.checkOnFocus);
    this.interval = setInterval(this.checkOnFocus, 30000);
  }
  getAttempt() {
    // The URL also guards reloads when an embedded browser blocks sessionStorage.
    let stored = 0; try { stored = Number(sessionStorage.getItem(this.attemptKey)) || 0; } catch { /* Use URL fallback. */ }
    return Math.max(stored, this.attempt || 0, Number(new URL(location.href).searchParams.get('v')) || 0);
  }
  clearAttempt() { this.attempt = 0; try { sessionStorage.removeItem(this.attemptKey); } catch { /* Storage may be restricted in an embed. */ } }
  setState(mode) { this.home = mode === 'intro'; this.resolve(); }
  loaded() {
    this.ready = true;
    if (this.getAttempt() && this.getAttempt() <= VERSION) {
      this.clearAttempt();
      const clean = new URL(location.href); clean.searchParams.delete('v'); clean.searchParams.delete('update');
      history.replaceState(null, '', clean.href);
      this.show(`Update complete — MicroFlyers ${VERSION_LABEL}`, '', false);
      setTimeout(() => { if (this.latest <= VERSION) this.notice.classList.add('hidden'); }, 4500);
    }
    this.resolve(); this.check();
  }
  show(message, action, progress = false) {
    this.notice.classList.remove('hidden'); this.notice.classList.toggle('updating', progress);
    document.getElementById('update-message').textContent = message;
    const button = document.getElementById('update-action'); button.textContent = action;
    button.classList.toggle('hidden', !action); button.disabled = progress;
    document.getElementById('update-progress').classList.toggle('hidden', !progress);
  }
  async check() {
    if (this.checking || this.applying || !this.ready || document.hidden || location.protocol === 'file:') return;
    this.checking = true;
    try {
      const url = new URL('./version.json', location.href); url.searchParams.set('check', Date.now());
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('Version check unavailable');
      const info = await response.json(), remote = parseVersion(info);
      if (!remote) throw new Error('Invalid version manifest');
      // Ignore a transient old CDN response once a newer version has been observed.
      this.latest = Math.max(this.latest, remote);
      this.status.textContent = this.latest > VERSION ? `UPDATE ${this.latest}` : 'LIVE';
      this.status.title = `Running ${VERSION_LABEL} · automatic update checks every 30 seconds`;
      this.status.classList.remove('offline'); this.resolve();
    } catch {
      this.status.textContent = 'OFFLINE'; this.status.classList.add('offline');
      this.status.title = 'Update check unavailable. The current game remains playable.';
    } finally { this.checking = false; }
  }
  resolve() {
    if (this.applying) return;
    const decision = updateDecision({ current: VERSION, latest: this.latest, ready: this.ready, home: this.home, attempted: this.getAttempt() });
    if (decision === 'pending') this.show(`V${this.latest} is ready. Return to the hangar to update.`, 'RETURN TO HANGAR');
    if (decision === 'retry') this.show(`V${this.latest} could not load. Retry when your connection is ready.`, 'RETRY UPDATE');
    if (decision === 'apply') this.apply();
  }
  apply() {
    if (this.applying || !this.ready || !this.home || this.latest <= VERSION) return;
    this.applying = true;
    this.attempt = this.latest;
    try { sessionStorage.setItem(this.attemptKey, String(this.latest)); } catch { /* No persistent storage required. */ }
    this.show(`Updating MicroFlyers to V${this.latest}…`, '', true);
    document.getElementById('launch-button').disabled = true;
    const destination = new URL(location.href);
    destination.searchParams.set('v', String(this.latest)); destination.searchParams.set('update', String(Date.now()));
    // New root HTML references immutable /versions/vN/ assets. Every module and
    // the FBX change URL together, rather than mixing stale files from two versions.
    setTimeout(() => { if (this.home) location.replace(destination.href); }, 1100);
  }
}
