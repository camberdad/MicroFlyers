/** Keyboard-only flight. Mouse buttons are weapons and never change these axes. */
export function readKeyboardFlight(keys,target,{pitchStyle='beginner',sensitivity=1}={}) {
  const up = keys.has('KeyW') || keys.has('ArrowUp'), down = keys.has('KeyS') || keys.has('ArrowDown');
  target.pitch = (Number(up)-Number(down))*(pitchStyle==='flight' ? -1 : 1);
  target.roll = Number(keys.has('KeyA') || keys.has('ArrowLeft'))-Number(keys.has('KeyD') || keys.has('ArrowRight'));
  target.yaw = Number(keys.has('KeyQ')) - Number(keys.has('KeyE'));
  target.boost = keys.has('Space');
  target.brake = keys.has('ShiftLeft') || keys.has('ShiftRight');
  target.sensitivity = Math.max(.5,Math.min(1.5,Number(sensitivity)||1));
  return target;
}
