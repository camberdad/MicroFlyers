# MicroFlyers

Small jet. Big room. A browser-based Three.js dogfighting game with two supplied interior airfields: **InteriorTest.fbx** and **room.obj** (prepared as a compact GLB).

**Current release: V8.** Play/share/embed: **https://camberdad.github.io/MicroFlyers/**

Source: https://github.com/camberdad/MicroFlyers · [Release changes](CHANGELOG.md) · [Iframe snippet](embed.html)

The header shows the running version and LIVE/OFFLINE update status. The game checks for new releases every 30 seconds and on focus. A new version displays a notice during flight; select Return to Hangar (or use the pause/results menus) to update. Updates at the hangar show progress and confirm the new version when loaded. Offline checks keep the existing game playable. Each numbered runtime is retained in `versions/vN/`, and the root page loads immutable version-specific assets to avoid mixed browser caches.

## Run

Requires a modern browser with WebGL 2 and Node.js 22.15+ (24 recommended). No npm install or build is needed.

```sh
node scripts/serve.mjs
```

Open **http://localhost:4173** and select **Take flight**. Opening `index.html` directly with `file://` will not load ES modules or the FBX; use HTTP. The bundled server binds only to your computer.

Choose **01 · The Living Room** or **02 · The Dining Room** in the hangar before taking flight. Return to the hangar to change maps. The second map downloads only when selected; both are cached in memory during that session. Each has a clear launch position, its own drone patrol area and matching HUD labels.

On Windows, you can also double-click **Start-MicroFlyers.cmd**. It uses an installed Node.js or this computer's bundled Codex Node.js runtime. Leave its terminal open while playing.

The interface adapts to smaller screens, but flight is designed for a desktop keyboard and mouse.

## Fly

| Input | Action |
| --- | --- |
| W / S or up / down arrows | Adjust climb / dive; release holds pitch |
| A / D or left / right arrows | Turn directly left / right; release levels wings |
| Q / E | Fine left / right rudder adjustment |
| Space | Raise throttle / afterburner |
| Shift | Lower throttle and apply airbrake |
| Mouse wheel | Fine throttle adjustment |
| Left mouse button (hold) | Fire gun |
| Right mouse button | Launch a homing missile when a drone is locked |
| Escape | Pause / resume; closes flight help first |
| R | Restart mission |
| F | Fullscreen, where the host permits it |
| V | Toggle procedural engine and combat audio |

V7 recreates the core behavior of [Toyborne's Arrow controls](https://www.breyes.net/toyborne/en/), independently implemented at the room's scale. Heading responds directly to A/D instead of waiting for bank to build; the aircraft banks into the turn and levels its wings on release. Pitch holds after releasing W/S, with a ±78° limit. Flight controls offers Beginner pitch (default W climbs / S dives), Flight style (S climbs / W dives), and saved sensitivity. Mouse movement never steers. Space raises a persistent throttle lever, Shift lowers it and applies an airbrake, and the wheel adjusts it in 4% steps. Throttle stays where it was on release; engine power spools smoothly. Cruise remains 8.5 world units/s, with the existing 4.5–19 speed range and momentum. Left click fires the gun; Space is now exclusively throttle. The chase camera and V6 HUD remain. This adapts the reference's easy flight mode rather than its optional 360-roll or mouse modes; no Toyborne source or assets are distributed.

The new HUD uses a left radar card, top-center compass, upper-right missile-seeker strip, lower-left airspeed/altitude/bank/throttle and lower-right gun/hull instruments. Circular locks, secondary contacts, gun hit/activity meters, large SPLASH ONE callouts and a real hostile-projectile proximity alert are generated in CSS/canvas. All telemetry is live and keeps the room's miniature units. MicroFlyers branding and the supplied room remain; the reference MP4 is not uploaded or embedded.

Left click fires the gun. Right click launches a homing missile toward a living drone ahead within 65 world units and clear line of sight. The HUD shows LOCK READY or the 1.8-second reload countdown. Missiles turn at a limited rate, leave a visible trail, destroy a drone on direct impact, and expire after five seconds. Furniture blocks locks and missiles; a destroyed target is not tracked further. The gun reticle still shows firing direction. Switching away pauses the game.

## Assets and scale

- V8's jet is **1:100**, replacing the former 1:60 miniature at 60% of its previous dimensions (`JET_SCALE = 0.408`). This is the game's miniature design ratio; the procedural aircraft has no specified real-world counterpart. Its central collision sphere has radius **0.13 world units**, smaller than the visible wings.
- Scenery, boundary and drone contact cause **no hull damage**. Actual triangle surfaces gently separate/slide the core without reducing speed, changing heading or resetting the aircraft. Wings may skim furniture. Enemy projectiles still damage the smaller player core. Box bounds remain a conservative broad phase for weapon occlusion.
- `assets/dining-room.glb` is a browser-ready derivative of the user's 167,670,242-byte OBJ: 5,081,352 bytes, 236 meshes and 294,121 triangles. Sub-centimeter clustering and meshoptimizer simplification reduce the original 1,906,512 triangles; a remote export backdrop outside the room is excluded. Named furniture and architecture remain.
- The dining OBJ's MTL contains wire colors and no texture references. Curated plaster, oak/walnut, fabric, glass-color and ceramic materials provide readable surfaces. The original OBJ and MTL remain untouched at their source location; the oversized OBJ is not uploaded to GitHub.
- To rebuild the derivative: `node scripts/prepare-dining-room.mjs /absolute/path/to/room.obj`. The pinned meshoptimizer simplifier and MIT license in `scripts/vendor/` are used only offline. Conversion metadata and source SHA-256 are in `assets/dining-room-info.json`.

- `assets/InteriorTest.fbx` is a copy of the user-supplied model. Its geometry, furniture, and room shell are loaded with `FBXLoader`; no Unity export is required.
- The living-room source measures approximately 519 × 300 × 817 source units. Each map's longest horizontal dimension is normalized to 120 game units. The smaller jet feels tiny next to the furniture.
- Source units are treated as centimeters for the HUD. Speed displays cm/s and altitude displays meters. `world.scale` converts the normalized simulation back to each source's units.
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
| `src/maps.js` | Airfield catalog, miniature scale and player-core radius |
| `src/surface-index.js`, `src/scenery-collision.js` | Packed triangle BVH, precise close passes and damage-free contact separation |
| `src/flight.js` | Quaternion flight, pitch/roll/yaw, minimum speed, boost/brake, momentum, swept segment helper |
| `src/aircraft.js` | Procedural micro jet model |
| `src/combat.js` | Four drone patrols, gunfire, homing missiles, lock selection, reloads, trails, nearest swept hits and damage |
| `src/ui.js` | Gun-line reticle, target marker, telemetry, radar, notifications |
| `src/hud.css`, `src/hud-math.js` | Footage-inspired HUD layout, compass calculations and cardinal directions |
| `src/audio.js` | Optional synthesized audio, started from a user gesture |
| `scripts/serve.mjs` | Dependency-free local HTTP server |
| `scripts/vendor.mjs` | Refresh pinned official Three.js modules and their loader dependencies |
| `scripts/inspect-model.mjs` | Inspect the actual FBX geometry and referenced textures without a browser |

Physics uses time in seconds and substeps at most 1/120 second; long frame gaps are capped. Aircraft/scenery contact uses a small core against nearby actual triangles, accelerated by a static BVH, with shorter movement samples to catch thin walls from either side. Empty space under tables is flyable. Fast projectiles test swept segments against individual mesh boxes and choose the nearest obstruction to avoid tunneling; irregular furniture can still block weapons conservatively. Drone patrol candidates are checked for surface clearance.

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
