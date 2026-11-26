// The screenshot scenes behind ?shot=start|play|bank|end. Each one flies the real rules forward
// from a fresh world for a fixed number of steps, steered by an autopilot that takes off,
// aims at the target ring and threads it, so the frame is what a short flight really looks
// like and the same seed always gives the same frame.
import { STEP } from './config.js';
import { EVENT_FINISH } from './world.js';
import { wrapAngle } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

/**
 * A plain proportional pilot: full throttle down the runway, pull up when fast enough, then
 * fly the course the way a person would — line up on a point in front of the target ring,
 * then aim through it — banking toward the aim point and climbing or diving to meet it.
 * Good enough to finish the course on a calm day, which is all the scenes ask of it.
 */
export function createAutopilot(world) {
  const { state } = world;
  return function controls() {
    const plane = state.plane;
    if (plane.grounded) {
      return { throttle: 1, roll: 0, pitch: plane.speed > 23 ? 0.6 : 0 };
    }
    const ring = state.rings[state.target];
    if (!ring) return { throttle: 0, roll: 0, pitch: 0 };
    const toRing = Math.hypot(ring.x - plane.x, ring.z - plane.z);
    // Far off, aim at a point in front of the ring to line the approach up; close in, aim
    // through the ring and out the other side, so the crossing is square.
    const lead = toRing > 170 ? -150 : 80;
    const aimX = ring.x + ring.nx * lead;
    const aimZ = ring.z + ring.nz * lead;
    const dx = aimX - plane.x;
    const dz = aimZ - plane.z;
    const dy = ring.y - plane.y;
    const distance = Math.hypot(dx, dz);
    const desiredHeading = Math.atan2(dx, -dz);
    const headingError = wrapAngle(desiredHeading - plane.heading);
    const roll = clamp(headingError * 1.35 - plane.roll * 0.22, -1, 1);
    const desiredPitch = Math.atan2(dy, Math.max(40, distance));
    const pitch = clamp((desiredPitch - plane.pitch) * 2.4 + 0.04, -1, 1);
    const cruise = toRing > 320 ? 0.86 : 0.64;
    const throttle = plane.throttle < cruise - 0.03 ? 1 : plane.throttle > cruise + 0.03 ? -1 : 0;
    return { pitch, roll, throttle };
  };
}

const PARKED = { pitch: 0, roll: 0, throttle: 0 };

function fly(world, controls, seconds, harmless) {
  const steps = Math.round(seconds / STEP);
  for (let index = 0; index < steps; index += 1) {
    if (world.step(STEP, controls(), harmless)) {
      // Events do not change the staging; the flight simply goes on or ends.
    }
    if (world.state.over) break;
  }
}

/**
 * Set `world` to the named scene (start, play, bank or end; any other name is start) and
 * return the screen to draw over it and the score to show as the best.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'bank' && name !== 'end') {
    fly(world, () => PARKED, 2, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const autopilot = createAutopilot(world);
  if (name === 'play') {
    // Caught on the climb-out: airborne, wings level, the first ring ahead over the sea.
    fly(world, autopilot, 11.5, false);
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'bank') {
    fly(world, autopilot, 30, false);
    // A committed left turn over the islands, held long enough for the world to tip.
    fly(world, () => ({ pitch: 0.3, roll: -0.7, throttle: 0 }), 0.9, false);
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  // end: fly the course out — up to four minutes of steps — and show how it settled.
  let guard = 0;
  while (!world.state.over && guard < 240 / STEP) {
    world.step(STEP, autopilot(), false);
    guard += 1;
  }
  const finished = world.state.finished;
  void EVENT_FINISH;
  return { screen: SCREEN_OVER, best: world.state.score, finished };
}
