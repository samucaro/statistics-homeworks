// =============================================================================
// app.js — HW3 page logic: simulate, then render every section
// =============================================================================

import * as T from "./theory.js";
import { simulate, coverage, CHECKPOINTS, N_MAX } from "./sim.js";
import { lineChart, histogram, trajectories } from "./charts4.js";

const $ = (id) => document.getElementById(id);
const C = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)"];
const N_SHOW = [10, 100, 1000, 10000];
const Q = [
  { id: "S", name: "Total score Sₙ", f: (s, n) => s, scale: () => 1 },
  { id: "avg", name: "Average score Sₙ/n", f: (s, n) => s / n, scale: (n) => 1 / n },
  { id: "norm", name: "Normalised score Sₙ/√n", f: (s, n) => s / Math.sqrt(n), scale: (n) => 1 / Math.sqrt(n) },
];
const mean = (a) => { let s = 0; for (const v of a) s += v; return s / a.length; };
const variance = (a) => { const mu = mean(a); let s = 0; for (const v of a) s += (v - mu) ** 2; return s / (a.length - 1); };
const fmt = (v, d = 3) => {
  const a = Math.abs(v);
  if (v === 0) return "0";
  if (a >= 1e5 || a < 1e-3) return v.toExponential(2);
  if (a >= 100) return v.toFixed(1);
  return v.toFixed(d);
};
const powTicks = (a, b) => { const t = []; for (let e = a; e <= b; e++) t.push(10 ** e); return t; };
const sup = (e) => String(e).replace(/-/g, "⁻").replace(/\d/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[d]);
const pow10Fmt = (v) => { const e = Math.round(Math.log10(v)); return Math.abs(Math.log10(v) - e) < 1e-9 ? (e === 0 ? "1" : e === 1 ? "10" : `10${sup(e)}`) : +v.toPrecision(2); };

let R = null, M = null;

// -----------------------------------------------------------------------------
// Run
// -----------------------------------------------------------------------------
async function run() {
  const model = $("model").value;
  let p = parseFloat($("p").value);
  if (!(p > 0 && p < 1)) { p = 0.2; $("p").value = p; }
  $("p").disabled = model === "rademacher";
  const m = +$("m").value, seed = parseInt($("seed").value, 10) || 1;
  M = T.stepModel(model, p);
  $("run").disabled = true;
  const t0 = performance.now();
  R = await simulate({ model, p, m, seed, onProgress: (f) => { $("progress").style.width = `${f * 100}%`; } });
  $("run-info").innerHTML = `${m.toLocaleString("en")} attackers × ${N_MAX.toLocaleString("en")} steps = ${(m * N_MAX / 1e6).toFixed(0)} million increments,
    simulated in ${((performance.now() - t0) / 1000).toFixed(1)} s (seed ${seed}). Step distribution: ${model === "rademacher" ? "Rademacher, μ = 0, σ² = 1" : `Bernoulli(p = ${p}), μ = ${p}, σ² = ${fmt(M.s2, 4)}`}.`;
  renderAll();
  $("run").disabled = false;
}

function renderAll() {
  renderTrajectories();
  renderDistributions();
  renderVariance();
  renderLLN();
  renderCLT();
  renderAttackers();
}

// -----------------------------------------------------------------------------
// §2 Trajectories
// -----------------------------------------------------------------------------
function renderTrajectories() {
  const K = +$("traj-k").value, sd = Math.sqrt(M.s2), mu = M.mu;
  const paths = R.paths;
  // Sₖ
  const sLo = Math.min(0, mu * K - 3.2 * sd * Math.sqrt(K)), sHi = mu * K + 3.2 * sd * Math.sqrt(K);
  trajectories($("traj-S"), paths, K, { f: (k, s) => s, yMin: sLo, yMax: sHi, yTicks: niceTicks(sLo, sHi),
    centre: (k) => mu * k, band: [(k) => mu * k - 2 * sd * Math.sqrt(k), (k) => mu * k + 2 * sd * Math.sqrt(k)], yTitle: "Sₖ" });
  // Sₖ/k
  const aLo = M.model === "rademacher" ? -1 : 0, aHi = 1;
  trajectories($("traj-avg"), paths, K, { f: (k, s) => s / k, yMin: aLo, yMax: aHi, yTicks: niceTicks(aLo, aHi),
    centre: () => mu, band: [(k) => mu - 2 * sd / Math.sqrt(k), (k) => mu + 2 * sd / Math.sqrt(k)], yTitle: "Sₖ / k" });
  // Sₖ/√k
  const nLo = Math.min(-3.5 * sd, mu * Math.sqrt(K) - 3.5 * sd), nHi = mu * Math.sqrt(K) + 3.5 * sd;
  trajectories($("traj-norm"), paths, K, { f: (k, s) => s / Math.sqrt(k), yMin: nLo, yMax: nHi, yTicks: niceTicks(nLo, nHi),
    centre: (k) => mu * Math.sqrt(k), band: [(k) => mu * Math.sqrt(k) - 2 * sd, (k) => mu * Math.sqrt(k) + 2 * sd], yTitle: "Sₖ / √k" });
}

