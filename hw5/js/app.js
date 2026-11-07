// =============================================================================
// app.js — HW5 page logic
// =============================================================================

import { FUNCTIONS, levelIntervals } from "./functions.js";
import * as I from "./integrate.js";
import { thomaeUpper } from "./rational.js";
import * as NM from "./normal.js";
import { makeRng } from "../../hw3/js/rng.js";
import { lineChart } from "../../hw3/js/charts4.js";
import { el } from "../../hw1/js/charts.js";

const $ = (id) => document.getElementById(id);
const C = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)", "var(--muted)"];
const REG = FUNCTIONS.filter((F) => !F.pathological);
const fe = (v) => (v === 0 ? "0" : !isFinite(v) ? "∞" : v.toExponential(1));
const fv = (v, d = 8) => (!isFinite(v) ? "∞" : v.toFixed(d));
const sup = (e) => String(e).replace("-", "⁻").replace(/\d/g, (c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[c]);
const pow10 = (v) => { const e = Math.round(Math.log10(v)); return e === 0 ? "1" : e === 1 ? "10" : `10${sup(e)}`; };
const decades = (a, b) => { const t = []; for (let e = a; e <= b; e++) t.push(10 ** e); return t; };

// =============================================================================
// Ex. 1 — picture: vertical strips vs horizontal layers
// =============================================================================
function drawPicture() {
  const F = REG.find((f) => f.id === $("pic-f").value), N = +$("pic-n").value;
  const T = isFinite(F.ymax) ? F.ymax : 6;                  // plot range for 1/√x
  for (const kind of ["riemann", "lebesgue"]) {
    const box = $(`pic-${kind}`), W = 440, H = 280, m = { l: 34, r: 10, t: 10, b: 26 };
    box.innerHTML = "";
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img" }, box);
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const X = (x) => m.l + ((x - F.a) / (F.b - F.a)) * iw, Y = (y) => m.t + ih - (Math.min(y, T * 1.05) / (T * 1.05)) * ih;
    if (kind === "riemann") {
      const h = (F.b - F.a) / N;
      for (let k = 0; k < N; k++) {
        const x0 = F.a + k * h, y = F.f(x0 + h / 2);
        el("rect", { x: X(x0), y: Y(y), width: Math.max(0.5, X(x0 + h) - X(x0) - 0.6), height: Y(0) - Y(y), fill: "var(--s2)", opacity: 0.35, stroke: "var(--s2)", "stroke-width": 0.6 }, svg);
      }
    } else {
      const dt = T / N;
      for (let j = 0; j < N; j++) {
        const t = (j + 0.5) * dt;
        for (const [u, v] of levelIntervals(F, t)) {
          el("rect", { x: X(u), y: Y((j + 1) * dt), width: Math.max(0.5, X(v) - X(u)), height: Y(j * dt) - Y((j + 1) * dt) - 0.6, fill: "var(--s3)", opacity: 0.35, stroke: "var(--s3)", "stroke-width": 0.6 }, svg);
        }
      }
      // highlight the preimage of one level on the x-axis
      const tj = (Math.floor(N / 2) + 0.5) * dt;
      for (const [u, v] of levelIntervals(F, tj)) el("rect", { x: X(u), y: Y(0) + 3, width: Math.max(1, X(v) - X(u)), height: 5, fill: "var(--s1)" }, svg);
      el("line", { x1: m.l, x2: W - m.r, y1: Y(tj), y2: Y(tj), stroke: "var(--s1)", "stroke-dasharray": "4 3" }, svg);
    }
    // curve
    let d = "";
    for (let i = 0; i <= 400; i++) {
      const x = F.a + ((F.b - F.a) * (i + 0.001)) / 400.002, y = F.f(x);
      d += `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(y).toFixed(1)}`;
    }
    el("path", { d, fill: "none", stroke: "var(--text)", "stroke-width": 1.6 }, svg);
    el("line", { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), stroke: "var(--muted)" }, svg);
    for (const x of [F.a, (F.a + F.b) / 2, F.b]) el("text", { x: X(x), y: H - 6, "text-anchor": "middle", "font-size": 11 }, svg).textContent = +x.toFixed(2);
    for (const y of [0, T / 2, T]) el("text", { x: m.l - 5, y: Y(y) + 4, "text-anchor": "end", "font-size": 11 }, svg).textContent = +y.toFixed(2);
  }
  const R = I.riemann(F, N, "mid"), L = I.lebesgueLevels(F, N, "mid");
  $("pic-cap").innerHTML = `${N} vertical strips (midpoint Riemann sum) = <b>${fv(R.value, 6)}</b> · ${N} horizontal layers (Lebesgue midpoint sum) = <b>${fv(L.value, 6)}</b>
    · exact = ${F.exactLabel}. ${isFinite(F.ymax) ? "" : `The range is cut at T = √${N} ≈ ${L.T.toFixed(2)} for the Lebesgue sum (plot shows up to 6).`}
    In the right panel the red bar on the x-axis is the preimage {x : f(x) &gt; t} of the dashed level t: its length is a <i>measure</i>.`;
}

