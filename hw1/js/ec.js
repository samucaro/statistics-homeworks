// =============================================================================
// ec.js — Elliptic-curve arithmetic over a prime field F_p
// HMWK 1 — Statistics (Sapienza, MSc Cybersecurity, A.A. 2026/27)
//
// DESIGN CHOICE (not required by the assignment): every number is a BigInt.
// The same code therefore works for the toy curve (p = 17) and for the real
// secp256k1 curve (p ≈ 2^256), which is used for the avalanche experiment.
//
// WARNING: educational code only. It is NOT constant-time and must never be
// used to handle real private keys (timing side-channels).
// =============================================================================

// -----------------------------------------------------------------------------
// 1. Modular arithmetic in F_p
// -----------------------------------------------------------------------------

/**
 * Mathematical modulo: always returns a value in [0, p-1].
 * Needed because the JavaScript % operator keeps the sign of the dividend:
 *   -5n % 17n === -5n   (JS)     but   -5 mod 17 = 12   (math)
 */
export function mod(a, p) {
  const r = a % p;
  return r >= 0n ? r : r + p;
}

/**
 * Modular inverse a^(-1) mod p, via the Extended Euclidean Algorithm.
 * Finds s such that a·s ≡ 1 (mod p). It exists iff gcd(a, p) = 1,
 * which for a prime p means: a is not ≡ 0.
 *
 * Invariant kept at every iteration:  oldS · a ≡ oldR (mod p)
 * When the remainder reaches 0, oldR = gcd(a, p) = 1, so oldS · a ≡ 1.
 */
