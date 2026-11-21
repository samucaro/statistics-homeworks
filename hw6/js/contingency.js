// =============================================================================
// contingency.js — Contingency table, frequencies and Pearson's χ² test
// HMWK 6 — Statistics (Sapienza, MSc Cybersecurity, A.A. 2026/27)
//
// Input: raw records (one object per observation) and the names of the two
// variables X (rows) and F (columns). Everything is computed from the records.
//
//   nᵢⱼ   observed count of (X = xᵢ, F = fⱼ)
//   nᵢ.   row total,  n.ⱼ  column total,  n  grand total
//   joint relative frequency        nᵢⱼ / n
//   marginal frequencies            nᵢ. / n ,  n.ⱼ / n
//   conditional frequencies         f(F = fⱼ | X = xᵢ) = nᵢⱼ / nᵢ.
//                                   f(X = xᵢ | F = fⱼ) = nᵢⱼ / n.ⱼ
//   expected under independence     Eᵢⱼ = nᵢ. · n.ⱼ / n
//   Pearson statistic               χ² = Σᵢⱼ (nᵢⱼ − Eᵢⱼ)² / Eᵢⱼ ,  df = (r − 1)(c − 1)
// =============================================================================

/** Builds the r × c table of counts from the records. Category order: first appearance, or `order`. */
export function buildTable(records, xKey, fKey, orderX = null, orderF = null) {
  const xs = orderX ? [...orderX] : [], fs = orderF ? [...orderF] : [];
  const xi = new Map(xs.map((v, i) => [v, i])), fi = new Map(fs.map((v, i) => [v, i]));
  const pairs = [];
  for (const rec of records) {
    const x = rec[xKey], f = rec[fKey];
    if (x === undefined || f === undefined || x === "" || f === "") continue;   // skip incomplete records
    if (!xi.has(x)) { xi.set(x, xs.length); xs.push(x); }
    if (!fi.has(f)) { fi.set(f, fs.length); fs.push(f); }
    pairs.push([xi.get(x), fi.get(f)]);
  }
  const counts = xs.map(() => new Array(fs.length).fill(0));
  for (const [i, j] of pairs) counts[i][j]++;
  return analyse(xs, fs, counts);
}

/** All derived quantities from a table of counts. */
export function analyse(xs, fs, counts) {
  const r = xs.length, c = fs.length;
  const rowTot = counts.map((row) => row.reduce((s, v) => s + v, 0));
  const colTot = fs.map((_, j) => counts.reduce((s, row) => s + row[j], 0));
  const n = rowTot.reduce((s, v) => s + v, 0);
  const joint = counts.map((row) => row.map((v) => v / n));
  const rowMarg = rowTot.map((v) => v / n), colMarg = colTot.map((v) => v / n);
  const condFgivenX = counts.map((row, i) => row.map((v) => (rowTot[i] ? v / rowTot[i] : NaN)));
  const condXgivenF = counts.map((row) => row.map((v, j) => (colTot[j] ? v / colTot[j] : NaN)));
  const expected = rowTot.map((ri) => colTot.map((cj) => (ri * cj) / n));
  let chi2 = 0;
  const contrib = counts.map((row, i) => row.map((o, j) => {
    const e = expected[i][j];
    const v = e > 0 ? (o - e) ** 2 / e : 0;
    chi2 += v;
    return v;
  }));
  // Pearson residuals (O − E)/√E and adjusted residuals, ≈ N(0,1) under H₀ cell by cell
  const resid = counts.map((row, i) => row.map((o, j) => (o - expected[i][j]) / Math.sqrt(expected[i][j])));
  const adjResid = counts.map((row, i) => row.map((o, j) =>
    (o - expected[i][j]) / Math.sqrt(expected[i][j] * (1 - rowTot[i] / n) * (1 - colTot[j] / n))));
  const df = (r - 1) * (c - 1);
  const p = chiSquarePValue(chi2, df);
  const minE = Math.min(...expected.flat());
  const smallE = expected.flat().filter((e) => e < 5).length;
  const cramersV = Math.sqrt(chi2 / (n * Math.max(1, Math.min(r - 1, c - 1))));
  return { xs, fs, counts, r, c, n, rowTot, colTot, joint, rowMarg, colMarg, condFgivenX, condXgivenF,
    expected, contrib, resid, adjResid, chi2, df, p, minE, smallE, cramersV };
}

