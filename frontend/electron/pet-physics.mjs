// Keep fractional positions between ticks; round only when placing the OS window.
function reflect(position, velocity, seconds, min, max) {
  if (max <= min) return { position: min, velocity: 0, hit: true };
  const start = Math.max(min, Math.min(max, position));
  let next = start + velocity * seconds;
  let speed = velocity;
  let hit = false;
  while (next < min || next > max) {
    if (next < min) { next = min + (min - next); speed = Math.abs(speed); }
    else { next = max - (next - max); speed = -Math.abs(speed); }
    hit = true;
  }
  // Reflect immediately when a tick lands exactly on a wall.
  if (next === min && speed < 0) { speed = -speed; hit = true; }
  if (next === max && speed > 0) { speed = -speed; hit = true; }
  return { position: next, velocity: speed, hit };
}

export function advanceMotion(state, area, hitbox, seconds) {
  const x = reflect(state.x, state.vx, seconds, area.x - hitbox.x, area.x + area.width - hitbox.x - hitbox.width);
  const y = reflect(state.y, state.vy, seconds, area.y - hitbox.y, area.y + area.height - hitbox.y - hitbox.height);
  return { x: x.position, y: y.position, vx: x.velocity, vy: y.velocity, hitX: x.hit, hitY: y.hit };
}

export function floorY(area, hitbox) {
  return area.y + area.height - hitbox.y - hitbox.height;
}

export function advanceGroundMotion(state, area, hitbox, seconds) {
  const next = advanceMotion({ ...state, vy: 0, y: floorY(area, hitbox) }, area, hitbox, seconds);
  return { ...next, y: floorY(area, hitbox), vy: 0 };
}

export function advanceFall(state, area, hitbox, seconds, gravity = 1800) {
  const floor = floorY(area, hitbox);
  const y = Math.min(floor, state.y + state.vy * seconds + gravity * seconds * seconds / 2);
  return { x: state.x, y, vy: y >= floor ? 0 : state.vy + gravity * seconds, landed: y >= floor };
}
