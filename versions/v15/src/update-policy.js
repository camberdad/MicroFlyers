/** Pure update decisions, shared by the browser controller and regression tests. */
export function parseVersion(info) {
  const value = Number(info?.versionNumber ?? info?.version);
  return Number.isInteger(value) && value > 0 ? value : null;
}
export function updateDecision({ current, latest, ready, home, attempted }) {
  if (!ready || latest <= current) return 'none';
  if (!home) return 'pending';
  if (attempted >= latest) return 'retry';
  return 'apply';
}
