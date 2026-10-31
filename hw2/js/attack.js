// =============================================================================
// attack.js — Recovering the restricted private key d from the public key Q
//
// The attacker (Eve) knows the curve, G, Bob's public key Q and the fact that
// d < K = 2^b. She does NOT need any ciphertext to find d: every candidate can
// be checked exactly, because the map d ↦ d·G is public and deterministic.
//
//   1. Exhaustive search (brute force): R ← G, 2G, 3G, … until R = Q.
//      One point addition per candidate → O(K) time, O(1) memory.
//
//   2. Baby-step giant-step (Shanks, 1971): write d = i·m + j, m = ⌈√K⌉.
//      Baby steps:  store j·G for j = 0…m−1 in a hash table.
//      Giant steps: for i = 0, 1, …, test whether Q − i·(m·G) is in the table.
//      If Q − i·mG = j·G then d = i·m + j.
//      O(√K) time AND O(√K) memory: a time–memory trade-off.
//
// Once d is known, Eve decrypts exactly like Bob.
// =============================================================================

import { CURVE } from "./toyecc.js";
import { add, neg, scalarMult, eq, INF } from "../../hw1/js/ec.js";

const G = CURVE.G;
const key = (Pt) => (Pt === INF ? "O" : Pt.x.toString(36) + (Pt.y & 1n ? "+" : "-"));
const pause = () => new Promise((r) => setTimeout(r, 0));

/**
 * Brute force on [1, K). Returns {d, steps, ms} (d = null if not found).
 * `shouldStop` lets the UI cancel a long run.
 */
export async function bruteForce(Q, K, onProgress, shouldStop) {
  const t0 = performance.now();
  let R = INF;
  for (let k = 1n; k < K; k++) {
    R = add(R, G, CURVE);                       // R = k·G
    if (eq(R, Q)) return { d: k, steps: k, ms: performance.now() - t0 };
    if ((k & 2047n) === 0n) {
      onProgress?.(Number(k) / Number(K), k);
      await pause();
      if (shouldStop?.()) return { d: null, steps: k, ms: performance.now() - t0, stopped: true };
    }
  }
  return { d: null, steps: K - 1n, ms: performance.now() - t0 };
}

/** Baby-step giant-step on [0, K). Returns {d, baby, giant, ms, m}. */
export async function bsgs(Q, K, onProgress) {
  const t0 = performance.now();
  const m = BigInt(Math.ceil(Math.sqrt(Number(K))));
  // Baby steps: table[j·G] = j
  const table = new Map();
  let B = INF;
  for (let j = 0n; j < m; j++) {
    table.set(key(B), j);
    B = add(B, G, CURVE);
    if ((j & 1023n) === 0n) { onProgress?.(0.5 * Number(j) / Number(m)); await pause(); }
  }
  // Giant steps: Γ = Q − i·(mG)
  const minusMG = neg(scalarMult(m, G, CURVE), CURVE);
  let Gamma = Q;
  for (let i = 0n; i <= m; i++) {
    const j = table.get(key(Gamma));
    if (j !== undefined) {
      const d = i * m + j;
      return { d, baby: m, giant: i + 1n, ms: performance.now() - t0, m, tableSize: table.size };
    }
    Gamma = add(Gamma, minusMG, CURVE);
    if ((i & 1023n) === 0n) { onProgress?.(0.5 + 0.5 * Number(i) / Number(m)); await pause(); }
  }
  return { d: null, baby: m, giant: m + 1n, ms: performance.now() - t0, m, tableSize: table.size };
}

/** Measures point additions per second on this device (the unit of cost). */
export function addsPerSecond(samples = 3000) {
  let R = G;
  const t0 = performance.now();
  for (let i = 0; i < samples; i++) R = add(R, G, CURVE);
  return samples / ((performance.now() - t0) / 1000);
}
