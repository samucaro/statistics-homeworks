// =============================================================================
// sim.js — Monte Carlo simulation of the penetration process
//
// Model: m attackers act independently on n systems. Attacker j visits the
// systems one after the other; at step i its score changes by Xᵢ⁽ʲ⁾:
//   Bernoulli:  Xᵢ = 1 if system i is penetrated (probability p), else 0
//   Rademacher: Xᵢ = +1 (attacker gains ground) or −1 (defender wins), ½ each
// Each attacker is one trajectory S₁, S₂, …, Sₙ (a random walk).
//
// For efficiency every attacker walks once up to n_max and we record Sₙ at
// each checkpoint n. Values at different n of the SAME attacker are dependent,
// but for each fixed n the m values are i.i.d. — which is all we need.
// =============================================================================

import { makeRng } from "./rng.js";

export const CHECKPOINTS = [10, 30, 100, 300, 1000, 3000, 10000];
export const N_MAX = CHECKPOINTS[CHECKPOINTS.length - 1];

export async function simulate({ model, p, m, seed, nTraj = 40, onProgress }) {
  const rng = makeRng(seed);
  const S = Object.fromEntries(CHECKPOINTS.map((n) => [n, new Float64Array(m)]));
  const paths = [];
  const rad = model === "rademacher";
  for (let j = 0; j < m; j++) {
    const keep = j < nTraj ? new Int32Array(N_MAX + 1) : null;
    let s = 0, c = 0;
    for (let k = 1; k <= N_MAX; k++) {
      const u = rng();
      s += rad ? (u < 0.5 ? 1 : -1) : (u < p ? 1 : 0);
      if (keep) keep[k] = s;
      if (k === CHECKPOINTS[c]) { S[k][j] = s; c++; }
    }
    if (keep) paths.push(keep);
    if (j % 100 === 99) { onProgress?.((j + 1) / m); await new Promise((r) => setTimeout(r, 0)); }
  }
  onProgress?.(1);
  return { S, paths, m };
}

/**
 * Union coverage: fraction of nSys systems penetrated by AT LEAST ONE of the
 * first m' attackers, for every m' ≤ mMax. For each system the index of the
 * first successful attacker is geometric: G = ⌈ln U / ln(1−p)⌉.
 */
export function coverage(p, nSys, mMax, seed) {
  const rng = makeRng(seed ^ 0x5bd1e995);
  const first = new Float64Array(nSys);
  for (let i = 0; i < nSys; i++) first[i] = Math.ceil(Math.log(1 - rng()) / Math.log(1 - p));
  const out = new Float64Array(mMax + 1);
  for (const g of first) if (g <= mMax) out[Math.max(1, g)]++;
  for (let k = 1; k <= mMax; k++) out[k] += out[k - 1];
  return Array.from(out, (c) => c / nSys);
}