// =============================================================================
// Ex. 1 — accuracy, convergence, efficiency
// =============================================================================
const NLIST = [10, 30, 100, 300, 1000, 3000, 10000];
const MC_REPS = 20;

function runMethods(F, N) {
  const t = (fn) => { const t0 = performance.now(); const r = fn(); r.ms = performance.now() - t0; return r; };
  const out = {
    left: t(() => I.riemann(F, N, "left")),
    mid: t(() => I.riemann(F, N, "mid")),
    darboux: t(() => I.darboux(F, N)),
    lebMid: t(() => I.lebesgueLevels(F, N, "mid")),
    lebLow: t(() => I.lebesgueLevels(F, N, "lower")),
    lebUp: t(() => I.lebesgueLevels(F, N, "upper")),
    grid: t(() => I.lebesgueGrid(F, N)),
  };
  const rng = makeRng(1000 + N);
  out.mc = t(() => { let e = 0, v = 0; for (let r = 0; r < MC_REPS; r++) { const x = I.monteCarlo(F, N, rng).value; v += x; e += Math.abs(x - F.exact); } return { value: v / MC_REPS, meanAbsErr: e / MC_REPS, evals: N }; });
  out.mc.ms /= MC_REPS;
  return out;
}

const METHOD_LABELS = [
  ["left", "Riemann, left endpoints", "R"], ["mid", "Riemann, midpoints", "R"],
  ["lebMid", "Lebesgue, exact level sets (midpoint levels)", "L"], ["lebLow", "Lebesgue lower sum", "L"], ["lebUp", "Lebesgue upper sum", "L"],
  ["grid", "Lebesgue, level sets measured by counting grid points", "L"], ["mc", "Monte Carlo (measure estimated by random points)", "L"],
];
const err = (r, F, k) => (k === "mc" ? r.meanAbsErr : Math.abs(r.value - F.exact));

function renderEx1() {
  const F = REG.find((f) => f.id === $("res-f").value);
  const res = NLIST.map((N) => ({ N, r: runMethods(F, N) }));
  // table
  $("res-table").innerHTML = `<thead><tr><th>N (strips / levels / points)</th>${METHOD_LABELS.map(([, l]) => `<th>${l}</th>`).join("")}<th>Darboux [L, U]</th></tr></thead><tbody>
    ${res.map(({ N, r }) => `<tr><td>${N.toLocaleString("en")}</td>${METHOD_LABELS.map(([k]) => `<td>${fv(k === "mc" ? r.mc.value : r[k].value, 7)}<br><span class="muted">err ${fe(err(r[k], F, k))} · ${r[k].evals.toLocaleString("en")} evals</span></td>`).join("")}
      <td>[${fv(r.darboux.lower, 6)}, ${fv(r.darboux.upper, 6)}]<br><span class="muted">U − L = ${fe(r.darboux.upper - r.darboux.lower)}</span></td></tr>`).join("")}</tbody>`;
  // convergence chart: error vs number of f evaluations
  const series = METHOD_LABELS.filter(([k]) => k !== "lebUp").map(([k, l], i) => ({
    name: l, color: C[i], dots: true, dash: k === "lebLow" ? "4 3" : "",
    pts: res.map(({ r }) => [Math.max(1, r[k].evals), err(r[k], F, k)]).filter(([, e]) => e > 0 && isFinite(e)),
  }));
  series.push({ name: "Darboux gap U − L (Riemann)", color: C[6], dots: true, dash: "2 3", pts: res.map(({ r }) => [r.darboux.evals || r.mid.evals, r.darboux.upper - r.darboux.lower]).filter(([, e]) => e > 0 && isFinite(e)) });
  const allE = series.flatMap((s) => s.pts.map(([, e]) => e)), allX = series.flatMap((s) => s.pts.map(([x]) => x));
  const y0 = Math.max(-17, Math.floor(Math.log10(Math.min(...allE)))), y1 = Math.ceil(Math.log10(Math.max(...allE)));
  const x0 = Math.floor(Math.log10(Math.min(...allX))), x1 = Math.ceil(Math.log10(Math.max(...allX)));
  lineChart($("res-chart"), series, { xLog: true, yLog: true, xMin: 10 ** x0, xMax: 10 ** x1, yMin: 10 ** y0, yMax: 10 ** y1,
    xTicks: decades(x0, x1), yTicks: decades(y0, y1).filter((_, i, a) => a.length < 10 || i % 2 === 0), xFmt: pow10, yFmt: pow10,
    xTitle: "cost: number of evaluations of f (log scale)", yTitle: "|error| (log scale)" });
  // observed orders (slope of log error vs log N over the last 3 points)
  const order = (k) => {
    const errs = res.slice(-4).map(({ r }) => err(r[k], F, k));
    if (errs.some((e) => !isFinite(e))) return "diverges (∞)";
    if (Math.max(...errs) < 1e-12) return "exact (round-off)";
    if (Math.min(...errs) < 1e-12) return "exact for some N";
    const pts = res.slice(-4).map(({ N, r }) => [Math.log(N), Math.log(err(r[k], F, k))]);
    const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const b = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
    return Math.abs(b) < 0.15 && Math.exp(my) < 1e-13 ? "exact (round-off)" : (-b).toFixed(2);
  };
  const last = res[res.length - 1].r;
  $("res-orders").innerHTML = METHOD_LABELS.map(([k, l]) => `<div class="stat"><div class="v">${order(k)}</div><div class="l">${l}: order p (error ∝ N⁻ᵖ)<br>time at N = 10⁴: ${last[k].ms.toFixed(2)} ms</div></div>`).join("");
}

