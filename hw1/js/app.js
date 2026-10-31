// =============================================================================
// app.js — Wires the page together: inputs, tables, animation, statistics.
// =============================================================================

import * as EC from "./ec.js";
import * as ST from "./stats.js";
import { barChart, scatter } from "./charts.js";
import { Animator } from "./viz.js";

const $ = (id) => document.getElementById(id);
const C17 = EC.TOY17;

// -----------------------------------------------------------------------------
// Section 1 — Setup: curve, base point G, private key k
// -----------------------------------------------------------------------------
const pts17 = EC.allPoints(C17);
const orders17 = pts17.map((P) => EC.pointOrder(P, C17));

function setupInputs() {
  const sel = $("g-select");
  pts17.forEach((P, i) => {
    const o = new Option(`${EC.fmt(P)} — order ${orders17[i]}`, i);
    if (P.x === 1n && P.y === 5n) o.selected = true; // G = (1, 5) as in the assignment
    sel.add(o);
  });
  $("curve-count").textContent = `${pts17.length} affine points + O = ${pts17.length + 1} points`;
}

function currentG() { return pts17[+$("g-select").value]; }
function currentK() {
  const v = $("k-input").value.trim();
  if (!/^\d+$/.test(v) || BigInt(v) < 1n) throw new Error("k must be a positive integer");
  return BigInt(v);
}

// -----------------------------------------------------------------------------
// Sections 2–3 — Compute and print G, 2G, ..., kG  and  double-and-add
// -----------------------------------------------------------------------------
function computeAll() {
  let G, k;
  try { G = currentG(); k = currentK(); $("k-error").textContent = ""; }
  catch (e) { $("k-error").textContent = e.message; return; }
  const n = EC.pointOrder(G, C17);
  $("g-info").innerHTML = `G = ${EC.fmt(G)} is on the curve: <b class="ok">${EC.isOnCurve(G, C17)}</b> · order of G: <b>n = ${n}</b>
     (so k·G depends only on k mod n = ${k % n})`;

  // Method 1 (required): repeated addition, shown only for small k
  const MAX_NAIVE = 200n;
  const body = $("naive-body");
  body.innerHTML = "";
  if (k <= MAX_NAIVE) {
    for (const m of EC.multiplesNaive(k, G, C17)) {
      const tr = body.insertRow();
      if (m.i === k) tr.className = "final";
      tr.innerHTML = `<td>${m.i}G</td><td class="mono">${EC.fmt(m.point)}</td>
        <td>${m.log.case}</td><td class="mono">${m.log.lambda ?? "—"}</td>`;
    }
    $("naive-note").textContent = "";
  } else {
    $("naive-note").textContent = `k > ${MAX_NAIVE}: the step-by-step list is skipped (it would need ${k - 1n} additions). Use double-and-add below.`;
  }

  // Method 2 (faster): double-and-add, O(log k)
  const da = EC.doubleAndAdd(k, G, C17);
  $("da-bits").innerHTML = `k = ${k} = <span class="mono">${da.bits}</span><sub>2</sub> (${da.bits.length} bits) →
    ${da.trace.length} group operations instead of ${k - 1n}`;
  const db = $("da-body");
  db.innerHTML = "";
  da.trace.forEach((t, i) => {
    const tr = db.insertRow();
    tr.innerHTML = `<td>${i + 1}</td><td class="mono">${t.bit}</td><td>${t.op === "double" ? "R ← 2R" : "R ← R + G"}</td>
      <td class="mono">${t.acc}G</td><td class="mono">${EC.fmt(t.to)}</td>`;
  });
  const Q = da.result;
  $("pubkey").innerHTML = `TOY PUBLIC KEY &nbsp; Q = ${k}·G = <b>${EC.fmt(Q)}</b>`;
  $("check").innerHTML = `Q on curve: <b class="ok">${EC.isOnCurve(Q, C17)}</b>`;

  anim.prepare($("anim-method").value, k, G);
  renderToySubgroup(G, n);
}

// -----------------------------------------------------------------------------
// Section 4 — Animation (Guru)
// -----------------------------------------------------------------------------
const anim = new Animator({ svgBox: $("anim-svg"), panel: $("anim-panel"), bitsBox: $("anim-bits"), curve: C17 });

function setupAnimation() {
  $("anim-play").onclick = () => anim.play();
  $("anim-step").onclick = () => { anim.stop(); anim.step(); };
  $("anim-reset").onclick = () => anim.reset();
  $("anim-method").onchange = () => { try { anim.prepare($("anim-method").value, currentK(), currentG()); } catch {} };
  $("anim-speed").oninput = (e) => { anim.speed = 2600 - +e.target.value; };
  anim.speed = 2600 - +$("anim-speed").value;
}

