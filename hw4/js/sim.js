// =============================================================================
// sim.js — m hackers × n systems, one score per (hacker, system).
// Each hacker's scores are fed to Welford's recurrences ONE AT A TIME, so a
// single pass along the trajectory gives the sampling mean and variance at
// every n we want to study (2, 3, 5, …, 1000).
// For a fixed n the m pairs (x̄, s²) are i.i.d. across hackers.
// =============================================================================

import { makeRng } from "../../hw3/js/rng.js";

export const NS = [2, 3, 5, 10, 20, 50, 100, 200, 500, 1000];
export const N_MAX = NS[NS.length - 1];

export async function simulate({ dist, m, seed, nTraj = 30, onProgress }) {
  const rng = makeRng(seed);
  const mean = Object.fromEntries(NS.map((n) => [n, new Float64Array(m)]));
  const vars = Object.fromEntries(NS.map((n) => [n, new Float64Array(m)]));
  const pathMean = [], pathVar = [];
  for (let j = 0; j < m; j++) {
    const keep = j < nTraj;
    const pm = keep ? new Float64Array(N_MAX + 1) : null, pv = keep ? new Float64Array(N_MAX + 1) : null;
    let M = 0, SS = 0, c = 0;
    for (let k = 1; k <= N_MAX; k++) {
      const x = dist.sample(rng);
      // ---- Welford's recurrences (the 3 core lines) ----
      const d = x - M;
      M += d / k;
      SS += d * (x - M);
      // ----------------------------------------------------
      if (keep) { pm[k] = M; pv[k] = k > 1 ? SS / (k - 1) : NaN; }
      if (k === NS[c]) { mean[k][j] = M; vars[k][j] = SS / (k - 1); c++; }
    }
    if (keep) { pv[1] = pv[2]; pathMean.push(pm); pathVar.push(pv); }
    if (j % 200 === 199) { onProgress?.((j + 1) / m); await new Promise((r) => setTimeout(r, 0)); }
  }
  onProgress?.(1);
  return { mean, vars, pathMean, pathVar, m };
}