function renderSummary() {
  const N = 1000;
  const rows = REG.map((F) => {
    const r = runMethods(F, N);
    const best = Math.min(...METHOD_LABELS.map(([k]) => err(r[k], F, k)));
    return `<tr><td>${F.label}</td><td>${F.exactLabel}</td>${METHOD_LABELS.map(([k]) => { const e = err(r[k], F, k); return `<td class="${e === best ? "best" : ""}">${fe(e)}</td>`; }).join("")}
      <td>${fe(r.darboux.upper - r.darboux.lower)}</td></tr>`;
  });
  $("sum-table").innerHTML = `<thead><tr><th>f</th><th>exact</th>${METHOD_LABELS.map(([, l]) => `<th>${l}</th>`).join("")}<th>Darboux U − L</th></tr></thead><tbody>${rows.join("")}</tbody>`;
}

function renderPathological() {
  const D = FUNCTIONS.find((f) => f.id === "dirichlet"), Th = FUNCTIONS.find((f) => f.id === "thomae");
  const Ns = [10, 100, 1000, 10000, 100000];
  $("path-table").innerHTML = `<thead><tr><th>N</th><th>Dirichlet: Riemann, rational tags</th><th>Dirichlet: Riemann, irrational tags</th><th>Dirichlet: Darboux [L, U]</th>
    <th>Thomae: Riemann, rational midpoints</th><th>Thomae: Riemann, irrational tags</th><th>Thomae: Darboux [L, U]</th></tr></thead><tbody>
    ${Ns.map((N) => { const a = I.pathological(D, N), b = I.pathological(Th, N);
      return `<tr><td>${N.toLocaleString("en")}</td><td>${a.riemannRational}</td><td>${a.riemannIrrational}</td><td>[${a.lower}, ${a.upper}]</td>
        <td>${b.riemannRational.toExponential(2)}</td><td>${b.riemannIrrational}</td><td>[0, ${b.upper.toFixed(5)}]</td></tr>`; }).join("")}</tbody>`;
  const Nt = [10, 30, 100, 300, 1000, 3000, 10000, 30000, 100000];
  lineChart($("thomae-chart"), [
    { name: "upper Darboux sum U(N)", color: C[1], dots: true, pts: Nt.map((N) => [N, thomaeUpper(N)]) },
    { name: "Riemann sum, rational midpoints", color: C[2], dots: true, pts: Nt.map((N) => [N, I.pathological(Th, N).riemannRational]) },
    { name: "reference slope N⁻¹", color: C[6], dash: "5 4", pts: [[10, 0.1], [1e5, 1e-5]] },
  ], { xLog: true, yLog: true, xTicks: decades(1, 5), yTicks: decades(-5, 0), xMin: 10, xMax: 1e5, yMin: 1e-5, yMax: 1, xFmt: pow10, yFmt: pow10,
    xTitle: "N subintervals (log scale)", yTitle: "value (exact integral = 0)" });
  // the floating-point trap: every double is a dyadic rational
  const show = [0.1, Math.SQRT2, Math.PI].map((x) => {
    const bits = new DataView(new ArrayBuffer(8)); bits.setFloat64(0, x);
    const hi = bits.getUint32(0), lo = bits.getUint32(4), exp = ((hi >>> 20) & 0x7ff) - 1075;
    const mant = (BigInt(hi & 0xfffff) | 0x100000n) << 32n | BigInt(lo);
    let num = mant, den = 1n << BigInt(-exp);
    while (num % 2n === 0n && den > 1n) { num /= 2n; den /= 2n; }
    return `<tr><td class="mono">${x === 0.1 ? "0.1" : x === Math.SQRT2 ? "Math.SQRT2 (√2)" : "Math.PI (π)"}</td><td class="mono wrap-ok">${num} / 2^${den.toString(2).length - 1}</td></tr>`;
  });
  $("float-table").innerHTML = `<thead><tr><th>JavaScript value</th><th>exact rational number actually stored</th></tr></thead><tbody>${show.join("")}</tbody>`;
}

