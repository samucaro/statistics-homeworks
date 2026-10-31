// =============================================================================
// stats.js — Small descriptive / inferential statistics toolkit
// Written from scratch (no libraries) so every formula is visible.
// =============================================================================

export const mean = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;

/** Sample standard deviation (n − 1 in the denominator). */
export function std(xs) {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1));
}

/** Counts how many times each value occurs → Map(value → count). */
export function frequencies(xs) {
  const f = new Map();
  for (const v of xs) f.set(v, (f.get(v) || 0) + 1);
  return f;
}

/** Puts numeric values in [0, max) into `bins` equal-width bins. */
export function histogram(xs, max, bins) {
  const counts = new Array(bins).fill(0);
  for (const v of xs) counts[Math.min(bins - 1, Math.floor((v / max) * bins))]++;
  return counts;
}

// -----------------------------------------------------------------------------
// Pearson's chi-square goodness-of-fit test for uniformity
//   H0: every category has the same probability 1/K.
//   χ² = Σ (Oᵢ − Eᵢ)² / Eᵢ ,  Eᵢ = N/K ,  df = K − 1
//   p-value = P(χ²_df ≥ observed) = Q(df/2, χ²/2)  (regularised upper gamma)
// Rule of thumb: the χ² approximation needs Eᵢ ≥ 5.
// -----------------------------------------------------------------------------
export function chiSquareUniform(counts) {
  const N = counts.reduce((s, v) => s + v, 0);
  const K = counts.length;
  const E = N / K;
  const stat = counts.reduce((s, o) => s + (o - E) ** 2 / E, 0);
  const df = K - 1;
  return { stat, df, expected: E, pValue: gammaQ(df / 2, stat / 2), valid: E >= 5 };
}

// ln Γ(z) — Lanczos approximation (g = 7, n = 9), accurate to ~1e-15.
function lnGamma(z) {
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Regularised upper incomplete gamma Q(a, x) = 1 − P(a, x). */
export function gammaQ(a, x) {
  if (x <= 0) return 1;
  if (x < a + 1) {
    // series expansion for P(a, x)
    let sum = 1 / a, term = sum, ap = a;
    for (let n = 0; n < 500; n++) {
      ap += 1; term *= x / ap; sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }
  // continued fraction for Q(a, x) (modified Lentz)
  let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

// -----------------------------------------------------------------------------
// Correlation
//   Pearson  r = Σ(xᵢ−x̄)(yᵢ−ȳ) / sqrt(Σ(xᵢ−x̄)² Σ(yᵢ−ȳ)²)   → LINEAR relation
//   Spearman ρ = Pearson computed on the ranks                → MONOTONIC relation
//   Under H0 (no correlation) and n large: r·sqrt(n) ≈ N(0,1), so |r| > 2/sqrt(n)
//   is "suspicious" at about the 5% level.
// -----------------------------------------------------------------------------
export function pearson(xs, ys) {
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxy / Math.sqrt(sxx * syy);
}

/** Ranks with ties replaced by their average rank. */
function ranks(xs) {
  const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let t = i; t <= j; t++) r[idx[t][1]] = avg;
    i = j + 1;
  }
  return r;
}

export const spearman = (xs, ys) => pearson(ranks(xs), ranks(ys));

// -----------------------------------------------------------------------------
// Bits
// -----------------------------------------------------------------------------

/** Number of 1-bits of a non-negative BigInt (popcount). */
export function popcount(v) {
  let c = 0;
  while (v > 0n) { c += Number(v & 1n); v >>= 1n; }
  return c;
}

/** Hamming distance = number of differing bits = popcount(a XOR b). */
export const hamming = (a, b) => popcount(a ^ b);

/**
 * For each bit position j (0 = least significant), the fraction of values
 * whose bit j is 1. Ideal "random-looking" output: every fraction ≈ 0.5,
 * with standard error sqrt(0.25/N).
 */
export function bitFrequencies(values, nBits) {
  const ones = new Array(nBits).fill(0);
  for (const v of values) for (let j = 0; j < nBits; j++) if ((v >> BigInt(j)) & 1n) ones[j]++;
  return ones.map((o) => o / values.length);
}

/** Shannon entropy H = −Σ pᵢ log2 pᵢ (bits), from a list of counts. */
export function entropy(counts) {
  const N = counts.reduce((s, v) => s + v, 0);
  return counts.reduce((h, c) => (c ? h - (c / N) * Math.log2(c / N) : h), 0);
}
