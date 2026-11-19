/** Online world leaderboard connection (Google Firebase). Leave blank to keep
 * scores local only. These are the PUBLIC web-app values from the Firebase
 * console (Project settings, Your apps, Web). Firebase web API keys are meant to
 * ship in browser code; security comes from firestore.rules.
 */
export const ONLINE_LEADERBOARD = Object.freeze({
  apiKey: 'AIzaSyDzHLOFHT5dvtEVBQnK_DaQaJtMZvg8QX0',
  projectId: 'microflyers-78b92',
});