function niceTicks(a, b) {
  const span = b - a, raw = span / 4, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((x) => x * mag).find((x) => x >= raw);
  const out = [];
  for (let t = Math.ceil(a / step) * step; t <= b + 1e-9; t += step) out.push(+t.toPrecision(10));
  return out;
}

// -----------------------------------------------------------------------------
// §3 Distributions: same x-axis for every n, so drift / spread / concentration show
// -----------------------------------------------------------------------------
function latticeEdges(qi, n, x0, x1, targetBins) {
  const q = Q[qi], h = M.step * q.scale(n);              // spacing of the possible values
  const offset = q.f(M.model === "rademacher" ? -n : 0, n); // one possible value
  const w = h * Math.max(1, Math.ceil((x1 - x0) / targetBins / h));
  let start = offset - h / 2;
  start += Math.floor((x0 - start) / w) * w;
  const edges = [];
  for (let e = start; e < x1 + w; e += w) edges.push(e);
  return edges;
}

function renderDistributions() {
  const grid = $("dist-grid");
  grid.innerHTML = "";
  Q.forEach((q, qi) => {
    // shared range: union of mean ± 4.5 sd over the shown n, clipped to the support
    let x0 = Infinity, x1 = -Infinity;
    for (const n of N_SHOW) {
      const mo = T.quantityMoments(M, n)[q.id], sd = Math.sqrt(mo.var);
      const lo = q.f(M.model === "rademacher" ? -n : 0, n), hi = q.f(n, n);
      x0 = Math.min(x0, Math.max(lo, mo.mean - 4.5 * sd));
      x1 = Math.max(x1, Math.min(hi, mo.mean + 4.5 * sd));
    }
    const row = document.createElement("div");
    row.innerHTML = `<div class="chart-title">${q.name} — same horizontal axis for every n</div><div class="dist-row"></div>`;
    grid.appendChild(row);
    const cells = row.querySelector(".dist-row");
    for (const n of N_SHOW) {
      const cell = document.createElement("div");
      cells.appendChild(cell);
      const vals = Array.from(R.S[n], (s) => q.f(s, n));
      const mo = T.quantityMoments(M, n)[q.id], sd = Math.sqrt(mo.var);
      histogram(cell, vals, { edges: latticeEdges(qi, n, x0, x1, 60), title: `n = ${n.toLocaleString("en")}`, color: C[qi + 1],
        curve: (x) => Math.exp(-0.5 * ((x - mo.mean) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI)), xTicks: niceTicks(x0, x1).filter((_, i, a) => a.length <= 4 || i % 2 === 0) });
      const cap = document.createElement("p");
      cap.className = "caption";
      cap.innerHTML = `mean ${fmt(mean(vals))} (th. ${fmt(mo.mean)}) · var ${fmt(variance(vals))} (th. ${fmt(mo.var)})`;
      cell.appendChild(cap);
    }
  });
}