// -----------------------------------------------------------------------------
// p-value: P(χ²_df ≥ x) = Q(df/2, x/2), regularised upper incomplete gamma.
// Computed in LOG space, so that p-values like 10⁻⁸⁰⁰ (far below the smallest
// double, ≈ 10⁻³⁰⁸) can still be reported instead of an uninformative 0.
// -----------------------------------------------------------------------------
function lnGamma(z) {
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/** log Q(a, x). Series for x < a + 1 (via P), continued fraction otherwise. */
export function logGammaQ(a, x) {
  if (x <= 0) return 0;
  const lead = -x + a * Math.log(x) - lnGamma(a);
  if (x < a + 1) {
    let sum = 1 / a, term = sum, ap = a;
    for (let k = 0; k < 1000; k++) { ap += 1; term *= x / ap; sum += term; if (Math.abs(term) < Math.abs(sum) * 1e-16) break; }
    return Math.log1p(-Math.exp(lead + Math.log(sum)));
  }
  let b = x + 1 - a, C = 1e300, D = 1 / b, h = D;          // modified Lentz
  for (let k = 1; k < 1000; k++) {
    const an = -k * (k - a);
    b += 2;
    D = an * D + b; if (Math.abs(D) < 1e-300) D = 1e-300;
    C = b + an / C; if (Math.abs(C) < 1e-300) C = 1e-300;
    D = 1 / D;
    const del = D * C; h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return lead + Math.log(h);
}

/** Returns { value, log10 } — value may underflow to 0, log10 never does. */
export function chiSquarePValue(chi2, df) {
  if (df <= 0) return { value: NaN, log10: NaN };
  const lq = logGammaQ(df / 2, chi2 / 2);
  return { value: Math.exp(lq), log10: lq / Math.LN10 };
}

/** Critical value χ²_{df, 1−α}: solves P(χ²_df ≥ x) = α by bisection. */
export function chiSquareCritical(df, alpha = 0.05) {
  let lo = 0, hi = Math.max(10, df * 10 + 50);
  for (let k = 0; k < 200; k++) { const mid = (lo + hi) / 2; if (chiSquarePValue(mid, df).value > alpha) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/** Density of χ²_df (for the chart). */
export function chiSquarePdf(x, df) {
  if (x <= 0) return 0;
  const k = df / 2;
  return Math.exp((k - 1) * Math.log(x) - x / 2 - k * Math.LN2 - lnGamma(k));
}

/**
 * Permutation test: shuffle the F labels among the records (keeping both sets
 * of marginal totals fixed) to simulate the null hypothesis of independence,
 * and recompute χ² each time. The p-value is the fraction of shuffles with
 * χ² ≥ the observed one — no χ² approximation needed.
 */
export async function permutationTest(T, B, rng, onProgress) {
  const xIdx = [], fIdx = [];
  T.counts.forEach((row, i) => row.forEach((v, j) => { for (let k = 0; k < v; k++) { xIdx.push(i); fIdx.push(j); } }));
  const n = xIdx.length, sims = new Float64Array(B);
  let atLeast = 0;
  const cell = new Float64Array(T.r * T.c);
  for (let b = 0; b < B; b++) {
    for (let k = n - 1; k > 0; k--) { const m = Math.floor(rng() * (k + 1)); const t = fIdx[k]; fIdx[k] = fIdx[m]; fIdx[m] = t; }  // Fisher–Yates
    cell.fill(0);
    for (let k = 0; k < n; k++) cell[xIdx[k] * T.c + fIdx[k]]++;
    let chi = 0;
    for (let i = 0; i < T.r; i++) for (let j = 0; j < T.c; j++) { const e = T.expected[i][j]; if (e > 0) chi += (cell[i * T.c + j] - e) ** 2 / e; }
    sims[b] = chi;
    if (chi >= T.chi2 - 1e-9) atLeast++;
    if (b % 50 === 49) { onProgress?.((b + 1) / B); await new Promise((r) => setTimeout(r, 0)); }
  }
  return { sims, p: (atLeast + 1) / (B + 1), atLeast };   // +1: the observed table is itself a permutation
}
