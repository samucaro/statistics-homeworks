// =============================================================================
// app.js — HW4 page logic
// =============================================================================

import { welfordTrace, naiveVariance, twoPassVariance, welfordVariance } from "./welford.js";
import { DISTS, varOfS2 } from "./dist.js";
import { simulate, NS } from "./sim.js";
import { makeRng } from "../../hw3/js/rng.js";
import { lineChart, histogram, trajectories } from "../../hw3/js/charts4.js";
import { barChart } from "../../hw1/js/charts.js";

const $ = (id) => document.getElementById(id);
const C = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)"];
const avg = (a) => { let s = 0; for (const v of a) s += v; return s / a.length; };
const vr = (a) => { const m = avg(a); let s = 0; for (const v of a) s += (v - m) ** 2; return s / (a.length - 1); };
const f = (v, d = 4) => { const a = Math.abs(v); if (!isFinite(v)) return "—"; if (v === 0) return "0"; if (a >= 1e5 || a < 1e-4) return v.toExponential(2); return v.toFixed(d); };
const ok = (good) => `<b class="${good ? "ok" : "bad"}">${good ? "✓" : "✗"}</b>`;

// =============================================================================
// Part 1 — worked example and numerical stability
// =============================================================================
function workedExample() {
  const xs = $("ex-input").value.split(/[\s,;]+/).map(Number).filter((x) => isFinite(x));
  if (xs.length < 2) { $("ex-table").innerHTML = `<tr><td class="bad">Enter at least two numbers.</td></tr>`; return; }
  const rows = welfordTrace(xs);
  $("ex-table").innerHTML = `<thead><tr><th>k</th><th>xₖ</th><th>Mₖ₋₁</th><th>d = xₖ − Mₖ₋₁</th><th>Mₖ = Mₖ₋₁ + d/k</th><th>xₖ − Mₖ</th>
    <th>SSₖ = SSₖ₋₁ + d·(xₖ − Mₖ)</th><th>s²ₖ = SSₖ/(k−1)</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${r.k}</td><td>${r.x}</td><td>${f(r.oldMean)}</td><td>${f(r.d)}</td><td><b>${f(r.mean)}</b></td><td>${f(r.dNew)}</td>
      <td>${f(r.oldSS)} + ${f(r.d)}·${f(r.dNew)} = <b>${f(r.ss)}</b></td><td>${r.k > 1 ? f(r.s2) : "—"}</td></tr>`).join("")}</tbody>`;
  const n = xs.length, m = avg(xs), ss = xs.reduce((s, x) => s + (x - m) ** 2, 0);
  const last = rows[rows.length - 1];
  $("ex-check").innerHTML = `Direct (two-pass) computation: mean = ${f(m)}, SS = Σ(xᵢ − x̄)² = ${f(ss)}, s² = ${f(ss / (n - 1))}.
    Welford: mean ${f(last.mean)} ${ok(Math.abs(last.mean - m) < 1e-9 * (1 + Math.abs(m)))}, SS ${f(last.ss)} ${ok(Math.abs(last.ss - ss) < 1e-9 * (1 + ss))}.`;
}

function stability() {
  const rng = makeRng(42);
  const base = Array.from({ length: 10000 }, () => 10 * rng());
  const ref = twoPassVariance(base);
  const offsets = [0, 1e4, 1e6, 1e8, 1e9, 1e10];
  const rel = (v) => Math.abs(v - ref) / ref;
  const cell = (v) => { const e = rel(v); return `<td class="${e > 1e-3 ? "bad" : ""}">${f(v, 6)}<br><span class="muted">rel. error ${e.toExponential(1)}</span></td>`; };
  $("stab-table").innerHTML = `<thead><tr><th>offset c (data = c + score)</th><th>naive Σx² − (Σx)²/n</th><th>two-pass</th><th>Welford</th></tr></thead><tbody>
    ${offsets.map((c) => { const d = base.map((x) => x + c);
      return `<tr><td>${c === 0 ? "0" : c.toExponential(0).replace("e+", "·10^")}</td>${cell(naiveVariance(d))}${cell(twoPassVariance(d))}${cell(welfordVariance(d))}</tr>`; }).join("")}
    </tbody>`;
  $("stab-ref").textContent = f(ref, 6);
}

// =============================================================================
// Part 2 — sampling mean and variance
// =============================================================================
let R = null, D = null;

function renderDist() {
  D = DISTS.find((d) => d.id === $("dist").value);
  $("dist-desc").textContent = D.desc;
  if (D.discrete) {
    barChart($("dist-chart"), D.pmf, { labels: [...Array(11).keys()], xLabelEvery: 1, color: "var(--s2)", yFmt: (v) => v.toFixed(2), xTitle: "score" });
  } else {
    const rng = makeRng(1), xs = Array.from({ length: 50000 }, () => D.sample(rng));
    const edges = []; for (let e = 0; e <= 10 + 1e-9; e += 0.25) edges.push(e);
    histogram($("dist-chart"), xs, { edges, curve: D.pdf, W: 460, H: 220, color: "var(--s2)", xTicks: [0, 2, 4, 6, 8, 10], title: "50,000 draws vs exact density" });
  }
  const kurt = D.mu4 / D.s2 ** 2;
  $("dist-stats").innerHTML = `
    <div class="stat"><div class="v">${f(D.mu)}</div><div class="l">μ = E[X]</div></div>
    <div class="stat"><div class="v">${f(D.s2)}</div><div class="l">σ² = Var(X)</div></div>
    <div class="stat"><div class="v">${f(Math.sqrt(D.s2))}</div><div class="l">σ</div></div>
    <div class="stat"><div class="v">${f(kurt, 3)}</div><div class="l">kurtosis μ₄/σ⁴ (normal: 3)</div></div>`;
}

async function run() {
  renderDist();
  const m = +$("m").value, seed = parseInt($("seed").value, 10) || 1;
  $("run").disabled = true;
  const t0 = performance.now();
  R = await simulate({ dist: D, m, seed, onProgress: (x) => { $("progress").style.width = `${x * 100}%`; } });
  $("run-info").textContent = `${m.toLocaleString("en")} hackers × ${NS[NS.length - 1].toLocaleString("en")} systems, one Welford pass per hacker: ${((performance.now() - t0) / 1000).toFixed(1)} s (seed ${seed}).`;
  renderComparison();
  renderSpread();
  renderHistograms();
  renderTrajectories();
  $("run").disabled = false;
}

function renderComparison() {
  const m = R.m, s = Math.sqrt(D.s2);
  const rows = NS.map((n) => {
    const xb = R.mean[n], v = R.vars[n];
    const aM = avg(xb), aV = avg(v), seM = Math.sqrt(D.s2 / n / m), seV = Math.sqrt(varOfS2(D, n) / m);
    const aS = avg(Array.from(v, Math.sqrt)), aPop = (aV * (n - 1)) / n;
    return { n, aM, aV, seM, seV, aS, aPop, sdM: Math.sqrt(vr(xb)), sdV: Math.sqrt(vr(v)) };
  });
  $("cmp-table").innerHTML = `<thead><tr><th>n</th>
    <th>avg of x̄ ± 2 SE<br><span class="muted">vs μ = ${f(D.mu, 3)}</span></th>
    <th>avg of s² ± 2 SE<br><span class="muted">vs σ² = ${f(D.s2, 3)}</span></th>
    <th>avg of SS/n<br><span class="muted">vs σ²(n−1)/n</span></th>
    <th>avg of s<br><span class="muted">vs σ = ${f(s, 3)}</span></th>
    <th>SD of x̄ across hackers<br><span class="muted">vs σ/√n</span></th>
    <th>SD of s² across hackers<br><span class="muted">vs √Var(s²)</span></th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${r.n}</td>
      <td>${f(r.aM, 3)} ± ${f(2 * r.seM, 3)} ${ok(Math.abs(r.aM - D.mu) <= 3 * r.seM)}</td>
      <td>${f(r.aV, 3)} ± ${f(2 * r.seV, 3)} ${ok(Math.abs(r.aV - D.s2) <= 3 * r.seV)}</td>
      <td>${f(r.aPop, 3)} <span class="muted">(${f((D.s2 * (r.n - 1)) / r.n, 3)})</span></td>
      <td>${f(r.aS, 3)}</td>
      <td>${f(r.sdM, 3)} <span class="muted">(${f(s / Math.sqrt(r.n), 3)})</span></td>
      <td>${f(r.sdV, 3)} <span class="muted">(${f(Math.sqrt(varOfS2(D, r.n)), 3)})</span></td></tr>`).join("")}</tbody>`;

  lineChart($("mean-chart"), [
    { name: "average of the m sampling means", color: C[1], pts: rows.map((r) => [r.n, r.aM]), dots: true, noLine: true },
    { name: "μ", color: C[0], pts: [[2, D.mu], [1000, D.mu]] },
    { name: "μ ± 2σ/√(mn): Monte Carlo band", color: "var(--muted)", pts: NS.map((n) => [n, D.mu + 2 * Math.sqrt(D.s2 / n / m)]), dash: "4 3", width: 1.4 },
    { name: "", color: "var(--muted)", pts: NS.map((n) => [n, D.mu - 2 * Math.sqrt(D.s2 / n / m)]), dash: "4 3", width: 1.4 },
  ], { xLog: true, xTicks: NS, yTicks: ticks(D.mu, 2.6 * Math.sqrt(D.s2 / 2 / m)), yMin: D.mu - 2.6 * Math.sqrt(D.s2 / 2 / m), yMax: D.mu + 2.6 * Math.sqrt(D.s2 / 2 / m),
    yFmt: (v) => v.toFixed(3), xTitle: "n = systems per hacker (log scale)", yTitle: "average of x̄" });

  const lo = Math.min(D.s2 / 2, ...rows.map((r) => r.aPop)) * 0.97, hi = D.s2 + 2.6 * Math.sqrt(varOfS2(D, 2) / m);
  lineChart($("var-chart"), [
    { name: "average of s² = SS/(n−1)", color: C[2], pts: rows.map((r) => [r.n, r.aV]), dots: true, noLine: true },
    { name: "average of SS/n (biased)", color: C[4], pts: rows.map((r) => [r.n, r.aPop]), dots: true, noLine: true },
    { name: "σ²", color: C[0], pts: [[2, D.s2], [1000, D.s2]] },
    { name: "σ²(n−1)/n", color: C[4], pts: NS.map((n) => [n, (D.s2 * (n - 1)) / n]), dash: "6 4", width: 1.6 },
    { name: "σ² ± 2√(Var(s²)/m): Monte Carlo band", color: "var(--muted)", pts: NS.map((n) => [n, D.s2 + 2 * Math.sqrt(varOfS2(D, n) / m)]), dash: "4 3", width: 1.4 },
    { name: "", color: "var(--muted)", pts: NS.map((n) => [n, D.s2 - 2 * Math.sqrt(varOfS2(D, n) / m)]), dash: "4 3", width: 1.4 },
  ], { xLog: true, xTicks: NS, yMin: lo, yMax: hi, yTicks: ticks((lo + hi) / 2, (hi - lo) / 2), yFmt: (v) => v.toFixed(2),
    xTitle: "n = systems per hacker (log scale)", yTitle: "average variance estimate" });
}

