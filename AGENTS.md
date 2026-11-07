# MicroFlyers release instructions

The user requested that every new game version be numbered, shown on screen, published to GitHub with its changes, and delivered to existing website embeds through live updates.

Flight direction (latest Toyborne reference, V7): keyboard-only Arrow-style direct steering. A/D or left/right arrows control heading directly; the bank follows the turn and wings level on release. W climbs/S dives (Beginner default); up/down arrows also work. Pitch holds on release with a 78-degree limit. Flight controls offers optional Flight style (S climbs) and saved sensitivity. Space raises persistent throttle, Shift lowers it and applies airbrake, wheel fine-adjusts throttle; releasing retains the setting. Keep cursor steering removed. Preserve room-scaled min/cruise/max speed 4.5/8.5/19 and momentum. This supersedes V6's broad bank-dependent turns and pitch auto-level. Left click fires the gun; right click launches a homing missile when a visible drone is locked. HUD direction remains the V6 footage-inspired compact radar, seeker, heading, airspeed, twin-gun/hull, tracking markers and combat callouts. Keep MicroFlyers branding and live telemetry. Do not publish third-party reference footage, source or assets. Preserve prior releases unchanged.

- Stable repository: `https://github.com/camberdad/MicroFlyers`.
- V8 adds a second map: The Dining Room, prepared from the supplied room.obj into assets/dining-room.glb. Preserve both hangar choices, independent spawn/overview/patrol setup and map-specific HUD labels. Do not upload the 168 MB source OBJ; rebuild with scripts/prepare-dining-room.mjs if needed.
- V8 miniature is 1:100 (JET_SCALE 0.408, 60% of the previous size). Player contact uses a 0.13-unit central sphere against actual triangle surfaces through SurfaceIndex. Scenery, boundary and drone contact must not damage health, reduce speed, bounce/change heading, flash warnings, or reset the aircraft. Gentle separation/slide is allowed. Hostile shots still damage the small core. Keep close furniture gaps flyable.
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
