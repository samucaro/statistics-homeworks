// =============================================================================
// normal.js — Numerical methods for the standard normal CDF
//   Φ(x) = ∫_{−∞}^{x} φ(t) dt,  φ(t) = e^{−t²/2}/√(2π)
//   Φ(x) = ½·[1 + erf(x/√2)],   Q(x) = 1 − Φ(x) = Φ(−x)
// Each method returns { value, terms } where `terms` counts the work done
// (function evaluations, series terms or continued-fraction levels).
// HMWK 5 — Statistics (Sapienza, MSc Cybersecurity, A.A. 2026/27)
// =============================================================================

const SQRT2PI = Math.sqrt(2 * Math.PI), SQRT2 = Math.SQRT2, SQRTPI = Math.sqrt(Math.PI);
export const pdf = (t) => Math.exp(-0.5 * t * t) / SQRT2PI;

// -----------------------------------------------------------------------------
// 1. Numerical integration of φ on [0, |x|]:  Φ(x) = ½ ± ∫₀^{|x|} φ
// -----------------------------------------------------------------------------
export function trapezoid(x, n = 100) {
  const a = Math.abs(x), h = a / n;
  let s = 0.5 * (pdf(0) + pdf(a));
  for (let i = 1; i < n; i++) s += pdf(i * h);
  const I = s * h;
  return { value: x >= 0 ? 0.5 + I : 0.5 - I, terms: n + 1 };
}

export function simpson(x, n = 100) {           // n even
  if (n % 2) n++;
  const a = Math.abs(x), h = a / n;
  let s = pdf(0) + pdf(a);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * pdf(i * h);
  const I = (s * h) / 3;
  return { value: x >= 0 ? 0.5 + I : 0.5 - I, terms: n + 1 };
}

// -----------------------------------------------------------------------------
// 2. Power series of erf
//   (a) Taylor series:  erf(z) = 2/√π · Σ (−1)ⁿ z^{2n+1} / (n!(2n+1))
//       alternating, with terms growing up to ~e^{z²}/√ before decaying:
//       catastrophic cancellation for |z| ≳ 3.
//   (b) Series with positive terms (Abramowitz–Stegun 7.1.6):
//       erf(z) = 2/√π · e^{−z²} · Σ 2ⁿ z^{2n+1} / (1·3·5⋯(2n+1))
//       no cancellation inside the sum.
// -----------------------------------------------------------------------------
export function erfTaylor(z) {
  let term = z, sum = z, n = 0;
  while (Math.abs(term) > 1e-17 * Math.abs(sum) && n < 500) {
    n++;
    term *= (-z * z) / n;                 // z^{2n+1}(−1)ⁿ/n!
    sum += term / (2 * n + 1);
  }
  return { value: (2 / SQRTPI) * sum, terms: n + 1 };
}

export function erfPositive(z) {
  let term = z, sum = z, n = 0;
  while (term > 1e-17 * sum && n < 1000) {
    n++;
    term *= (2 * z * z) / (2 * n + 1);
    sum += term;
  }
  return { value: (2 / SQRTPI) * Math.exp(-z * z) * sum, terms: n + 1 };
}

export const seriesTaylor = (x) => { const e = erfTaylor(x / SQRT2); return { value: 0.5 * (1 + e.value), terms: e.terms }; };
export const seriesPositive = (x) => {
  const z = Math.abs(x) / SQRT2, e = erfPositive(z);
  return { value: x >= 0 ? 0.5 + 0.5 * e.value : 0.5 - 0.5 * e.value, terms: e.terms };
};

// -----------------------------------------------------------------------------
// 3. Continued fraction for the upper tail (Laplace), x > 0:
//   Q(x) = φ(x) / (x + 1/(x + 2/(x + 3/(x + …))))
//   evaluated with the modified Lentz algorithm; converges fast for large x.
// -----------------------------------------------------------------------------
export function tailCF(x) {
  const tiny = 1e-300;
  let f = x, C = x, D = 0, k = 0;
  for (k = 1; k < 500; k++) {
    D = x + k * D; if (Math.abs(D) < tiny) D = tiny; D = 1 / D;
    C = x + k / C; if (Math.abs(C) < tiny) C = tiny;
    const delta = C * D;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return { value: pdf(x) / f, terms: k };
}

// -----------------------------------------------------------------------------
// 4. MY METHOD — hybrid, ~1e-15 relative accuracy on the whole real line
//   |x| < 2 : positive-term erf series (≤ 25 terms, no cancellation)
//   |x| ≥ 2 : continued fraction for the tail (≤ 106 levels); the small tail
//             probability is computed DIRECTLY, never as 1 − (number close to 1)
// The switch point trades accuracy for cost (see the page): at 3 the method is
// faster but loses ~2 digits near x = −2.9 to cancellation in 0.5 − 0.5·erf.
// -----------------------------------------------------------------------------
export let SWITCH = 2;
export const setSwitch = (s) => { SWITCH = s; };
export function phiHybrid(x) {
  const a = Math.abs(x);
  if (a < SWITCH) {
    const e = erfPositive(a / SQRT2);
    return { value: x >= 0 ? 0.5 + 0.5 * e.value : 0.5 - 0.5 * e.value, terms: e.terms };
  }
  const t = tailCF(a);
  return { value: x >= 0 ? 1 - t.value : t.value, terms: t.terms };
}

// -----------------------------------------------------------------------------
// 5. Classic closed-form approximations (fixed cost)
// -----------------------------------------------------------------------------
/** Abramowitz & Stegun 26.2.17: |error| < 7.5·10⁻⁸ (absolute). */
export function as26217(x) {
  const b = [0.319381530, -0.356563782, 1.781477937, -1.821255978, 1.330274429];
  const a = Math.abs(x), t = 1 / (1 + 0.2316419 * a);
  const poly = t * (b[0] + t * (b[1] + t * (b[2] + t * (b[3] + t * b[4]))));
  const q = pdf(a) * poly;
  return { value: x >= 0 ? 1 - q : q, terms: 1 };
}

/** Abramowitz & Stegun 7.1.26 for erf: |error| < 1.5·10⁻⁷ (used in HW3). */
export function as7126(x) {
  const z = Math.abs(x) / SQRT2, t = 1 / (1 + 0.3275911 * z);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return { value: x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y), terms: 1 };
}

export const METHODS = [
  { id: "hybrid", name: "Hybrid: positive series + tail continued fraction (my method)", fn: phiHybrid },
  { id: "series+", name: "erf series, positive terms (A&S 7.1.6)", fn: seriesPositive },
  { id: "taylor", name: "erf Taylor series (alternating)", fn: seriesTaylor },
  { id: "simpson", name: "Simpson's rule, n = 100", fn: (x) => simpson(x, 100) },
  { id: "trap", name: "Trapezoidal rule, n = 100", fn: (x) => trapezoid(x, 100) },
  { id: "as26217", name: "Abramowitz–Stegun 26.2.17", fn: as26217 },
  { id: "as7126", name: "Abramowitz–Stegun 7.1.26 (erf)", fn: as7126 },
];
