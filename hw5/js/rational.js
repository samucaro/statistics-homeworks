// =============================================================================
// rational.js — exact rational arithmetic for Thomae's function
// =============================================================================

export const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return Math.abs(a); };

/**
 * Fraction with the SMALLEST denominator in the closed interval [pn/pd, qn/qd]
 * (0 ≤ p < q), by the continued-fraction / Stern–Brocot recursion:
 *   if an integer lies in [p, q] → it is the answer (denominator 1);
 *   otherwise p, q ∈ (a, a+1): write x = a + 1/y with y ∈ [1/(q−a), 1/(p−a)].
 * Returns [numerator, denominator].
 */
export function simplestIn(pn, pd, qn, qd) {
  const a = Math.floor(pn / pd);
  if (a * pd === pn) return [a, 1];                  // p itself is an integer
  if ((a + 1) * qd <= qn) return [a + 1, 1];          // a + 1 ≤ q
  const [yn, yd] = simplestIn(qd, qn - a * qd, pd, pn - a * pd);
  return [a * yn + yd, yn];
}

/**
 * Upper Darboux sum of Thomae's function on the uniform partition of [0, 1]
 * into N subintervals: U = Σ (1/N) · sup_{[k/N,(k+1)/N]} f = Σ (1/N) · 1/q_min(k).
 * (The lower sum is 0: every subinterval contains irrationals.)
 */
export function thomaeUpper(N) {
  let s = 0;
  for (let k = 0; k < N; k++) s += 1 / simplestIn(k, N, k + 1, N)[1];
  return s / N;
}

/** Thomae at the rational p/q: 1/(q / gcd(p, q)). */
export const thomaeAt = (p, q) => gcd(p, q) / q;
