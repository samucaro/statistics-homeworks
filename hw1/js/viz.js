// =============================================================================
// viz.js — Slowed-down visual representation of scalar multiplication
// (OPTIONAL "Guru level" part of the assignment).
//
// The toy curve over F_17 is drawn as a 17×17 grid: each dot is a point (x, y)
// that satisfies y² ≡ x³ + 7 (mod 17). We animate each step R ← R + P:
//   blue  = current accumulator R
//   orange= the point being added (G, or R itself when doubling)
//   green = result of the step
// The point at infinity O has no (x, y): it is drawn as a box beside the grid.
//
// NOTE: over a finite field the "chord-and-tangent" line wraps around modulo p,
// so we do not draw the geometric line (it would be misleading); we show the
// algebra (λ, x₃, y₃) in the side panel instead.
// =============================================================================

import { el } from "./charts.js";
import { allPoints, multiplesNaive, doubleAndAdd, fmt, INF } from "./ec.js";

export class Animator {
  constructor({ svgBox, panel, bitsBox, curve }) {
    this.svgBox = svgBox; this.panel = panel; this.bitsBox = bitsBox;
    this.curve = curve; this.steps = []; this.i = 0; this.timer = null; this.speed = 1200;
  }

  /** Build the list of steps for the chosen method. */
  prepare(method, k, G) {
    this.stop();
    this.G = G; this.k = k; this.method = method;
    if (method === "naive") {
      this.bits = null;
      let prev = INF;
      this.steps = multiplesNaive(k, G, this.curve).map((m) => {
        const s = { from: prev, other: G, to: m.point, log: m.log, label: `${m.i - 1n}G + G = ${m.i}G` };
        prev = m.point; return s;
      });
    } else {
      const r = doubleAndAdd(k, G, this.curve);
      this.bits = r.bits;
      this.steps = r.trace.map((t) => ({
        from: t.from, other: t.other, to: t.to, log: t.log, bitIndex: t.bitIndex,
        label: t.op === "double" ? `bit ${t.bit}: R ← 2R  (now R = ${t.acc}G)` : `bit 1: R ← R + G  (now R = ${t.acc}G)`,
      }));
    }
    this.i = 0;
    this.drawBase();
    this.renderPanel(null);
  }