// -----------------------------------------------------------------------------
// §4 Variance under the three normalisations
// -----------------------------------------------------------------------------
function renderVariance() {
  const rows = [];
  const series = [];
  Q.forEach((q, i) => {
    const emp = CHECKPOINTS.map((n) => [n, variance(Array.from(R.S[n], (s) => q.f(s, n)))]);
    const th = CHECKPOINTS.map((n) => [n, T.quantityMoments(M, n)[q.id].var]);
    series.push({ name: `Var(${q.id === "S" ? "Sₙ" : q.id === "avg" ? "Sₙ/n" : "Sₙ/√n"}) simulated`, color: C[i], pts: emp, dots: true, noLine: true });
    series.push({ name: "", color: C[i], pts: th, dash: "5 4", width: 1.6 });
  });
  series.push({ name: "theory (dashed)", color: "var(--muted)", pts: [], dash: "5 4" });
  const allV = series.flatMap((s) => s.pts.map(([, y]) => y));
  const e0 = Math.floor(Math.log10(Math.min(...allV))), e1 = Math.ceil(Math.log10(Math.max(...allV)));
  lineChart($("var-chart"), series, { xLog: true, yLog: true, xTicks: CHECKPOINTS, yTicks: powTicks(e0, e1), yFmt: pow10Fmt,
    yMin: 10 ** e0, yMax: 10 ** e1, xTitle: "n (number of systems, log scale)", yTitle: "variance across attackers (log scale)" });
  for (const n of CHECKPOINTS) {
    const th = T.quantityMoments(M, n);
    const cells = Q.map((q) => `<td>${fmt(variance(Array.from(R.S[n], (s) => q.f(s, n))))} <span class="muted">(${fmt(th[q.id].var)})</span></td>`).join("");
    rows.push(`<tr><td>${n.toLocaleString("en")}</td>${cells}</tr>`);
  }
  $("var-table").innerHTML = `<thead><tr><th>n</th><th>Var(Sₙ) sim. (theory nσ²)</th><th>Var(Sₙ/n) sim. (theory σ²/n)</th><th>Var(Sₙ/√n) sim. (theory σ²)</th></tr></thead><tbody>${rows.join("")}</tbody>`;
  const se = Math.sqrt(2 / (R.m - 1));
  $("var-note").textContent = `Each simulated variance comes from m = ${R.m} attackers, so it carries a relative Monte Carlo error of about ±${(200 * se).toFixed(1)}% (2·√(2/(m−1)), normal approximation).`;
}

// -----------------------------------------------------------------------------
// §5 Law of large numbers
// -----------------------------------------------------------------------------
function renderLLN() {
  const eps = +$("lln-eps").value;
  const emp = CHECKPOINTS.map((n) => { let c = 0; for (const s of R.S[n]) if (Math.abs(s / n - M.mu) >= eps - 1e-12) c++; return [n, c / R.m]; });
  const nsDense = []; for (let e = 1; e <= 4.0001; e += 0.05) nsDense.push(Math.round(10 ** e));
  const exact = CHECKPOINTS.map((n) => [n, T.exactTail(M, n, eps)]);
  lineChart($("lln-chart"), [
    { name: "simulated (m attackers)", color: C[1], pts: emp, dots: true },
    { name: "exact (binomial law)", color: C[2], pts: exact, dots: false },
    { name: "Chebyshev bound σ²/(nε²)", color: C[0], pts: nsDense.map((n) => [n, T.chebyshev(M, n, eps)]), dash: "6 4" },
    { name: `Hoeffding bound 2e^(−2nε²/${M.range * M.range})`, color: C[3], pts: nsDense.map((n) => [n, T.hoeffding(M, n, eps)]), dash: "2 3" },
  ], { xLog: true, yMin: 0, yMax: 1, xTicks: CHECKPOINTS, yTicks: [0, 0.25, 0.5, 0.75, 1], yFmt: (v) => `${Math.round(v * 100)}%`,
    xTitle: "n (log scale)", yTitle: `P(|Sₙ/n − μ| ≥ ${eps})` });
  $("lln-table").innerHTML = `<thead><tr><th>n</th>${CHECKPOINTS.map((n) => `<th>${n.toLocaleString("en")}</th>`).join("")}</tr></thead><tbody>
    <tr><td>simulated</td>${emp.map(([, v]) => `<td>${(v * 100).toFixed(1)}%</td>`).join("")}</tr>
    <tr><td>exact</td>${exact.map(([, v]) => `<td>${v < 1e-4 && v > 0 ? v.toExponential(1) : (v * 100).toFixed(1) + "%"}</td>`).join("")}</tr>
    <tr><td>Chebyshev</td>${CHECKPOINTS.map((n) => `<td>${(T.chebyshev(M, n, eps) * 100).toFixed(1)}%</td>`).join("")}</tr>
    <tr><td>Hoeffding</td>${CHECKPOINTS.map((n) => { const v = T.hoeffding(M, n, eps); return `<td>${v < 1e-4 ? v.toExponential(1) : (v * 100).toFixed(1) + "%"}</td>`; }).join("")}</tr></tbody>`;
}

