// =============================================================================
// app.js — HW6 page logic: datasets → contingency table → χ² test → reading
// =============================================================================

import * as CT from "./contingency.js";
import { makeRng } from "../../hw3/js/rng.js";
import { histogram } from "../../hw3/js/charts4.js";
import { el } from "../../hw1/js/charts.js";

const $ = (id) => document.getElementById(id);
const COLORS = ["var(--s2)", "var(--s1)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)", "var(--muted)"];
const pct = (v, d = 1) => (isFinite(v) ? `${(100 * v).toFixed(d)}%` : "—");
const num = (v, d = 2) => (Math.abs(v) >= 1e4 ? v.toLocaleString("en", { maximumFractionDigits: 0 }) : v.toFixed(d));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const fmtP = (p) => {
  if (!isFinite(p.log10)) return "—";
  if (p.value >= 1e-4) return p.value.toFixed(4);
  const e = Math.floor(p.log10), m = 10 ** (p.log10 - e);
  return `${m.toFixed(2)} × 10<sup>${e}</sup>`;
};

// -----------------------------------------------------------------------------
// Data loading: a small CSV parser (header row, comma or semicolon, \n or \r\n)
// -----------------------------------------------------------------------------
export function parseCSV(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return { header: [], records: [] };
  const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ";" : ",";
  const split = (l) => l.split(sep).map((v) => v.trim().replace(/^"(.*)"$/, "$1"));
  const header = split(lines[0]);
  const records = lines.slice(1).map((l) => { const v = split(l); return Object.fromEntries(header.map((h, i) => [h, v[i] ?? ""])); });
  return { header, records };
}

const cache = {};
async function load(file) {
  if (!cache[file]) cache[file] = parseCSV(await (await fetch(`data/${file}`)).text());
  return cache[file];
}

/** Synthetic data: X and F drawn INDEPENDENTLY, so H₀ is true by construction. */
function synthetic(n, seed) {
  const rng = makeRng(seed);
  const pick = (cats, probs) => { const u = rng(); let s = 0; for (let i = 0; i < cats.length; i++) { s += probs[i]; if (u < s) return cats[i]; } return cats[cats.length - 1]; };
  const recs = [];
  for (let k = 0; k < n; k++) recs.push({ "user role": pick(["employee", "contractor", "admin"], [0.7, 0.2, 0.1]), "login hour": pick(["office hours", "evening", "night"], [0.6, 0.3, 0.1]) });
  return { header: ["user role", "login hour"], records: recs };
}

/** Merges categories whose marginal share is below `share` into "other (rare)". */
function mergeRare(records, key, share) {
  const cnt = new Map();
  for (const r of records) cnt.set(r[key], (cnt.get(r[key]) || 0) + 1);
  const rare = new Set([...cnt].filter(([, c]) => c / records.length < share).map(([k]) => k));
  if (rare.size < 2) return { records, merged: [] };
  return { records: records.map((r) => (rare.has(r[key]) ? { ...r, [key]: "other (rare)" } : r)), merged: [...rare] };
}

const DATASETS = {
  "nsl-proto": { label: "NSL-KDD — protocol × label (normal / attack)", file: "nsl-kdd-train20.csv", x: "protocol", f: "label" },
  "nsl-flag": { label: "NSL-KDD — connection flag × traffic category", file: "nsl-kdd-train20.csv", x: "flag", f: "category", rareOption: true },
  "ucb-all": { label: "Berkeley 1973 — gender × admission (all departments)", file: "ucb-admissions-1973.csv", x: "gender", f: "admission", orderX: ["Male", "Female"], orderF: ["Admitted", "Rejected"] },
  "ucb-dept": { label: "Berkeley 1973 — gender × admission within one department", file: "ucb-admissions-1973.csv", x: "gender", f: "admission", orderX: ["Male", "Female"], orderF: ["Admitted", "Rejected"], dept: true },
  "synthetic": { label: "Synthetic — two variables generated independently", synthetic: true },
  "custom": { label: "Your data — paste a CSV", custom: true },
};

// -----------------------------------------------------------------------------
// Main pipeline
// -----------------------------------------------------------------------------
let T = null, current = null;

