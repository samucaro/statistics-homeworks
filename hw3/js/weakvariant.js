// =============================================================================
// weakvariant.js — A DESIGN flaw, independent of the key size (optional part)
//
// Naive variant of the toy scheme: Alice encrypts the message CHARACTER BY
// CHARACTER and reuses ONE ephemeral key r for the whole message:
//     R = r·G (sent once),  S = r·Q,  Cᵢ = Mᵢ + S   for every character i.
// Even with a full-size private key, the same character always gives the same
// ciphertext point: the scheme degenerates into a monoalphabetic substitution
// (a "Caesar cipher in the group of curve points", with mask S instead of k).
// Two consequences demonstrated on the page:
//   1. ciphertext-only: symbol frequencies mirror letter frequencies;
//   2. known-plaintext: one known character gives S = C₁ − M₁, hence everything.
// =============================================================================

import { CURVE, encodeBlock, decodeBlock, pointToHex, randomInRange } from "./toyecc.js";
import { add, neg, scalarMult } from "../../hw1/js/ec.js";

/** Naive encryption: one ephemeral key, one point per byte (ASCII text). */
export async function encryptPerChar(text, Q, onProgress) {
  const bytes = new TextEncoder().encode(text);
  const r = randomInRange(1n, CURVE.n);
  const R = scalarMult(r, CURVE.G, CURVE);
  const S = scalarMult(r, Q, CURVE);
  const C = [];
  const cache = new Map(); // encoding is deterministic: cache it (speed only)
  for (let i = 0; i < bytes.length; i++) {
    let M = cache.get(bytes[i]);
    if (!M) { M = encodeBlock([bytes[i]]); cache.set(bytes[i], M); }
    C.push(add(M, S, CURVE));
    if (i % 200 === 199) { onProgress?.(i / bytes.length); await new Promise((res) => setTimeout(res, 0)); }
  }
  return { R, C };
}

/**
 * Ciphertext-only frequency attack: rank ciphertext symbols by frequency and
 * map the k-th most frequent symbol to the k-th most frequent character of the
 * training corpus. Returns the guessed text and per-symbol statistics.
 */
export function frequencyAttack(C, corpusText) {
  const corpusCount = new Map();
  for (const ch of corpusText) corpusCount.set(ch, (corpusCount.get(ch) || 0) + 1);
  const corpusRank = [...corpusCount.entries()].sort((a, b) => b[1] - a[1]).map(([ch]) => ch);
  const symCount = new Map();
  const ids = C.map(pointToHex);
  for (const id of ids) symCount.set(id, (symCount.get(id) || 0) + 1);
  const symRank = [...symCount.entries()].sort((a, b) => b[1] - a[1]);
  const mapping = new Map(symRank.map(([id], i) => [id, corpusRank[i] ?? "?"]));
  return { guess: ids.map((id) => mapping.get(id)).join(""), symRank, corpusRank, distinct: symCount.size };
}

/** Known-plaintext attack: knowing the first character recovers S, then all. */
export function knownPlaintextAttack(C, firstChar) {
  const M1 = encodeBlock(new TextEncoder().encode(firstChar));
  const S = add(C[0], neg(M1, CURVE), CURVE);        // S = C₁ − M₁
  const minusS = neg(S, CURVE);
  const out = C.map((Ci) => {
    try { return new TextDecoder().decode(decodeBlock(add(Ci, minusS, CURVE))); } catch { return "?"; }
  });
  return { S, text: out.join("") };
}
