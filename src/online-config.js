/** Online leaderboard connection (Supabase). Leave blank to keep scores local only.
 * url: the project URL, e.g. https://abcdefghijklmnop.supabase.co
 * key: the project's PUBLIC "publishable" (or legacy "anon") key. It is designed
 *      to ship in browser code; the database only allows reads and validated
 *      score submissions (see supabase/leaderboard.sql).
 * NEVER put the secret / service_role key here.
 */
export const ONLINE_LEADERBOARD = Object.freeze({
  url: '',
  key: '',
});