// -----------------------------------------------------------------------------
// Section 5.1 — Statistics on the assignment's curve (p = 17)
// -----------------------------------------------------------------------------
function renderToyOrders() {
  // How are the orders of the 17 affine points distributed? (Lagrange: they divide 18)
  const f = ST.frequencies(orders17.map(Number));
  const keys = [...f.keys()].sort((a, b) => a - b);
  $("orders-table").innerHTML = `<tr><th>order of point</th>${keys.map((k) => `<td>${k}</td>`).join("")}</tr>
    <tr><th>number of points</th>${keys.map((k) => `<td>${f.get(k)}</td>`).join("")}</tr>`;
}

function renderToySubgroup(G, n) {
  const xs = [], ys = [];
  for (let k = 1n; k < n; k++) { const P = EC.scalarMult(k, G, C17); xs.push(Number(P.x)); ys.push(Number(P.y)); }
  const fx = new Array(17).fill(0), fy = new Array(17).fill(0);
  xs.forEach((v) => fx[v]++); ys.forEach((v) => fy[v]++);
  const lab = [...Array(17).keys()];
  barChart($("toy-x-chart"), fx, { labels: lab, xLabelEvery: 1, color: "var(--accent-2)", xTitle: "x coordinate" });
  barChart($("toy-y-chart"), fy, { labels: lab, xLabelEvery: 1, color: "var(--accent)", xTitle: "y coordinate" });
  const distinctX = fx.filter((c) => c > 0).length;
  $("toy-x-summary").innerHTML = `G = ${EC.fmt(G)}, n = ${n}: the ${Number(n) - 1} points k·G (k = 1…${n - 1n})
    use only <b>${distinctX}</b> distinct x values out of 17 — each one (except a point with y = 0) appears exactly twice,
    because (n − k)G = −kG has the same x.`;
}