// =============================================================================
// Ex. 2 — normal CDF
// =============================================================================
let REF = null;

function renderPointsTable() {
  const nist = { 0.5: 0.19146, 1: 0.34134, 1.96: 0.475, 2: 0.47725, 3: 0.49865, 4: 0.49997 };
  const show = ["hybrid", "as26217", "simpson", "taylor"];
  const ms = NM.METHODS.filter((m) => show.includes(m.id));
  $("pts-table").innerHTML = `<thead><tr><th>x</th><th>reference Φ(x) (mpmath, 20 digits)</th><th>NIST table (0.5 + area 0→x)</th>
    ${ms.map((m) => `<th>${m.name}<br><span class="muted">value · relative error</span></th>`).join("")}</tr></thead><tbody>
    ${REF.points.map((p) => { const ref = Number(p.phi);
      return `<tr><td>${p.x}</td><td class="mono">${p.phi.slice(0, 22)}</td><td>${nist[p.x] !== undefined ? (0.5 + nist[p.x]).toFixed(5) : "—"}</td>
      ${ms.map((m) => { const v = m.fn(p.x).value, e = Math.abs(v - ref) / ref; return `<td class="mono ${e > 1e-6 ? "bad" : ""}">${v.toPrecision(12)}<br><span class="muted">${fe(e)}</span></td>`; }).join("")}</tr>`; }).join("")}</tbody>`;
}

function renderAccuracy() {
  const series = NM.METHODS.map((m, i) => ({
    name: m.name, color: C[i % C.length], dash: i >= 5 ? "4 3" : "",
    pts: REF.grid.map((r) => { const ref = Number(r.phi), v = m.fn(r.x).value; const e = Math.abs(v - ref) / ref; return [r.x, Math.min(10, Math.max(1e-17, e))]; }),
  }));
  lineChart($("acc-chart"), series, { yLog: true, xMin: -10, xMax: 10, yMin: 1e-17, yMax: 10, xTicks: [-10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10],
    yTicks: [1e-16, 1e-12, 1e-8, 1e-4, 1], yFmt: pow10, xFmt: (v) => v, xTitle: "x", yTitle: "relative error of Φ(x) (log scale)", W: 700, H: 330 });
}

function renderConvergence() {
  const x = 1.96, ref = Number(REF.points.find((p) => p.x === 1.96).phi), ns = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];
  lineChart($("conv-chart"), [
    { name: "trapezoidal rule", color: C[0], dots: true, pts: ns.map((n) => [n, Math.abs(NM.trapezoid(x, n).value - ref)]).filter(([, e]) => e > 0) },
    { name: "Simpson's rule", color: C[1], dots: true, pts: ns.map((n) => [n, Math.abs(NM.simpson(x, n).value - ref)]).filter(([, e]) => e > 0) },
    { name: "slope −2", color: C[6], dash: "5 4", pts: [[2, 2e-2], [1024, 2e-2 / 512 ** 2]] },
    { name: "slope −4", color: C[6], dash: "2 3", pts: [[2, 1e-3], [256, 1e-3 / 128 ** 4]] },
  ], { xLog: true, yLog: true, xTicks: [2, 8, 32, 128, 512], yTicks: decades(-16, -1).filter((_, i) => i % 3 === 0), xMin: 2, xMax: 1024, yMin: 1e-16, yMax: 0.1,
    yFmt: pow10, xTitle: "number of subintervals n (log scale)", yTitle: "|error| at x = 1.96" });
  const xs = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  $("terms-table").innerHTML = `<thead><tr><th>x</th>${xs.map((v) => `<th>${v}</th>`).join("")}</tr></thead><tbody>
    <tr><td>Taylor series terms</td>${xs.map((v) => `<td>${NM.seriesTaylor(v).terms}</td>`).join("")}</tr>
    <tr><td>positive series terms</td>${xs.map((v) => `<td>${NM.seriesPositive(v).terms}</td>`).join("")}</tr>
    <tr><td>continued-fraction levels</td>${xs.map((v) => `<td>${NM.tailCF(v).terms}</td>`).join("")}</tr></tbody>`;
}

