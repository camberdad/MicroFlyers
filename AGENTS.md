# MicroFlyers release instructions

The user requested that every new game version be numbered, shown on screen, published to GitHub with its changes, and delivered to existing website embeds through live updates.

Flight direction (latest requests, V5): keyboard-only steering; remove cursor steering entirely. W climbs and S dives, A/D bank and turn, Q/E add rudder. Increase turning radius (V5 uses a 1.5 radius multiplier) while retaining V4's capped pitch/bank, neutral leveling and speed/momentum. Left click fires the gun; right click launches a homing missile when a visible drone is locked. Preserve prior releases unchanged.

- Stable repository: `https://github.com/camberdad/MicroFlyers`.
- Stable game/embed URL: `https://camberdad.github.io/MicroFlyers/`.
- Publish branch `main`, repository root, using GitHub Pages.
- Current release is defined by `src/version.js`. Increment by one for each new release: V2, V3, V4, and so on. Never re-use or overwrite a published numbered release.
- Add a concrete change list at the top of `CHANGELOG.md` and update the title/header version in `index.html` before preparing a release.
- Keep the visible version label and live update controller working. Check every 30 seconds and on focus. Do not automatically interrupt a flight; notify the player and update after returning to the hangar. Keep offline play available, use a reload-loop guard, and show completion after a new release loads.
- Run appropriate regression checks and browser verification, then `node scripts/release.mjs`. It creates the immutable `versions/vN/` runtime, generates checksummed `release.json`/`version.json`, and points the root HTML to the version's assets. Preserve every prior version directory.
- Commit and push the complete new release, its manifests and changelog to GitHub. Verify GitHub Pages succeeds, the live manifest matches the release and the served asset checksums, and the public URL loads the correct version before reporting deployment complete.
- Publish a matching GitHub Release/tag (`vN`) with the version's concrete changes. Run `node scripts/verify-release.mjs` to verify the public assets after deployment.
- Keep the stable public URL unchanged so existing website embeds pick up updates. `embed.html` contains the matching iframe snippet.
- Never publish credentials, caches, `node_modules`, or `artifacts/`.