// -----------------------------------------------------------------------------
// Section 5.2 — Statistics on a larger toy curve (p = 2089, prime order n = 2143)
// -----------------------------------------------------------------------------
function largerCurveStats() {
  const C = EC.TOY2089;
  const P0 = EC.allPoints(C)[0];
  C.G = P0;
  const n = EC.pointOrder(P0, C);
  const p = Number(C.p);
  const NB = 12; // p < 2^12
  $("big-params").innerHTML = `y² = x³ + 7 (mod ${C.p}), G = ${EC.fmt(P0)}, #E = n = ${n} (prime → cofactor 1, every point ≠ O is a generator)`;

  // Sequential walk k = 1 … n−1 (one addition per step)
  const ks = [], xs = [], ys = [];
  let R = EC.INF;
  for (let k = 1; k < Number(n); k++) { R = EC.add(R, P0, C); ks.push(k); xs.push(Number(R.x)); ys.push(Number(R.y)); }
  const N = xs.length;

  // (a) distribution of coordinates: 16 bins + chi-square
  const BINS = 16;
  const hx = ST.histogram(xs, p, BINS), hy = ST.histogram(ys, p, BINS);
  const cx = ST.chiSquareUniform(hx), cy = ST.chiSquareUniform(hy);
  const binLab = [...Array(BINS).keys()].map((i) => Math.round((i * p) / BINS));
  barChart($("big-x-hist"), hx, { labels: binLab, refLine: N / BINS, xLabelEvery: 2, xTitle: "x (bin start)" });
  barChart($("big-y-hist"), hy, { labels: binLab, refLine: N / BINS, xLabelEvery: 2, color: "var(--accent)", xTitle: "y (bin start)" });
  $("big-chi").innerHTML = `
    <div class="stat"><div class="v">${cx.stat.toFixed(2)}</div><div class="l">χ² (x), df = ${cx.df}</div></div>
    <div class="stat"><div class="v">${cx.pValue.toFixed(3)}</div><div class="l">p-value (x)</div></div>
    <div class="stat"><div class="v">${cy.stat.toFixed(2)}</div><div class="l">χ² (y), df = ${cy.df}</div></div>
    <div class="stat"><div class="v">${cy.pValue.toFixed(3)}</div><div class="l">p-value (y)</div></div>`;

  // (b) frequency of individual values
  const fx = ST.frequencies(xs);
  const mult = ST.frequencies([...fx.values()]);
  const notUsed = p - fx.size;
  const fy = ST.frequencies(ys);
  $("big-freq").innerHTML = `Of the ${p} possible x values, <b>${fx.size}</b> occur and <b>${notUsed}</b> never occur
    (x³ + 7 is not a square mod p for them). Every occurring x appears exactly
    <b>${[...mult.keys()].join(" or ")}</b> times. Every y value appears at most <b>${Math.max(...fy.values())}</b> times.
    Entropy of x: <b>${ST.entropy([...fx.values()]).toFixed(3)}</b> bits = log₂(${fx.size}), the maximum possible over the
    ${fx.size} values that can occur (log₂(${p}) = ${Math.log2(p).toFixed(3)} bits would require every value in [0, p) to be possible).`;

  // (c) bit distribution of x
  const bf = ST.bitFrequencies(xs.map(BigInt), NB);
  // each x value appears twice (±y), so only N/2 values are distinct: the
  // effective sample size for the standard error is N/2, not N.
  const se = Math.sqrt(0.25 / (N / 2));
  barChart($("big-bits"), bf, { labels: bf.map((_, j) => j), xLabelEvery: 1, yMax: 1, refLine: 0.5,
    band: [0.5 - 2 * se, 0.5 + 2 * se], xTitle: "bit position of x (0 = LSB)" });

  // (d) correlation input ↔ output
  // Over the FULL range, x(kG) = x((n−k)G) makes x a symmetric function of k
  // around n/2, so the covariance with k is exactly 0: a structural artefact,
  // not evidence of randomness. We therefore also test the half range
  // k = 1 … (n−1)/2, where every x appears only once (no duplicated data).
  const r = ST.pearson(ks, xs), rho = ST.spearman(ks, xs);
  const H = (N / 2) | 0;
  const rH = ST.pearson(ks.slice(0, H), xs.slice(0, H)), rhoH = ST.spearman(ks.slice(0, H), xs.slice(0, H));
  const lagH = ST.pearson(xs.slice(0, H - 1), xs.slice(1, H));
  const thrH = 2 / Math.sqrt(H);
  const flag = (v) => (Math.abs(v) > thrH ? "bad" : "ok");
  scatter($("big-scatter"), ks.map((k, i) => ({ x: k, y: xs[i] })), { xMax: Number(n), yMax: p, xTitle: "private key k", yTitle: "x(kG)" });
  $("big-corr").innerHTML = `
    <div class="stat"><div class="v">${r.toExponential(1)}</div><div class="l">Pearson r(k, x), full range</div></div>
    <div class="stat"><div class="v">${rho.toExponential(1)}</div><div class="l">Spearman ρ(k, x), full range</div></div>
    <div class="stat"><div class="v ${flag(rH)}">${rH.toFixed(4)}</div><div class="l">Pearson r, k ≤ (n−1)/2</div></div>
    <div class="stat"><div class="v ${flag(rhoH)}">${rhoH.toFixed(4)}</div><div class="l">Spearman ρ, k ≤ (n−1)/2</div></div>
    <div class="stat"><div class="v ${flag(lagH)}">${lagH.toFixed(4)}</div><div class="l">lag-1 r(x(kG), x((k+1)G)), half range</div></div>
    <div class="stat"><div class="v">±${thrH.toFixed(4)}</div><div class="l">≈ 95% band under H₀ (2/√${H})</div></div>`;

  // (e) avalanche-like behaviour: flip one bit of k, measure Hamming distance of x
  const xOf = new Map(ks.map((k, i) => [k, BigInt(xs[i])]));
  const hd = [];
  for (const k of ks) for (let j = 0; j < NB; j++) {
    const k2 = k ^ (1 << j);
    if (k2 >= 1 && k2 < Number(n)) hd.push(ST.hamming(xOf.get(k), xOf.get(k2)));
  }
  // baseline: Hamming distance between x of two random (independent) points of the walk
  const base = [];
  for (let t = 0; t < hd.length; t++) base.push(ST.hamming(BigInt(xs[(Math.random() * N) | 0]), BigInt(xs[(Math.random() * N) | 0])));
  const hHist = new Array(NB + 1).fill(0); hd.forEach((d) => hHist[d]++);
  const bHist = new Array(NB + 1).fill(0); base.forEach((d) => bHist[d]++);
  barChart($("big-aval"), hHist.map((c) => c / hd.length), { labels: hHist.map((_, i) => i), xLabelEvery: 1, xTitle: "bits of x changed (1-bit flip of k)" });
  barChart($("big-aval-base"), bHist.map((c) => c / base.length), { labels: bHist.map((_, i) => i), xLabelEvery: 1, color: "var(--point)", xTitle: "bits differing, two random points" });
  $("big-aval-stats").innerHTML = `
    <div class="stat"><div class="v">${ST.mean(hd).toFixed(3)}</div><div class="l">mean HD after 1-bit flip</div></div>
    <div class="stat"><div class="v">${ST.mean(base).toFixed(3)}</div><div class="l">mean HD random pairs</div></div>
    <div class="stat"><div class="v">${hd.length}</div><div class="l">flipped pairs tested</div></div>`;
}