function renderSwitch() {
  const rows = [1.5, 2, 2.5, 3, 4].map((sw) => {
    NM.setSwitch(sw);
    let worst = 0, maxT = 0;
    for (const r of REF.grid) {
      const v = NM.phiHybrid(r.x); maxT = Math.max(maxT, v.terms);
      // error of the SMALLER of Φ and 1 − Φ: what tail probabilities need
      const small = r.x < 0 ? Number(r.phi) : Number(r.q);
      const got = r.x < 0 ? v.value : (Math.abs(r.x) < sw ? 0.5 - 0.5 * NM.erfPositive(Math.abs(r.x) / Math.SQRT2).value : NM.tailCF(r.x).value);
      worst = Math.max(worst, Math.abs(got - small) / small);
    }
    return `<tr${sw === 2 ? ' class="final"' : ""}><td>${sw}</td><td>${fe(worst)}</td><td>${maxT}</td></tr>`;
  });
  NM.setSwitch(2);
  $("switch-table").innerHTML = `<thead><tr><th>switch point s</th><th>worst relative error of the tail probability min(Φ, 1 − Φ) on [−10, 10]</th><th>max terms / levels</th></tr></thead><tbody>${rows.join("")}</tbody>`;
}

async function benchmark() {
  $("bench-run").disabled = true;
  const rows = [];
  const xs = Float64Array.from({ length: 20000 }, (_, i) => -6 + 12 * ((i * 0.6180339887) % 1));
  for (const m of NM.METHODS) {
    let s = 0, reps = 0;
    const t0 = performance.now();
    do { for (const x of xs) s += m.fn(x).value; reps++; } while (performance.now() - t0 < 120);
    const ns = ((performance.now() - t0) / (reps * xs.length)) * 1e6;
    rows.push({ m, ns, s });
    await new Promise((r) => setTimeout(r, 0));
  }
  const fastest = Math.min(...rows.map((r) => r.ns));
  $("bench-table").innerHTML = `<thead><tr><th>Method</th><th>time per evaluation</th><th>relative to fastest</th><th>max relative error on [−10, 10]</th></tr></thead><tbody>
    ${rows.map(({ m, ns }) => { let worst = 0; for (const r of REF.grid) { const ref = Number(r.phi); worst = Math.max(worst, Math.abs(m.fn(r.x).value - ref) / ref); }
      return `<tr><td>${m.name}</td><td>${ns.toFixed(0)} ns</td><td>× ${(ns / fastest).toFixed(1)}</td><td class="${worst > 1e-6 ? "bad" : "ok"}">${fe(worst)}</td></tr>`; }).join("")}</tbody>`;
  $("bench-run").disabled = false;
}

// =============================================================================
// Boot
// =============================================================================
for (const sel of ["pic-f", "res-f"]) REG.forEach((F) => $(sel).add(new Option(F.label, F.id)));
$("pic-f").onchange = drawPicture;
$("pic-n").oninput = () => { $("pic-n-v").textContent = $("pic-n").value; drawPicture(); };
$("res-f").onchange = renderEx1;
$("bench-run").onclick = benchmark;
drawPicture();
renderEx1();
renderSummary();
renderPathological();
fetch("data/phi-reference.json").then((r) => r.json()).then(async (ref) => {
  REF = ref;
  renderPointsTable();
  renderAccuracy();
  renderConvergence();
  renderSwitch();
  await benchmark();
}).catch((e) => { console.error(e); $("pts-table").innerHTML = `<tr><td class="bad">Cannot load reference values: ${e.message}</td></tr>`; });
