// A small seeded random number generator (splitmix32): the same seed gives the same
// archipelago and the same ring course, which is what makes the screenshot scenes repeatable
// and lets two runs of the hand-in program be compared byte for byte.

export function createRandom(seed) {
  let state = seed | 0;
  return function random() {
    state = (state + 0x9e3779b9) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
    t = t ^ (t >>> 15);
    return (t >>> 0) / 4294967296;
  };
}

/**
 * A steady hash of two world coordinates, for texture that must not shimmer between frames:
 * the same corner of the world always hashes to the same value in [0, 1).
 */
export function hash2(x, z) {
  let h = Math.imul(x | 0, 0x8da6b343) ^ Math.imul(z | 0, 0xd8163841);
  h = Math.imul(h ^ (h >>> 13), 0x165667b1);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