// -----------------------------------------------------------------------------
// §6 Central limit theorem
// -----------------------------------------------------------------------------
function renderCLT() {
  const n = +$("clt-n").value, sd = Math.sqrt(M.s2);
  const z = Array.from(R.S[n], (s) => (s - n * M.mu) / (sd * Math.sqrt(n)));
  // lattice of Z: spacing step/(σ√n), one value at (lo·n − nμ)/(σ√n)
  const h = M.step / (sd * Math.sqrt(n)), off = (M.lo * n - n * M.mu) / (sd * Math.sqrt(n));
  const w = h * Math.max(1, Math.ceil(8 / 48 / h));
  let start = off - h / 2; start += Math.floor((-4 - start) / w) * w;
  const edges = []; for (let e = start; e < 4 + w; e += w) edges.push(e);
  histogram($("clt-hist"), z, { edges, curve: T.normPdf, W: 620, H: 260, color: C[2], xTicks: [-4, -3, -2, -1, 0, 1, 2, 3, 4],
    title: `${M.model === "rademacher" ? "Sₙ/√n" : "(Sₙ − np)/√(np(1−p))"}, n = ${n.toLocaleString("en")}` });
  const mz = mean(z), vz = variance(z);
  let m3 = 0, m4 = 0; for (const v of z) { m3 += (v - mz) ** 3; m4 += (v - mz) ** 4; }
  m3 /= z.length; m4 /= z.length;
  const skX = M.model === "rademacher" ? 0 : (1 - 2 * M.p) / Math.sqrt(M.s2), kuX = M.model === "rademacher" ? -2 : (1 - 6 * M.s2) / M.s2;
  let out = 0; for (const v of z) if (Math.abs(v) > 1.96) out++;
  $("clt-stats").innerHTML = `
    <div class="stat"><div class="v">${fmt(mz)}</div><div class="l">mean (N(0,1): 0)</div></div>
    <div class="stat"><div class="v">${fmt(vz)}</div><div class="l">variance (N(0,1): 1)</div></div>
    <div class="stat"><div class="v">${fmt(m3 / vz ** 1.5)}</div><div class="l">skewness (exact ${fmt(skX / Math.sqrt(n))}, N: 0)</div></div>
    <div class="stat"><div class="v">${fmt(m4 / vz ** 2 - 3)}</div><div class="l">excess kurtosis (exact ${fmt(kuX / n)}, N: 0)</div></div>
    <div class="stat"><div class="v">${((out / z.length) * 100).toFixed(1)}%</div><div class="l">|Z| &gt; 1.96 (N: 5%)</div></div>
    <div class="stat"><div class="v">${fmt(T.ksEmpirical(z), 4)} / ${fmt(T.ksExact(M, n), 4)}</div><div class="l">KS distance: simulated / exact</div></div>`;
  // KS vs n
  const nsDense = []; for (let e = 1; e <= 4.0001; e += 0.1) nsDense.push(Math.round(10 ** e));
  const emp = CHECKPOINTS.map((nn) => [nn, T.ksEmpirical(Array.from(R.S[nn], (s) => (s - nn * M.mu) / (sd * Math.sqrt(nn))))]);
  const noise = 1.36 / Math.sqrt(R.m);
  lineChart($("ks-chart"), [
    { name: "simulated KS distance", color: C[1], pts: emp, dots: true },
    { name: "exact KS distance (binomial vs normal)", color: C[2], pts: CHECKPOINTS.map((nn) => [nn, T.ksExact(M, nn)]), dots: true },
    { name: "Berry–Esseen bound 0.4748·ρ/(σ³√n)", color: C[0], pts: nsDense.map((nn) => [nn, T.berryEsseen(M, nn)]), dash: "6 4" },
    { name: `Monte Carlo noise level 1.36/√m (m = ${R.m})`, color: C[4], pts: [[10, noise], [10000, noise]], dash: "2 3" },
  ], { xLog: true, yLog: true, xTicks: CHECKPOINTS, yTicks: [0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1], yMin: 0.001, yMax: 1,
    xTitle: "n (log scale)", yTitle: "sup |Fₙ(z) − Φ(z)| (log scale)" });
}