async function run() {
  const key = $("ds").value, D = DATASETS[key];
  for (const id of ["opt-dept", "opt-synth", "opt-custom", "opt-rare"]) $(id).hidden = true;
  $("opt-dept").hidden = !D.dept; $("opt-synth").hidden = !D.synthetic; $("opt-custom").hidden = !D.custom; $("opt-rare").hidden = !D.rareOption;
  let data, xKey = D.x, fKey = D.f, note = "";
  if (D.synthetic) {
    data = synthetic(+$("synth-n").value, +$("synth-seed").value || 1);
    xKey = "user role"; fKey = "login hour";
  } else if (D.custom) {
    data = parseCSV($("custom-csv").value);
    fillColumnSelectors(data.header);
    xKey = $("custom-x").value; fKey = $("custom-f").value;
    if (!data.records.length || xKey === fKey) { $("analysis").innerHTML = `<p class="bad">Paste a CSV with a header row and choose two different columns.</p>`; return; }
  } else {
    data = await load(D.file);
  }
  let records = data.records;
  if (D.dept) records = records.filter((r) => r.department === $("dept").value);
  if (D.rareOption && $("rare").checked) {
    const a = mergeRare(records, xKey, 0.01); records = a.records;
    const b = mergeRare(records, fKey, 0.01); records = b.records;
    const m = [...a.merged, ...b.merged];
    if (m.length) note = `Merged into “other (rare)” because they cover less than 1% of the records: ${m.map(esc).join(", ")}.`;
  }
  T = CT.buildTable(records, xKey, fKey, D.orderX, D.orderF);
  current = { key, D, records, xKey, fKey, header: data.header, note };
  renderAll();
}

function fillColumnSelectors(header) {
  for (const id of ["custom-x", "custom-f"]) {
    const sel = $(id), prev = sel.value;
    if ([...sel.options].map((o) => o.value).join() === header.join()) continue;
    sel.innerHTML = header.map((h) => `<option>${esc(h)}</option>`).join("");
    if (header.includes(prev)) sel.value = prev;
  }
  // default: the last two columns (a first column is often just an identifier)
  if ($("custom-x").value === $("custom-f").value && header.length > 1) { $("custom-x").value = header[header.length - 2]; $("custom-f").value = header[header.length - 1]; }
}

// -----------------------------------------------------------------------------
// Rendering
// -----------------------------------------------------------------------------
function table(title, cellFn, { rowTotals, colTotals, corner = "", note = "" }) {
  const head = `<tr><th>${esc(current.xKey)} \\ ${esc(current.fKey)}</th>${T.fs.map((f) => `<th>${esc(f)}</th>`).join("")}${rowTotals ? `<th>${rowTotals.label}</th>` : ""}</tr>`;
  const body = T.xs.map((x, i) => `<tr><td><b>${esc(x)}</b></td>${T.fs.map((_, j) => `<td>${cellFn(i, j)}</td>`).join("")}${rowTotals ? `<td class="tot">${rowTotals.fn(i)}</td>` : ""}</tr>`).join("");
  const foot = colTotals ? `<tr class="tot"><td>${colTotals.label}</td>${T.fs.map((_, j) => `<td>${colTotals.fn(j)}</td>`).join("")}${rowTotals ? `<td>${corner}</td>` : ""}</tr>` : "";
  return `<div><div class="chart-title">${title}</div><div class="table-wrap"><table class="ct">${head}${body}${foot}</table></div>${note ? `<p class="caption">${note}</p>` : ""}</div>`;
}

function heat(v) {
  // Pearson residual → background colour: red = more than expected, blue = fewer
  const a = Math.min(1, Math.abs(v) / 6) * 0.55;
  return v >= 0 ? `background: color-mix(in srgb, var(--s1) ${Math.round(a * 100)}%, transparent)` : `background: color-mix(in srgb, var(--s2) ${Math.round(a * 100)}%, transparent)`;
}

