// Keyboard and mouse flight controls. Held keys and the mouse's place on the screen give a
// continuous set of controls — pitch, roll and throttle, each in [-1, 1] — while one-shot
// presses (start or restart, pause) are queued as bit flags and taken once by the loop, so a
// press between two frames is never lost and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;

const ROLL_LEFT = new Set(['ArrowLeft', 'KeyA']);
const ROLL_RIGHT = new Set(['ArrowRight', 'KeyD']);
const PITCH_UP = new Set(['ArrowUp', 'KeyW']);
const PITCH_DOWN = new Set(['ArrowDown', 'KeyS']);
const THROTTLE_UP = new Set(['ShiftLeft', 'ShiftRight', 'KeyE']);
const THROTTLE_DOWN = new Set(['ControlLeft', 'KeyQ']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);

/** Mouse steering ignores the middle of the screen, so a resting pointer does not steer. */
const DEADZONE = 0.09;

function axis(negative, positive) {
  return (positive ? 1 : 0) - (negative ? 1 : 0);
}

function shape(value) {
  const magnitude = Math.abs(value);
  if (magnitude <= DEADZONE) return 0;
  return Math.sign(value) * Math.min(1, (magnitude - DEADZONE) / (1 - DEADZONE));
}

export function createInput(target) {
  const held = {
    rollLeft: false, rollRight: false,
    pitchUp: false, pitchDown: false,
    throttleUp: false, throttleDown: false,
  };
  let actions = 0;
  // The mouse's place in [-1, 1] across and down the window; centred until it first moves.
  const mouse = { x: 0, y: 0, seen: false };

  const KEYMAP = [
    [ROLL_LEFT, 'rollLeft'], [ROLL_RIGHT, 'rollRight'],
    [PITCH_UP, 'pitchUp'], [PITCH_DOWN, 'pitchDown'],
    [THROTTLE_UP, 'throttleUp'], [THROTTLE_DOWN, 'throttleDown'],
  ];

  window.addEventListener('keydown', (event) => {
    for (const [keys, name] of KEYMAP) {
      if (keys.has(event.code)) {
        held[name] = true;
        event.preventDefault();
        return;
      }
    }
    if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
      event.preventDefault();
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    for (const [keys, name] of KEYMAP) {
      if (keys.has(event.code)) {
        held[name] = false;
        return;
      }
    }
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    for (const name of Object.keys(held)) held[name] = false;
  });
  window.addEventListener('pointermove', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = (event.clientY / window.innerHeight) * 2 - 1;
    mouse.seen = true;
  });
  target.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });

  return {
    /**
     * The controls as they stand: pitch +1 climbs, roll +1 banks right, throttle +1 opens it.
     * Keys win while they are held; otherwise the mouse steers from where it rests.
     */
    controls() {
      let roll = axis(held.rollLeft, held.rollRight);
      let pitch = axis(held.pitchDown, held.pitchUp);
      if (roll === 0 && mouse.seen) roll = shape(mouse.x);
      if (pitch === 0 && mouse.seen) pitch = shape(-mouse.y);
      return {
        pitch,
        roll,
        throttle: axis(held.throttleDown, held.throttleUp),
      };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
