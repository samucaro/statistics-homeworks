// =============================================================================
// charts4.js — SVG charts for HW3 (no libraries): line chart with optional
// log axes, histogram with density overlay, trajectory plot.
// =============================================================================

import { el } from "../../hw1/js/charts.js";

function frame(container, W, H) {
  container.innerHTML = "";
  return el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img" }, container);
}
function legend(container, series) {
  const lg = document.createElement("div");
  lg.className = "legend";
  lg.innerHTML = series.filter((s) => s.name).map((s) =>
    `<span><i style="border-top:3px ${s.dash ? "dashed" : "solid"} ${s.color}"></i>${s.name}</span>`).join("");
  container.appendChild(lg);
}
const fmtNum = (v) => (Math.abs(v) >= 1000 ? v.toExponential(0).replace("+", "") : +v.toPrecision(3));

/**
 * lineChart(container, series, opts)
 *   series: [{ name, color, dash, pts: [[x, y], …], dots }]
 *   opts: { xLog, yLog, xMin, xMax, yMin, yMax, xTicks, yTicks, xFmt, yFmt, xTitle, yTitle, W, H }
 * With xLog/yLog the axis is log10 and ticks are given in data units.
 */
export function lineChart(container, series, o = {}) {
  const W = o.W || 620, H = o.H || 300, m = { l: o.ml || 58, r: 14, t: 12, b: 40 };
  const svg = frame(container, W, H);
  const fx = o.xLog ? Math.log10 : (v) => v, fy = o.yLog ? Math.log10 : (v) => v;
  const xs = [], ys = [];
  for (const s of series) for (const [x, y] of s.pts) if (isFinite(fy(y)) && y !== null) { xs.push(fx(x)); ys.push(fy(y)); }
  const x0 = o.xMin !== undefined ? fx(o.xMin) : Math.min(...xs), x1 = o.xMax !== undefined ? fx(o.xMax) : Math.max(...xs);
  const y0 = o.yMin !== undefined ? fy(o.yMin) : Math.min(...ys), y1 = o.yMax !== undefined ? fy(o.yMax) : Math.max(...ys);
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const X = (v) => m.l + ((fx(v) - x0) / (x1 - x0 || 1)) * iw;
  const Y = (v) => m.t + ih - ((Math.min(Math.max(fy(v), y0), y1) - y0) / (y1 - y0 || 1)) * ih;
  const xF = o.xFmt || fmtNum, yF = o.yFmt || fmtNum;
  for (const v of o.yTicks || [y0, (y0 + y1) / 2, y1].map((t) => (o.yLog ? 10 ** t : t))) {
    el("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), stroke: "var(--grid)" }, svg);
    el("text", { x: m.l - 6, y: Y(v) + 4, "text-anchor": "end", "font-size": 11 }, svg).textContent = yF(v);
  }
  for (const v of o.xTicks || []) {
    el("line", { x1: X(v), x2: X(v), y1: m.t + ih, y2: m.t + ih + 4, stroke: "var(--muted)" }, svg);
    el("text", { x: X(v), y: m.t + ih + 16, "text-anchor": "middle", "font-size": 11 }, svg).textContent = xF(v);
  }
  el("line", { x1: m.l, x2: W - m.r, y1: m.t + ih, y2: m.t + ih, stroke: "var(--muted)" }, svg);
  if (o.xTitle) el("text", { x: m.l + iw / 2, y: H - 4, "text-anchor": "middle", "font-size": 11 }, svg).textContent = o.xTitle;
  if (o.yTitle) el("text", { x: 12, y: m.t + ih / 2, "text-anchor": "middle", "font-size": 11, transform: `rotate(-90 12 ${m.t + ih / 2})` }, svg).textContent = o.yTitle;
  for (const s of series) {
    const pts = s.pts.filter(([, y]) => y !== null && isFinite(fy(y)));
    if (!pts.length) continue;
    if (!s.noLine) el("path", { d: pts.map(([x, y], i) => `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(""),
      fill: "none", stroke: s.color, "stroke-width": s.width || 2.2, "stroke-dasharray": s.dash || "", "stroke-linejoin": "round" }, svg);
    if (s.dots) for (const [x, y] of pts) {
      const c = el("circle", { cx: X(x), cy: Y(y), r: 3.4, fill: s.color }, svg);
      el("title", {}, c).textContent = `${s.name}: x = ${xF(x)}, y = ${yF(y)}`;
    }
  }
  legend(container, series);
}

/**
 * Histogram of a sample on [xMin, xMax) with given bin edges, shown as a
 * DENSITY (count / (m · width)) so that it is comparable with a pdf.
 *   curve: function x → density (dashed overlay), e.g. a normal approximation
 */
export function histogram(container, values, o) {
  const W = o.W || 300, H = o.H || 170, m = { l: 34, r: 8, t: 8, b: 28 };
  const svg = frame(container, W, H);
  const { edges } = o;
  const nb = edges.length - 1, w = edges[1] - edges[0];
  const counts = new Float64Array(nb);
  let out = 0;
  for (const v of values) {
    const i = Math.floor((v - edges[0]) / w + 1e-9);
    if (i >= 0 && i < nb) counts[i]++; else out++;
  }
  const dens = Array.from(counts, (c) => c / (values.length * w));
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const xMin = edges[0], xMax = edges[nb];
  const X = (v) => m.l + ((v - xMin) / (xMax - xMin)) * iw;
  let yMax = Math.max(...dens);
  if (o.curve) for (let i = 0; i <= 200; i++) yMax = Math.max(yMax, o.curve(xMin + ((xMax - xMin) * i) / 200));
  yMax *= 1.08;
  const Y = (v) => m.t + ih - (v / yMax) * ih;
  dens.forEach((d, i) => {
    if (!d) return;
    const r = el("rect", { x: X(edges[i]) + 0.3, width: Math.max(0.8, X(edges[i + 1]) - X(edges[i]) - 0.6), y: Y(d), height: m.t + ih - Y(d), fill: o.color || "var(--s2)", opacity: 0.85 }, svg);
    el("title", {}, r).textContent = `[${+edges[i].toPrecision(4)}, ${+edges[i + 1].toPrecision(4)}): ${counts[i]} attackers`;
  });
  if (o.curve) {
    let d = "";
    for (let i = 0; i <= 200; i++) { const x = xMin + ((xMax - xMin) * i) / 200; d += `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(o.curve(x)).toFixed(1)}`; }
    el("path", { d, fill: "none", stroke: "var(--s1)", "stroke-width": 1.8, "stroke-dasharray": "4 3" }, svg);
  }
  el("line", { x1: m.l, x2: W - m.r, y1: m.t + ih, y2: m.t + ih, stroke: "var(--muted)" }, svg);
  for (const t of o.xTicks || [xMin, (xMin + xMax) / 2, xMax]) {
    el("text", { x: X(t), y: H - 12, "text-anchor": "middle", "font-size": 10 }, svg).textContent = fmtNum(t);
  }
  el("text", { x: m.l - 4, y: m.t + 8, "text-anchor": "end", "font-size": 9 }, svg).textContent = fmtNum(yMax / 1.08);
  if (o.title) el("text", { x: W - m.r, y: m.t + 10, "text-anchor": "end", "font-size": 11, "font-weight": 600, style: "fill:var(--text)" }, svg).textContent = o.title;
  if (out) el("text", { x: W - m.r, y: m.t + 24, "text-anchor": "end", "font-size": 9 }, svg).textContent = `${out} outside range`;
}

/**
 * Trajectories: y = f(k, S_k) for k = 1…K for each path, with an optional
 * centre line and band (functions of k).
 */
export function trajectories(container, paths, K, o) {
  const W = o.W || 620, H = o.H || 260, m = { l: 52, r: 12, t: 10, b: 36 };
  const svg = frame(container, W, H);
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const X = (k) => m.l + (k / K) * iw;
  const Y = (v) => m.t + ih - ((Math.min(Math.max(v, o.yMin), o.yMax) - o.yMin) / (o.yMax - o.yMin)) * ih;
  for (const t of o.yTicks) {
    el("line", { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), stroke: "var(--grid)" }, svg);
    el("text", { x: m.l - 6, y: Y(t) + 4, "text-anchor": "end", "font-size": 11 }, svg).textContent = fmtNum(t);
  }
  for (const t of [0, K / 4, K / 2, (3 * K) / 4, K]) el("text", { x: X(t), y: m.t + ih + 16, "text-anchor": "middle", "font-size": 11 }, svg).textContent = Math.round(t);
  el("text", { x: m.l + iw / 2, y: H - 4, "text-anchor": "middle", "font-size": 11 }, svg).textContent = o.xTitle || "step k (system index)";
  if (o.yTitle) el("text", { x: 12, y: m.t + ih / 2, "text-anchor": "middle", "font-size": 11, transform: `rotate(-90 12 ${m.t + ih / 2})` }, svg).textContent = o.yTitle;
  const step = Math.max(1, Math.floor(K / 600));
  const ks = []; for (let k = 1; k <= K; k += step) ks.push(k); if (ks[ks.length - 1] !== K) ks.push(K);
  if (o.band) {
    const up = ks.map((k) => `${X(k).toFixed(1)},${Y(o.band[1](k)).toFixed(1)}`), lo = ks.slice().reverse().map((k) => `${X(k).toFixed(1)},${Y(o.band[0](k)).toFixed(1)}`);
    el("polygon", { points: up.concat(lo).join(" "), fill: "var(--s3)", opacity: 0.13 }, svg);
  }
  for (const path of paths) {
    el("path", { d: ks.map((k, i) => `${i ? "L" : "M"}${X(k).toFixed(1)},${Y(o.f(k, path[k])).toFixed(1)}`).join(""),
      fill: "none", stroke: "var(--s2)", "stroke-width": 1, opacity: 0.45 }, svg);
  }
  if (o.centre) el("path", { d: ks.map((k, i) => `${i ? "L" : "M"}${X(k).toFixed(1)},${Y(o.centre(k)).toFixed(1)}`).join(""),
    fill: "none", stroke: "var(--s1)", "stroke-width": 2, "stroke-dasharray": "5 4" }, svg);
}