function renderAll() {
  const { records, xKey, fKey, note } = current;
  // raw records
  const prev = records.slice(0, 6);
  $("raw").innerHTML = `<p class="caption">${records.length.toLocaleString("en")} records (observations); first ${prev.length} shown. Only the two columns
    <b>X = ${esc(xKey)}</b> and <b>F = ${esc(fKey)}</b> are used.</p>
    <div class="table-wrap"><table class="preview"><tr><th>#</th><th>X = ${esc(xKey)}</th><th>F = ${esc(fKey)}</th></tr>
    ${prev.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r[xKey])}</td><td>${esc(r[fKey])}</td></tr>`).join("")}</table></div>
    ${note ? `<p class="caption">${note}</p>` : ""}`;

  const n = T.n;
  $("tables-1").innerHTML =
    table("Observed counts nᵢⱼ (the contingency table)", (i, j) => T.counts[i][j].toLocaleString("en"),
      { rowTotals: { label: "nᵢ.", fn: (i) => T.rowTot[i].toLocaleString("en") }, colTotals: { label: "n.ⱼ", fn: (j) => T.colTot[j].toLocaleString("en") }, corner: `n = ${n.toLocaleString("en")}` }) +
    table("Joint and marginal relative frequencies nᵢⱼ / n", (i, j) => pct(T.joint[i][j]),
      { rowTotals: { label: "marginal of X", fn: (i) => pct(T.rowMarg[i]) }, colTotals: { label: "marginal of F", fn: (j) => pct(T.colMarg[j]) }, corner: "100%" });
  $("tables-2").innerHTML =
    table(`Conditional frequencies of F given X: f(F | X = xᵢ) = nᵢⱼ / nᵢ.`, (i, j) => pct(T.condFgivenX[i][j]),
      { rowTotals: { label: "row sum", fn: () => "100%" }, colTotals: { label: "marginal of F", fn: (j) => pct(T.colMarg[j]) }, corner: "100%",
        note: "Under independence every row would equal the bottom row (the marginal distribution of F)." }) +
    table(`Conditional frequencies of X given F: f(X | F = fⱼ) = nᵢⱼ / n.ⱼ`, (i, j) => pct(T.condXgivenF[i][j]),
      { rowTotals: { label: "marginal of X", fn: (i) => pct(T.rowMarg[i]) }, colTotals: { label: "column sum", fn: () => "100%" },
        note: "Under independence every column would equal the right-hand column (the marginal distribution of X)." });
  $("tables-3").innerHTML =
    table("Expected counts under independence Eᵢⱼ = nᵢ. · n.ⱼ / n", (i, j) => `<span class="${T.expected[i][j] < 5 ? "bad" : ""}">${num(T.expected[i][j])}</span>`,
      { rowTotals: { label: "nᵢ.", fn: (i) => T.rowTot[i].toLocaleString("en") }, colTotals: { label: "n.ⱼ", fn: (j) => T.colTot[j].toLocaleString("en") }, corner: n.toLocaleString("en"),
        note: "Same margins as the observed table; red values are below 5." }) +
    table("Pearson residuals (Oᵢⱼ − Eᵢⱼ)/√Eᵢⱼ and contributions to χ²", (i, j) => `<span style="${heat(T.resid[i][j])};padding:2px 4px;border-radius:4px">${T.resid[i][j] >= 0 ? "+" : ""}${num(T.resid[i][j])}</span><span class="cell-sub">${num(T.contrib[i][j], 1)}</span>`,
      { colTotals: null, note: "Red: more observations than independence predicts; blue: fewer. Small number: the cell's share of χ² = Σ residual²." });

  renderStats();
  renderBars();
  $("perm-out").innerHTML = ""; $("perm-chart").innerHTML = ""; $("perm-progress").style.width = "0";
  renderSimpson();
}

function renderStats() {
  const crit = CT.chiSquareCritical(T.df, 0.05);
  const reject = T.p.value < 0.05;
  const cells = T.r * T.c, share = T.smallE / cells;
  $("stats").innerHTML = `
    <div class="stat"><div class="v">${T.n.toLocaleString("en")}</div><div class="l">n (observations)</div></div>
    <div class="stat"><div class="v">${num(T.chi2, 3)}</div><div class="l">χ² = Σ (O − E)²/E</div></div>
    <div class="stat"><div class="v">${T.df}</div><div class="l">degrees of freedom (r−1)(c−1) = (${T.r}−1)(${T.c}−1)</div></div>
    <div class="stat"><div class="v">${fmtP(T.p)}</div><div class="l">p-value P(χ²<sub>${T.df}</sub> ≥ ${num(T.chi2, 1)})</div></div>
    <div class="stat"><div class="v">${num(crit, 3)}</div><div class="l">critical value at α = 0.05</div></div>
    <div class="stat"><div class="v">${T.cramersV.toFixed(3)}</div><div class="l">Cramér's V (strength, 0 … 1)</div></div>
    <div class="stat"><div class="v">${num(T.minE)}</div><div class="l">smallest expected count</div></div>`;
  const strength = T.cramersV < 0.1 ? "negligible" : T.cramersV < 0.3 ? "weak" : T.cramersV < 0.5 ? "moderate" : "strong";
  let warn = "";
  if (share > 0.2 || T.minE < 1) warn = `<div class="warn-box"><b>Approximation not reliable:</b> ${T.smallE} of ${cells} cells (${pct(share, 0)}) have an expected count below 5
    ${T.minE < 1 ? "and at least one is below 1" : ""} (Cochran's rule: at most 20% below 5, none below 1). The χ² distribution may be a poor model for the statistic here:
    group rare categories${current.D.rareOption ? " (checkbox above)" : ""} or use the permutation test below.</div>`;
  $("decision").className = `decision ${reject ? "dep" : "ind"}`;
  $("decision").innerHTML = reject
    ? `<b>Reject H₀ (independence) at α = 0.05:</b> χ² = ${num(T.chi2, 2)} &gt; ${num(crit, 2)}, p = ${fmtP(T.p)}. The data are not compatible with
       independence: <b>${esc(current.xKey)}</b> and <b>${esc(current.fKey)}</b> are statistically <b>associated</b>; the strength of the association is
       ${strength} (V = ${T.cramersV.toFixed(2)}).`
    : `<b>Do not reject H₀ at α = 0.05:</b> χ² = ${num(T.chi2, 2)} ≤ ${num(crit, 2)}, p = ${fmtP(T.p)}. The observed deviations from independence are of the
       size expected by chance. This does <i>not</i> prove independence: it means the data give no evidence of association (V = ${T.cramersV.toFixed(2)}).`;
  $("decision-warn").innerHTML = warn;
}

/** 100%-stacked bars: one per category of X, plus the marginal distribution of F. */
function renderBars() {
  const box = $("bars"), rows = [...T.xs.map((x, i) => ({ label: x, p: T.condFgivenX[i], n: T.rowTot[i] })), { label: "all (marginal)", p: T.colMarg, n: T.n, marg: true }];
  const W = 680, rowH = 26, m = { l: 130, r: 70, t: 6 }, H = m.t + rows.length * (rowH + 8) + 6;
  box.innerHTML = "";
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Conditional distributions of F for each category of X" }, box);
  const iw = W - m.l - m.r;
  rows.forEach((row, k) => {
    const y = m.t + k * (rowH + 8);
    if (row.marg) el("line", { x1: m.l - 4, x2: W - m.r + 4, y1: y - 4, y2: y - 4, stroke: "var(--muted)", "stroke-dasharray": "3 3" }, svg);
    el("text", { x: m.l - 8, y: y + rowH / 2 + 4, "text-anchor": "end", "font-size": 12, style: row.marg ? "font-weight:600;fill:var(--text)" : "fill:var(--text)" }, svg).textContent = String(row.label).slice(0, 18);
    let x0 = m.l;
    row.p.forEach((p, j) => {
      const w = p * iw;
      if (w > 0) {
        const rect = el("rect", { x: x0, y, width: Math.max(0, w - 1), height: rowH, fill: COLORS[j % COLORS.length], opacity: 0.85 }, svg);
        el("title", {}, rect).textContent = `${row.label} → ${T.fs[j]}: ${pct(p)}`;
        if (w > 34) el("text", { x: x0 + w / 2, y: y + rowH / 2 + 4, "text-anchor": "middle", "font-size": 10.5, style: "fill:#fff" }, svg).textContent = pct(p, 0);
      }
      x0 += w;
    });
    el("text", { x: W - m.r + 8, y: y + rowH / 2 + 4, "font-size": 11 }, svg).textContent = `n = ${row.n.toLocaleString("en")}`;
  });
  const lg = document.createElement("div");
  lg.className = "legend";
  lg.innerHTML = T.fs.map((f, j) => `<span><i style="border-top:10px solid ${COLORS[j % COLORS.length]};width:14px"></i>${esc(f)}</span>`).join("");
  box.appendChild(lg);
}

async function permutation() {
  if (!T) return;
  const B = +$("perm-b").value;
  $("perm-run").disabled = true;
  const res = await CT.permutationTest(T, B, makeRng(+$("synth-seed").value || 7), (f) => { $("perm-progress").style.width = `${f * 100}%`; });
  $("perm-progress").style.width = "100%";
  const sims = res.sims, max = Math.max(...sims, CT.chiSquareCritical(T.df, 0.001));
  const edges = []; const w = max / 50; for (let e = 0; e <= max + w; e += w) edges.push(e);
  histogram($("perm-chart"), sims, { edges, curve: (x) => CT.chiSquarePdf(x, T.df), W: 680, H: 240, color: "var(--s4)",
    title: `${B.toLocaleString("en")} permutations · dashed: χ²(${T.df}) density`, xTicks: [0, max / 4, max / 2, (3 * max) / 4, max].map((v) => +v.toFixed(1)) });
  const beyond = T.chi2 > max;
  $("perm-out").innerHTML = `
    <div class="stat-row">
      <div class="stat"><div class="v">${num(T.chi2, 2)}</div><div class="l">observed χ² ${beyond ? "(far to the right of every simulated value)" : ""}</div></div>
      <div class="stat"><div class="v">${res.atLeast} / ${B}</div><div class="l">permutations with χ² ≥ observed</div></div>
      <div class="stat"><div class="v">${res.p < 0.001 ? "&lt; " + (1 / (B + 1)).toExponential(1) : res.p.toFixed(4)}</div><div class="l">permutation p-value (≥ 1/(B+1))</div></div>
      <div class="stat"><div class="v">${fmtP(T.p)}</div><div class="l">asymptotic χ² p-value</div></div>
    </div>`;
  $("perm-run").disabled = false;
}

/** Simpson's paradox panel (Berkeley data, always shown). */
async function renderSimpson() {
  const { records } = await load("ucb-admissions-1973.csv");
  const rows = [];
  for (const d of ["A", "B", "C", "D", "E", "F", "all"]) {
    const recs = d === "all" ? records : records.filter((r) => r.department === d);
    const t = CT.buildTable(recs, "gender", "admission", ["Male", "Female"], ["Admitted", "Rejected"]);
    rows.push({ d, t, men: t.condFgivenX[0][0], women: t.condFgivenX[1][0], appM: t.rowTot[0], appW: t.rowTot[1], rate: t.colMarg[0] });
  }
  const allM = rows[6].appM, allW = rows[6].appW;
  $("simpson").innerHTML = `<thead><tr><th>Department</th><th>admission rate overall</th><th>share of men's applications</th><th>share of women's applications</th>
    <th>admitted: men</th><th>admitted: women</th><th>χ² (df 1)</th><th>p-value</th></tr></thead><tbody>
    ${rows.map(({ d, t, men, women, appM, appW, rate }) => `<tr${d === "all" ? ' class="final"' : ""}><td>${d === "all" ? "All departments (aggregated)" : d}</td><td>${pct(rate)}</td>
      <td>${d === "all" ? "100%" : pct(appM / allM)}</td><td>${d === "all" ? "100%" : pct(appW / allW)}</td>
      <td>${pct(men)}</td><td>${pct(women)}</td><td>${num(t.chi2, 2)}</td><td class="${t.p.value < 0.05 ? "bad" : ""}">${fmtP(t.p)}</td></tr>`).join("")}</tbody>`;
}

// -----------------------------------------------------------------------------
// Boot
// -----------------------------------------------------------------------------
Object.entries(DATASETS).forEach(([k, d]) => $("ds").add(new Option(d.label, k)));
$("custom-csv").value = `incident_id,initial_vector,severity
1,phishing,high
2,phishing,low
3,vulnerability,high
4,credentials,medium
5,phishing,medium
6,vulnerability,high
7,credentials,low
8,phishing,low
9,vulnerability,medium
10,credentials,high`;
for (const id of ["ds", "dept", "synth-n", "rare", "custom-x", "custom-f"]) $(id).addEventListener("change", run);
$("synth-seed").addEventListener("change", run);
$("custom-run").onclick = run;
$("perm-run").onclick = permutation;
run().catch((e) => { console.error(e); $("analysis").innerHTML = `<p class="bad">Error: ${esc(e.message)}</p>`; });
