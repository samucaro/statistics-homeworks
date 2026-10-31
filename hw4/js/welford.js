// =============================================================================
// welford.js — Knuth's recurrence for the mean and Welford's recurrences for
// the sum of squares (SS) and the variance. One pass, O(1) memory, stable.
// HMWK 4 — Statistics (Sapienza, MSc Cybersecurity, A.A. 2026/27)
//
//   Mₖ  = Mₖ₋₁ + (xₖ − Mₖ₋₁)/k                     (Knuth: mean)
//   SSₖ = SSₖ₋₁ + (xₖ − Mₖ₋₁)(xₖ − Mₖ)              (Welford: sum of squares)
//   s²ₖ = SSₖ/(k − 1)   sample (unbiased) variance, k ≥ 2
//   σ̂²ₖ = SSₖ/k         population (biased, "plug-in") variance
// =============================================================================

export class Welford {
  constructor() { this.k = 0; this.mean = 0; this.ss = 0; }

  /** Adds one observation. The whole algorithm is the 3 lines marked ★. */
  push(x) {
    this.k++;
    const d = x - this.mean;        // ★ deviation from the OLD mean
    this.mean += d / this.k;        // ★ Knuth: new mean
    this.ss += d * (x - this.mean); // ★ Welford: old deviation × new deviation
  }

  get variance() { return this.k > 1 ? this.ss / (this.k - 1) : NaN; }   // s²
  get popVariance() { return this.k > 0 ? this.ss / this.k : NaN; }      // σ̂²
  get sd() { return Math.sqrt(this.variance); }

  /**
   * Extension (not required): merge two accumulators, e.g. computed on two
   * log shards in parallel (Chan, Golub & LeVeque, 1979).
   *   δ = M_B − M_A,  n = n_A + n_B,  M = M_A + δ·n_B/n,  SS = SS_A + SS_B + δ²·n_A·n_B/n
   */
  static merge(a, b) {
    const r = new Welford(), n = a.k + b.k;
    if (!n) return r;
    const delta = b.mean - a.mean;
    r.k = n; r.mean = a.mean + (delta * b.k) / n; r.ss = a.ss + b.ss + (delta * delta * a.k * b.k) / n;
    return r;
  }
}

/** Returns every intermediate step, for the worked example on the page. */
export function welfordTrace(xs) {
  const w = new Welford(), rows = [];
  for (const x of xs) {
    const oldMean = w.mean, oldSS = w.ss;
    w.push(x);
    rows.push({ k: w.k, x, d: x - oldMean, oldMean, mean: w.mean, dNew: x - w.mean, oldSS, ss: w.ss, s2: w.variance, pop: w.popVariance });
  }
  return rows;
}

// ---- reference algorithms, for comparison -------------------------------------

/** Textbook one-pass formula: SS = Σx² − (Σx)²/n. Prone to catastrophic cancellation. */
export function naiveVariance(xs) {
  let s = 0, s2 = 0;
  for (const x of xs) { s += x; s2 += x * x; }
  const n = xs.length;
  return (s2 - (s * s) / n) / (n - 1);
}

/** Two-pass algorithm: first the mean, then Σ(x − mean)². Accurate, but needs all data stored. */
export function twoPassVariance(xs) {
  let s = 0;
  for (const x of xs) s += x;
  const m = s / xs.length;
  let ss = 0, c = 0;
  for (const x of xs) { ss += (x - m) ** 2; c += x - m; }      // c: compensation for rounding in m
  return (ss - (c * c) / xs.length) / (xs.length - 1);
}

export function welfordVariance(xs) {
  const w = new Welford();
  for (const x of xs) w.push(x);
  return w.variance;
}