// -----------------------------------------------------------------------------
// Section 5.3 — Real secp256k1 vs SHA-256 (avalanche + bit balance), on demand
// -----------------------------------------------------------------------------
function randomScalar(n) {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  let v = 0n;
  for (const x of b) v = (v << 8n) | BigInt(x);
  return (v % (n - 1n)) + 1n;     // in [1, n−1]  (tiny modulo bias is irrelevant here)
}
const toBytes32 = (v) => { const b = new Uint8Array(32); for (let i = 31; i >= 0; i--) { b[i] = Number(v & 0xffn); v >>= 8n; } return b; };
async function sha256Big(v) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", toBytes32(v)));
  return d.reduce((a, x) => (a << 8n) | BigInt(x), 0n);
}

async function runSecp() {
  const S = EC.SECP256K1;
  const N = +$("secp-n").value;
  const btn = $("secp-run"); btn.disabled = true;
  const bar = $("secp-progress");
  const hdEC = [], hdH = [], xsOut = [];
  for (let t = 0; t < N; t++) {
    const k = randomScalar(S.n);
    let k2;
    do { k2 = k ^ (1n << BigInt((Math.random() * 256) | 0)); } while (k2 === 0n || k2 >= S.n);
    const Q1 = EC.scalarMult(k, S.G, S), Q2 = EC.scalarMult(k2, S.G, S);
    hdEC.push(ST.hamming(Q1.x, Q2.x));
    xsOut.push(Q1.x);
    if (crypto.subtle) hdH.push(ST.hamming(await sha256Big(k), await sha256Big(k2)));
    bar.style.width = `${((t + 1) / N) * 100}%`;
    if (t % 4 === 3) await new Promise((r) => setTimeout(r, 0)); // keep the page responsive
  }
  btn.disabled = false;
  const se = Math.sqrt(0.25 / N);
  const bf = ST.bitFrequencies(xsOut, 256);
  const outside = bf.filter((f) => Math.abs(f - 0.5) > 2 * se).length;
  barChart($("secp-bits"), bf, { yMax: 1, refLine: 0.5, band: [0.5 - 2 * se, 0.5 + 2 * se], xLabelEvery: 32,
    labels: bf.map((_, j) => j), xTitle: "bit position of x(Q) (0 = LSB)" });
  const hist = (a) => { const h = new Array(33).fill(0); a.forEach((d) => h[Math.min(32, Math.max(0, Math.round((d - 96) / 2)))]++); return h.map((c) => c / a.length); };
  const labs = [...Array(33).keys()].map((i) => 96 + 2 * i);
  barChart($("secp-hd-ec"), hist(hdEC), { labels: labs, xLabelEvery: 4, xTitle: "Hamming distance (bits of x changed)" });
  if (hdH.length) barChart($("secp-hd-h"), hist(hdH), { labels: labs, xLabelEvery: 4, color: "var(--accent)", xTitle: "Hamming distance (bits of SHA-256 changed)" });
  $("secp-stats").innerHTML = `
    <div class="stat"><div class="v">${ST.mean(hdEC).toFixed(1)} ± ${ST.std(hdEC).toFixed(1)}</div><div class="l">HD of x(kG), mean ± sd</div></div>
    <div class="stat"><div class="v">${hdH.length ? ST.mean(hdH).toFixed(1) + " ± " + ST.std(hdH).toFixed(1) : "n/a"}</div><div class="l">HD of SHA-256(k), mean ± sd</div></div>
    <div class="stat"><div class="v">128 ± 8</div><div class="l">ideal: Binomial(256, ½)</div></div>
    <div class="stat"><div class="v">${outside} / 256</div><div class="l">bit positions outside ±2 SE (≈ 13 expected by chance)</div></div>`;
}

// -----------------------------------------------------------------------------
// Boot
// -----------------------------------------------------------------------------
setupInputs();
setupAnimation();
renderToyOrders();
$("compute").onclick = computeAll;
$("k-input").addEventListener("keydown", (e) => { if (e.key === "Enter") computeAll(); });
$("g-select").onchange = computeAll;
computeAll();
largerCurveStats();
$("secp-run").onclick = runSecp;
