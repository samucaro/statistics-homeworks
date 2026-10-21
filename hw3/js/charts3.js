// =============================================================================
// charts3.js — Multi-series line chart (SVG, no libraries) for HW3.
// Bar charts are reused from HW1 (../../hw1/js/charts.js).
// =============================================================================

import { el } from "../../hw1/js/charts.js";

/**
 * lineChart(container, xs, series, opts)
 *   xs      : numeric x values (shared by all series)
 *   series  : [{ name, values (null = missing), color, dash, points: [{x,y}] (optional scatter) }]
 *   opts    : { yMin, yMax, xLog2, xTicks, yTicks, xTitle, yTitle, yFmt, xFmt }
 */
export function lineChart(container, xs, series, opts = {}) {
  const W = 620, H = 300, m = { l: opts.marginLeft ?? 52, r: 14, t: 12, b: 40 };
  container.innerHTML = "";
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img" }, container);
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const tx = opts.xLog2 ? (v) => Math.log2(v) : (v) => v;
  const allX = xs.map(tx);
  const xMin = opts.xMin ?? Math.min(...allX), xMax = opts.xMax ?? Math.max(...allX);
  const yMin = opts.yMin ?? 0, yMax = opts.yMax ?? 1;
  const X = (v) => m.l + ((tx(v) - xMin) / (xMax - xMin || 1)) * iw;
  const Y = (v) => m.t + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;
  const yFmt = opts.yFmt || ((v) => v);
  const xFmt = opts.xFmt || ((v) => v);

  for (const v of opts.yTicks || [yMin, (yMin + yMax) / 2, yMax]) {
    el("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), stroke: "var(--grid)" }, svg);
    el("text", { x: m.l - 6, y: Y(v) + 4, "text-anchor": "end", "font-size": 11 }, svg).textContent = yFmt(v);
  }
  for (const v of opts.xTicks || xs) {
    el("line", { x1: X(v), x2: X(v), y1: m.t + ih, y2: m.t + ih + 4, stroke: "var(--muted)" }, svg);
    el("text", { x: X(v), y: m.t + ih + 16, "text-anchor": "middle", "font-size": 11 }, svg).textContent = xFmt(v);
  }
  el("line", { x1: m.l, x2: W - m.r, y1: m.t + ih, y2: m.t + ih, stroke: "var(--muted)" }, svg);
  if (opts.xTitle) el("text", { x: m.l + iw / 2, y: H - 4, "text-anchor": "middle", "font-size": 11 }, svg).textContent = opts.xTitle;
  if (opts.yTitle) el("text", { x: 12, y: m.t + ih / 2, "text-anchor": "middle", "font-size": 11, transform: `rotate(-90 12 ${m.t + ih / 2})` }, svg).textContent = opts.yTitle;

  for (const s of series) {
    if (s.values) {
      let d = "";
      s.values.forEach((v, i) => { if (v === null || v === undefined) return; d += `${d ? "L" : "M"}${X(xs[i]).toFixed(1)},${Y(v).toFixed(1)}`; });
      el("path", { d, fill: "none", stroke: s.color, "stroke-width": 2.2, "stroke-dasharray": s.dash || "", "stroke-linejoin": "round" }, svg);
      if (!s.dash) s.values.forEach((v, i) => {
        if (v === null || v === undefined) return;
        const c = el("circle", { cx: X(xs[i]), cy: Y(v), r: 3.2, fill: s.color }, svg);
        el("title", {}, c).textContent = `${s.name} — x = ${xFmt(xs[i])}: ${yFmt(v)}`;
      });
    }
    for (const pt of s.points || []) {
      const c = el("circle", { cx: X(pt.x), cy: Y(pt.y), r: 4.5, fill: "none", stroke: s.color, "stroke-width": 2 }, svg);
      el("title", {}, c).textContent = `${s.name} — x = ${xFmt(pt.x)}: ${yFmt(pt.y)}`;
    }
  }
  // legend (HTML, below the chart, so it wraps on phones)
  const lg = document.createElement("div");
  lg.className = "legend";
  lg.innerHTML = series.filter((s) => !s.noLegend).map((s) => `<span><i style="border-top:3px ${s.dash ? "dashed" : "solid"} ${s.color}"></i>${s.name}</span>`).join("");
  container.appendChild(lg);
  return svg;
}
