// =============================================================================
// functions.js — the test functions of Ex. 1
// Each regular function is described by monotone PIECES. This lets us compute
// exactly (up to bisection) the measure of level sets μ({x : f(x) > t}) — the
// basic ingredient of a Lebesgue sum — and the exact sup/inf on any interval
// for Darboux sums.
// =============================================================================

const PI = Math.PI;
// mono: "inc" | "dec" | "const";  lo/hi: limits of f at the piece ends (may be ∞)
export const FUNCTIONS = [
  { id: "sin", label: "sin x on [0, π]", a: 0, b: PI, exact: 2, exactLabel: "2",
    f: Math.sin, ymax: 1, pieces: [{ p: 0, q: PI / 2, mono: "inc" }, { p: PI / 2, q: PI, mono: "dec" }] },
  { id: "sq", label: "x² on [0, 1]", a: 0, b: 1, exact: 1 / 3, exactLabel: "1/3",
    f: (x) => x * x, ymax: 1, pieces: [{ p: 0, q: 1, mono: "inc" }] },
  { id: "step13", label: "1 if x < 0.5, 3 if x ≥ 0.5", a: 0, b: 1, exact: 2, exactLabel: "2",
    f: (x) => (x < 0.5 ? 1 : 3), ymax: 3, pieces: [{ p: 0, q: 0.5, mono: "const", v: 1 }, { p: 0.5, q: 1, mono: "const", v: 3 }] },
  { id: "abs", label: "|x − 0.5| on [0, 1]", a: 0, b: 1, exact: 0.25, exactLabel: "1/4",
    f: (x) => Math.abs(x - 0.5), ymax: 0.5, pieces: [{ p: 0, q: 0.5, mono: "dec" }, { p: 0.5, q: 1, mono: "inc" }] },
  { id: "invsqrt", label: "1/√x on (0, 1] (unbounded)", a: 0, b: 1, exact: 2, exactLabel: "2 (improper)",
    f: (x) => 1 / Math.sqrt(x), ymax: Infinity, pieces: [{ p: 0, q: 1, mono: "dec" }] },
  { id: "ind", label: "1 if x < 0.5, 0 if x ≥ 0.5", a: 0, b: 1, exact: 0.5, exactLabel: "1/2",
    f: (x) => (x < 0.5 ? 1 : 0), ymax: 1, pieces: [{ p: 0, q: 0.5, mono: "const", v: 1 }, { p: 0.5, q: 1, mono: "const", v: 0 }] },
  { id: "sinc", label: "sin(x)/x on [0, π]", a: 0, b: PI, exact: 1.8519370519824662, exactLabel: "Si(π) = 1.851937051982466…",
    f: (x) => (x === 0 ? 1 : Math.sin(x) / x), ymax: 1, pieces: [{ p: 0, q: PI, mono: "dec" }] },
  { id: "dirichlet", label: "Dirichlet: 1 on ℚ, 0 elsewhere", a: 0, b: 1, exact: 0, exactLabel: "Lebesgue: 0 · Riemann: does not exist",
    pathological: true, ymax: 1 },
  { id: "thomae", label: "Thomae: 1/q at p/q, 0 elsewhere", a: 0, b: 1, exact: 0, exactLabel: "0 (both)",
    pathological: true, ymax: 1 },
];

/** f at the end of a piece, as a one-sided limit (handles x = 0 for 1/√x). */
function endValue(F, piece, x) {
  if (piece.mono === "const") return piece.v;
  const v = F.f(x);
  return isFinite(v) ? v : Infinity;
}

/**
 * Measure of {x in [a,b] : f(x) > t}  (strict = true)  or  f(x) ≥ t.
 * On a monotone piece the set is an interval whose end is found by bisection
 * (60 halvings ≈ full double precision). Returns { measure, evals }.
 */
export function levelMeasure(F, t, strict = true) {
  let m = 0, evals = 0;
  const above = (v) => (strict ? v > t : v >= t);
  for (const P of F.pieces) {
    const len = P.q - P.p;
    if (P.mono === "const") { if (above(P.v)) m += len; continue; }
    const fp = endValue(F, P, P.p), fq = endValue(F, P, P.q); evals += 2;
    const inc = P.mono === "inc";
    const low = inc ? fp : fq, high = inc ? fq : fp;
    if (above(low)) { m += len; continue; }          // whole piece above t
    if (!above(high)) continue;                       // whole piece below t
    let lo = P.p, hi = P.q;                           // crossing inside
    for (let i = 0; i < 60; i++) {
      const mid = 0.5 * (lo + hi), v = F.f(mid); evals++;
      if (above(v) === inc) hi = mid; else lo = mid;
    }
    m += inc ? P.q - hi : lo - P.p;
  }
  return { measure: m, evals };
}

/** Intervals forming {f > t} (for the picture). */
export function levelIntervals(F, t) {
  const out = [];
  for (const P of F.pieces) {
    if (P.mono === "const") { if (P.v > t) out.push([P.p, P.q]); continue; }
    const fp = endValue(F, P, P.p), fq = endValue(F, P, P.q), inc = P.mono === "inc";
    if (Math.min(fp, fq) > t) { out.push([P.p, P.q]); continue; }
    if (Math.max(fp, fq) <= t) continue;
    let lo = P.p, hi = P.q;
    for (let i = 0; i < 50; i++) { const mid = 0.5 * (lo + hi); if ((F.f(mid) > t) === inc) hi = mid; else lo = mid; }
    out.push(inc ? [hi, P.q] : [P.p, lo]);
  }
  return out;
}

/** Exact sup and inf of f on [u, v] using the monotone pieces (Darboux sums). */
export function supInf(F, u, v) {
  let sup = -Infinity, inf = Infinity, evals = 0;
  for (const P of F.pieces) {
    const lo = Math.max(u, P.p), hi = Math.min(v, P.q);
    if (lo > hi) continue;
    if (P.mono === "const") {
      // a constant piece [p, q) only "owns" its right end if it is the last piece
      if (lo === hi && lo === P.q && P.q !== F.b) continue;
      sup = Math.max(sup, P.v); inf = Math.min(inf, P.v); continue;
    }
    const a = endValue(F, P, lo), b = endValue(F, P, hi); evals += 2;
    sup = Math.max(sup, a, b); inf = Math.min(inf, a, b);
  }
  return { sup, inf, evals };
}
