# MicroFlyers releases

Stable play/embed URL: https://camberdad.github.io/MicroFlyers/

## V14 — Remove the two Living Room trees

- Remove the large tree beside the sofa and the smaller tree by the piano, including their branches and pots.
- Exclude the removed meshes before building environment collisions, leaving both cleared spaces flyable.
- Preserve the other decorative plants, furniture, Dining Room, V13 rocket boost/turning, career saves and live updates.

## V13 — Held rocket boost, glowing jets and tighter turns

- Change Space from a persistent throttle increase to a held rocket boost, adding 18% speed over the selected normal throttle. Release smoothly returns to normal without changing the throttle setting.
- Light up twin blue rocket plumes and additive nozzle glow while boosting; turn the effect off on release, pause, focus loss and return to hangar. Scenery still occludes the effect.
- Increase direct heading turn rate by 12.5%, tightening normal-speed turn radius by about 11% while keeping existing momentum, pitch and bank behavior.
- Show ROCKET BOOST in the live airspeed instrument and use a modest boost camera widening. Update flight-school instructions; wheel throttle and Shift airbrake remain available, with braking taking priority.
- Preserve the miniature airframe/core, normal flight speeds, enemy markers, career saves/upgrades, both maps, prior releases and live updates.

## V12 — Enemy lock circles and offscreen direction arrows

- Track every onscreen enemy plane with a clear amber circle and its contact number/distance.
- Show a larger cyan double circle around the actual missile target, with LOCKED · RMB FIRE or TRACKING · REARMING status tied to the existing line-of-sight and reload logic.
- Add screen-edge arrows for every live enemy outside the camera view. Include contact number, distance and a BEHIND label for rear contacts; highlight the locked target's arrow.
- Calculate directions in chase-camera space so left/right bearings stay correct behind the aircraft, with a right-turn hint for directly rearward contacts.
- Spread clustered arrows along their edge, keep labels inside the viewport and remove indicators immediately when enemies are destroyed or Free Fly begins.
- Preserve aircraft size/speed, flight controls, randomized waves, GP/upgrades, saves, both maps and live updates.

## V11 — Slower flight and half-size player jet

- Reduce player cruise, minimum and afterburner speeds by 30%: 5.95, 3.15 and 13.3 world units/second respectively, in both Career and Free Fly.
- Halve the player's length, wingspan and height relative to V10, changing the miniature design scale from 1:100 to 1:200 (JET_SCALE 0.204).
- Halve the player's central collision radius to 0.065 and resize player projectiles, missiles and nose launch offsets to match.
- Keep the existing chase-camera distance so the smaller aircraft remains visibly half-size; update scale labels and the airspeed meter's maximum.
- Preserve steering, held throttle, momentum response, both maps, randomized career starts, forward-only enemy guns, GP/upgrades, saves and live updates.

## V10 — Randomized wave starts and forward-only enemy guns

- Randomize the player's and every enemy's career starting position and heading at each wave launch or retry, on both maps.
- Keep the player at least 20 world units from each enemy, enemies at least 9 units apart, and prevent aircraft from initially aiming at each other. Validate furniture clearance and six units of clear departure space before launching the whole wave.
- Remove the fixed, nose-on practice target arrangement. Keep the opening rounds harmless and slow, with enemies found through exploration and radar.
- Make enemy planes fly along their actual nose and turn gradually toward patrol waypoints or the player, rather than sliding along a fixed orbit or instantly swiveling to fire.
- Fire enemy guns only when the player is within a narrow 10-degree forward cone, in range, visible through the scenery and the gun has reloaded. Shots originate at the nose and travel forward; no side or rear turret fire.
- Preserve the 30-round difficulty curve, GP/upgrades, saved career progress, Free Fly, forgiving scenery contact and live updates.

## V9 — Free Fly, 30-round Career and GP upgrades

