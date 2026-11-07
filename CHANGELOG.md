# MicroFlyers releases

Stable play/embed URL: https://camberdad.github.io/MicroFlyers/

## V5 — Keyboard flight, wider turns and homing missiles

- Remove cursor steering and its toggle/indicator entirely; use keyboard-only flight.
- Invert W/S: W climbs and S dives. Keep A/D banking, Q/E rudder, boost/braking and automatic leveling.
- Increase turn radius by 50% at the same speed and bank, using turnRadiusMultiplier 1.5.
- Launch a homing missile with right click; left click remains the gun.
- Acquire a living drone ahead within range and line of sight, with a lock indicator and 1.8-second missile reload.
- Add visible rockets and trails, limited homing turn speed, furniture collisions and a five-second missile lifetime.
- Preserve prior versions, live updates, and the stable website/embed URL.

## V4 — Configurable casual banking flight

- Adapt the user's flightConfig example with pitchSpeed 1.5, rollSpeed 2.0, yawSpeed 1.0, autoLevelSpeed 3.5, maxRoll 0.6 and maxPitch 0.4.
- Accumulate pitch/bank input to the configured caps, and return those angles smoothly to neutral when input is released or the cursor is centered.
- Make banking turn the aircraft automatically while Q/E provide extra rudder control.
- Map W to nose down and S to nose up, matching the supplied example; retain intuitive cursor-up climbing.
- Rebuild heading, pitch and roll together as a quaternion to avoid conflicting local rotation setters.
- Keep a steady camera horizon while the aircraft visibly banks.
- Preserve cursor steering by default and the existing cruise/boost/braking speed, minimum airspeed and momentum at the room's scale.
- Publish V4 with live updates and retain V1, V2 and V3 unchanged.

## V3 — Cursor steering and unrestricted dogfighting

- Make cursor steering active by default, with an on-screen steering cursor and separate gun reticle.
- Sharpen pitch, roll and yaw response; full roll rate is approximately 218 degrees per second.
- Remove Flight Assist, automatic leveling and pitch/bank limits entirely.
- Enable continuous barrel rolls, vertical loops and inverted flight with direct quaternion controls.
- Follow the aircraft through rolls and loops with a smooth quaternion chase camera.
- Keep the existing cruise speed, boost/brake behavior, minimum airspeed and forward momentum.
- Preserve keyboard controls and an M toggle for keyboard-only flying.
- Publish V3 with live updates, change notes and a retained numbered runtime.

## V2 — Assisted flight, versioned releases and live updates

- Make Flight Assist the default: smooth banking and climbing with automatic leveling when controls are released.
- Limit assisted bank to 48° and pitch to 32° for predictable indoor turns and aiming.
- Add a precision mouse response curve and a Flight Assist toggle (C) for manual aerobatics.
- Preserve the original forward speed, acceleration, braking, minimum airspeed and momentum physics.
- Publish MicroFlyers on GitHub Pages with a permanent website/embed URL.
- Show the running version and live update status in the game's header.
- Check for new versions every 30 seconds and when the browser regains focus.
- Notify pilots about an available update without interrupting a flight.
- Add Return to Hangar from pause and mission results; apply pending updates from the hangar.
- Show update progress, completion, and a retry option if a stale page or connection prevents updating.
- Load each release's scripts, styles, dependencies, and model from its numbered folder so browser caches cannot mix versions.
- Preserve the original V1 and the complete V2 under `versions/v1/` and `versions/v2/`.
- Record release metadata, asset checksums, and changes in GitHub; document the same process for future versions.

## V1 — Original playable prototype

- Import the supplied InteriorTest.fbx living room as a micro-scale airfield.
- Add a procedural fighter jet, third-person chase camera, and keyboard/mouse flight.
- Implement flight momentum, minimum airspeed, afterburner, and braking.
- Add four patrolling combat drones, nose-fired projectiles, and collision damage.
- Add a projected reticle, targeting marker, radar, hull/speed/altitude HUD, pause, and mission results.
- Replace the model's missing external texture images with generated room materials.
- Bundle pinned Three.js/FBXLoader/FFlate dependencies and add optional synthesized audio.
