// =============================================================================
// toyecc.js — Toy public-key encryption on secp256k1 (EC-ElGamal)
// HMWK 3 — Statistics (Sapienza, MSc Cybersecurity, A.A. 2026/27)
//
// The curve arithmetic is the one written for HW1 (../../hw1/js/ec.js),
// reused unchanged. The "toy" part, as required by the assignment, is that
// the receiver's PRIVATE KEY d is restricted to a small range [1, 2^b), so
// that attacks are feasible in a browser.
//
// Scheme (textbook EC-ElGamal):
//   Key generation (Bob):   d ∈ [1, 2^b)            private
//                           Q = d·G                 public
//   Encoding:               message bytes → points M on the curve (Koblitz)
//   Encryption (Alice):     r ∈ [1, n−1] fresh      ephemeral secret
//                           R = r·G                 sent
//                           S = r·Q                 shared mask, never sent
//                           C = M + S               sent
//   Decryption (Bob):       S = d·R  (= d·r·G = r·d·G = r·Q)
//                           M = C − S
//
// WARNING: educational code. No authentication, not constant-time,
// deliberately weak keys. Never use it to protect real data.
// =============================================================================

import { SECP256K1 as CURVE, mod, add, neg, scalarMult, INF, isOnCurve } from "../../hw1/js/ec.js";

export { CURVE };
const { p: P, n: N, G } = CURVE;

// -----------------------------------------------------------------------------
// Number theory helpers
// -----------------------------------------------------------------------------

/** Modular exponentiation b^e mod m (square-and-multiply). */
export function modPow(b, e, m) {
  let r = 1n;
  b = mod(b, m);
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return r;
}

/**
 * Square root mod p. secp256k1 has p ≡ 3 (mod 4), so if a is a square,
 * a^((p+1)/4) is one of its two roots (the other is p − root).
 * Returns null when a is not a quadratic residue.
 */
export function sqrtModP(a) {
  const r = modPow(a, (P + 1n) / 4n, P);
  return mod(r * r - a, P) === 0n ? r : null;
}

/**
 * Uniform random integer in [lo, hi) from the OS CSPRNG.
 * Rejection sampling: draw just enough random bits and retry when the value
 * falls outside the range. This avoids the "modulo bias" of (random % size).
 */
export function randomInRange(lo, hi) {
  const size = hi - lo;
  const nBits = size.toString(2).length;
  const nBytes = Math.ceil(nBits / 8);
  const excess = BigInt(nBytes * 8 - nBits);
  for (;;) {
    const buf = crypto.getRandomValues(new Uint8Array(nBytes));
    let v = 0n;
    for (const x of buf) v = (v << 8n) | BigInt(x);
    v >>= excess;                 // keep exactly nBits bits
    if (v < size) return lo + v;
  }
}

// -----------------------------------------------------------------------------
// Point (de)serialisation — compressed SEC1 form: 02/03 || x  (33 bytes)
// -----------------------------------------------------------------------------
export function pointToHex(Pt) {
  if (Pt === INF) return "00";
  return (Pt.y & 1n ? "03" : "02") + Pt.x.toString(16).padStart(64, "0");
}

// -----------------------------------------------------------------------------
// Message encoding: bytes → curve points (Koblitz's method)
// -----------------------------------------------------------------------------
// A block of up to 29 bytes becomes the integer m = 0x01 || bytes
// (the leading 0x01 keeps leading zero bytes and marks the block length).
// We look for x = 256·m + j, j = 0…255, such that x³ + 7 is a square mod p.
// About half of all x work, so the chance that all 256 tries fail is 2^−256.
// Decoding is simply m = x >> 8: the encoding needs no key, it is NOT
// encryption, just a way to represent data as group elements.
export const BLOCK_BYTES = 29;

export function encodeBlock(bytes) {
  let m = 1n;
  for (const b of bytes) m = (m << 8n) | BigInt(b);
  for (let j = 0n; j < 256n; j++) {
    const x = (m << 8n) | j;
    const y = sqrtModP(mod(x * x * x + 7n, P));
    if (y !== null) return { x, y };
  }
  throw new Error("encoding failed (probability 2^-256)");
}

export function decodeBlock(M) {
  let m = M.x >> 8n;
  const out = [];
  while (m > 1n) { out.unshift(Number(m & 0xffn)); m >>= 8n; }
  if (m !== 1n) throw new Error("not a valid encoded block (wrong key?)");
  return Uint8Array.from(out);
}

export function encodeMessage(text) {
  const bytes = new TextEncoder().encode(text);
  const blocks = [];
  for (let i = 0; i < bytes.length; i += BLOCK_BYTES) blocks.push(encodeBlock(bytes.slice(i, i + BLOCK_BYTES)));
  if (!blocks.length) blocks.push(encodeBlock(new Uint8Array()));
  return blocks;
}

// -----------------------------------------------------------------------------
// The scheme
// -----------------------------------------------------------------------------

/** Bob: private key restricted to [1, 2^bits), public key Q = d·G. */
export function keyGen(bits) {
  const d = randomInRange(1n, 1n << BigInt(bits));
  return { d, Q: scalarMult(d, G, CURVE), bits };
}

/**
 * Alice: encrypts one encoded block M for public key Q.
 * Returns the ciphertext (R, C) and, for display only, Alice's secrets r, S.
 */
export function encryptBlock(M, Q) {
  const r = randomInRange(1n, N);          // full range: the ephemeral key is NOT restricted
  const R = scalarMult(r, G, CURVE);
  const S = scalarMult(r, Q, CURVE);
  const C = add(M, S, CURVE);
  return { R, C, secret: { r, S } };
}

/** Bob: recovers M = C − d·R. */
export function decryptBlock(ct, d) {
  if (!isOnCurve(ct.R, CURVE) || !isOnCurve(ct.C, CURVE)) throw new Error("ciphertext point not on the curve");
  const S = scalarMult(d, ct.R, CURVE);
  return { M: add(ct.C, neg(S, CURVE), CURVE), S };
}

export function encrypt(text, Q) {
  const Ms = encodeMessage(text);
  return Ms.map((M) => ({ M, ...encryptBlock(M, Q) }));
}

export function decrypt(blocks, d) {
  const parts = blocks.map((b) => decodeBlock(decryptBlock(b, d).M));
  const all = new Uint8Array(parts.reduce((s, x) => s + x.length, 0));
  let o = 0;
  for (const x of parts) { all.set(x, o); o += x.length; }
  return new TextDecoder().decode(all);
}