// -----------------------------------------------------------------------------
// §7 n systems and m attackers
// -----------------------------------------------------------------------------
function renderAttackers() {
  const sd = Math.sqrt(M.s2), m = R.m;
  const ks = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000].filter((k) => k <= m / 4);
  const series = [];
  [100, 1000, 10000].forEach((n, i) => {
    const a = Array.from(R.S[n], (s) => s / n);
    const emp = ks.map((k) => { const g = Math.floor(m / k); let tot = 0; for (let j = 0; j < g; j++) { let mx = -Infinity; for (let t = j * k; t < (j + 1) * k; t++) mx = Math.max(mx, a[t]); tot += mx; } return [k, tot / g]; });
    series.push({ name: `n = ${n.toLocaleString("en")}: simulated`, color: C[i + 1], pts: emp, dots: true, noLine: true });
    series.push({ name: "", color: C[i + 1], pts: ks.map((k) => [k, M.mu + (sd / Math.sqrt(n)) * T.expectedMaxNormal(k)]), dash: "5 4", width: 1.6 });
  });
  series.push({ name: "μ + σ·E[max of m′ normals]/√n (dashed)", color: "var(--muted)", pts: [], dash: "5 4" });
  const yMax = Math.max(...series.flatMap((s) => s.pts.map(([, y]) => y)));
  lineChart($("atk-max"), series, { xLog: true, xTicks: ks, yMin: M.mu - 0.02, yMax: yMax * 1.02 + (M.mu === 0 ? 0.02 : 0),
    yFmt: (v) => v.toFixed(2), xTitle: "number of attackers m′ (log scale)", yTitle: "E[best attacker's Sₙ/n]" });

  const cm = Math.min(m, 200);
  const c100 = coverage(M.p, 100, cm, 11), c1e4 = coverage(M.p, 10000, cm, 12);
  const kk = []; for (let k = 1; k <= cm; k = k < 10 ? k + 1 : Math.round(k * 1.25)) kk.push(k);
  lineChart($("atk-cov"), [
    { name: "n = 100 systems, simulated", color: C[1], pts: kk.map((k) => [k, c100[k]]), dots: true, noLine: true },
    { name: "n = 10,000 systems, simulated", color: C[2], pts: kk.map((k) => [k, c1e4[k]]), dots: true, noLine: true },
    { name: `theory 1 − (1 − p)^m′, p = ${M.p}`, color: C[0], pts: kk.map((k) => [k, 1 - (1 - M.p) ** k]), dash: "5 4" },
  ], { xLog: true, yMin: 0, yMax: 1, xTicks: [1, 2, 5, 10, 20, 50, 100, 200].filter((k) => k <= cm), yTicks: [0, 0.25, 0.5, 0.75, 1],
    yFmt: (v) => `${Math.round(v * 100)}%`, xTitle: "number of attackers m′ (log scale)", yTitle: "systems hit by ≥ 1 attacker" });

  const n = 1000, a = Array.from(R.S[n], (s) => s / n);
  const tot = R.S[n].reduce((x, y) => x + y, 0);
  const k90 = Math.ceil(Math.log(0.1) / Math.log(1 - M.p));
  $("atk-stats").innerHTML = `
    <div class="stat"><div class="v">${fmt(mean(a))} ± ${fmt(2 * Math.sqrt(variance(a) / m))}</div><div class="l">average over the ${m} attackers of Sₙ/n (n = 1000), ±2 SE</div></div>
    <div class="stat"><div class="v">${tot.toLocaleString("en")}</div><div class="l">aggregate score Σⱼ Sₙ⁽ʲ⁾ (theory m·n·μ = ${(m * n * M.mu).toLocaleString("en")}, sd √(mn)σ = ${fmt(Math.sqrt(m * n) * sd, 1)})</div></div>
    <div class="stat"><div class="v">${fmt(Math.min(...a))} … ${fmt(Math.max(...a))}</div><div class="l">worst … best single attacker, Sₙ/n</div></div>
    <div class="stat"><div class="v">${k90}</div><div class="l">attackers needed to hit 90% of systems (1 − (1−p)^m ≥ 0.9)</div></div>`;
}

// -----------------------------------------------------------------------------
// Boot
// -----------------------------------------------------------------------------
$("run").onclick = run;
$("model").onchange = run;
$("traj-k").onchange = () => R && renderTrajectories();
$("lln-eps").onchange = () => R && renderLLN();
$("clt-n").onchange = () => R && renderCLT();
run().catch((e) => { console.error(e); $("run-info").innerHTML = `<span class="bad">${e.message}</span>`; });
