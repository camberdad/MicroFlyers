# MicroFlyers

Small jet. Big room. A browser-based Three.js dogfighting game using the supplied **InteriorTest.fbx** living room as its airfield.

**Current release: V6.** Play/share/embed: **https://camberdad.github.io/MicroFlyers/**

Source: https://github.com/camberdad/MicroFlyers · [Release changes](CHANGELOG.md) · [Iframe snippet](embed.html)

The header shows the running version and LIVE/OFFLINE update status. The game checks for new releases every 30 seconds and on focus. A new version displays a notice during flight; select Return to Hangar (or use the pause/results menus) to update. Updates at the hangar show progress and confirm the new version when loaded. Offline checks keep the existing game playable. Each numbered runtime is retained in `versions/vN/`, and the root page loads immutable version-specific assets to avoid mixed browser caches.

## Run

Requires a modern browser with WebGL 2 and Node.js 22.15+ (24 recommended). No npm install or build is needed.

```sh
node scripts/serve.mjs
```

Open **http://localhost:4173** and select **Take flight**. Opening `index.html` directly with `file://` will not load ES modules or the FBX; use HTTP. The bundled server binds only to your computer.

On Windows, you can also double-click **Start-MicroFlyers.cmd**. It uses an installed Node.js or this computer's bundled Codex Node.js runtime. Leave its terminal open while playing.

The interface adapts to smaller screens, but flight is designed for a desktop keyboard and mouse.

## Fly

| Input | Action |
| --- | --- |
| W / S | Climb / dive (inverted from V4) |
| A / D | Roll left / right; banking also gently turns the aircraft |
| Q / E | Yaw left / right |
| Shift | Accelerate / afterburner |
| Space | Brake **and** fire, matching both requested Space bindings |
| Left mouse button (hold) | Fire without braking |
| Right mouse button | Launch a homing missile when a drone is locked |
| Escape | Pause / resume; closes flight help first |
| R | Restart mission |
| F | Fullscreen, where the host permits it |
| V | Toggle procedural engine and combat audio |

V6 uses keyboard-only flight: W climbs, S dives, A/D bank, and Q/E add rudder. Mouse movement never steers. The user's desktop-fighter footage guides the visible motion: deeper banks, smooth pitch/leveling, a slight camera bank, and the jet lower in frame. `flightConfig` uses maxRoll 1.2 radians (~69°), maxPitch 0.55 (~32°), turnRadiusMultiplier 4.5, pitchSpeed 1.1, rollSpeed 1.8 and autoLevelSpeed 2.6. At full bank and cruise, the turn radius is about 32 world units, 50% wider than V5. Cruise stays at 8.5 world units/s (~58 cm/s); boost, braking, minimum airspeed and momentum are unchanged. The footage does not reveal exact input/physics values, so the controller reproduces visible motion cues rather than claiming an exact reconstruction.

The new HUD uses a left radar card, top-center compass, upper-right missile-seeker strip, lower-left airspeed/altitude/bank/throttle and lower-right gun/hull instruments. Circular locks, secondary contacts, gun hit/activity meters, large SPLASH ONE callouts and a real hostile-projectile proximity alert are generated in CSS/canvas. All telemetry is live and keeps the room's miniature units. MicroFlyers branding and the supplied room remain; the reference MP4 is not uploaded or embedded.

Left click fires the gun. Right click launches a homing missile toward a living drone ahead within 65 world units and clear line of sight. The HUD shows LOCK READY or the 1.8-second reload countdown. Missiles turn at a limited rate, leave a visible trail, destroy a drone on direct impact, and expire after five seconds. Furniture blocks locks and missiles; a destroyed target is not tracked further. The gun reticle still shows firing direction. Switching away pauses the game.

## Assets and scale

- `assets/InteriorTest.fbx` is a copy of the user-supplied model. Its geometry, furniture, and room shell are loaded with `FBXLoader`; no Unity export is required.
- The source measures approximately 519 × 300 × 817 source units. The longest horizontal dimension is normalized to 120 game units. The roughly 1.2-unit jet feels tiny next to the furniture.
- Source units are treated as centimeters for the HUD. Speed displays cm/s and altitude displays meters. `world.scale` converts the normalized simulation back to source units. The 1:60 caption describes the miniature aircraft concept, rather than an independently verified physical measurement of the model.
- The supplied folder contains **only the FBX**, which references external texture images. Generated canvas textures and curated materials replace those missing images: wood, woven rug, plaster, artwork, and the TV screen. These replacements are intentional; original texture fidelity needs the accompanying texture files.
- Original exported cameras and lights are removed. A directional sun with soft shadows, ambient light, hemisphere fill, and secondary directional fill keep the room readable.
- The aircraft, drones, runway, effects, and audio are generated in code.

## Code structure

