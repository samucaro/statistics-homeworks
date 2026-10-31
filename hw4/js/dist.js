// =============================================================================
// dist.js — Score distributions on [0, 10] with EXACT moments
//   μ = E[X],  σ² = Var(X),  μ₄ = E[(X − μ)⁴]  (needed for Var(s²))
// =============================================================================

function discrete(id, name, desc, pmf) {
  const mu = pmf.reduce((s, p, k) => s + k * p, 0);
  const s2 = pmf.reduce((s, p, k) => s + (k - mu) ** 2 * p, 0);
  const mu4 = pmf.reduce((s, p, k) => s + (k - mu) ** 4 * p, 0);
  const cdf = []; pmf.reduce((s, p, k) => (cdf[k] = s + p), 0);
  return {
    id, name, desc, discrete: true, pmf, mu, s2, mu4,
    sample: (rng) => { const u = rng(); let k = 0; while (k < 10 && u >= cdf[k]) k++; return k; },
  };
}

const binom = Array.from({ length: 11 }, (_, k) => {
  let c = 1; for (let i = 0; i < k; i++) c = (c * (10 - i)) / (i + 1);
  return c * 0.3 ** k * 0.7 ** (10 - k);
});

// Beta(2, 5) on [0, 1], scaled to [0, 10]: skewed to the right.
const A = 2, B = 5;
const betaVar = (A * B) / ((A + B) ** 2 * (A + B + 1));
const betaExKurt = (6 * ((A - B) ** 2 * (A + B + 1) - A * B * (A + B + 2))) / (A * B * (A + B + 2) * (A + B + 3));

export const DISTS = [
  discrete("realistic", "Discrete, right-skewed (default)",
    "Most attempts score low; full penetration (10) is rare. P(0…10) = 0.30, 0.18, 0.13, 0.10, 0.08, 0.06, 0.05, 0.04, 0.03, 0.02, 0.01.",
    [0.30, 0.18, 0.13, 0.10, 0.08, 0.06, 0.05, 0.04, 0.03, 0.02, 0.01]),
  discrete("binom", "Binomial(10, 0.3)", "Score = number of successful sub-steps out of 10, each with probability 0.3 (links to the Bernoulli model of HW3).", binom),
  discrete("unif-d", "Discrete uniform {0, …, 10}", "Every integer score equally likely.", Array(11).fill(1 / 11)),
  {
    id: "beta", name: "Continuous: 10 × Beta(2, 5)", desc: "Continuous scores, mode at 2, long right tail.", discrete: false,
    mu: (10 * A) / (A + B), s2: 100 * betaVar, mu4: 1e4 * (3 + betaExKurt) * betaVar ** 2,
    pdf: (x) => (x <= 0 || x >= 10 ? 0 : (30 * (x / 10) * (1 - x / 10) ** 4) / 10),
    // Beta(2,5) = G₂/(G₂ + G₅) with Gₖ ~ Gamma(k) = −ln(U₁⋯Uₖ)
    sample: (rng) => { let g2 = 1, g5 = 1; for (let i = 0; i < 2; i++) g2 *= 1 - rng(); for (let i = 0; i < 5; i++) g5 *= 1 - rng();
      const a = -Math.log(g2), b = -Math.log(g5); return (10 * a) / (a + b); },
  },
  {
    id: "unif-c", name: "Continuous uniform [0, 10]", desc: "Symmetric, no preferred score.", discrete: false,
    mu: 5, s2: 100 / 12, mu4: 1e4 / 80, pdf: (x) => (x < 0 || x > 10 ? 0 : 0.1), sample: (rng) => 10 * rng(),
  },
];

/**
 * Exact variance of the sample variance s² (denominator n − 1) for i.i.d. data:
 *   Var(s²) = μ₄/n − σ⁴(n − 3)/(n(n − 1))
 * For normal data μ₄ = 3σ⁴ and this reduces to 2σ⁴/(n − 1).
 */
export const varOfS2 = (D, n) => D.mu4 / n - (D.s2 ** 2 * (n - 3)) / (n * (n - 1));
