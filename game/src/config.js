// SUNHARROW — Archipelago Ring Run. Every tuning number and colour in one place.
// The view is a fixed 1280x720 logical frame; the renderer scales it to the window, so no rule
// below depends on the screen size. The world itself is measured in metres: x east, z south,
// y up, heading 0 = north (toward -z), growing clockwise as a compass does.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Sea level is y = 0 everywhere; land rises out of it. The plane is a landplane: water is a crash. */
export const SEA_LEVEL = 0;

/** The home island's flat top, where the runway sits. Height in metres above the sea. */
export const PLATEAU_HEIGHT = 14;

/** The runway strip on the home island: a flat rectangle, long axis north-south. */
export const RUNWAY = {
  /** Centre of the strip, in world metres (the home island is centred on the origin). */
  x: 0,
  z: 0,
  /** Half the strip's length (north-south) and half its width (east-west). */
  halfLength: 210,
  halfWidth: 16,
  /** The height of the strip's surface; the plateau is flattened to this under the strip. */
  height: PLATEAU_HEIGHT,
};

export const PLANE = {
  /** How far above its centre point the plane's belly sits, for ground contact. */
  clearance: 2.2,
  /** Throttle range and how fast a held throttle key moves it, per second. */
  throttleRate: 0.55,
  /** Speeds in metres a second: at full throttle on the flat, and at idle. */
  maxSpeed: 82,
  minSpeed: 16,
  /** Below this speed the wing stalls: the nose drops and the plane sinks. */
  stallSpeed: 24,
  /** How fast roll and pitch answer their controls, radians a second toward the target. */
  rollRate: 2.4,
  pitchRate: 1.9,
  /** The most the controls can bank or tilt the plane, in radians. */
  maxRoll: 1.15,
  maxPitch: 0.52,
  /** Turn rate at full bank, scaled by speed: radians a second at the reference speed. */
  turnAtBank: 0.62,
  turnRefSpeed: 46,
};

export const COURSE = {
  /** Rings to fly through, not counting the finish ring over the runway. */
  rings: 8,
  /** The loop the rings are strung along: centre and radius in metres, around the home island. */
  loopRadius: 980,
  /** Ring sizes: the hole you must thread, in metres. */
  ringRadius: 26,
  /** Points for a ring, plus up to this much more for threading its middle. */
  ringPoints: 100,
  ringCentreBonus: 50,
  /** The par time for the whole course, in seconds; beating it pays the leftover as bonus. */
  parSeconds: 210,
  bonusPerSecond: 5,
  finishPoints: 250,
};

/** Camera: how far behind and above the plane the chase view sits, in metres. */
export const CAMERA = { back: 15, up: 5.5, lookAhead: 42 };

export const PALETTE = {
  backdrop: '#0d1120',
  skyTop: '#232f57',
  skyMid: '#7a5a78',
  horizon: '#e8975f',
  sun: '#ffd9a0',
  sunCore: '#fff3d6',
  sea: '#173f5c',
  seaDeep: '#10293d',
  sand: '#d9b77c',
  grass: '#567b46',
  forest: '#2f5d3a',
  rock: '#7d7468',
  snow: '#f2ede4',
  runway: '#3c4148',
  runwayLine: '#f5f2e8',
  planeBody: '#f3e9d2',
  planeTrim: '#c8433c',
  planeDark: '#2b2f36',
  ringNext: '#ffb340',
  ringDone: '#3fd68f',
  ringIdle: '#57c7d4',
  panel: '#141a28',
  panelEdge: '#3a4a63',
  text: '#f4efe4',
  muted: '#a7adc0',
  gaugeFace: '#101623',
  gaugeGlow: '#ffb340',
  gaugeNeedle: '#ffdf9e',
  warn: '#ff6a5e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'sunharrow-ring-run.best';
