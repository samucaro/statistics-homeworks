// =============================================================================
// integrate.js — Riemann-type and Lebesgue-type numerical integration
//
// RIEMANN: partition the DOMAIN [a, b] into N subintervals, then
//   Σ f(tagₖ)·Δx           (left or midpoint tags)
//   L(N) = Σ inf f·Δx ≤ ∫ ≤ U(N) = Σ sup f·Δx      (Darboux sums)
//
// LEBESGUE: partition the RANGE [0, ymax] into M levels 0 = t₀ < … < t_M,
// measure the preimages, and sum. For f ≥ 0, summation by parts turns the
// lower/upper simple-function sums into the "layer-cake" formula
//   ∫ f dμ = ∫₀^∞ μ({f > t}) dt
//   lower   Σ t_j·μ(t_j ≤ f < t_{j+1})   = Σ_{j=1..M}   Δt · μ(f ≥ t_j)
//   upper   Σ t_{j+1}·μ(t_j < f ≤ t_{j+1}) = Σ_{j=0..M−1} Δt · μ(f > t_j)
//   midpoint                               = Σ_{j=0..M−1} Δt · μ(f > t_j + Δt/2)
// How μ is obtained is what distinguishes the variants:
//   "levels"  exact level sets (monotone pieces + bisection)
//   "grid"    counting K domain samples per level (what a computer can do in general)
//   "MC"      K random points: μ estimated statistically (Monte Carlo)
// Every method reports `evals` = number of evaluations of f, the cost unit.
// =============================================================================

import { levelMeasure, supInf } from "./functions.js";
import { thomaeAt, thomaeUpper } from "./rational.js";

// ---- Riemann ----------------------------------------------------------------
export function riemann(F, N, tag = "mid") {
  const h = (F.b - F.a) / N;
  let s = 0;
  for (let k = 0; k < N; k++) s += F.f(F.a + (k + (tag === "mid" ? 0.5 : 0)) * h);
  return { value: s * h, evals: N };
}

export function darboux(F, N) {
  const h = (F.b - F.a) / N;
  let L = 0, U = 0, evals = 0;
  for (let k = 0; k < N; k++) {
    const r = supInf(F, F.a + k * h, F.a + (k + 1) * h);
    L += r.inf * h; U += r.sup * h; evals += r.evals;
  }
  return { lower: L, upper: U, evals };
}

// ---- Lebesgue, exact level sets ------------------------------------------------
/** Range truncation for unbounded f: T = √M balances the level step T/M and the lost tail. */
export const rangeTop = (F, M) => (isFinite(F.ymax) ? F.ymax : Math.sqrt(M));

export function lebesgueLevels(F, M, rule = "mid") {
  const T = rangeTop(F, M), dt = T / M;
  let s = 0, evals = 0;
  for (let j = 0; j < M; j++) {
    const t = rule === "lower" ? (j + 1) * dt : rule === "upper" ? j * dt : (j + 0.5) * dt;
    const r = levelMeasure(F, t, rule !== "lower");      // lower uses μ(f ≥ t)
    s += r.measure * dt; evals += r.evals;
  }
  return { value: s, evals, T };
}

// ---- Lebesgue, level sets measured by counting grid samples ------------------
export function lebesgueGrid(F, K) {
  const h = (F.b - F.a) / K, vals = new Float64Array(K);
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < K; k++) { const v = F.f(F.a + (k + 0.5) * h); vals[k] = v; if (v < lo) lo = v; if (v > hi) hi = v; }
  const M = Math.max(1, Math.ceil(Math.sqrt(K))), dt = (hi - lo) / M || 1;
  const count = new Float64Array(M);
  for (const v of vals) count[Math.min(M - 1, Math.floor((v - lo) / dt))]++;
  let s = 0;
  for (let j = 0; j < M; j++) s += (lo + (j + 0.5) * dt) * count[j] * h;   // level value × measure of its preimage
  return { value: s, evals: K, levels: M };
}

// ---- Monte Carlo: measure estimated with random points --------------------------
export function monteCarlo(F, K, rng) {
  let s = 0;
  for (let k = 0; k < K; k++) s += F.f(F.a + (F.b - F.a) * (1 - rng()));   // 1 − u ∈ (0, 1]
  return { value: ((F.b - F.a) * s) / K, evals: K };
}

// ---- Pathological functions: exact reasoning ----------------------------------
// Tags of a uniform partition (k/N or (2k+1)/(2N)) are RATIONAL. Shifting them
// by θ·h with θ = 1/√2 gives IRRATIONAL tags. Both are valid Riemann tags.
const THETA = Math.SQRT1_2;
export function pathological(F, N) {
  const h = 1 / N;
  if (F.id === "dirichlet") {
    return {
      riemannRational: 1,               // every rational tag gives f = 1
      riemannIrrational: 0,             // every irrational tag gives f = 0
      lower: 0, upper: 1,               // every subinterval contains both kinds
      lebesgue: 0,                      // μ(ℚ ∩ [0,1]) = 0  ⇒ ∫ = 1·0 + 0·1 = 0
      mcExact: 0,                       // a uniform random real is irrational w.p. 1
      mcFloat: 1,                       // every double is a (dyadic) rational!
    };
  }
  let mid = 0;
  for (let k = 0; k < N; k++) mid += thomaeAt(2 * k + 1, 2 * N);          // exact rational midpoints
  return {
    riemannRational: mid * h, riemannIrrational: 0 * THETA,
    lower: 0, upper: thomaeUpper(N),
    lebesgue: 0,                       // {f ≥ 1/q} is FINITE for every q ⇒ μ = 0 at every level t > 0
    mcExact: 0, mcFloat: null,
  };
}