function ticks(c, h) { return [c - h, c - h / 2, c, c + h / 2, c + h].map((v) => +v.toPrecision(6)); }

function renderSpread() {
  const pts = (arr) => NS.map((n) => [n, vr(arr[n])]);
  const all = [...NS.map((n) => D.s2 / n), ...NS.map((n) => varOfS2(D, n))];
  const e0 = Math.floor(Math.log10(Math.min(...all))) , e1 = Math.ceil(Math.log10(Math.max(...all)));
  const yT = []; for (let e = e0; e <= e1; e++) yT.push(10 ** e);
  lineChart($("spread-chart"), [
    { name: "Var of x̄ across hackers", color: C[1], pts: pts(R.mean), dots: true, noLine: true },
    { name: "theory σ²/n", color: C[1], pts: NS.map((n) => [n, D.s2 / n]), dash: "6 4", width: 1.6 },
    { name: "Var of s² across hackers", color: C[2], pts: pts(R.vars), dots: true, noLine: true },
    { name: "theory μ₄/n − σ⁴(n−3)/(n(n−1))", color: C[2], pts: NS.map((n) => [n, varOfS2(D, n)]), dash: "6 4", width: 1.6 },
  ], { xLog: true, yLog: true, xTicks: NS, yTicks: yT, yMin: 10 ** e0, yMax: 10 ** e1,
    yFmt: (v) => { const e = Math.round(Math.log10(v)); return e >= 0 && e <= 3 ? String(10 ** e) : "10" + String(e).replace("-", "⁻").replace(/\d/g, (c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[c]); },
    xTitle: "n = systems per hacker (log scale)", yTitle: "variance across hackers (log scale)" });
  const r1000 = Math.sqrt(varOfS2(D, 1000)) / D.s2, m1000 = Math.sqrt(D.s2 / 1000) / D.mu;
  $("spread-note").innerHTML = `At n = 1,000 the relative standard deviation is ${(100 * m1000).toFixed(1)}% for x̄ (σ/(μ√n)) and
    ${(100 * r1000).toFixed(1)}% for s² (≈ √((κ − 1)/n) with kurtosis κ = ${f(D.mu4 / D.s2 ** 2, 2)}). The precision of s² depends on the tails of the distribution through κ, that of x̄ only on σ/μ.`;
}

function renderHistograms() {
  const show = [5, 20, 200];
  const grid = $("hist-grid");
  grid.innerHTML = "";
  const rowsSpec = [
    { name: "Sampling mean x̄", data: R.mean, mean: () => D.mu, var: (n) => D.s2 / n, color: C[1], h: (n) => (D.discrete ? 1 / n : 0) },
    { name: "Sampling variance s²", data: R.vars, mean: () => D.s2, var: (n) => varOfS2(D, n), color: C[2], h: () => 0 },
  ];
  for (const spec of rowsSpec) {
    let x0 = Infinity, x1 = -Infinity;
    for (const n of show) {
      const sd = Math.sqrt(spec.var(n));
      x0 = Math.min(x0, Math.max(0, spec.mean() - 4 * sd)); x1 = Math.max(x1, spec.mean() + 4.5 * sd);
    }
    if (spec.name.startsWith("Sampling mean")) x1 = Math.min(x1, 10);
    const row = document.createElement("div");
    row.innerHTML = `<div class="chart-title">${spec.name} across the m hackers — same horizontal axis for every n (dashed: normal approximation)</div><div class="dist-row three"></div>`;
    grid.appendChild(row);
    for (const n of show) {
      const cell = document.createElement("div");
      row.querySelector(".dist-row").appendChild(cell);
      const h = spec.h(n);
      let w = (x1 - x0) / 50, start = x0;
      if (h) { w = h * Math.max(1, Math.ceil(w / h)); start = -h / 2 + Math.floor((x0 + h / 2) / w) * w; }
      const edges = []; for (let e = start; e < x1 + w; e += w) edges.push(e);
      const mu = spec.mean(), sd = Math.sqrt(spec.var(n));
      histogram(cell, spec.data[n], { edges, color: spec.color, title: `n = ${n}`,
        curve: (x) => Math.exp(-0.5 * ((x - mu) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI)),
        xTicks: [x0, (x0 + x1) / 2, x1].map((v) => +v.toPrecision(3)) });
      let below = 0; for (const v of spec.data[n]) if (v < mu) below++;
      const cap = document.createElement("p");
      cap.className = "caption";
      cap.textContent = `${((100 * below) / R.m).toFixed(0)}% of hackers below the true ${spec.name.includes("mean") ? "μ" : "σ²"}`;
      cell.appendChild(cap);
    }
  }
}

function renderTrajectories() {
  const K = +$("traj-k").value, s = Math.sqrt(D.s2);
  const mLo = Math.max(0, D.mu - 3.2 * s / Math.sqrt(2)), mHi = Math.min(10, D.mu + 3.2 * s / Math.sqrt(2));
  trajectories($("traj-mean"), R.pathMean, K, { f: (k, v) => v, yMin: mLo, yMax: mHi, yTicks: niceTicks(mLo, mHi),
    centre: () => D.mu, band: [(k) => D.mu - (2 * s) / Math.sqrt(k), (k) => D.mu + (2 * s) / Math.sqrt(k)], yTitle: "running x̄", xTitle: "systems attempted k" });
  const vHi = D.s2 * 3;
  trajectories($("traj-var"), R.pathVar, K, { f: (k, v) => v, yMin: 0, yMax: vHi, yTicks: niceTicks(0, vHi),
    centre: () => D.s2, band: [(k) => Math.max(0, D.s2 - 2 * Math.sqrt(varOfS2(D, Math.max(k, 2)))), (k) => D.s2 + 2 * Math.sqrt(varOfS2(D, Math.max(k, 2)))],
    yTitle: "running s²", xTitle: "systems attempted k" });
}

function niceTicks(a, b) {
  const raw = (b - a) / 4, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((x) => x * mag).find((x) => x >= raw);
  const out = []; for (let t = Math.ceil(a / step) * step; t <= b + 1e-9; t += step) out.push(+t.toPrecision(10));
  return out;
}

// =============================================================================
// Boot
// =============================================================================
DISTS.forEach((d) => $("dist").add(new Option(d.name, d.id)));
$("ex-run").onclick = workedExample;
$("ex-input").addEventListener("keydown", (e) => { if (e.key === "Enter") workedExample(); });
$("run").onclick = run;
$("dist").onchange = run;
$("traj-k").onchange = () => R && renderTrajectories();
workedExample();
stability();
run().catch((e) => { console.error(e); $("run-info").innerHTML = `<span class="bad">${e.message}</span>`; });
