/** Keyboard-only flight. Mouse buttons are weapons and never change these axes. */
export function readKeyboardFlight(keys, target) {
  target.pitch = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
  target.roll = Number(keys.has('KeyA')) - Number(keys.has('KeyD'));
  target.yaw = Number(keys.has('KeyQ')) - Number(keys.has('KeyE'));
  target.boost = keys.has('ShiftLeft') || keys.has('ShiftRight');
  target.brake = keys.has('Space');
  return target;
}
