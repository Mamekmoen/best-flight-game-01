// SUNHARROW's rules and state, with no drawing and no browser in it: a seeded archipelago with
// a home island and a runway, a ring course strung around it, and an arcade flight model —
// throttle, banked turns, stalls, takeoffs, landings, crashes. step() advances one fixed step
// under a set of controls and returns what happened as bit flags, so the caller can react
// without the world knowing about screens or sound.
import { COURSE, PLANE, PLATEAU_HEIGHT, RUNWAY, SEA_LEVEL } from './config.js';

export const EVENT_RING = 1;
export const EVENT_MISS = 2;
export const EVENT_CRASH = 4;
export const EVENT_FINISH = 8;
export const EVENT_TAKEOFF = 16;

/** Wrap an angle to (-PI, PI]. */
export function wrapAngle(angle) {
  let wrapped = angle % (Math.PI * 2);
  if (wrapped > Math.PI) wrapped -= Math.PI * 2;
  if (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
}

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** True when a world point is over the runway strip (a margin of `pad` metres counts). */
export function overRunway(x, z, pad) {
  return Math.abs(x - RUNWAY.x) <= RUNWAY.halfWidth + pad && Math.abs(z - RUNWAY.z) <= RUNWAY.halfLength + pad;
}

export function createWorld(random) {
  // The archipelago: a home island at the origin and six outer islands scattered around it.
  // The home island's middle is flattened into the plateau the runway sits on.
  const islands = [{ x: 0, z: 0, radius: 560, peak: 66, phase: 0 }];
  for (let index = 1; index <= 6; index += 1) {
    const angle = index * 1.13 + random() * 0.55;
    const distance = 1250 + random() * 750;
    islands.push({
      x: Math.sin(angle) * distance,
      z: -Math.cos(angle) * distance,
      radius: 250 + random() * 280,
      peak: 42 + random() * 95,
      phase: random() * Math.PI * 2,
    });
  }

  /**
   * The land's height at a point, in metres; below the sea it returns the sea floor.
   * Pure in (x, z): the renderer samples it thousands of times a frame and always agrees
   * with the collisions the simulation felt.
   */
  function terrainHeight(x, z) {
    let height = -6;
    for (let index = 0; index < islands.length; index += 1) {
      const island = islands[index];
      const dx = x - island.x;
      const dz = z - island.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      if (distance >= island.radius) continue;
      const shape = Math.cos((distance / island.radius) * Math.PI) * 0.5 + 0.5;
      let h = island.peak * Math.pow(shape, 1.25);
      // Rolling detail, kept off the shoreline so beaches stay clean.
      h += island.peak * 0.1 * shape * Math.sin(x * 0.013 + island.phase) * Math.cos(z * 0.011 + island.phase * 2);
      if (h > height) height = h;
    }
    // The home plateau: blend the middle of the home island flat, and the strip exactly flat.
    const fromHome = Math.sqrt(x * x + z * z);
    if (fromHome < 300) {
      const blend = smoothstep(300, 190, fromHome);
      height = height * (1 - blend) + PLATEAU_HEIGHT * blend;
      if (overRunway(x, z, 26)) height = RUNWAY.height;
    }
    return height;
  }

  /** The ground the plane can touch: land, or the sea's surface where there is no land. */
  function groundHeight(x, z) {
    return Math.max(SEA_LEVEL, terrainHeight(x, z));
  }

  // The ring course: eight rings on a wide loop around the home island, flown clockwise from
  // the north, then a finish ring hanging over the runway. Each ring's altitude is lifted
  // clear of whatever land it hangs over, and each ring faces the way the flight reaches it —
  // along the line from the previous ring — so it is met face-on, not edge-on.
  const rings = [];
  for (let index = 0; index < COURSE.rings; index += 1) {
    const theta = (-index * Math.PI * 2) / COURSE.rings;
    const x = Math.sin(theta) * COURSE.loopRadius;
    const z = -Math.cos(theta) * COURSE.loopRadius;
    const wanted = 74 + 52 * (0.5 + 0.5 * Math.sin(index * 2.3 + 0.6));
    const y = Math.max(wanted, terrainHeight(x, z) + 48);
    rings.push({ x, y, z, nx: 0, nz: -1, radius: COURSE.ringRadius, done: false });
  }
  rings.push({
    x: RUNWAY.x,
    y: RUNWAY.height + 36,
    z: RUNWAY.z - 30,
    nx: 0,
    nz: -1,
    radius: COURSE.ringRadius + 4,
    done: false,
    finish: true,
  });
  // Face every ring along the course: from the runway's threshold for the first, then from
  // each ring to the next.
  let fromX = RUNWAY.x;
  let fromZ = RUNWAY.z + RUNWAY.halfLength;
  for (const ring of rings) {
    const dx = ring.x - fromX;
    const dz = ring.z - fromZ;
    const length = Math.hypot(dx, dz) || 1;
    ring.nx = dx / length;
    ring.nz = dz / length;
    fromX = ring.x;
    fromZ = ring.z;
  }

  const plane = {
    x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0,
    speed: 0, throttle: 0, vy: 0, grounded: true,
  };
  const state = {
    plane,
    rings,
    target: COURSE.rings, // Index of the ring to fly through; the finish ring until the course opens.
    score: 0,
    elapsed: 0,
    passed: 0,
    lastBonus: 0,
    flash: 0, // Seconds left on the ring flash message (pass or miss), for the HUD.
    flashText: '',
    over: false,
    finished: false,
    crashText: '',
  };

  function reset() {
    plane.x = RUNWAY.x;
    plane.z = RUNWAY.z + RUNWAY.halfLength - 30;
    plane.y = RUNWAY.height + PLANE.clearance;
    plane.heading = 0;
    plane.pitch = 0;
    plane.roll = 0;
    plane.speed = 0;
    plane.throttle = 0;
    plane.vy = 0;
    plane.grounded = true;
    for (const ring of rings) ring.done = false;
    state.target = 0;
    state.score = 0;
    state.elapsed = 0;
    state.passed = 0;
    state.lastBonus = 0;
    state.flash = 0;
    state.flashText = '';
    state.over = false;
    state.finished = false;
    state.crashText = '';
  }

  /** The signed distance of the plane from the target ring's plane, along the ring's facing. */
  function axialDistance(ring) {
    return (plane.x - ring.x) * ring.nx + (plane.z - ring.z) * ring.nz;
  }

  function checkRing(previousAxial) {
    const ring = rings[state.target];
    if (!ring || ring.done) return 0;
    const axial = axialDistance(ring);
    if (previousAxial === 0 || Math.sign(axial) === Math.sign(previousAxial) || plane.grounded) return 0;
    // The plane just crossed the ring's plane: how far from the hole's centre was it?
    const dx = plane.x - ring.x;
    const dy = plane.y - ring.y;
    const dz = plane.z - ring.z;
    const radial = Math.sqrt(dx * dx + dy * dy + dz * dz - axial * axial);
    if (radial > ring.radius) {
      state.flash = 2.2;
      state.flashText = 'Missed the ring — circle back';
      return EVENT_MISS;
    }
    ring.done = true;
    const centreBonus = Math.round(COURSE.ringCentreBonus * (1 - radial / ring.radius));
    if (ring.finish) {
      const timeBonus = Math.max(0, Math.round((COURSE.parSeconds - state.elapsed) * COURSE.bonusPerSecond));
      state.score += COURSE.finishPoints + timeBonus;
      state.lastBonus = COURSE.finishPoints + timeBonus;
      state.finished = true;
      state.over = true;
      state.flash = 3;
      state.flashText = 'Course complete!';
      return EVENT_FINISH;
    }
    state.score += COURSE.ringPoints + centreBonus;
    state.lastBonus = COURSE.ringPoints + centreBonus;
    state.passed += 1;
    state.target += 1;
    state.flash = 2.2;
    state.flashText = `Ring ${state.passed} of ${COURSE.rings} — +${state.lastBonus}`;
    return EVENT_RING;
  }

  /**
   * One fixed step. `controls` is { pitch, roll, throttle }, each in [-1, 1]: pitch +1 pulls
   * the nose up, roll +1 banks right, throttle +1 opens it. With `harmless` set nothing can
   * crash and nothing scores (a backdrop flight).
   */
  function step(dt, controls, harmless) {
    let events = 0;
    if (state.over) return events;
    state.elapsed += dt;
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt);

    const targetRing = rings[state.target];
    const previousAxial = targetRing ? axialDistance(targetRing) : 0;

    plane.throttle = clamp(plane.throttle + controls.throttle * PLANE.throttleRate * dt, 0, 1);

    // Roll and pitch ease toward what the controls ask for.
    const targetRoll = controls.roll * PLANE.maxRoll;
    const targetPitch = controls.pitch * PLANE.maxPitch;
    plane.roll += clamp(targetRoll - plane.roll, -PLANE.rollRate * dt, PLANE.rollRate * dt);
    plane.pitch += clamp(targetPitch - plane.pitch, -PLANE.pitchRate * dt, PLANE.pitchRate * dt);

    // Speed settles toward the throttle's mark, slower when climbing, faster in a dive.
    // On the ground the brakes hold at a standstill with the throttle shut; in the air the
    // plane always keeps at least its gliding speed.
    const targetSpeed = plane.grounded
      ? plane.throttle * PLANE.maxSpeed
      : PLANE.minSpeed + plane.throttle * (PLANE.maxSpeed - PLANE.minSpeed);
    const settling = plane.grounded ? 1.6 : 0.55;
    plane.speed += (targetSpeed - plane.speed) * Math.min(1, settling * dt);
    if (!plane.grounded) plane.speed -= Math.sin(plane.pitch) * 7.5 * dt;
    plane.speed = Math.max(0, plane.speed);

    // A banked wing turns the plane; on the ground the same input steers the roll-out.
    if (plane.grounded) {
      plane.heading = wrapAngle(plane.heading + controls.roll * 0.45 * dt * Math.min(1, plane.speed / 18));
    } else {
      const turn = -Math.sin(plane.roll) * PLANE.turnAtBank * (plane.speed / PLANE.turnRefSpeed);
      plane.heading = wrapAngle(plane.heading - turn * dt);
    }

    // Stall: too slow and the nose drops, the wing sinks.
    let sink = 0;
    if (!plane.grounded && plane.speed < PLANE.stallSpeed) {
      plane.pitch += (-0.3 - plane.pitch) * Math.min(1, 2.2 * dt);
      sink = (PLANE.stallSpeed - plane.speed) * 0.55;
    }

    const forwardX = Math.sin(plane.heading);
    const forwardZ = -Math.cos(plane.heading);
    const horizontal = plane.speed * Math.cos(plane.pitch);
    plane.x += forwardX * horizontal * dt;
    plane.z += forwardZ * horizontal * dt;
    plane.vy = plane.grounded ? 0 : plane.speed * Math.sin(plane.pitch) - sink;
    plane.y += plane.vy * dt;

    const ground = groundHeight(plane.x, plane.z);
    const floor = ground + PLANE.clearance;

    if (plane.grounded) {
      plane.y = floor;
      // Leaving the ground takes speed and a raised nose; leaving the strip sideways is a crash.
      if (!overRunway(plane.x, plane.z, 2)) {
        if (!harmless) {
          state.over = true;
          state.crashText = 'You left the runway and struck the ground.';
          return EVENT_CRASH;
        }
        plane.y = floor;
      } else if (plane.speed > 27 && plane.pitch > 0.04) {
        plane.grounded = false;
        events |= EVENT_TAKEOFF;
      } else if (plane.z < RUNWAY.z - RUNWAY.halfLength - 260 || Math.abs(plane.x) > 4000 || Math.abs(plane.z) > 4000) {
        // Idling scenery for the title screen: a parked plane never gets here, but a backdrop
        // flight that wanders off is quietly parked again.
        if (harmless) reset();
      }
    } else if (plane.y <= floor) {
      // Touching down: a landing is gentle, slow, flat and on the strip; anything else is a crash.
      const gentle = plane.vy > -5.5 && Math.abs(plane.pitch) < 0.16 && Math.abs(plane.roll) < 0.3;
      if (!harmless && overRunway(plane.x, plane.z, 0) && gentle && ground > SEA_LEVEL) {
        plane.grounded = true;
        plane.y = floor;
        plane.pitch = 0;
      } else if (harmless) {
        plane.y = floor;
        plane.vy = Math.max(0, plane.vy);
      } else {
        state.over = true;
        state.crashText = ground <= SEA_LEVEL
          ? 'The Kitefin went down in the sea.'
          : 'The Kitefin struck the land.';
        events |= EVENT_CRASH;
        return events;
      }
    }

    if (!plane.grounded) events |= checkRing(previousAxial);
    return events;
  }

  reset();
  return { state, reset, step, terrainHeight, groundHeight, islands };
}
