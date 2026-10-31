// =============================================================================
// charts.js — Minimal SVG charts (no libraries). Colours come from CSS tokens.
// =============================================================================

const NS = "http://www.w3.org/2000/svg";

export function el(tag, attrs = {}, parent = null) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

function frame(container, W, H) {
  container.innerHTML = "";
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img" }, container);
  return svg;
}

/**
 * Vertical bar chart.
 * opts: labels[], refLine (number, dashed horizontal), band [lo, hi] (shaded),
 *       yMax, color, xLabelEvery, yFmt
 */
export function barChart(container, values, opts = {}) {
  const W = 460, H = 220, m = { l: 44, r: 10, t: 10, b: 30 };
  const svg = frame(container, W, H);
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const yMax = opts.yMax ?? (Math.max(...values, opts.refLine ?? 0, opts.band ? opts.band[1] : 0) * 1.1 || 1);
  const y = (v) => m.t + ih - (v / yMax) * ih;
  const bw = iw / values.length;
  const fmtY = opts.yFmt || ((v) => (yMax <= 1 ? v.toFixed(2) : Math.round(v)));

  // y axis ticks
  for (let i = 0; i <= 4; i++) {
    const v = (yMax * i) / 4;
    el("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: "var(--grid)" }, svg);
    el("text", { x: m.l - 6, y: y(v) + 4, "text-anchor": "end", "font-size": 10 }, svg).textContent = fmtY(v);
  }
  if (opts.band) {
    el("rect", { x: m.l, width: iw, y: y(opts.band[1]), height: y(opts.band[0]) - y(opts.band[1]),
      fill: "var(--accent-3)", opacity: 0.12 }, svg);
  }
  values.forEach((v, i) => {
    const r = el("rect", {
      x: m.l + i * bw + bw * 0.1, width: Math.max(1, bw * 0.8),
      y: y(v), height: Math.max(0, m.t + ih - y(v)),
      fill: opts.color || "var(--accent-2)", rx: bw > 6 ? 2 : 0,
    }, svg);
    el("title", {}, r).textContent = `${opts.labels ? opts.labels[i] : i}: ${typeof v === "number" ? +v.toFixed(4) : v}`;
  });
  if (opts.refLine !== undefined) {
    el("line", { x1: m.l, x2: W - m.r, y1: y(opts.refLine), y2: y(opts.refLine),
      stroke: "var(--accent)", "stroke-dasharray": "5 4", "stroke-width": 1.5 }, svg);
  }
  const every = opts.xLabelEvery || Math.ceil(values.length / 12);
  values.forEach((_, i) => {
    if (i % every) return;
    el("text", { x: m.l + i * bw + bw / 2, y: H - m.b + 14, "text-anchor": "middle", "font-size": 10 }, svg)
      .textContent = opts.labels ? opts.labels[i] : i;
  });
  if (opts.xTitle) el("text", { x: m.l + iw / 2, y: H - 2, "text-anchor": "middle", "font-size": 10 }, svg).textContent = opts.xTitle;
  return svg;
}

/** Scatter plot of [{x, y}] with numeric axes [0, xMax] × [0, yMax]. */
export function scatter(container, pts, opts = {}) {
  const W = 460, H = 300, m = { l: 44, r: 10, t: 10, b: 34 };
  const svg = frame(container, W, H);
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const xMax = opts.xMax, yMax = opts.yMax;
  const sx = (v) => m.l + (v / xMax) * iw;
  const sy = (v) => m.t + ih - (v / yMax) * ih;
  el("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "none", stroke: "var(--border)" }, svg);
  for (let i = 0; i <= 4; i++) {
    el("text", { x: m.l - 6, y: sy((yMax * i) / 4) + 4, "text-anchor": "end", "font-size": 10 }, svg).textContent = Math.round((yMax * i) / 4);
    el("text", { x: sx((xMax * i) / 4), y: H - m.b + 14, "text-anchor": "middle", "font-size": 10 }, svg).textContent = Math.round((xMax * i) / 4);
  }
  const r = opts.r || 1.6;
  for (const p of pts) el("circle", { cx: sx(p.x), cy: sy(p.y), r, fill: opts.color || "var(--accent-2)", opacity: 0.7 }, svg);
  if (opts.xTitle) el("text", { x: m.l + iw / 2, y: H - 4, "text-anchor": "middle", "font-size": 11 }, svg).textContent = opts.xTitle;
  if (opts.yTitle) el("text", { x: 12, y: m.t + ih / 2, "text-anchor": "middle", "font-size": 11, transform: `rotate(-90 12 ${m.t + ih / 2})` }, svg).textContent = opts.yTitle;
  return svg;
}
