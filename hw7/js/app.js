// =============================================================================
// app.js — HW7 page logic
// =============================================================================

import { EXAMPLES, CHECKS, N_MAX, runConvergence, runSqrtN, SQRT_CHECKS } from "./convergence.js";
import * as B from "./bayes.js";
import { makeRng } from "../../hw3/js/rng.js";
import { lineChart, trajectories } from "../../hw3/js/charts4.js";

const $ = (id) => document.getElementById(id);
const C = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)", "var(--muted)"];
const pct = (v, d = 2) => `${(100 * v).toFixed(d)}%`;
const sup = (e) => String(e).replace("-", "⁻").replace(/\d/g, (c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[c]);
const pow10 = (v) => { const e = Math.round(Math.log10(v)); return Math.abs(Math.log10(v) - e) > 1e-9 ? String(+v.toPrecision(2)) : e === 0 ? "1" : e === 1 ? "10" : e === 2 ? "100" : e === 3 ? "1000" : `10${sup(e)}`; };
const decades = (a, b) => { const t = []; for (let e = a; e <= b; e++) t.push(10 ** e); return t; };
const yes = (b) => (b ? `<b class="ok">yes</b>` : `<b class="bad">no</b>`);

// =============================================================================
// Part 1 — modes of convergence
// =============================================================================
let CV = null;

async function convergenceRun() {
  const key = $("cv-ex").value, eps = +$("cv-eps").value, m = +$("cv-m").value;
  $("cv-run").disabled = true;
  CV = { key, eps, res: await runConvergence(key, m, eps, 2026, 30, (f) => { $("cv-progress").style.width = `${f * 100}%`; }) };
  $("cv-progress").style.width = "100%";
  renderConvergence();
  $("cv-run").disabled = false;
}

function renderConvergence() {
  const { key, eps, res } = CV, E = EXAMPLES[key], th = E.theory || {};
  const K = +$("cv-k").value;
  const [y0, y1] = E.yRange;
  trajectories($("cv-paths"), res.paths, K, { f: (k, v) => v, yMin: y0, yMax: y1, yTicks: niceTicks(y0, y1),
    centre: key === "flip" ? null : () => E.limit({}), band: key === "flip" ? null : [() => E.limit({}) - eps, () => E.limit({}) + eps],
    xTitle: "n", yTitle: "Xₙ(ω) for 30 paths ω" });
  const M = res.metrics;
  lineChart($("cv-chart"), [
    { name: "in probability: P(|Xₙ − X| > ε)", color: C[1], dots: true, pts: M.map((r) => [r.n, r.p]) },
    { name: "almost surely: P(sup_{k≥n} |Xₖ − X| > ε)", color: C[0], dots: true, pts: M.map((r) => [r.n, r.as]) },
    { name: key === "flip" ? "in distribution: KS distance between the laws" : "in distribution: distance of the laws (away from the atom)", color: C[2], dots: true, dash: "4 3", pts: M.map((r) => [r.n, r.ks]) },
  ], { xLog: true, xTicks: [1, 10, 100, 1000, 5000], xFmt: pow10, yMin: 0, yMax: 1, yTicks: [0, 0.25, 0.5, 0.75, 1], yFmt: (v) => v.toFixed(2),
    xTitle: "n (log scale)", yTitle: "probability / distance" });
  const l2 = M.map((r) => [r.n, r.l2]).filter(([, v]) => v > 0);
  const l2th = th.l2 ? CHECKS.map((n) => [n, th.l2(n)]) : [];
  const all = [...l2, ...l2th].map(([, v]) => v);
  const e0 = Math.floor(Math.log10(Math.min(...all))), e1 = Math.ceil(Math.log10(Math.max(...all)));
  lineChart($("cv-l2"), [
    { name: "mean square: E[(Xₙ − X)²], simulated", color: C[3], dots: true, noLine: true, pts: l2 },
    { name: "exact value", color: C[3], dash: "5 4", pts: l2th },
  ], { xLog: true, yLog: true, xTicks: [1, 10, 100, 1000, 5000], xFmt: pow10, yTicks: decades(e0, Math.max(e1, e0 + 1)), yFmt: pow10,
    yMin: 10 ** e0, yMax: 10 ** Math.max(e1, e0 + 1), xTitle: "n (log scale)", yTitle: "E[(Xₙ − X)²] (log scale)" });
  const last = M[M.length - 1];
  const obs = { p: last.p < 0.01, as: last.as < 0.01 && key !== "bern", l2: last.l2 < 0.01 && !(th.l2 && th.l2(5000) > 1), d: last.ks < 0.05 };
  $("cv-verdict").innerHTML = `<thead><tr><th></th><th>almost surely</th><th>in probability</th><th>in mean square (L²)</th><th>in distribution</th></tr></thead><tbody>
    <tr><td>theory</td>${["as", "p", "l2", "d"].map((k) => `<td>${yes(E.modes[k])}</td>`).join("")}</tr>
    <tr><td>at n = 5,000 (simulation)</td><td>${pct(last.as, 1)}</td><td>${pct(last.p, 1)}</td><td>${last.l2.toPrecision(3)}${th.l2 ? ` <span class="muted">(exact ${th.l2(5000).toPrecision(3)})</span>` : ""}</td><td>${last.ks.toFixed(3)}</td></tr></tbody>`;
  $("cv-note").innerHTML = NOTES[key];
}

const NOTES = {
  mean: `The strong law of large numbers in action: every path settles inside the band and stays there, so all four modes hold. E[(X̄ₙ − ½)²] = 1/(12n) is the
    variance of the mean — mean-square convergence and the weak law follow from it via Chebyshev.`,
  bern: `<b>In probability and in L² but not almost surely.</b> P(Xₙ = 1) = 1/n → 0, yet Σ 1/n = ∞ and the Xₙ are independent, so by the second
    Borel–Cantelli lemma ones keep appearing forever on almost every path: P(sup_{k≥n} Xₖ = 1) = 1 for every n. With a finite horizon N = ${N_MAX.toLocaleString("en")}
    the simulation shows 1 − (n − 1)/N, which tends to 1 as N → ∞.`,
  spike: `<b>Almost surely and in probability but not in L².</b> On each path U(ω) &gt; 0, so Xₙ(ω) = 0 as soon as n &gt; 1/U(ω): the paths die out. But the rare
    non-zero values are huge: E[Xₙ²] = n² · (1/n) = n → ∞. The simulation's estimate of E[Xₙ²] even drops to 0 for large n, because no path out of m has U ≤ 1/n —
    a warning that averages can miss rare, extreme events.`,
  flip: `<b>Only in distribution.</b> Xₙ = −Z has exactly the law N(0, 1) of Z, so the laws coincide (KS ≈ 0, sampling noise only). Yet |Xₙ − Z| = 2|Z| never shrinks:
    P(|Xₙ − Z| &gt; ε) = P(|Z| &gt; ε/2) for every n. Convergence in distribution compares <i>laws</i>, not the values of the variables.`,
};

function niceTicks(a, b) {
  const raw = (b - a) / 4, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((x) => x * mag).find((x) => x >= raw);
  const out = []; for (let t = Math.ceil(a / step) * step; t <= b + 1e-9; t += step) out.push(+t.toPrecision(10));
  return out;
}

async function sqrtRun() {
  $("sq-run").disabled = true;
  const r = await runSqrtN(+$("sq-m").value, 99, (f) => { $("sq-progress").style.width = `${f * 100}%`; });
  $("sq-progress").style.width = "100%";
  const xs = SQRT_CHECKS, dense = []; for (let e = 0; e <= 4.0001; e += 0.1) dense.push(10 ** e);
  lineChart($("sq-chart"), [
    { name: "independent N(0,1)", color: C[1], dots: true, noLine: true, pts: xs.map((n, i) => [n, r.iid[i]]) },
    { name: "theory σ/√n", color: C[1], dash: "5 4", pts: dense.map((n) => [n, 1 / Math.sqrt(n)]) },
    { name: "equicorrelated, ρ = 0.01", color: C[2], dots: true, noLine: true, pts: xs.map((n, i) => [n, r.r001[i]]) },
    { name: "theory σ√((1 + (n−1)ρ)/n), ρ = 0.01", color: C[2], dash: "5 4", pts: dense.map((n) => [n, Math.sqrt((1 + (n - 1) * 0.01) / n)]) },
    { name: "equicorrelated, ρ = 0.1", color: C[3], dots: true, noLine: true, pts: xs.map((n, i) => [n, r.r01[i]]) },
    { name: "theory, ρ = 0.1", color: C[3], dash: "5 4", pts: dense.map((n) => [n, Math.sqrt((1 + (n - 1) * 0.1) / n)]) },
    { name: "independent Cauchy (no finite variance)", color: C[0], dots: true, pts: xs.map((n, i) => [n, r.cauchy[i]]) },
  ], { xLog: true, yLog: true, xTicks: decades(0, 4), yTicks: [0.01, 0.03, 0.1, 0.3, 1, 3], xMin: 1, xMax: 1e4, yMin: 0.006, yMax: 3, xFmt: pow10,
    yFmt: (v) => String(v), xTitle: "n (log scale)", yTitle: "spread of X̄ₙ (log scale)" });
  $("sq-run").disabled = false;
}

// =============================================================================
// Part 2 — Bayes
// =============================================================================
function baseRate() {
  const prior = +$("br-prior").value, tpr = +$("br-tpr").value / 100, fpr = +$("br-fpr").value / 100;
  $("br-prior-v").textContent = prior < 0.001 ? `1 in ${Math.round(1 / prior).toLocaleString("en")}` : pct(prior, 2);
  const r = B.alertPosterior(prior, tpr, fpr);
  const N = 1_000_000, att = prior * N, tp = tpr * att, fp = fpr * (N - att);
  $("br-stats").innerHTML = `
    <div class="stat"><div class="v">${pct(prior, prior < 0.01 ? 3 : 1)}</div><div class="l">prior P(attack) — base rate</div></div>
    <div class="stat"><div class="v">${pct(tpr, 1)} / ${pct(fpr, 2)}</div><div class="l">likelihoods P(alert | attack) / P(alert | benign)</div></div>
    <div class="stat"><div class="v">${pct(r.ppv, 2)}</div><div class="l"><b>posterior P(attack | alert)</b></div></div>
    <div class="stat"><div class="v">${(r.missed * 100).toExponential(1)}%</div><div class="l">posterior P(attack | no alert)</div></div>`;
  $("br-table").innerHTML = `<thead><tr><th>Out of ${N.toLocaleString("en")} events</th><th>alert</th><th>no alert</th><th>total</th></tr></thead><tbody>
    <tr><td>attack</td><td>${Math.round(tp).toLocaleString("en")}</td><td>${Math.round(att - tp).toLocaleString("en")}</td><td>${Math.round(att).toLocaleString("en")}</td></tr>
    <tr><td>benign</td><td>${Math.round(fp).toLocaleString("en")}</td><td>${Math.round(N - att - fp).toLocaleString("en")}</td><td>${Math.round(N - att).toLocaleString("en")}</td></tr>
    <tr class="final"><td>total</td><td>${Math.round(tp + fp).toLocaleString("en")}</td><td>${Math.round(N - tp - fp).toLocaleString("en")}</td><td>${N.toLocaleString("en")}</td></tr></tbody>`;
  $("br-reading").innerHTML = `Of the ${Math.round(tp + fp).toLocaleString("en")} alerts, only ${Math.round(tp).toLocaleString("en")} are real attacks:
    <b>${pct(r.ppv, 2)}</b>. The detector is accurate, but benign events are so many more than attacks that even a ${pct(fpr, 2)} false-positive rate produces
    ${(fp / Math.max(tp, 1e-9)).toFixed(0)} false alarms per true one.`;
  const priors = []; for (let e = -6; e <= -0.3; e += 0.05) priors.push(10 ** e);
  lineChart($("br-chart"), [
    { name: "P(attack | alert), current detector", color: C[0], pts: priors.map((p) => [p, B.alertPosterior(p, tpr, fpr).ppv]) },
    { name: "detector with 10× fewer false positives", color: C[1], dash: "5 4", pts: priors.map((p) => [p, B.alertPosterior(p, tpr, fpr / 10).ppv]) },
    { name: "current base rate", color: C[6], dash: "2 3", pts: [[prior, 0], [prior, 1]] },
  ], { xLog: true, xTicks: decades(-6, 0).slice(0, -1).concat([0.5]), xMin: 1e-6, xMax: 0.5, xFmt: (v) => (v >= 0.01 ? pct(v, 0) : pow10(v)), yMin: 0, yMax: 1,
    yTicks: [0, 0.25, 0.5, 0.75, 1], yFmt: (v) => pct(v, 0), xTitle: "base rate P(attack) (log scale)", yTitle: "P(attack | alert)" });
  const s = B.sequentialAlerts(prior, tpr, fpr, 3);
  $("br-seq").innerHTML = `<thead><tr><th>independent detectors alerting</th>${s.probs.map((_, i) => `<th>${i}</th>`).join("")}</tr></thead><tbody>
    <tr><td>P(attack | alerts)</td>${s.probs.map((p) => `<td>${pct(p, 2)}</td>`).join("")}</tr></tbody>`;
  $("br-lr").textContent = s.lr.toFixed(0);
}

const PRIORS = {
  uniform: { a: 1, b: 1, label: "Uniform Beta(1, 1): no prior information" },
  jeffreys: { a: 0.5, b: 0.5, label: "Jeffreys Beta(½, ½): objective default" },
  past: { a: 3, b: 27, label: "Informative Beta(3, 27): past campaigns ≈ 10%, worth 30 employees" },
  strong: { a: 40, b: 360, label: "Strong Beta(40, 360): ≈ 10%, worth 400 employees" },
  wrong: { a: 40, b: 10, label: "Badly wrong Beta(40, 10): believes ≈ 80%" },
  custom: { label: "Custom Beta(a, b)" },
};

function betaBinomial() {
  const n = Math.max(0, Math.round(+$("bb-n").value)), k = Math.min(n, Math.max(0, Math.round(+$("bb-k").value))), t = +$("bb-t").value / 100;
  $("bb-k").value = k;
  const key = $("bb-prior").value;
  $("bb-custom").hidden = key !== "custom";
  const a = key === "custom" ? Math.max(0.01, +$("bb-a").value) : PRIORS[key].a, b = key === "custom" ? Math.max(0.01, +$("bb-b").value) : PRIORS[key].b;
  const post = B.betaPosterior(a, b, k, n), w = B.wilson(k, n);
  const grid = []; for (let i = 1; i < 600; i++) grid.push(i / 600);
  const top = Math.min(1, Math.max(post.ci[1] * 1.8, 0.25, (a / (a + b)) * 1.6));
  const g = grid.filter((p) => p <= top);
  const dens = (f) => g.map((p) => [p, Math.min(f(p), 200)]);
  const prior = dens((p) => B.betaPdf(p, a, b)), lik = n ? dens((p) => B.likelihoodDensity(p, k, n)) : [], postD = dens((p) => B.betaPdf(p, post.A, post.B));
  const yMax = Math.min(60, Math.max(...[...prior, ...lik, ...postD].map(([, v]) => v)) * 1.08);
  lineChart($("bb-chart"), [
    { name: `prior Beta(${a}, ${b})`, color: C[1], dash: "5 4", pts: prior },
    { name: "likelihood L(p) ∝ pᵏ(1−p)ⁿ⁻ᵏ (rescaled)", color: C[4], dash: "2 3", pts: lik },
    { name: `posterior Beta(${+post.A.toFixed(2)}, ${+post.B.toFixed(2)})`, color: C[0], pts: postD, width: 2.6 },
  ], { xMin: 0, xMax: top, yMin: 0, yMax, xTicks: niceTicks(0, top), xFmt: (v) => pct(v, 0), yTicks: niceTicks(0, yMax), yFmt: (v) => String(+v.toFixed(1)),
    xTitle: "p = probability that an employee clicks", yTitle: "density" });
  const pAbove = 1 - B.betaCdf(t, post.A, post.B);
  $("bb-stats").innerHTML = `
    <div class="stat"><div class="v">${n ? pct(k / n, 1) : "—"}</div><div class="l">frequentist estimate k/n (MLE)</div></div>
    <div class="stat"><div class="v">[${pct(w[0], 1)}, ${pct(w[1], 1)}]</div><div class="l">95% Wilson confidence interval</div></div>
    <div class="stat"><div class="v">${pct(post.mean, 1)}</div><div class="l">posterior mean</div></div>
    <div class="stat"><div class="v">[${pct(post.ci[0], 1)}, ${pct(post.ci[1], 1)}]</div><div class="l">95% credible interval</div></div>
    <div class="stat"><div class="v">${pct(pAbove, 1)}</div><div class="l">P(p &gt; ${pct(t, 0)} | data)</div></div>
    <div class="stat"><div class="v">${pct(post.priorWeight, 0)}</div><div class="l">weight of the prior in the posterior mean</div></div>`;
  $("bb-formula").innerHTML = `posterior mean = ${post.priorWeight.toFixed(3)} × prior mean ${(a / (a + b)).toFixed(3)} + ${(1 - post.priorWeight).toFixed(3)} × k/n ${n ? (k / n).toFixed(3) : "—"} = <b>${post.mean.toFixed(3)}</b>`;
}

let SL = null;
function sequentialRun() {
  const pTrue = +$("sl-p").value / 100, seed = +$("sl-seed").value || 1, rng = makeRng(seed);
  const N = 1000, xs = [], hits = [0];
  for (let i = 1; i <= N; i++) hits.push(hits[i - 1] + (rng() < pTrue ? 1 : 0));
  const ns = [0]; for (let e = 0; e <= 3.0001; e += 0.05) { const v = Math.round(10 ** e); if (v !== ns[ns.length - 1]) ns.push(v); }
  const analysts = [{ name: "analyst A: uniform prior Beta(1, 1)", a: 1, b: 1, color: C[1] }, { name: "analyst B: badly wrong prior Beta(40, 10)", a: 40, b: 10, color: C[0] }];
  const series = [];
  for (const an of analysts) {
    const post = ns.map((n) => [n, B.betaPosterior(an.a, an.b, hits[n], n)]);
    series.push({ name: an.name + " — posterior mean", color: an.color, pts: post.map(([n, p]) => [Math.max(n, 0.8), p.mean]) });
    series.push({ name: "", color: an.color, dash: "3 3", width: 1.2, pts: post.map(([n, p]) => [Math.max(n, 0.8), p.ci[0]]) });
    series.push({ name: "", color: an.color, dash: "3 3", width: 1.2, pts: post.map(([n, p]) => [Math.max(n, 0.8), p.ci[1]]) });
  }
  series.push({ name: "true p", color: C[6], dash: "6 4", pts: [[0.8, pTrue], [N, pTrue]] });
  series.push({ name: "dashed: 95% credible intervals", color: C[6], pts: [] });
  lineChart($("sl-chart"), series, { xLog: true, xMin: 0.8, xMax: N, xTicks: [1, 10, 100, 1000], xFmt: pow10, yMin: 0, yMax: 1, yTicks: [0, 0.25, 0.5, 0.75, 1],
    yFmt: (v) => pct(v, 0), xTitle: "employees observed so far (log scale)", yTitle: "belief about p" });
  const sdA = ns.filter((n) => n >= 1).map((n) => [n, B.betaPosterior(1, 1, hits[n], n).sd]);
  lineChart($("sl-sd"), [
    { name: "posterior SD, analyst A", color: C[1], pts: sdA },
    { name: "√(p(1 − p)/n): the frequentist standard error", color: C[6], dash: "5 4", pts: sdA.map(([n]) => [n, Math.sqrt((pTrue * (1 - pTrue)) / n)]) },
  ], { xLog: true, yLog: true, xMin: 1, xMax: N, xTicks: [1, 10, 100, 1000], yTicks: [0.01, 0.03, 0.1, 0.3], yMin: 0.008, yMax: 0.5, xFmt: pow10, yFmt: (v) => String(v),
    xTitle: "n (log scale)", yTitle: "posterior SD (log scale)" });
  const snap = [0, 5, 20, 100, 1000];
  $("sl-table").innerHTML = `<thead><tr><th>after n employees</th>${snap.map((n) => `<th>${n} (${hits[n]} clicks)</th>`).join("")}</tr></thead><tbody>
    ${analysts.map((an) => `<tr><td>${an.name.split(":")[0]}</td>${snap.map((n) => { const p = B.betaPosterior(an.a, an.b, hits[n], n); return `<td>${pct(p.mean, 1)} <span class="muted">[${pct(p.ci[0], 0)}, ${pct(p.ci[1], 0)}]</span></td>`; }).join("")}</tr>`).join("")}</tbody>`;
}

// =============================================================================
// Boot
// =============================================================================
Object.entries(EXAMPLES).forEach(([k, e]) => $("cv-ex").add(new Option(e.name, k)));
Object.entries(PRIORS).forEach(([k, p]) => $("bb-prior").add(new Option(p.label, k)));
$("bb-prior").value = "past";
$("cv-run").onclick = convergenceRun;
for (const id of ["cv-ex", "cv-eps", "cv-m"]) $(id).onchange = convergenceRun;
$("cv-k").onchange = () => CV && renderConvergence();
$("sq-run").onclick = sqrtRun;
for (const id of ["br-prior", "br-tpr", "br-fpr"]) $(id).oninput = baseRate;
for (const id of ["bb-n", "bb-k", "bb-t", "bb-prior", "bb-a", "bb-b"]) $(id).oninput = betaBinomial;
$("bb-prior").onchange = betaBinomial;
for (const id of ["sl-p", "sl-seed"]) $(id).oninput = sequentialRun;
document.querySelectorAll("[data-bb]").forEach((b) => b.addEventListener("click", () => { const [n, k] = b.dataset.bb.split(","); $("bb-n").value = n; $("bb-k").value = k; betaBinomial(); }));
baseRate();
betaBinomial();
sequentialRun();
convergenceRun().then(sqrtRun).catch((e) => console.error(e));