| File | Responsibility |
| --- | --- |
| `index.html`, `styles.css` | Landing screen, instruments, radar canvas, help, pause, results, responsive layout |
| `src/main.js` | Separate initialization, asset loading, and requestAnimationFrame phases; input, game states, collision response, chase camera |
| `src/input.js` | Keyboard-only axes, W/S mapping, boost and brake input |
| `src/world.js` | FBX loading, normalization, lighting, generated materials, per-mesh static Box3 colliders |
| `src/flight.js` | Quaternion flight, pitch/roll/yaw, minimum speed, boost/brake, momentum, swept segment helper |
| `src/aircraft.js` | Procedural micro jet model |
| `src/combat.js` | Four drone patrols, gunfire, homing missiles, lock selection, reloads, trails, nearest swept hits and damage |
| `src/ui.js` | Gun-line reticle, target marker, telemetry, radar, notifications |
| `src/hud.css`, `src/hud-math.js` | Footage-inspired HUD layout, compass calculations and cardinal directions |
| `src/audio.js` | Optional synthesized audio, started from a user gesture |
| `scripts/serve.mjs` | Dependency-free local HTTP server |
| `scripts/vendor.mjs` | Refresh pinned official Three.js modules and their loader dependencies |
| `scripts/inspect-model.mjs` | Inspect the actual FBX geometry and referenced textures without a browser |

Physics uses time in seconds and substeps at most 1/120 second; long frame gaps are capped. Environment collisions use **individual mesh Box3 bounds**, never the enclosing room box. Fast projectiles test the swept segment and choose its nearest obstruction to avoid tunneling and shooting through furniture. Drone and aircraft hulls are approximate boxes, so irregular geometry can register conservative hits. Drone patrol candidates are checked for clearance.

## Three.js, FBXLoader, and FFlate CDN links

The game defaults to pinned **local** copies so it also works when a CDN is unavailable. Three.js and FFlate license notices are retained in `vendor/three`. To use the CDN instead, replace the import map in `index.html` with:

```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/"
  }
}
</script>
```

- [Three.js module](https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js)
- [FBXLoader](https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/loaders/FBXLoader.js)
- [FFlate prerequisite](https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/libs/fflate.module.js)

`FBXLoader` imports the matching FFlate ES module automatically. Do not mix Three.js versions or add an unrelated global FFlate script. See the [official FBXLoader documentation](https://threejs.org/docs/pages/FBXLoader.html).

Optional Google Fonts enhance typography; local sans-serif fonts are used if the request is blocked. Game code and assets need no external runtime requests.

## GitHub Pages

The repository uses GitHub Pages from `main` at the root. Existing website embeds keep the same stable URL for future releases. `release.json` records the release number, changes and asset SHA-256 checksums; `CHANGELOG.md` keeps the complete change history. The original prototype is retained in `versions/v1/`; V2 and future releases have their own complete runtime folders.

For every future release: increment `src/version.js`, add its concrete changes at the top of `CHANGELOG.md`, test the game, then run `node scripts/release.mjs`. Commit and push the new runtime folder, manifests, changelog and root page together. Never overwrite a published numbered folder. Verify Pages and the live version/checksums after publishing. `AGENTS.md` preserves these release requirements for future work.

Run `node scripts/verify-release.mjs` after Pages finishes deploying to verify the public version, root HTML, every numbered runtime asset checksum, every prior retained release, and embed snippet. Publish a matching GitHub Release (`vN`) with the concrete changes as well as updating `CHANGELOG.md`.

This folder is the complete static site. All runtime URLs are relative, including the FBX, so repository subpaths work.

1. Add these files to your GitHub repository and push them. Include `assets/` and `vendor/`.
2. In the repository's **Settings → Pages**, select **Deploy from a branch** and choose your branch's **/ (root)** folder.
3. Open the Pages URL once GitHub finishes publishing.

`.nojekyll` is included. No compilation, server backend, secret keys, Unity runtime, or node_modules are required on the host. Use the configured repository and Pages deployment for subsequent releases.

## Embed

Host the complete folder, then embed its URL:

```html
<iframe
  src="https://YOUR-USERNAME.github.io/MicroFlyers/"
  title="MicroFlyers"
  width="100%"
  height="800"
  style="border:0;border-radius:12px"
  allow="fullscreen; autoplay"
  allowfullscreen
></iframe>
```

Click the flight view to focus keyboard input. If your host uses an iframe sandbox, allow scripts and same-origin assets. Fullscreen requires the host's fullscreen permission.

## Verify

```sh
node --import ./scripts/three-node.mjs --test tests/*.test.mjs
node scripts/inspect-model.mjs
```

Tests cover minimum speed, boost/brake precedence, control direction, banking inertia, numerical stability, fast projectile intersections, furniture occlusion, enemy damage, elimination, restart cleanup, and parsing/normalization/launch clearance using the actual FBX. The Node resolver hook points tests at the same vendored Three.js version as the browser.

To re-download official dependency sources (requires internet):

```sh
node scripts/vendor.mjs
```