  // ---- drawing ---------------------------------------------------------------
  drawBase() {
    const p = Number(this.curve.p);
    const cell = 22, m = 30, gridW = p * cell;
    this.cell = cell; this.m = m; this.p = p;
    const W = m + gridW + 90, H = m + gridW + 24;
    this.svgBox.innerHTML = "";
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img",
      "aria-label": "Points of the toy curve over F_17" }, this.svgBox);
    this.svg = svg;
    const defs = el("defs", {}, svg);
    for (const [id, col] of [["arB", "var(--accent-2)"], ["arO", "var(--accent)"], ["arT", "var(--point)"]]) {
      const mk = el("marker", { id, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse" }, defs);
      el("path", { d: "M0,0 L10,5 L0,10 z", fill: col }, mk);
    }
    // grid + axis labels (y grows upward, as in a math plot)
    for (let i = 0; i < p; i++) {
      el("line", { x1: this.X(i), x2: this.X(i), y1: this.Y(0), y2: this.Y(p - 1), stroke: "var(--grid)" }, svg);
      el("line", { y1: this.Y(i), y2: this.Y(i), x1: this.X(0), x2: this.X(p - 1), stroke: "var(--grid)" }, svg);
      if (i % 2 === 0 || p <= 17) {
        el("text", { x: this.X(i), y: this.Y(0) + 18, "text-anchor": "middle", "font-size": 10 }, svg).textContent = i;
        el("text", { x: m - 10, y: this.Y(i) + 3, "text-anchor": "end", "font-size": 10 }, svg).textContent = i;
      }
    }
    el("text", { x: this.X(p - 1) + 8, y: this.Y(0) + 18, "font-size": 11 }, svg).textContent = "x";
    el("text", { x: m - 10, y: this.Y(p - 1) - 10, "font-size": 11 }, svg).textContent = "y";
    // symmetry axis y = p/2 : points P and −P are mirror images across it
    el("line", { x1: this.X(0), x2: this.X(p - 1), y1: this.Y(p / 2), y2: this.Y(p / 2),
      stroke: "var(--point)", "stroke-dasharray": "2 4" }, svg);
    // all curve points
    for (const P of allPoints(this.curve)) {
      el("circle", { cx: this.X(Number(P.x)), cy: this.Y(Number(P.y)), r: 4.5, fill: "var(--point)" }, svg);
    }
    // point at infinity box
    this.Obox = { x: this.X(p - 1) + 40, y: this.Y(p - 1) + 10 };
    el("rect", { x: this.Obox.x - 18, y: this.Obox.y - 14, width: 36, height: 28, rx: 6, fill: "none", stroke: "var(--point)" }, svg);
    el("text", { x: this.Obox.x, y: this.Obox.y + 5, "text-anchor": "middle", "font-size": 13 }, svg).textContent = "O";
    // G label
    const g = this.pos(this.G);
    el("circle", { cx: g.x, cy: g.y, r: 9, fill: "none", stroke: "var(--accent)", "stroke-width": 2 }, svg);
    el("text", { x: g.x + 10, y: g.y - 10, "font-size": 12, "font-weight": 700, style: "fill:var(--accent)" }, svg).textContent = "G";
    this.trail = el("g", {}, svg);
    this.layer = el("g", {}, svg);
  }
  X(i) { return this.m + i * this.cell + this.cell / 2; }
  Y(j) { return this.m + (this.p - 1 - j) * this.cell + this.cell / 2 - 10; }
  pos(P) { return P === INF ? this.Obox : { x: this.X(Number(P.x)), y: this.Y(Number(P.y)) }; }

  arrow(A, B, color, marker, layer) {
    const a = this.pos(A), b = this.pos(B);
    if (a.x === b.x && a.y === b.y) return null; // e.g. doubling O gives O: nothing to draw
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
    const ux = dx / L, uy = dy / L, sh = 8;
    // slight curve so that A→B and B→A don't overlap
    const mx = (a.x + b.x) / 2 - uy * 18, my = (a.y + b.y) / 2 + ux * 18;
    return el("path", { d: `M${a.x + ux * sh},${a.y + uy * sh} Q${mx},${my} ${b.x - ux * sh},${b.y - uy * sh}`,
      fill: "none", stroke: color, "stroke-width": 2, "marker-end": `url(#${marker})` }, layer);
  }

  dot(P, color, r, layer) {
    const a = this.pos(P);
    return el("circle", { cx: a.x, cy: a.y, r, fill: color }, layer);
  }

  showStep(idx) {
    const s = this.steps[idx];
    this.layer.innerHTML = "";
    // trail of previous results
    if (idx > 0) {
      const prev = this.steps[idx - 1];
      this.arrow(prev.from, prev.to, "var(--point)", "arT", this.trail)?.setAttribute("opacity", 0.35);
    }
    this.dot(s.from, "var(--accent-2)", 7, this.layer);
    if (s.other !== s.from) this.dot(s.other, "var(--accent)", 7, this.layer);
    this.arrow(s.from, s.to, "var(--accent-2)", "arB", this.layer);
    if (s.other !== s.from) this.arrow(s.other, s.to, "var(--accent)", "arO", this.layer);
    this.dot(s.to, "var(--accent-3)", 8, this.layer);
    this.renderPanel(s, idx);
  }

  renderPanel(s, idx) {
    if (this.bitsBox) {
      if (this.bits) {
        this.bitsBox.innerHTML = `k = ${this.k} = <span class="bits">${[...this.bits].map((b, i) =>
          `<span class="${s && i === s.bitIndex ? "cur" : s && i < s.bitIndex ? "done" : ""}">${b}</span>`).join("")}</span><sub>2</sub>`;
      } else this.bitsBox.innerHTML = `k = ${this.k} (repeated addition: ${this.k} steps)`;
    }
    if (!s) { this.panel.innerHTML = `<p class="caption">Press ▶ Play or Step.</p>`; return; }
    const L = s.log, P = s.from, Q = s.other, p = this.curve.p;
    let algebra = `<div><b>${L.case}</b></div>`;
    if (L.lambda !== undefined) {
      const formula = L.case.startsWith("doubling") ? "λ = (3x₁² + a) / (2y₁)" : "λ = (y₂ − y₁) / (x₂ − x₁)";
      algebra += `${formula}<br>λ = ${L.num} · ${L.den}⁻¹ = ${L.num} · ${modInvSmall(L.den, p)} ≡ <b>${L.lambda}</b> (mod ${p})<br>
        x₃ = λ² − x₁ − x₂ = ${L.lambda}² − ${P.x} − ${Q.x} ≡ <b>${s.to.x}</b><br>
        y₃ = λ(x₁ − x₃) − y₁ = ${L.lambda}(${P.x} − ${s.to.x}) − ${P.y} ≡ <b>${s.to.y}</b>`;
    }
    this.panel.innerHTML = `<div class="caption">Step ${idx + 1} / ${this.steps.length}</div>
      <div style="font-weight:600;margin:4px 0">${s.label}</div>
      <div class="formula">${fmt(P)} ${s.other === s.from ? "doubled" : "+ " + fmt(Q)} → <b style="color:var(--accent-3)">${fmt(s.to)}</b><br>${algebra}</div>`;
  }

  // ---- controls ---------------------------------------------------------------
  step() {
    if (this.i >= this.steps.length) return false;
    this.showStep(this.i++);
    if (this.i >= this.steps.length) this.onEnd?.();
    return this.i < this.steps.length;
  }
  play() {
    this.stop();
    if (this.i >= this.steps.length) this.reset();
    const tick = () => { if (this.step()) this.timer = setTimeout(tick, this.speed); else this.timer = null; };
    tick();
  }
  stop() { clearTimeout(this.timer); this.timer = null; }
  reset() { this.stop(); this.i = 0; this.drawBase(); this.renderPanel(null); }
}

function modInvSmall(a, p) { // display only
  for (let s = 1n; s < p; s++) if ((a * s) % p === 1n) return s;
  return "?";
}
