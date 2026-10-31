// =============================================================================
// theory.js — Exact results used to check the simulation
//   moments of the two step distributions, exact law of Sₙ (binomial),
//   normal density/CDF, LLN bounds, Berry–Esseen bound, KS distances.
// =============================================================================

/**
 * Step distribution.
 *   Bernoulli(p):  X ∈ {0, 1}     μ = p,  σ² = p(1−p),  ρ = E|X−μ|³ = p(1−p)(p² + (1−p)²)
 *   Rademacher:    X ∈ {−1, +1}   μ = 0,  σ² = 1,       ρ = 1
 * range = b − a (used by Hoeffding's inequality).
 */
export function stepModel(model, p) {
  if (model === "rademacher") return { model, p: 0.5, mu: 0, s2: 1, rho: 1, range: 2, lo: -1, step: 2 };
  return { model, p, mu: p, s2: p * (1 - p), rho: p * (1 - p) * (p * p + (1 - p) * (1 - p)), range: 1, lo: 0, step: 1 };
}

/** Mean and variance of the three quantities for a given n. */
export function quantityMoments(M, n) {
  return {
    S: { mean: n * M.mu, var: n * M.s2 },
    avg: { mean: M.mu, var: M.s2 / n },
    norm: { mean: Math.sqrt(n) * M.mu, var: M.s2 },
  };
}

// ---- normal distribution ----------------------------------------------------
export const normPdf = (z) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);

/** Φ(z) via erf (Abramowitz–Stegun 7.1.26, absolute error < 1.5e-7). */
export function normCdf(z) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

// ---- exact distribution of Sₙ -----------------------------------------------
const LF = [0];
function logFact(n) { for (let i = LF.length; i <= n; i++) LF[i] = LF[i - 1] + Math.log(i); return LF[n]; }

/**
 * Exact law of Sₙ. With B ~ Binomial(n, p) successes:
 *   Bernoulli:  Sₙ = B            Rademacher:  Sₙ = 2B − n   (so Sₙ ≡ n mod 2)
 * Returns support values s[k] and probabilities q[k], k = 0…n.
 */
export function exactLaw(M, n) {
  logFact(n);
  const s = new Float64Array(n + 1), q = new Float64Array(n + 1);
  const lp = Math.log(M.p), lq = Math.log(1 - M.p);
  for (let k = 0; k <= n; k++) {
    q[k] = Math.exp(LF[n] - LF[k] - LF[n - k] + k * lp + (n - k) * lq);
    s[k] = M.model === "rademacher" ? 2 * k - n : k;
  }
  return { s, q };
}

/** Exact P(|Sₙ/n − μ| ≥ ε). */
export function exactTail(M, n, eps) {
  const { s, q } = exactLaw(M, n);
  let t = 0;
  for (let k = 0; k <= n; k++) if (Math.abs(s[k] / n - M.mu) >= eps - 1e-12) t += q[k];
  return Math.min(1, t);
}

/** Chebyshev: P(|Sₙ/n − μ| ≥ ε) ≤ σ²/(nε²).   Hoeffding: ≤ 2·exp(−2nε²/(b−a)²). */
export const chebyshev = (M, n, eps) => Math.min(1, M.s2 / (n * eps * eps));
export const hoeffding = (M, n, eps) => Math.min(1, 2 * Math.exp((-2 * n * eps * eps) / (M.range * M.range)));

/** Berry–Esseen: sup |Fₙ − Φ| ≤ C·ρ/(σ³√n), C ≤ 0.4748 (Shevtsova, 2011). */
export const berryEsseen = (M, n) => (0.4748 * M.rho) / (Math.pow(M.s2, 1.5) * Math.sqrt(n));

/**
 * Exact Kolmogorov distance between the law of Zₙ = (Sₙ − nμ)/(σ√n) and N(0,1).
 * Fₙ is a step function, so the supremum is reached at a jump, either just
 * before it (left limit) or at it.
 */
export function ksExact(M, n) {
  const { s, q } = exactLaw(M, n);
  const sd = Math.sqrt(n * M.s2);
  let F = 0, D = 0;
  for (let k = 0; k <= n; k++) {
    const z = (s[k] - n * M.mu) / sd, P = normCdf(z);
    D = Math.max(D, Math.abs(F - P));      // left limit
    F += q[k];
    D = Math.max(D, Math.abs(F - P));      // at the jump
  }
  return D;
}

/** Kolmogorov distance between the empirical CDF of a sample and Φ (handles ties). */
export function ksEmpirical(z) {
  const a = Float64Array.from(z).sort();
  const m = a.length;
  let D = 0;
  for (let i = 0; i < m;) {
    let j = i;
    while (j + 1 < m && a[j + 1] === a[i]) j++;
    const P = normCdf(a[i]);
    D = Math.max(D, Math.abs(i / m - P), Math.abs((j + 1) / m - P));
    i = j + 1;
  }
  return D;
}

/** E[max of k i.i.d. N(0,1)] = ∫ z · k φ(z) Φ(z)^(k−1) dz, by numerical integration. */
export function expectedMaxNormal(k) {
  if (k === 1) return 0;
  let s = 0;
  const h = 0.005;
  for (let z = -8; z <= 8; z += h) s += z * k * normPdf(z) * Math.pow(normCdf(z), k - 1) * h;
  return s;
}
