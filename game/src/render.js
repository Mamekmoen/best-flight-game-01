// Drawing only: the world in, pixels out. A chase camera sits behind and above the plane;
// the archipelago is drawn as a perspective grid of ground quads coloured by the same height
// function the simulation collides with, so the land you see is the land you can hit. Over it
// go the rings, the plane itself, a HUD with altitude, speed and heading, and a panel of lit
// cockpit gauges along the bottom. The 1280x720 logical frame is scaled to the window.
import { CAMERA, COURSE, FIELD, FONT, PALETTE, PLANE, RUNWAY } from './config.js';
import { hash2 } from './random.js';
import { overRunway, wrapAngle } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

/** Vertical field of view and the focal length it gives, in pixels. */
const FOCAL = 600;
/** How far the drawn world reaches, and the fog that softens it. */
const GRID_ROWS = 48;
const GRID_COLS = 31;
const FOG_DISTANCE = 4300;

/** The sun's direction: low in the north-east, where the dawn is breaking. */
const SUN = normalize3(0.52, 0.24, -0.82);

function normalize3(x, y, z) {
  const length = Math.hypot(x, y, z);
  return { x: x / length, y: y / length, z: z / length };
}

function hexRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function mixRgb(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function css(rgb) {
  return `rgb(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0})`;
}

const COLORS = {
  sea: hexRgb(PALETTE.sea),
  seaDeep: hexRgb(PALETTE.seaDeep),
  sand: hexRgb(PALETTE.sand),
  grass: hexRgb(PALETTE.grass),
  forest: hexRgb(PALETTE.forest),
  rock: hexRgb(PALETTE.rock),
  snow: hexRgb(PALETTE.snow),
  runway: hexRgb(PALETTE.runway),
  runwayLine: hexRgb(PALETTE.runwayLine),
  horizon: hexRgb(PALETTE.horizon),
};

/** The ground's colour at a height, with slope pushing grass toward rock. */
function groundColor(height, slope, x, z) {
  if (height <= 0.4) {
    const sparkle = hash2(Math.floor(x / 90), Math.floor(z / 90));
    return mixRgb(COLORS.seaDeep, COLORS.sea, 0.5 + sparkle * 0.13);
  }
  if (overRunway(x, z, 0)) {
    const onLine = Math.abs(x - RUNWAY.x) < 1.4 && hash2(0, Math.floor(z / 22)) > 0.42;
    return onLine ? COLORS.runwayLine : COLORS.runway;
  }
  if (height < 2.6) return COLORS.sand;
  let base;
  if (height < 40) {
    const patch = hash2(Math.floor(x / 90), Math.floor(z / 90));
    base = mixRgb(COLORS.grass, COLORS.forest, patch);
  } else if (height < 82) {
    base = mixRgb(COLORS.forest, COLORS.rock, (height - 40) / 42);
  } else {
    base = mixRgb(COLORS.rock, COLORS.snow, Math.min(1, (height - 82) / 26));
  }
  if (slope > 0.55 && height >= 2.6) base = mixRgb(base, COLORS.rock, Math.min(0.7, (slope - 0.55) * 1.4));
  return base;
}

/** Multiply a colour by a light factor, for sun shading on the land. */
function shadeRgb(rgb, factor) {
  return [rgb[0] * factor, rgb[1] * factor, rgb[2] * factor];
}

export function createRenderer(canvas, world) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  // The camera basis for the current frame, and a scratch point for projections.
  const cam = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0 };
  const projected = { x: 0, y: 0, z: -1 };

  function placeCamera(plane) {
    const cosPitch = Math.cos(plane.pitch);
    const fx = Math.sin(plane.heading) * cosPitch;
    const fy = Math.sin(plane.pitch);
    const fz = -Math.cos(plane.heading) * cosPitch;
    cam.x = plane.x - fx * CAMERA.back;
    cam.y = plane.y - fy * CAMERA.back + CAMERA.up;
    cam.z = plane.z - fz * CAMERA.back;
    // Look a little way ahead of the plane, softening the pitch so the horizon stays readable.
    const lookPitch = plane.pitch * 0.72;
    const lx = Math.sin(plane.heading) * Math.cos(lookPitch);
    const ly = Math.sin(lookPitch);
    const lz = -Math.cos(plane.heading) * Math.cos(lookPitch);
    let vx = plane.x + lx * CAMERA.lookAhead - cam.x;
    let vy = plane.y + ly * CAMERA.lookAhead - cam.y;
    let vz = plane.z + lz * CAMERA.lookAhead - cam.z;
    const vLength = Math.hypot(vx, vy, vz) || 1;
    vx /= vLength; vy /= vLength; vz /= vLength;
    // Right = view x up; up completes the basis.
    let rx = -vz; // cross((vx,vy,vz), (0,1,0)) has no y term worth keeping here; see below.
    let rz = vx;
    const rLength = Math.hypot(rx, rz) || 1;
    rx /= rLength; rz /= rLength;
    cam.fx = vx; cam.fy = vy; cam.fz = vz;
    cam.rx = rx; cam.ry = 0; cam.rz = rz;
    // Up = right x view, checked against the north-facing case (up comes out (0, 1, 0)).
    cam.ux = -cam.rz * cam.fy;
    cam.uy = cam.rz * cam.fx - cam.rx * cam.fz;
    cam.uz = cam.rx * cam.fy;
  }

  /** Project a world point into the logical frame; z <= 0 means behind the camera. */
  function project(x, y, z) {
    const dx = x - cam.x;
    const dy = y - cam.y;
    const dz = z - cam.z;
    const cz = dx * cam.fx + dy * cam.fy + dz * cam.fz;
    projected.z = cz;
    if (cz <= 0.5) {
      projected.x = -9999;
      projected.y = -9999;
      return projected;
    }
    projected.x = FIELD.width / 2 + ((dx * cam.rx + dy * cam.ry + dz * cam.rz) * FOCAL) / cz;
    projected.y = FIELD.height / 2 - ((dx * cam.ux + dy * cam.uy + dz * cam.uz) * FOCAL) / cz;
    return projected;
  }

  function drawSky(plane, horizonY) {
    const gradient = context.createLinearGradient(0, -320, 0, FIELD.height + 320);
    gradient.addColorStop(0, PALETTE.skyTop);
    gradient.addColorStop(0.52, PALETTE.skyMid);
    gradient.addColorStop(0.72, PALETTE.horizon);
    gradient.addColorStop(1, PALETTE.seaDeep);
    context.fillStyle = gradient;
    context.fillRect(-420, -340, FIELD.width + 840, FIELD.height + 680);
    // The sea's base coat from the horizon down, so no gap in the ground grid can show sky.
    const horizonPoint = project(cam.x + cam.fx * 4000, cam.y, cam.z + cam.fz * 4000);
    if (horizonPoint.z > 0) {
      context.fillStyle = PALETTE.seaDeep;
      context.fillRect(-420, horizonPoint.y, FIELD.width + 840, FIELD.height + 680);
    }
    // The sun, where the dawn is breaking.
    const sun = project(cam.x + SUN.x * 6000, cam.y + SUN.y * 6000, cam.z + SUN.z * 6000);
    if (sun.z > 0) {
      const glow = context.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 190);
      glow.addColorStop(0, 'rgba(255, 217, 160, 0.85)');
      glow.addColorStop(0.25, 'rgba(255, 183, 110, 0.35)');
      glow.addColorStop(1, 'rgba(255, 183, 110, 0)');
      context.fillStyle = glow;
      context.fillRect(sun.x - 200, sun.y - 200, 400, 400);
      context.fillStyle = PALETTE.sunCore;
      context.beginPath();
      context.arc(sun.x, sun.y, 30, 0, Math.PI * 2);
      context.fill();
    }
    void horizonY;
    void plane;
  }

  // Cloud puffs: fixed to the world by a steady hash, drifting a breath with time.
  const clouds = [];
  for (let index = 0; index < 16; index += 1) {
    const angle = hash2(index, 7) * Math.PI * 2;
    const distance = 900 + hash2(index, 13) * 2500;
    clouds.push({
      x: Math.sin(angle) * distance,
      z: -Math.cos(angle) * distance,
      y: 200 + hash2(index, 29) * 120,
      size: 60 + hash2(index, 41) * 95,
    });
  }

  function drawClouds(elapsed) {
    for (const cloud of clouds) {
      const drift = Math.sin(elapsed * 0.01 + cloud.size) * 12;
      const p = project(cloud.x + drift, cloud.y, cloud.z);
      if (p.z < 60) continue;
      const scale = FOCAL / p.z;
      const w = cloud.size * scale;
      if (w < 6 || w > 380 || p.x < -w || p.x > FIELD.width + w) continue;
      const alpha = Math.max(0, 0.34 - p.z / 10000);
      // Soft puffs: each is a radial gradient squashed flat, so a cloud has no hard edge.
      const puffs = [
        [0, 0, 1], [-0.42, 0.06, 0.52], [0.44, 0.05, 0.48], [0.05, -0.12, 0.55],
      ];
      for (const [ox, oy, part] of puffs) {
        const radius = w * part;
        context.save();
        context.translate(p.x + ox * w, p.y + oy * w);
        context.scale(1, 0.32);
        const gradient = context.createRadialGradient(0, 0, radius * 0.1, 0, 0, radius);
        gradient.addColorStop(0, `rgba(250, 240, 226, ${alpha.toFixed(3)})`);
        gradient.addColorStop(1, 'rgba(250, 240, 226, 0)');
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(0, 0, radius, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    }
  }

  // The ground grid: rows of constant distance ahead, columns of constant sideways offset,
  // each vertex's height from the world's own height function. Projected once per frame into
  // flat arrays, then painted far to near.
  const rowDistance = new Float32Array(GRID_ROWS);
  for (let row = 0; row < GRID_ROWS; row += 1) rowDistance[row] = 7 * Math.pow(1.155, row);
  const gridX = new Float32Array(GRID_ROWS * GRID_COLS);
  const gridY = new Float32Array(GRID_ROWS * GRID_COLS);
  const gridZ = new Float32Array(GRID_ROWS * GRID_COLS);
  const gridH = new Float32Array(GRID_ROWS * GRID_COLS);

  function drawTerrain(plane) {
    const headingX = Math.sin(plane.heading);
    const headingZ = -Math.cos(plane.heading);
    const rightX = -headingZ;
    const rightZ = headingX;
    // The sun's direction in the camera's ground terms, for shading the land's faces.
    const sunRight = SUN.x * rightX + SUN.z * rightZ;
    const sunFwd = SUN.x * headingX + SUN.z * headingZ;
    for (let row = 0; row < GRID_ROWS; row += 1) {
      const distance = rowDistance[row];
      const halfSpan = 12 + distance * 1.02;
      for (let col = 0; col < GRID_COLS; col += 1) {
        const lateral = (col / (GRID_COLS - 1) - 0.5) * 2 * halfSpan;
        const wx = cam.x + headingX * distance + rightX * lateral;
        const wz = cam.z + headingZ * distance + rightZ * lateral;
        const index = row * GRID_COLS + col;
        gridH[index] = world.terrainHeight(wx, wz);
        const p = project(wx, Math.max(0, gridH[index]), wz);
        gridX[index] = p.x;
        gridY[index] = p.y;
        gridZ[index] = p.z;
      }
    }
    for (let row = GRID_ROWS - 2; row >= 0; row -= 1) {
      const centreDistance = (rowDistance[row] + rowDistance[row + 1]) / 2;
      const fog = Math.min(0.88, Math.pow(rowDistance[row + 1] / FOG_DISTANCE, 1.25));
      const centreHalfSpan = 12 + centreDistance * 1.02;
      for (let col = 0; col < GRID_COLS - 1; col += 1) {
        const a = row * GRID_COLS + col;
        const b = a + 1;
        const c = a + GRID_COLS;
        const d = c + 1;
        if (gridZ[a] < 2 || gridZ[b] < 2 || gridZ[c] < 2 || gridZ[d] < 2) continue;
        const height = (gridH[a] + gridH[b] + gridH[c] + gridH[d]) / 4;
        const slope = Math.abs(gridH[c] - gridH[a]) / Math.max(1, rowDistance[row + 1] - rowDistance[row]);
        // The quad's centre in the world, for its texture and the runway test.
        const lateral = ((col + 0.5) / (GRID_COLS - 1) - 0.5) * 2 * centreHalfSpan;
        const wx = cam.x + headingX * centreDistance + rightX * lateral;
        const wz = cam.z + headingZ * centreDistance + rightZ * lateral;
        let base = groundColor(height, slope, wx, wz);
        if (height > 0.4) {
          // Sun shading: a face that falls away toward the sun catches the dawn; one that
          // rises toward it sits in its own shade.
          const quadWidth = (2 * centreHalfSpan) / (GRID_COLS - 1);
          const quadDepth = Math.max(1, rowDistance[row + 1] - rowDistance[row]);
          const gradRight = ((gridH[b] + gridH[d]) - (gridH[a] + gridH[c])) / 2 / quadWidth;
          const gradFwd = ((gridH[c] + gridH[d]) - (gridH[a] + gridH[b])) / 2 / quadDepth;
          const light = Math.max(0.68, Math.min(1.22, 1 - (gradRight * sunRight + gradFwd * sunFwd) * 1.35));
          base = shadeRgb(base, light);
        }
        context.fillStyle = css(mixRgb(base, COLORS.horizon, fog));
        context.beginPath();
        context.moveTo(gridX[a], gridY[a]);
        context.lineTo(gridX[b], gridY[b]);
        context.lineTo(gridX[d], gridY[d]);
        context.lineTo(gridX[c], gridY[c]);
        context.closePath();
        context.fill();
      }
    }
  }

  function drawRunwayMarkings() {
    // Threshold bars and a centreline, drawn as projected ground quads so they sit on the strip.
    context.fillStyle = 'rgba(245, 242, 232, 0.9)';
    for (let dash = -4; dash <= 4; dash += 1) {
      if (dash === 0) continue;
      const z = RUNWAY.z + dash * 42;
      quadOnGround(RUNWAY.x - 1.1, z - 9, RUNWAY.x + 1.1, z + 9, RUNWAY.height);
    }
    for (const end of [-1, 1]) {
      for (let bar = -2; bar <= 2; bar += 1) {
        if (bar === 0) continue;
        const z = RUNWAY.z + end * (RUNWAY.halfLength - 14);
        quadOnGround(RUNWAY.x + bar * 5.4 - 1.6, z - 7, RUNWAY.x + bar * 5.4 + 1.6, z + 7, RUNWAY.height);
      }
    }
  }

  function quadOnGround(x0, z0, x1, z1, y) {
    const a = project(x0, y + 0.15, z0);
    if (a.z < 2) return;
    const ax = a.x; const ay = a.y;
    const b = project(x1, y + 0.15, z0);
    if (b.z < 2) return;
    const bx = b.x; const by = b.y;
    const c = project(x1, y + 0.15, z1);
    if (c.z < 2) return;
    const cx2 = c.x; const cy2 = c.y;
    const d = project(x0, y + 0.15, z1);
    if (d.z < 2) return;
    context.beginPath();
    context.moveTo(ax, ay);
    context.lineTo(bx, by);
    context.lineTo(cx2, cy2);
    context.lineTo(d.x, d.y);
    context.closePath();
    context.fill();
  }

  function drawRing(ring, isTarget, elapsed) {
    // project() returns one shared scratch point: copy each result before projecting again.
    const centrePoint = project(ring.x, ring.y, ring.z);
    if (centrePoint.z < 4) return;
    const centre = { x: centrePoint.x, y: centrePoint.y, z: centrePoint.z };
    const distance = centre.z;
    // The ring's two axes in the world: up, and sideways across its facing.
    const upPoint = project(ring.x, ring.y + ring.radius, ring.z);
    if (upPoint.z < 4) return;
    const up = { x: upPoint.x, y: upPoint.y };
    const sideX = -ring.nz;
    const sideZ = ring.nx;
    const sidePoint = project(ring.x + sideX * ring.radius, ring.y, ring.z + sideZ * ring.radius);
    if (sidePoint.z < 4) return;
    const side = { x: sidePoint.x, y: sidePoint.y };
    const radiusY = Math.hypot(up.x - centre.x, up.y - centre.y);
    const radiusX = Math.hypot(side.x - centre.x, side.y - centre.y);
    if (radiusX < 3 || radiusY < 3) return;
    const tilt = Math.atan2(up.y - centre.y, up.x - centre.x) + Math.PI / 2;
    let color = PALETTE.ringIdle;
    let width = 4;
    if (ring.done) {
      color = PALETTE.ringDone;
      width = 3;
    } else if (isTarget) {
      color = PALETTE.ringNext;
      width = 5 + Math.sin(elapsed * 5) * 1.2;
    }
    context.save();
    context.strokeStyle = color;
    context.lineWidth = Math.max(2, width * Math.min(1, 300 / distance));
    context.shadowColor = color;
    context.shadowBlur = isTarget ? 16 : 6;
    context.beginPath();
    context.ellipse(centre.x, centre.y, radiusX, radiusY, tilt, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  function drawPlane(plane, elapsed) {
    // The plane's shadow, projected onto whatever is under it.
    const groundY = Math.max(0, world.terrainHeight(plane.x, plane.z));
    const shadow = project(plane.x, groundY + 0.4, plane.z);
    if (shadow.z > 2 && plane.y - groundY < 190) {
      const size = Math.max(10, 1300 / shadow.z);
      context.fillStyle = `rgba(8, 10, 16, ${Math.max(0, 0.34 - (plane.y - groundY) / 560).toFixed(3)})`;
      context.beginPath();
      context.ellipse(shadow.x, shadow.y, size, size * 0.3, 0, 0, Math.PI * 2);
      context.fill();
    }

    const cx = FIELD.width / 2;
    const cy = FIELD.height * 0.685 + Math.sin(plane.pitch) * -36;
    context.save();
    context.translate(cx, cy);
    context.rotate(plane.roll * 0.82);
    const s = 1.85;
    context.scale(s, s);
    // Tailplane and fin, behind the wing from this view.
    context.fillStyle = PALETTE.planeTrim;
    context.beginPath();
    context.moveTo(-34, -34);
    context.lineTo(34, -34);
    context.lineTo(26, -24);
    context.lineTo(-26, -24);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(-3, -52);
    context.lineTo(3, -52);
    context.lineTo(5, -30);
    context.lineTo(-5, -30);
    context.closePath();
    context.fill();
    // Fuselage, nose at the bottom of the frame, tail at the top.
    context.fillStyle = PALETTE.planeBody;
    context.beginPath();
    context.moveTo(0, 40);
    context.bezierCurveTo(11, 38, 14, 18, 12, -6);
    context.bezierCurveTo(10, -26, 6, -40, 0, -46);
    context.bezierCurveTo(-6, -40, -10, -26, -12, -6);
    context.bezierCurveTo(-14, 18, -11, 38, 0, 40);
    context.fill();
    // The main wing, spanning the frame, with trim tips and navigation lights.
    context.fillStyle = PALETTE.planeTrim;
    context.beginPath();
    context.moveTo(-86, 2);
    context.lineTo(86, 2);
    context.lineTo(78, 13);
    context.lineTo(-78, 13);
    context.closePath();
    context.fill();
    context.fillStyle = '#ff5a4e';
    context.beginPath();
    context.arc(-84, 7, 3.2, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#54ff9a';
    context.beginPath();
    context.arc(84, 7, 3.2, 0, Math.PI * 2);
    context.fill();
    // Canopy.
    context.fillStyle = PALETTE.planeDark;
    context.beginPath();
    context.ellipse(0, -14, 6.4, 11, 0, 0, Math.PI * 2);
    context.fill();
    // The propeller: a blurred disc at the nose with two blade streaks turning with time.
    context.fillStyle = 'rgba(30, 32, 38, 0.28)';
    context.beginPath();
    context.arc(0, 42, 15, 0, Math.PI * 2);
    context.fill();
    const blade = elapsed * (6 + plane.throttle * 46) + plane.speed * 0.04;
    context.strokeStyle = 'rgba(24, 26, 32, 0.65)';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(Math.cos(blade) * -14, 42 + Math.sin(blade) * -14);
    context.lineTo(Math.cos(blade) * 14, 42 + Math.sin(blade) * 14);
    context.stroke();
    context.fillStyle = PALETTE.planeDark;
    context.beginPath();
    context.arc(0, 42, 3.4, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawCompassTape(plane) {
    const x = FIELD.width / 2;
    const y = 64;
    context.fillStyle = 'rgba(13, 17, 28, 0.55)';
    context.fillRect(x - 170, y - 20, 340, 34);
    const headingDeg = ((plane.heading * 180) / Math.PI + 360) % 360;
    context.save();
    context.beginPath();
    context.rect(x - 170, y - 20, 340, 34);
    context.clip();
    const points = [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']];
    for (const [deg, label] of points) {
      let offset = wrapAngle(((deg - headingDeg) * Math.PI) / 180) * (180 / Math.PI);
      if (Math.abs(offset) > 62) continue;
      text(label, x + offset * 2.6, y - 13, 17, PALETTE.text, 'center');
    }
    for (let tick = 0; tick < 360; tick += 15) {
      let offset = wrapAngle(((tick - headingDeg) * Math.PI) / 180) * (180 / Math.PI);
      if (Math.abs(offset) > 62) continue;
      context.fillStyle = PALETTE.muted;
      context.fillRect(x + offset * 2.6 - 1, y + 7, 2, 5);
    }
    context.restore();
    context.fillStyle = PALETTE.gaugeGlow;
    context.beginPath();
    context.moveTo(x - 6, y - 24);
    context.lineTo(x + 6, y - 24);
    context.lineTo(x, y - 15);
    context.closePath();
    context.fill();
  }

  function drawGauge(cx, cy, radius, label, fraction, needleText, warn) {
    context.fillStyle = PALETTE.gaugeFace;
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = warn ? PALETTE.warn : PALETTE.panelEdge;
    context.lineWidth = 2.5;
    context.shadowColor = warn ? PALETTE.warn : PALETTE.gaugeGlow;
    context.shadowBlur = 7;
    context.stroke();
    context.shadowBlur = 0;
    const start = Math.PI * 0.75;
    const sweep = Math.PI * 1.5;
    for (let tick = 0; tick <= 10; tick += 1) {
      const angle = start + (tick / 10) * sweep;
      const inner = radius - (tick % 5 === 0 ? 11 : 7);
      context.strokeStyle = PALETTE.muted;
      context.lineWidth = 1.6;
      context.beginPath();
      context.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      context.lineTo(cx + Math.cos(angle) * (radius - 3), cy + Math.sin(angle) * (radius - 3));
      context.stroke();
    }
    const angle = start + Math.max(0, Math.min(1, fraction)) * sweep;
    context.strokeStyle = PALETTE.gaugeNeedle;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(cx, cy);
    context.lineTo(cx + Math.cos(angle) * (radius - 12), cy + Math.sin(angle) * (radius - 12));
    context.stroke();
    context.fillStyle = PALETTE.gaugeNeedle;
    context.beginPath();
    context.arc(cx, cy, 3.4, 0, Math.PI * 2);
    context.fill();
    text(label, cx, cy - 25, 11.5, PALETTE.muted, 'center');
    text(needleText, cx, cy + 27, 16, PALETTE.text, 'center');
  }

  function drawHorizonGauge(cx, cy, radius, plane) {
    context.save();
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.clip();
    context.fillStyle = PALETTE.gaugeFace;
    context.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    context.translate(cx, cy);
    context.rotate(-plane.roll);
    const shift = Math.max(-radius, Math.min(radius, plane.pitch * radius * 1.6));
    context.fillStyle = '#3f6d9e';
    context.fillRect(-radius * 1.5, -radius * 1.5 + shift, radius * 3, radius * 1.5);
    context.fillStyle = '#6d5136';
    context.fillRect(-radius * 1.5, shift, radius * 3, radius * 1.5);
    context.strokeStyle = 'rgba(244, 239, 228, 0.9)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(-radius * 1.5, shift);
    context.lineTo(radius * 1.5, shift);
    context.stroke();
    context.restore();
    context.strokeStyle = PALETTE.gaugeGlow;
    context.lineWidth = 2.5;
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = PALETTE.gaugeNeedle;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(cx - radius * 0.52, cy);
    context.lineTo(cx - radius * 0.16, cy);
    context.moveTo(cx + radius * 0.16, cy);
    context.lineTo(cx + radius * 0.52, cy);
    context.stroke();
    context.fillStyle = PALETTE.gaugeNeedle;
    context.beginPath();
    context.arc(cx, cy, 2.6, 0, Math.PI * 2);
    context.fill();
    text('HORIZON', cx, cy + radius - 11, 11, PALETTE.text, 'center');
  }

  function drawInstruments(state) {
    const plane = state.plane;
    // The panel bar the gauges live in.
    const top = FIELD.height - 118;
    context.fillStyle = 'rgba(15, 19, 30, 0.82)';
    context.fillRect(0, top, FIELD.width, FIELD.height - top);
    context.fillStyle = PALETTE.panelEdge;
    context.fillRect(0, top, FIELD.width, 2);
    const cy = top + 62;
    const speedKmh = Math.round(plane.speed * 3.6);
    const altitude = Math.max(0, Math.round(plane.y));
    drawGauge(120, cy, 44, 'SPEED km/h', plane.speed / PLANE.maxSpeed, String(speedKmh), false);
    drawHorizonGauge(268, cy - 6, 40, plane);
    drawGauge(416, cy, 44, 'ALTITUDE m', plane.y / 320, String(altitude), false);
    // Throttle and course progress, as lit bars beside the gauges.
    context.fillStyle = PALETTE.muted;
    text('THROTTLE', 520, cy - 26, 13, PALETTE.muted, 'left');
    context.fillStyle = 'rgba(255,255,255,0.12)';
    context.fillRect(520, cy - 16, 190, 13);
    context.fillStyle = PALETTE.gaugeGlow;
    context.fillRect(520, cy - 16, 190 * plane.throttle, 13);
    text('RINGS', 520, cy + 22, 13, PALETTE.muted, 'left');
    context.fillStyle = 'rgba(255,255,255,0.12)';
    context.fillRect(520, cy + 32, 190, 13);
    context.fillStyle = PALETTE.ringDone;
    context.fillRect(520, cy + 32, (190 * state.passed) / COURSE.rings, 13);
    if (!plane.grounded && plane.speed < PLANE.stallSpeed && plane.throttle < 0.98) {
      if (Math.floor(state.elapsed * 3) % 2 === 0) text('STALL', 616, cy - 44, 17, PALETTE.warn, 'left');
    }
  }

  function drawHud(state, best) {
    const plane = state.plane;
    context.textBaseline = 'top';
    const altitude = Math.max(0, Math.round(plane.y));
    const speedKmh = Math.round(plane.speed * 3.6);
    const headingDeg = String(Math.round(((plane.heading * 180) / Math.PI + 360) % 360)).padStart(3, '0');
    text(`ALT ${altitude} m`, 26, 18, 24, PALETTE.text, 'left');
    text(`SPD ${speedKmh} km/h`, 26, 48, 24, PALETTE.text, 'left');
    text(`HDG ${headingDeg}°`, 26, 78, 24, PALETTE.text, 'left');
    const minutes = Math.floor(state.elapsed / 60);
    const seconds = String(Math.floor(state.elapsed % 60)).padStart(2, '0');
    text(`SCORE ${state.score}`, FIELD.width - 26, 18, 24, PALETTE.text, 'right');
    text(`TIME ${minutes}:${seconds}`, FIELD.width - 26, 48, 24, PALETTE.text, 'right');
    text(`BEST ${best}`, FIELD.width - 26, 78, 24, PALETTE.muted, 'right');
    // A small crosshair at the centre of the view.
    context.strokeStyle = 'rgba(244, 239, 228, 0.65)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(FIELD.width / 2 - 13, FIELD.height / 2 - 40);
    context.lineTo(FIELD.width / 2 + 13, FIELD.height / 2 - 40);
    context.moveTo(FIELD.width / 2, FIELD.height / 2 - 53);
    context.lineTo(FIELD.width / 2, FIELD.height / 2 - 27);
    context.stroke();
    if (state.flash > 0) {
      context.fillStyle = 'rgba(13, 17, 28, 0.5)';
      const width = context.measureText(state.flashText).width + 190;
      context.fillRect(FIELD.width / 2 - width / 2, 118, width, 40);
      text(state.flashText, FIELD.width / 2, 126, 24, PALETTE.gaugeGlow, 'center');
    }
    drawCompassTape(plane);
    drawGuide(state);
  }

  /** An arrow at the view's edge pointing at the target ring, with its distance. */
  function drawGuide(state) {
    const ring = state.rings[state.target];
    if (!ring || ring.done) return;
    const p = project(ring.x, ring.y, ring.z);
    const plane = state.plane;
    const distance = Math.round(Math.hypot(ring.x - plane.x, ring.z - plane.z));
    if (p.z > 0 && p.x > 60 && p.x < FIELD.width - 60 && p.y > 60 && p.y < FIELD.height - 160) {
      text(`${distance} m`, p.x, p.y + ring.radius * FOCAL / p.z + 12, 18, PALETTE.ringNext, 'center');
      return;
    }
    // Off view: clamp the direction to a point on an ellipse around the centre and aim there.
    let dx = p.x - FIELD.width / 2;
    let dy = p.y - (FIELD.height / 2 - 40);
    if (p.z <= 0) {
      dx = -dx;
      dy = Math.abs(dy) + 60;
    }
    const length = Math.hypot(dx, dy) || 1;
    const ex = FIELD.width / 2 + (dx / length) * 430;
    const ey = FIELD.height / 2 - 40 + (dy / length) * 200;
    const angle = Math.atan2(dy, dx);
    context.save();
    context.translate(ex, ey);
    context.rotate(angle);
    context.fillStyle = PALETTE.ringNext;
    context.beginPath();
    context.moveTo(16, 0);
    context.lineTo(-10, -10);
    context.lineTo(-4, 0);
    context.lineTo(-10, 10);
    context.closePath();
    context.fill();
    context.restore();
    text(`${distance} m`, ex, ey + 16, 17, PALETTE.ringNext, 'center');
  }

  const PANEL = { width: 660, top: 118, line: 33, bottom: 64 };

  function drawPanel(title, lines, prompt, titleColor) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2 - 30;
    context.fillStyle = 'rgba(17, 22, 36, 0.88)';
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 74, 52, titleColor || PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 21, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 36, 23, PALETTE.gaugeGlow, 'center');
  }

  const TITLE_LINES = [
    'Fly the Kitefin through all 8 rings around',
    'the archipelago, then thread the finish ring',
    'over the runway. Dawn is breaking.',
    '',
    'Bank: arrow keys or A D',
    'Climb and dive: up and down, or the mouse',
    'Throttle: Shift opens it, Ctrl closes it (or E / Q)',
    'Take off past 100 km/h, nose raised. Mind the stall.',
  ];
  const PAUSED_LINES = ['The dawn will wait for you.'];

  /** Paint one frame: the world, then the HUD and instruments, then any panel. */
  function draw(state, screen, best) {
    const plane = state.plane;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    placeCamera(plane);
    // The whole world tips against the bank; the panel and HUD stay level with the reader.
    context.save();
    context.translate(FIELD.width / 2, FIELD.height * 0.47);
    context.rotate(-plane.roll * 0.45);
    context.translate(-FIELD.width / 2, -FIELD.height * 0.47);
    drawSky(plane, 0);
    drawClouds(state.elapsed);
    drawTerrain(plane);
    drawRunwayMarkings();
    for (let index = state.rings.length - 1; index >= 0; index -= 1) {
      if (index !== state.target) drawRing(state.rings[index], false, state.elapsed);
    }
    if (state.rings[state.target]) drawRing(state.rings[state.target], true, state.elapsed);
    context.restore();
    drawPlane(plane, state.elapsed);
    if (screen === SCREEN_TITLE) {
      drawPanel('SUNHARROW', [...TITLE_LINES, `Best score ${best}`], 'Press Space or click to fly');
      return;
    }
    drawHud(state, best);
    drawInstruments(state);
    if (screen === SCREEN_PAUSED) drawPanel('Paused', PAUSED_LINES, 'Press P to fly on');
    else if (screen === SCREEN_OVER) {
      if (state.finished) {
        drawPanel('Course complete!', [
          `Score ${state.score} — rings ${state.passed} of ${COURSE.rings}`,
          `Time ${Math.floor(state.elapsed / 60)}:${String(Math.floor(state.elapsed % 60)).padStart(2, '0')} against a par of ${Math.floor(COURSE.parSeconds / 60)}:${String(COURSE.parSeconds % 60).padStart(2, '0')}`,
          `Best ${best}`,
        ], 'Press Space or click to fly again', PALETTE.ringDone);
      } else {
        drawPanel('Down', [
          state.crashText,
          `Score ${state.score} — rings ${state.passed} of ${COURSE.rings}`,
          `Best ${best}`,
        ], 'Press Space or click to try again', PALETTE.warn);
      }
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
