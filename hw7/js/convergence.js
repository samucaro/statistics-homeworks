// =============================================================================
// convergence.js — Simulating the four modes of convergence
// HMWK 7 — Statistics (Sapienza, MSc Cybersecurity, A.A. 2026/27)
//
// For a sequence Xₙ → X we estimate, over m independent paths ω:
//   in probability      P(|Xₙ − X| > ε)                    → 0 ?
//   in mean square (L²) E[(Xₙ − X)²]                        → 0 ?
//   almost surely       P(sup_{k ≥ n} |Xₖ − X| > ε)          → 0 ?
//       (a.s. convergence is EQUIVALENT to this condition for every ε > 0;
//        the sup is taken up to a finite horizon N, an approximation)
//   in distribution     sup_x |F_{Xₙ}(x) − F_X(x)| (KS)     → 0 ?
// =============================================================================

import { makeRng } from "../../hw3/js/rng.js";

export const N_MAX = 10000;
export const CHECKS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];

const normal = (rng) => { let u = 0; while (u === 0) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); };

/**
 * Each example: init(rng) → state of one path (ω), next(state, n, rng) → Xₙ,
 * limit(state) → X(ω). `theory` gives exact values where known.
 */
export const EXAMPLES = {
  mean: {
    name: "Sample mean of Uniform(0, 1) scores: Xₙ = (U₁ + … + Uₙ)/n → ½",
    modes: { as: true, p: true, l2: true, d: true },
    init: () => ({ s: 0 }),
    next: (st, n, rng) => { st.s += rng(); return st.s / n; },
    limit: () => 0.5,
    constLimit: true,
    theory: { l2: (n) => 1 / (12 * n) },
    yRange: [0, 1],
  },
  bern: {
    name: "Independent Xₙ ~ Bernoulli(1/n) → 0",
    modes: { as: false, p: true, l2: true, d: true },
    init: () => ({}),
    next: (st, n, rng) => (rng() < 1 / n ? 1 : 0),
    limit: () => 0,
    constLimit: true,
    theory: { p: (n) => 1 / n, l2: (n) => 1 / n, as: (n) => (n === 1 ? 1 : 1 - (n - 1) / N_MAX) },
    yRange: [-0.1, 1.1],
  },
  spike: {
    name: "Xₙ = n · 1{U ≤ 1/n}, one U per path → 0",
    modes: { as: true, p: true, l2: false, d: true },
    init: (rng) => ({ u: 1 - rng() }),
    next: (st, n) => (st.u <= 1 / n ? n : 0),
    limit: () => 0,
    constLimit: true,
    theory: { p: (n) => 1 / n, l2: (n) => n, as: (n) => 1 / n },
    yRange: [-1, 30],
  },
  flip: {
    name: "Xₙ = −Z with Z ~ N(0, 1); candidate limit X = Z",
    modes: { as: false, p: false, l2: false, d: true },
    init: (rng) => ({ z: normal(rng) }),
    next: (st) => -st.z,
    limit: (st) => st.z,
    theory: { l2: () => 4 },
    yRange: [-3.5, 3.5],
  },
};

/** Runs m paths up to N_MAX and returns metrics at the CHECKS plus a few paths. */
export async function runConvergence(key, m, eps, seed, nPaths = 30, onProgress) {
  const E = EXAMPLES[key], rng = makeRng(seed);
  const exceed = CHECKS.map(() => 0), sq = CHECKS.map(() => 0);
  const values = CHECKS.map(() => new Float64Array(m)), limits = new Float64Array(m);
  const lastExceed = new Float64Array(m);               // last k ≤ N with |Xₖ − X| > ε
  const paths = [];
  for (let j = 0; j < m; j++) {
    const st = E.init(rng), X = E.limit(st);
    limits[j] = X;
    const keep = j < nPaths ? new Float64Array(N_MAX + 1) : null;
    let c = 0, last = 0;
    for (let n = 1; n <= N_MAX; n++) {
      const x = E.next(st, n, rng);
      const d = x - X;
      if (Math.abs(d) > eps) last = n;
      if (keep) keep[n] = x;
      if (n === CHECKS[c]) { values[c][j] = x; if (Math.abs(d) > eps) exceed[c]++; sq[c] += d * d; c++; }
    }
    lastExceed[j] = last;
    if (keep) { keep[0] = keep[1]; paths.push(keep); }
    if (j % 50 === 49) { onProgress?.((j + 1) / m); await new Promise((r) => setTimeout(r, 0)); }
  }
  const sorted = Float64Array.from(limits).sort();
  const metrics = CHECKS.map((n, c) => ({
    n,
    p: exceed[c] / m,
    l2: sq[c] / m,
    as: lastExceed.reduce((s, t) => s + (t >= n ? 1 : 0), 0) / m,
    // Convergence in distribution only requires F_{Xₙ}(x) → F_X(x) at CONTINUITY points of F_X.
    // A constant limit c has a jump at c, so we measure the distance away from it (|x − c| ≥ ε):
    // max(P(Xₙ ≤ c − ε), P(Xₙ ≥ c + ε)). For a continuous limit we use the KS distance.
    ks: E.constLimit ? distAwayFromAtom(values[c], E.limit({}), eps) : ks2(values[c], sorted),
  }));
  return { metrics, paths, m };
}