export function modInverse(a, p) {
  a = mod(a, p);
  if (a === 0n) {
    // Division by zero in F_p. In point addition this means a vertical
    // line, i.e. the result is the point at infinity (handled below).
    throw new Error("0 has no modular inverse");
  }
  let [oldR, r] = [a, p];   // remainders
  let [oldS, s] = [1n, 0n]; // Bézout coefficients of a
  while (r !== 0n) {
    const q = oldR / r;     // BigInt division truncates (integer quotient)
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  if (oldR !== 1n) throw new Error(`${a} is not invertible mod ${p}`);
  return mod(oldS, p);
}

// -----------------------------------------------------------------------------
// 2. Curves and points
// -----------------------------------------------------------------------------
// Short Weierstrass form  y² = x³ + a·x + b  (mod p).
// secp256k1 and all our toy curves have a = 0, b = 7.
// A point is {x, y}; the point at infinity O (neutral element) is `null`.

export const INF = null;

/** Toy curve required by the assignment: y² = x³ + 7 (mod 17), G = (1, 5). */
export const TOY17 = {
  name: "Toy curve (assignment)",
  p: 17n, a: 0n, b: 7n,
  G: { x: 1n, y: 5n },
};

/**
 * Larger toy curve (OUR CHOICE, not in the assignment): y² = x³ + 7 (mod 2089).
 * The group has n = 2143 points, a PRIME number, so every point except O
 * generates the whole group (cofactor h = 1, like secp256k1).
 * This gives enough samples for statistics to mean something.
 * (Note: p = 547 also has prime order, but #E = p there: an "anomalous" curve,
 *  broken by Smart's attack — a nice example of why parameters matter.)
 */
export const TOY2089 = {
  name: "Larger toy curve (our choice)",
  p: 2089n, a: 0n, b: 7n,
  G: null, // filled in at load time: first point found with smallest x
};

/** Real secp256k1 parameters (SEC 2, v2.0), as used by Bitcoin and Ethereum. */
export const SECP256K1 = {
  name: "secp256k1",
  p: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn,
  a: 0n, b: 7n,
  G: {
    x: 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n,
    y: 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n,
  },
  n: 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n,
};

/** Checks y² ≡ x³ + a·x + b (mod p). O is considered on the curve. */
export function isOnCurve(P, c) {
  if (P === INF) return true;
  return mod(P.y * P.y - (P.x * P.x * P.x + c.a * P.x + c.b), c.p) === 0n;
}

export function eq(P, Q) {
  if (P === INF || Q === INF) return P === Q;
  return P.x === Q.x && P.y === Q.y;
}

export function neg(P, c) {
  return P === INF ? INF : { x: P.x, y: mod(-P.y, c.p) };
}

/**
 * Point addition P + Q, with an optional `log` object that records the
 * intermediate values (used by the step-by-step visualisation).
 *
 * Cases (chord-and-tangent rule):
 *   1. P = O          → Q          (O is the neutral element)
 *   2. Q = O          → P
 *   3. Q = −P         → O          (vertical line: x₂ − x₁ ≡ 0, no inverse)
 *   4. P = Q          → doubling:  λ = (3x₁² + a) / (2y₁)   (tangent slope)
 *   5. P ≠ Q          → addition:  λ = (y₂ − y₁) / (x₂ − x₁) (chord slope)
 *   then  x₃ = λ² − x₁ − x₂ ,  y₃ = λ(x₁ − x₃) − y₁
 */
export function add(P, Q, c, log = null) {
  const p = c.p;
  if (P === INF) { if (log) log.case = "P = O, so P + Q = Q"; return Q; }
  if (Q === INF) { if (log) log.case = "Q = O, so P + Q = P"; return P; }
  if (P.x === Q.x && mod(P.y + Q.y, p) === 0n) {
    if (log) log.case = "Q = −P (vertical line), so P + Q = O";
    return INF;
  }
  let lambda;
  if (eq(P, Q)) {
    const num = mod(3n * P.x * P.x + c.a, p);
    const den = mod(2n * P.y, p);
    lambda = mod(num * modInverse(den, p), p);
    if (log) Object.assign(log, { case: "doubling (tangent)", num, den, lambda });
  } else {
    const num = mod(Q.y - P.y, p);
    const den = mod(Q.x - P.x, p);
    lambda = mod(num * modInverse(den, p), p);
    if (log) Object.assign(log, { case: "addition (chord)", num, den, lambda });
  }
  const x3 = mod(lambda * lambda - P.x - Q.x, p);
  const y3 = mod(lambda * (P.x - x3) - P.y, p);
  return { x: x3, y: y3 };
}

// -----------------------------------------------------------------------------
// 3. Scalar multiplication  Q = k·G
// -----------------------------------------------------------------------------

/**
 * Method required by the assignment: G, 2G, 3G, ..., kG by repeated addition.
 * Cost: k − 1 additions → O(k). Fine for k = 6, useless for k ≈ 2^256.
 * Returns the whole list of multiples.
 */
export function multiplesNaive(k, G, c) {
  const out = [];
  let R = INF;
  for (let i = 1n; i <= k; i++) {
    const log = {};
    R = add(R, G, c, log);
    out.push({ i, point: R, log });
  }
  return out;
}

/**
 * Faster method ("use a faster method for a larger k"): double-and-add,
 * scanning the bits of k from the most significant one (left-to-right).
 *   R ← O ; for each bit b of k:  R ← 2R ;  if b = 1: R ← R + G
 * Cost: ≤ log2(k) doublings + ≤ log2(k) additions → O(log k).
 * Example k = 6 = 110₂ : O →(2R,+G) G →(2R,+G) 3G →(2R) 6G
 * Returns the result and a trace of every step.
 */
export function doubleAndAdd(k, G, c) {
  const bits = k.toString(2);
  const trace = [];
  let R = INF;
  let acc = 0n; // the scalar currently represented by R (for display)
  for (let i = 0; i < bits.length; i++) {
    const logD = {};
    const before = R;
    R = add(R, R, c, logD);
    acc *= 2n;
    trace.push({ bit: bits[i], bitIndex: i, op: "double", from: before, other: before, to: R, acc, log: logD });
    if (bits[i] === "1") {
      const logA = {};
      const prev = R;
      R = add(R, G, c, logA);
      acc += 1n;
      trace.push({ bit: bits[i], bitIndex: i, op: "add", from: prev, other: G, to: R, acc, log: logA });
    }
  }
  return { result: R, trace, bits };
}

/** Plain scalar multiplication without trace (fast path for statistics). */
export function scalarMult(k, G, c) {
  let R = INF;
  let A = G;
  while (k > 0n) {          // right-to-left variant: no string conversion
    if (k & 1n) R = add(R, A, c);
    A = add(A, A, c);
    k >>= 1n;
  }
  return R;
}

// -----------------------------------------------------------------------------
// 4. Utilities for small curves (brute force: only OK when p is tiny)
// -----------------------------------------------------------------------------

/** Lists every affine point of a small curve (O excluded). */
export function allPoints(c) {
  const pts = [];
  for (let x = 0n; x < c.p; x++) {
    const rhs = mod(x * x * x + c.a * x + c.b, c.p);
    for (let y = 0n; y < c.p; y++) {
      if (mod(y * y, c.p) === rhs) pts.push({ x, y });
    }
  }
  return pts;
}

/** Order of a point: smallest n ≥ 1 with n·P = O (brute force). */
export function pointOrder(P, c) {
  let R = P;
  let n = 1n;
  while (R !== INF) { R = add(R, P, c); n++; }
  return n;
}

export function fmt(P) {
  return P === INF ? "O" : `(${P.x}, ${P.y})`;
}
