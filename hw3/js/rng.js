// =============================================================================
// rng.js — Seeded pseudo-random generator (xoshiro128**), for REPRODUCIBLE
// simulations: the same seed always gives the same trajectories.
// Not cryptographic — that is fine here: we simulate, we do not protect data.
// =============================================================================

/** splitmix32: turns one 32-bit seed into well-mixed state words. */
function splitmix32(a) {
  return function () {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

/** Returns a function giving uniform numbers in [0, 1). */
export function makeRng(seed) {
  const sm = splitmix32(seed >>> 0);
  let a = sm(), b = sm(), c = sm(), d = sm();
  return function () {
    const t = b << 9;
    let r = Math.imul(b, 5);
    r = ((r << 7) | (r >>> 25)) >>> 0;
    r = Math.imul(r, 9);
    c ^= a; d ^= b; b ^= c; a ^= d; c ^= t;
    d = (d << 11) | (d >>> 21);
    return (r >>> 0) / 4294967296;
  };
}