function distAwayFromAtom(v, c, eps) {
  let lo = 0, hi = 0;
  for (const x of v) { if (x <= c - eps) lo++; if (x >= c + eps) hi++; }
  return Math.max(lo, hi) / v.length;
}

/** Two-sample Kolmogorov–Smirnov distance between the law of Xₙ and that of X (samples). */
function ks2(a, sortedB) {
  const A = Float64Array.from(a).sort(), B = sortedB;
  let i = 0, j = 0, d = 0;
  while (i < A.length && j < B.length) {
    const v = Math.min(A[i], B[j]);
    while (i < A.length && A[i] === v) i++;
    while (j < B.length && B[j] === v) j++;
    d = Math.max(d, Math.abs(i / A.length - j / B.length));
  }
  return d;
}

// -----------------------------------------------------------------------------
// The √n demonstration: spread of the sample mean under different dependence
// -----------------------------------------------------------------------------
export const SQRT_CHECKS = [1, 3, 10, 30, 100, 300, 1000, 3000, 10000];

/**
 * Scale of X̄ₙ across m paths, measured by IQR/1.349 (equals the SD for normal
 * data, and stays finite for Cauchy data whose variance does not exist).
 *   iid N(0,1)                    : σ/√n
 *   equicorrelated, Corr = ρ      : Xᵢ = √ρ·Z₀ + √(1−ρ)·Zᵢ → σ·√((1 + (n−1)ρ)/n) → σ√ρ
 *   iid standard Cauchy           : X̄ₙ is again standard Cauchy: scale constant (IQR/1.349 ≈ 1.483)
 */
export async function runSqrtN(m, seed, onProgress) {
  const rng = makeRng(seed);
  const specs = [{ id: "iid", rho: 0 }, { id: "r001", rho: 0.01 }, { id: "r01", rho: 0.1 }, { id: "cauchy" }];
  const out = {};
  for (const [si, s] of specs.entries()) {
    const vals = SQRT_CHECKS.map(() => new Float64Array(m));
    for (let j = 0; j < m; j++) {
      const z0 = normal(rng);
      let sum = 0, c = 0;
      for (let n = 1; n <= SQRT_CHECKS[SQRT_CHECKS.length - 1]; n++) {
        const x = s.id === "cauchy" ? Math.tan(Math.PI * (rng() - 0.5)) : Math.sqrt(s.rho) * z0 + Math.sqrt(1 - s.rho) * normal(rng);
        sum += x;
        if (n === SQRT_CHECKS[c]) { vals[c][j] = sum / n; c++; }
      }
      if (j % 100 === 99) { onProgress?.((si + (j + 1) / m) / specs.length); await new Promise((r) => setTimeout(r, 0)); }
    }
    out[s.id] = vals.map((v) => iqrScale(v));
  }
  return out;
}

function iqrScale(v) {
  const a = Float64Array.from(v).sort(), q = (p) => { const h = (a.length - 1) * p, i = Math.floor(h); return a[i] + (h - i) * (a[Math.min(i + 1, a.length - 1)] - a[i]); };
  return (q(0.75) - q(0.25)) / 1.349;
}
