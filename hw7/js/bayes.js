// =============================================================================
// bayes.js — Bayes' theorem in two settings
//   1. Events:      P(attack | alert) from prior (base rate) and likelihoods (TPR, FPR)
//   2. Parameters:  Beta prior × Binomial likelihood → Beta posterior (conjugacy)
// =============================================================================

// ---- 1. Discrete Bayes: the base-rate problem ---------------------------------
/**
 *   P(A | +) = P(+ | A)·P(A) / [P(+ | A)·P(A) + P(+ | ¬A)·P(¬A)]
 *   posterior    likelihood × prior   /   evidence (law of total probability)
 */
export function alertPosterior(prior, tpr, fpr) {
  const evidence = tpr * prior + fpr * (1 - prior);
  return {
    ppv: (tpr * prior) / evidence,                              // P(attack | alert)
    missed: ((1 - tpr) * prior) / (1 - evidence),               // P(attack | no alert)
    evidence,
  };
}

/** Odds form: posterior odds = prior odds × likelihood ratio, applied k times (independent detectors). */
export function sequentialAlerts(prior, tpr, fpr, k) {
  const lr = tpr / fpr, out = [];
  let odds = prior / (1 - prior);
  out.push(odds / (1 + odds));
  for (let i = 0; i < k; i++) { odds *= lr; out.push(odds / (1 + odds)); }
  return { lr, probs: out };
}

// ---- 2. Beta–Binomial -------------------------------------------------------------
export function lnGamma(z) {
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
const lnBeta = (a, b) => lnGamma(a) + lnGamma(b) - lnGamma(a + b);

/** Beta(a, b) density. */
export function betaPdf(x, a, b) {
  if (x <= 0 || x >= 1) return 0;
  return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - lnBeta(a, b));
}

/** Regularised incomplete beta I_x(a, b) = P(Beta(a,b) ≤ x): continued fraction (Lentz). */
export function betaCdf(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (x > (a + 1) / (a + b + 2)) return 1 - betaCdf(1 - x, b, a);     // use the faster-converging side
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnBeta(a, b)) / a;
  let f = 1, C = 1, D = 0;
  for (let i = 0; i <= 400; i++) {
    const m = i >> 1;
    const num = i === 0 ? 1 : i % 2 === 0 ? (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m)) : -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    D = 1 + num * D; if (Math.abs(D) < 1e-300) D = 1e-300; D = 1 / D;
    C = 1 + num / C; if (Math.abs(C) < 1e-300) C = 1e-300;
    const cd = C * D; f *= cd;
    if (Math.abs(1 - cd) < 1e-15) break;
  }
  return front * (f - 1);
}

export function betaQuantile(q, a, b) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (betaCdf(mid, a, b) < q) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/** Prior Beta(a, b) + data (k successes in n) → posterior Beta(a + k, b + n − k). */
export function betaPosterior(a, b, k, n) {
  const A = a + k, B = b + n - k;
  return {
    A, B,
    mean: A / (A + B),
    mode: A > 1 && B > 1 ? (A - 1) / (A + B - 2) : NaN,
    sd: Math.sqrt((A * B) / ((A + B) ** 2 * (A + B + 1))),
    ci: [betaQuantile(0.025, A, B), betaQuantile(0.975, A, B)],
    // posterior mean = w·(prior mean) + (1 − w)·(sample proportion),  w = (a + b)/(a + b + n)
    priorWeight: (a + b) / (a + b + n),
  };
}

/** Frequentist 95% Wilson score interval, for comparison. */
export function wilson(k, n, z = 1.959964) {
  if (n === 0) return [0, 1];
  const ph = k / n, den = 1 + (z * z) / n;
  const centre = (ph + (z * z) / (2 * n)) / den, half = (z / den) * Math.sqrt((ph * (1 - ph)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/** Binomial likelihood L(p) = C(n,k) pᵏ (1−p)ⁿ⁻ᵏ, rescaled to integrate to 1 over p (for plotting). */
export const likelihoodDensity = (p, k, n) => betaPdf(p, k + 1, n - k + 1);