- Add two hangar modes on both maps: peaceful Free Fly with no enemies or damage, and a saved 30-round Career with waves of enemy planes.
- Begin with one slow, one-hit practice plane and no incoming fire in rounds 1–2. Place opening practice targets in a clear lane ahead of takeoff.
- Gradually increase enemy count from 1 to 8, waves per round from 1 to 3, enemy hull strength, patrol speed, projectile speed/damage and firing accuracy/frequency. The full career contains 60 waves and ends after round 30.
- Award and immediately bank 25–50 GP per career kill. Keep earned GP after a defeat or return to the hangar; resume the current uncleared wave after reloading.
- Add a GP upgrade hangar accessible before launch and between waves: five shot levels increase gun/missile damage and firing rate; five armor levels add 30 hull points each, up to 250.
- Show round, wave, target count, GP and actual hull capacity in the HUD; repair/rearm at each wave launch. Offer the next wave, retry, upgrades or peaceful flying after a sortie.
- Save career GP, levels, kills and next-wave progress locally in this browser. If storage is blocked, keep session play available and state that progress is not saved.
- Preserve V7 flight controls, both V8 maps, 1:100 scale, forgiving scenery contact, live updates and every prior version.

## V8 — Second airfield, 1:100 micro jet and forgiving collisions

- Add The Dining Room as Airfield 02, selectable from the hangar alongside the original Living Room.
- Prepare the supplied 168 MB room.obj as a roughly 5 MB indexed GLB with 236 named meshes, simplified furniture geometry and curated materials. Load it only when selected and cache both maps for return visits.
- Give each map its own launch position, overview camera, room bounds, radar label and drone patrol area.
- Change the miniature jet from 1:60 to 1:100: 60% of its former dimensions, with a closer chase camera and proportionally smaller missiles.
- Replace oversized aircraft/furniture box contact with a small 0.13-unit central core and accelerated triangle-surface checks, allowing close passes and flight through actual furniture gaps.
- Remove scenery, boundary and drone-contact damage, collision warnings, harsh bounce-backs, forced heading/speed changes and spawn resets. Contact separates/slides the aircraft gently; hostile gunfire still damages the hull.
- Keep V7 flight controls, live updates, the stable share/embed link and all previous releases.

## V7 — Toyborne-style direct steering and held throttle

- Review [Toyborne's](https://www.breyes.net/toyborne/en/) published controls and test its offline Free flight in Arrow mode.
- Replace bank-dependent heading changes with smooth, direct A/D or left/right-arrow turns. Bank follows the turn; releasing turn input levels the wings and stops turning promptly.
- Let W/S or up/down arrows adjust pitch and hold that attitude on release, with a 78-degree safety limit.
- Default to Beginner pitch (W climbs / S dives), preserving the user's preferred direction. Add optional Flight style (S climbs) and saved steering sensitivity in Flight controls.
- Match held throttle controls: Space raises throttle/afterburner; Shift lowers throttle and applies an airbrake; the wheel makes fine adjustments. Throttle stays set after release.
- Keep keyboard-only steering, left-click gun, right-click homing missiles, existing room-scaled speed range and momentum, HUD and live updates.
- Implement the observed control behavior independently; retain previous MicroFlyers versions and do not distribute Toyborne code or assets.

## V6 — Footage-inspired HUD and broader banking flight

- Review the supplied 28.82-second desktop-fighter footage and use its HUD layout and visible flight motion as references.
- Move the radar to a compact left-side card and add a top-center heading tape, upper-right missile seeker, lower-left airspeed/altitude/bank/throttle and lower-right twin-gun/hull instruments.
- Add circular lock rings, secondary bandit markers, SPLASH ONE kill callouts, gun-hit/activity readouts and a real incoming-fire warning.
- Keep all HUD readouts tied to live gameplay, with centimeters/meters for the miniature room.
- Increase full-bank turn radius by about 50% over V5 (about 32 world units at cruise), with deeper banks and smoother pitch/leveling.
- Keep the aircraft lower in frame and let the chase camera follow a small part of the bank, matching the footage's motion cues.
- Preserve keyboard-only W/S flight, gun and right-click homing missiles, original speed/momentum, live updates and previous releases.

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
