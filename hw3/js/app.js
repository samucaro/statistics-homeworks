// =============================================================================
// app.js — HW3 page logic
// =============================================================================

import * as T from "./toyecc.js";
import * as CZ from "./caesar.js";
import * as X from "./cryptanalysis.js";
import * as A from "./attack.js";
import * as V from "./weakvariant.js";
import * as ST from "../../hw1/js/stats.js";
import { barChart } from "../../hw1/js/charts.js";
import { lineChart } from "./charts3.js";
import { scalarMult, eq } from "../../hw1/js/ec.js";

const $ = (id) => document.getElementById(id);
const pause = () => new Promise((r) => setTimeout(r, 0));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const shortHex = (h, a = 12, b = 8) => (h.length > a + b + 1 ? `${h.slice(0, a)}…${h.slice(-b)}` : h);
const hex64 = (v) => v.toString(16).padStart(64, "0");
const stripHeader = (t) => t.split("\n").filter((l) => !l.startsWith("#")).join("\n");
const SERIES = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)"];

/** Human-readable duration. */
function fmtDur(s) {
  if (!isFinite(s)) return "∞";
  if (s < 1e-6) return "< 1 µs";
  if (s < 1e-3) return `${(s * 1e6).toFixed(0)} µs`;
  if (s < 1) return `${(s * 1e3).toFixed(0)} ms`;
  if (s < 120) return `${s.toFixed(1)} s`;
  if (s < 7200) return `${(s / 60).toFixed(0)} min`;
  if (s < 2 * 86400) return `${(s / 3600).toFixed(1)} h`;
  const y = s / 3.156e7;
  if (y < 1) return `${(s / 86400).toFixed(0)} days`;
  if (y < 1e4) return `${y.toFixed(y < 10 ? 1 : 0)} years`;
  const u = y / 1.38e10;
  return `${y.toExponential(1)} years${u > 1 ? ` (≈ ${u.toExponential(1)} × age of the universe)` : ""}`;
}
const pow2 = (e) => `2<sup>${e}</sup>`;

// Shared state
const state = { keys: null, cipher: null, message: "", model: null, corpora: {}, rate: null, caesarKey: 3 };

// =============================================================================
// §1 Toy ECC scheme
// =============================================================================
function eccKeyGen() {
  const bits = +$("ecc-bits").value;
  state.keys = T.keyGen(bits);
  const { d, Q } = state.keys;
  $("ecc-keys").innerHTML = `
    <table><tbody>
    <tr><th class="secret">private key d</th><td class="hex"><b>${d}</b> &nbsp;(hex ${d.toString(16)}) — chosen uniformly in [1, 2<sup>${bits}</sup>): only ${(2 ** bits - 1).toLocaleString("en")} possible values</td></tr>
    <tr><th class="public">public key Q = d·G</th><td class="hex">${T.pointToHex(Q)}<br><span class="caption">compressed form: 02/03 (parity of y) ‖ x — a full-size, random-looking point despite the tiny d</span></td></tr>
    </tbody></table>`;
  eccEncrypt();
}

function eccEncrypt() {
  if (!state.keys) return;
  state.message = $("ecc-msg").value;
  const t0 = performance.now();
  state.cipher = T.encrypt(state.message, state.keys.Q);
  const ms = performance.now() - t0;
  const bytes = new TextEncoder().encode(state.message).length;
  const rows = state.cipher.map((b, i) => `
    <tr><td>${i + 1}</td>
      <td class="hex">${shortHex(hex64(b.M.x))}</td>
      <td class="hex secret">${shortHex(hex64(b.secret.r))}</td>
      <td class="hex secret">${shortHex(T.pointToHex(b.secret.S))}</td>
      <td class="hex public">${shortHex(T.pointToHex(b.R))}</td>
      <td class="hex public">${shortHex(T.pointToHex(b.C))}</td></tr>`).join("");
  $("ecc-enc").innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>block</th><th>M (x, encoded message)</th><th class="secret">r (Alice, secret)</th><th class="secret">S = r·Q (never sent)</th><th class="public">R = r·G (sent)</th><th class="public">C = M + S (sent)</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <p class="caption">${bytes} bytes of UTF-8 → ${state.cipher.length} block(s) of ≤ ${T.BLOCK_BYTES} bytes → ciphertext of ${state.cipher.length * 66} bytes (two 33-byte points per block). Encrypted in ${ms.toFixed(0)} ms.</p>
    <details><summary>Ciphertext as transmitted (what Eve intercepts)</summary>
      <div class="hex">${state.cipher.map((b) => `(${T.pointToHex(b.R)}, ${T.pointToHex(b.C)})`).join("<br>")}</div></details>`;
  eccDecrypt();
}

function eccDecrypt() {
  if (!state.cipher) return;
  try {
    const b = state.cipher[0];
    const { S } = T.decryptBlock(b, state.keys.d);
    const text = T.decrypt(state.cipher, state.keys.d);
    $("ecc-dec").innerHTML = `
      <p>Bob computes S = d·R = <span class="hex">${shortHex(T.pointToHex(S))}</span>
      — equal to Alice's S: <b class="${eq(S, b.secret.S) ? "ok" : "bad"}">${eq(S, b.secret.S)}</b> (block 1), then M = C − S and decodes:</p>
      <div class="big-text">${esc(text)}</div>
      <p class="caption">Round trip correct: <b class="${text === state.message ? "ok" : "bad"}">${text === state.message}</b></p>`;
  } catch (e) { $("ecc-dec").innerHTML = `<p class="bad">${e.message}</p>`; }
  updateAttackInfo();
}

// =============================================================================
// §2 Caesar
// =============================================================================
function caesarRun() {
  let k = parseInt($("cz-key").value, 10);
  if (!(k >= 0 && k <= 25)) { k = ((k % 26) + 26) % 26 || 0; $("cz-key").value = k; }
  state.caesarKey = k;
  const msg = $("ecc-msg").value;
  const c = CZ.encrypt(msg, k), back = CZ.decrypt(c, k);
  $("cz-out").innerHTML = `
    <div class="table-wrap"><table class="alpha"><tr><td>plain</td>${CZ.LETTERS.map((l) => `<td>${l}</td>`).join("")}</tr>
    <tr><td>cipher</td>${CZ.LETTERS.map((_, i) => `<td><b>${CZ.LETTERS[(i + k) % 26]}</b></td>`).join("")}</tr></table></div>
    <div class="table-wrap"><table><tbody>
      <tr><th>plaintext</th><td class="wrap-ok"><div class="big-text">${esc(msg)}</div></td></tr>
      <tr><th>ciphertext (k = ${k})</th><td class="wrap-ok"><div class="big-text">${esc(c)}</div></td></tr>
      <tr><th>decrypted (k = ${k})</th><td class="wrap-ok"><div class="big-text">${esc(back)}</div></td></tr>
    </tbody></table></div>
    <p class="caption">Same length as the plaintext; spaces and punctuation unchanged; round trip correct:
    <b class="${back === msg ? "ok" : "bad"}">${back === msg}</b>.</p>`;
  if (!$("ca-input").dataset.touched) $("ca-input").value = CZ.encrypt(DEFAULT_ATTACK_TEXT, k);
}

// =============================================================================
// §3 Comparison: statistical properties of the ciphertexts
// =============================================================================
async function compareRun() {
  const btn = $("cmp-run"); btn.disabled = true;
  const text = stripHeader(state.corpora.test).slice(1200, 2400).replace(/\s+/g, " ");
  const k = state.caesarKey || 3;
  const cP = CZ.letterCounts(text), cC = CZ.letterCounts(CZ.encrypt(text, k));
  barChart($("cmp-plain"), cP, { labels: CZ.LETTERS, xLabelEvery: 1, color: "var(--s2)", xTitle: "plaintext letters" });
  barChart($("cmp-caesar"), cC, { labels: CZ.LETTERS, xLabelEvery: 1, color: "var(--s1)", xTitle: `Caesar ciphertext letters (k = ${k})` });
  $("cmp-ecc").innerHTML = `<p class="caption">Encrypting ${text.length} characters with EC-ElGamal…</p>`;
  await pause();
  const blocks = [];
  const Ms = T.encodeMessage(text);
  for (let i = 0; i < Ms.length; i++) { blocks.push(T.encryptBlock(Ms[i], state.keys.Q)); if (i % 4 === 3) await pause(); }
  const bytes = [];
  for (const b of blocks) for (const P of [b.R, b.C]) { let x = P.x; for (let j = 0; j < 32; j++) { bytes.push(Number(x & 0xffn)); x >>= 8n; } }
  const hist = new Array(16).fill(0); bytes.forEach((v) => hist[v >> 4]++);
  const chi = ST.chiSquareUniform(hist);
  const counts256 = new Array(256).fill(0); bytes.forEach((v) => counts256[v]++);
  barChart($("cmp-ecc"), hist, { labels: [..."0123456789abcdef"].map((h) => h + "x"), xLabelEvery: 1, refLine: bytes.length / 16, color: "var(--s3)", xTitle: "EC ciphertext bytes (16 bins by high nibble)" });
  $("cmp-stats").innerHTML = `
    <div class="stat"><div class="v">${CZ.indexOfCoincidence(cP).toFixed(4)}</div><div class="l">IC plaintext letters</div></div>
    <div class="stat"><div class="v">${CZ.indexOfCoincidence(cC).toFixed(4)}</div><div class="l">IC Caesar ciphertext (identical)</div></div>
    <div class="stat"><div class="v">${CZ.indexOfCoincidence(counts256).toFixed(4)}</div><div class="l">IC of EC ciphertext bytes (uniform = 1/256 = 0.0039)</div></div>
    <div class="stat"><div class="v">${chi.pValue.toFixed(3)}</div><div class="l">χ² p-value, EC bytes uniform (df 15)</div></div>
    <div class="stat"><div class="v">× ${((blocks.length * 66) / new TextEncoder().encode(text).length).toFixed(2)}</div><div class="l">EC ciphertext / plaintext size (Caesar × 1)</div></div>`;
  // Determinism
  const w = "HELLO";
  const e1 = T.encrypt(w, state.keys.Q)[0], e2 = T.encrypt(w, state.keys.Q)[0];
  $("cmp-twice").innerHTML = `<table><thead><tr><th>Encrypt "${w}" twice</th><th>Caesar (k = ${k})</th><th>EC-ElGamal: C (and R)</th></tr></thead><tbody>
    <tr><td>1st time</td><td class="mono">${CZ.encrypt(w, k)}</td><td class="hex">${shortHex(T.pointToHex(e1.C), 16, 8)}</td></tr>
    <tr><td>2nd time</td><td class="mono">${CZ.encrypt(w, k)}</td><td class="hex">${shortHex(T.pointToHex(e2.C), 16, 8)}</td></tr>
    <tr><td>Equal?</td><td><b class="bad">yes — deterministic</b></td><td><b class="ok">${T.pointToHex(e1.C) === T.pointToHex(e2.C) ? "yes" : "no — randomised by r"}</b></td></tr></tbody></table>`;
  btn.disabled = false;
}

// =============================================================================
// §4 Statistical cryptanalysis of Caesar
// =============================================================================
const DEFAULT_ATTACK_TEXT = "The Caesar cipher replaces each letter with the letter three places further down the alphabet.";

function renderModel() {
  const M = state.model, H = M.entropy;
  barChart($("lm-chart"), M.p, { labels: CZ.LETTERS, xLabelEvery: 1, color: "var(--s2)", yFmt: (v) => v.toFixed(2), xTitle: "letter frequency in the training corpus" });
  const order = M.p.map((v, i) => [v, CZ.LETTERS[i]]).sort((a, b) => b[0] - a[0]).map(([, l]) => l).join("");
  $("lm-stats").innerHTML = `
    <div class="stat"><div class="v">${M.N.toLocaleString("en")}</div><div class="l">letters in the corpus</div></div>
    <div class="stat"><div class="v">${M.nWords.toLocaleString("en")}</div><div class="l">distinct words (dictionary)</div></div>
    <div class="stat"><div class="v mono" style="font-size:.85rem">${order.slice(0, 12)}…</div><div class="l">letters by frequency</div></div>
    <div class="stat"><div class="v">${CZ.indexOfCoincidence(M.counts).toFixed(4)}</div><div class="l">index of coincidence</div></div>
    <div class="stat"><div class="v">${deltaMin().d.toFixed(2)} (t = ${deltaMin().t})</div><div class="l">Δ<sub>min</sub>: closest wrong shift, χ² gap per letter</div></div>`;
  $("lm-entropy").innerHTML = `
    <thead><tr><th>Model</th><th>Entropy H (bits/letter)</th><th>Redundancy D = log₂26 − H</th><th>Unicity distance U = log₂26 / D</th></tr></thead><tbody>
    <tr><td>No knowledge (uniform)</td><td>${H.H0.toFixed(3)}</td><td>0</td><td>∞ (cannot be broken)</td></tr>
    <tr><td>Letter frequencies (unigram)</td><td>${H.H1.toFixed(3)}</td><td>${(H.H0 - H.H1).toFixed(3)}</td><td><b>${X.unicity(H.H1).toFixed(1)} letters</b></td></tr>
    <tr><td>Bigrams: H(Xₜ | Xₜ₋₁)</td><td>${H.H2.toFixed(3)}</td><td>${(H.H0 - H.H2).toFixed(3)}</td><td><b>${X.unicity(H.H2).toFixed(1)} letters</b></td></tr>
    <tr><td>Trigrams: H(Xₜ | Xₜ₋₂Xₜ₋₁)</td><td>${H.H3.toFixed(3)}</td><td>${(H.H0 - H.H3).toFixed(3)}</td><td><b>${X.unicity(H.H3).toFixed(1)} letters</b></td></tr></tbody>`;
}

/**
 * How different is the language distribution p from itself rotated by t?
 * Δ_t = Σᵢ (p_{i+t} − pᵢ)² / pᵢ is the expected χ² increase PER LETTER when
 * decrypting with a key that is wrong by t. The right key gives χ² ≈ df = 25
 * whatever the length; a wrong key gives ≈ 25 + L·Δ_t: the gap grows with L.
 */
function deltaMin() {
  const p = state.model.p;
  let best = { t: 0, d: Infinity };
  for (let t = 1; t < 26; t++) {
    let s = 0;
    for (let i = 0; i < 26; i++) s += (p[(i + t) % 26] - p[i]) ** 2 / p[i];
    if (s < best.d) best = { t, d: s };
  }
  return best;
}

function attackCaesar() {
  const ct = $("ca-input").value;
  const prep = X.prepare(ct);
  if (!prep.L) { $("ca-out").innerHTML = `<p class="bad">No letters in the ciphertext.</p>`; return; }
  const method = $("ca-method").value;
  const results = X.METHODS.map((m) => {
    const scores = X.scoreShifts(prep, m.id, state.model);
    return { m, scores, ...X.bestKey(scores) };
  });
  const sel = results.find((r) => r.m.id === method);
  const vals = method === "chi2" ? sel.scores.map((v) => -v) : sel.scores.map((v) => v - Math.min(...sel.scores));
  barChart($("ca-chart"), vals, { labels: [...Array(26).keys()], xLabelEvery: 1, color: "var(--s4)",
    yFmt: (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)),
    xTitle: method === "chi2" ? "candidate key s — χ² (LOWEST wins)" : "candidate key s — score above the worst shift (HIGHEST wins)" });
  $("ca-out").innerHTML = `
    <p class="caption">Ciphertext: ${prep.L} letters. Every method tries all 26 keys; they differ only in how a candidate plaintext is scored.</p>
    <div class="table-wrap"><table><thead><tr><th>Method</th><th>Recovered key</th><th>Decryption with that key</th></tr></thead><tbody>
    ${results.map((r) => `<tr><td>${r.m.name}${r.ties > 1 ? ` <span class="pill">tie among ${r.ties}</span>` : ""}</td><td class="mono">${r.key}</td>
      <td class="wrap-ok mono" style="font-size:.85rem">${esc(CZ.decrypt(ct, r.key).slice(0, 110))}${ct.length > 110 ? "…" : ""}</td></tr>`).join("")}
    </tbody></table></div>`;
}

const LENGTHS = [3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 300];
async function experimentRun() {
  const btn = $("exp-run"); btn.disabled = true;
  const trials = +$("exp-trials").value;
  const src = $("exp-source").value;
  const res = await X.lengthExperiment(state.model, state.corpora[src], LENGTHS, trials, CZ.encrypt,
    (f) => { $("exp-progress").style.width = `${f * 100}%`; });
  lineChart($("exp-chart"), LENGTHS, X.METHODS.map((m, i) => ({ name: m.name, values: res[m.id], color: SERIES[i] })),
    { xLog2: true, yMin: 0, yMax: 1, yTicks: [0, 0.25, 0.5, 0.75, 1], xTicks: [3, 5, 10, 20, 50, 100, 300],
      yFmt: (v) => `${Math.round(v * 100)}%`, xTitle: "ciphertext length (letters, log scale)", yTitle: "key recovered" });
  const ci = (p) => 1.96 * Math.sqrt((p * (1 - p)) / trials);
  $("exp-table").innerHTML = `<thead><tr><th>letters</th>${X.METHODS.map((m) => `<th>${m.name}</th>`).join("")}</tr></thead><tbody>
    ${LENGTHS.map((L, li) => { const best = Math.max(...X.METHODS.map((m) => res[m.id][li]));
      return `<tr><td>${L}</td>${X.METHODS.map((m) => { const p = res[m.id][li]; return `<td class="${p === best ? "best" : ""}">${(p * 100).toFixed(0)}%</td>`; }).join("")}</tr>`; }).join("")}</tbody>`;
  $("exp-note").textContent = `${trials} random excerpts per length (same ciphertexts for every method, random key 1–25). ` +
    `95% margin of error: at most ±${(ci(0.5) * 100).toFixed(1)} percentage points (at 50%), smaller near 0% and 100%.`;
  btn.disabled = false;
}

const LIPOGRAM = "A lipogram is a kind of writing that avoids a particular symbol. This paragraph is an illustration: in it you will not spot that glyph at all, which forms a curious constraint for any author who wants to try such a trick.";
function lipogramDemo() {
  const k = 11;
  const ct = CZ.encrypt(LIPOGRAM, k);
  const prep = X.prepare(ct);
  const nE = (LIPOGRAM.match(/e/gi) || []).length;
  $("lipo-out").innerHTML = `<div class="big-text" style="font-size:.88rem">${esc(LIPOGRAM)}</div>
    <p class="caption">${prep.L} letters, of which “E”: ${nE}. Encrypted with k = ${k}.</p>
    <div class="table-wrap"><table><thead><tr><th>Method</th><th>Recovered key</th><th>Correct?</th></tr></thead><tbody>
    ${X.METHODS.map((m) => { const r = X.bestKey(X.scoreShifts(prep, m.id, state.model));
      return `<tr><td>${m.name}</td><td class="mono">${r.key}</td><td class="${r.key === k ? "ok" : "bad"}">${r.key === k ? "yes" : "no"}</td></tr>`; }).join("")}
    </tbody></table></div>`;
}

// =============================================================================
// §5 Attacking the restricted private key
// =============================================================================
let stopFlag = false;

function updateAttackInfo() {
  if (!state.keys || !state.rate) return;
  const b = state.keys.bits, K = 2 ** b;
  $("atk-info").innerHTML = `Target: Bob's public key Q from §1, with d &lt; 2<sup>${b}</sup>. Measured speed on this device:
    <b>${Math.round(state.rate).toLocaleString("en")}</b> point additions/s. Expected time: brute force ≈ ${fmtDur(K / 2 / state.rate)}
    (worst case ${fmtDur(K / state.rate)}); baby-step giant-step ≈ ${fmtDur((1.5 * Math.sqrt(K)) / state.rate)}.`;
}

async function attackRun(kind) {
  const { Q, bits } = state.keys;
  const K = 1n << BigInt(bits);
  const out = $("atk-out");
  ["atk-brute", "atk-bsgs"].forEach((id) => ($(id).disabled = true));
  $("atk-stop").disabled = kind !== "brute";
  stopFlag = false;
  out.innerHTML = `<p class="caption">Running ${kind === "brute" ? "brute force" : "baby-step giant-step"}…</p>`;
  const prog = (f) => { $("atk-progress").style.width = `${Math.min(100, f * 100)}%`; };
  const r = kind === "brute" ? await A.bruteForce(Q, K, prog, () => stopFlag) : await A.bsgs(Q, K, prog);
  prog(1);
  ["atk-brute", "atk-bsgs"].forEach((id) => ($(id).disabled = false));
  $("atk-stop").disabled = true;
  if (r.d === null) { out.innerHTML = `<p class="bad">${r.stopped ? `Stopped after ${r.steps.toLocaleString("en")} candidates.` : "Key not found."}</p>`; return; }
  const verified = eq(scalarMult(r.d, T.CURVE.G, T.CURVE), Q);
  let plain = "";
  try { plain = T.decrypt(state.cipher.map(({ R, C }) => ({ R, C })), r.d); } catch (e) { plain = "(" + e.message + ")"; }
  const ops = kind === "brute" ? `${r.steps.toLocaleString("en")} point additions` :
    `${r.baby.toLocaleString("en")} baby steps + ${r.giant.toLocaleString("en")} giant steps (table of ${r.tableSize.toLocaleString("en")} points)`;
  out.innerHTML = `
    <div class="stat-row">
      <div class="stat"><div class="v">${r.d}</div><div class="l">recovered private key d</div></div>
      <div class="stat"><div class="v">${fmtDur(r.ms / 1000)}</div><div class="l">time</div></div>
      <div class="stat"><div class="v ${verified ? "ok" : "bad"}">${verified ? "d·G = Q ✓" : "✗"}</div><div class="l">exact verification</div></div>
    </div>
    <p class="caption">Work: ${ops}.</p>
    <p>Eve now decrypts the intercepted ciphertext of §1 using only public data and the recovered d (she uses R and C, not Alice's secrets):</p>
    <div class="big-text">${esc(plain)}</div>`;
}

async function scalingRun() {
  const btn = $("scale-run"); btn.disabled = true;
  const bruteBits = [8, 10, 12, 14, 16], bsgsBits = [8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28];
  const xs = bsgsBits;
  const bruteMs = {}, bsgsMs = {};
  let done = 0; const total = bruteBits.length + bsgsBits.length;
  const prog = () => { $("scale-progress").style.width = `${(++done / total) * 100}%`; };
  for (const b of bruteBits) {
    const k = T.keyGen(b);
    const r = await A.bruteForce(k.Q, 1n << BigInt(b));
    bruteMs[b] = r.ms; prog();
  }
  for (const b of bsgsBits) {
    const k = T.keyGen(b);
    const r = await A.bsgs(k.Q, 1n << BigInt(b));
    bsgsMs[b] = r.ms; prog();
  }
  const rate = state.rate;
  const expBrute = xs.map((b) => Math.log2(((2 ** b) / 2 / rate) * 1000));
  const expBsgs = xs.map((b) => Math.log2(((1.5 * 2 ** (b / 2)) / rate) * 1000));
  lineChart($("scale-chart"), xs, [
    { name: "brute force, measured (random d)", values: xs.map((b) => (bruteMs[b] ? Math.log2(Math.max(bruteMs[b], 0.1)) : null)), color: "var(--s1)" },
    { name: "brute force, expected 2^(b−1) additions", values: expBrute, color: "var(--s1)", dash: "5 4" },
    { name: "BSGS, measured", values: xs.map((b) => Math.log2(Math.max(bsgsMs[b], 0.1))), color: "var(--s2)" },
    { name: "BSGS, expected 1.5·2^(b/2) additions", values: expBsgs, color: "var(--s2)", dash: "5 4" },
  ], { yMin: Math.log2(0.1), yMax: Math.log2(1e8), yTicks: [0.1, 1, 100, 1e4, 1e6, 1e8].map(Math.log2),
    yFmt: (v) => fmtDur(2 ** v / 1000).replace(/\.0 /, " "),
    xTicks: xs, xTitle: "private-key bits b (d < 2^b)", yTitle: "time (log scale)", marginLeft: 74 });
  btn.disabled = false;
}

function extrapolationTable() {
  const rate = state.rate, big = 1e12;
  const rows = [16, 20, 32, 48, 64, 80, 128, 256].map((b) => {
    const brute = 2 ** (b - 1), bs = b === 256 ? 0.886 * 2 ** 128 : 1.5 * 2 ** (b / 2);
    const mem = 2 ** (b / 2) * 40;
    const units = [["kB", 1e3], ["MB", 1e6], ["GB", 1e9], ["TB", 1e12], ["PB", 1e15], ["EB", 1e18]];
    let memStr = `${mem.toExponential(0)} bytes`;
    for (const [u, v] of units) if (mem >= v && mem < v * 1000) memStr = `${(mem / v).toFixed(0)} ${u}`;
    if (mem >= 1e21) memStr += " (more than all storage on Earth)";
    return `<tr${b === 256 ? ' class="final"' : ""}><td>${b}${b === 256 ? " (full secp256k1)" : ""}</td>
      <td>${fmtDur(brute / rate)}</td><td>${fmtDur(bs / rate)}</td><td>${fmtDur(bs / big)}</td><td>${memStr}</td></tr>`;
  }).join("");
  $("extra-table").innerHTML = `<thead><tr><th>key bits b</th><th>brute force, this browser</th><th>√ methods (BSGS / rho / kangaroo), this browser</th>
    <th>√ methods at 10<sup>12</sup> additions/s (≈ 1000 GPUs, rough assumption)</th><th>BSGS table memory (rho/kangaroo: almost none)</th></tr></thead><tbody>${rows}</tbody>`;
}

// =============================================================================
// §6 Design flaw demo
// =============================================================================
async function weakRun() {
  const btn = $("weak-run"); btn.disabled = true;
  const text = stripHeader(state.corpora.test).slice(4000, 5500).replace(/\s+/g, " ");
  const k = T.keyGen(256);                         // FULL-size key on purpose
  $("weak-out").innerHTML = `<p class="caption">Encrypting ${text.length} characters, one point each…</p>`;
  const ct = await V.encryptPerChar(text, k.Q);
  const fa = V.frequencyAttack(ct.C, stripHeader(state.corpora.train).replace(/\s+/g, " "));
  let ok = 0;
  const recon = [...text].map((ch, i) => { const g = fa.guess[i]; if (g === ch) ok++; return `<span class="${g === ch ? "h" : "m"}">${esc(g)}</span>`; }).join("");
  const kp = V.knownPlaintextAttack(ct.C, text[0]);
  const show = (ch) => (ch === " " ? "␣" : esc(ch));
  const top = fa.symRank.slice(0, 8).map(([id, c], i) => `<tr><td>${i + 1}</td><td class="hex">${shortHex(id, 10, 6)}</td><td>${c}</td><td class="mono">${show(fa.corpusRank[i])}</td></tr>`).join("");
  $("weak-out").innerHTML = `
    <p>Private key: a <b>full 256-bit</b> d — the attack below does not touch it.
    The ${text.length}-character message produced only <b>${fa.distinct}</b> distinct ciphertext points (one per distinct character).</p>
    <div class="grid2">
      <div><div class="chart-title">Most frequent ciphertext points</div><div class="table-wrap"><table><thead><tr><th>rank</th><th>point</th><th>count</th><th>guess (corpus rank)</th></tr></thead><tbody>${top}</tbody></table></div></div>
      <div><div class="chart-title">1 · Ciphertext-only frequency attack</div>
        <p><b>${((ok / text.length) * 100).toFixed(1)}%</b> of the characters guessed correctly just by matching frequency ranks
        (green = right, red = wrong), with no key and no known plaintext.</p></div>
    </div>
    <div class="recon">${recon}</div>
    <h4>2 · Known-plaintext attack: the attacker only knows that the message starts with “${esc(text[0])}”</h4>
    <p>S = C₁ − Encode(“${esc(text[0])}”) → Mᵢ = Cᵢ − S for every i. Recovered text identical to the plaintext:
      <b class="${kp.text === text ? "ok" : "bad"}">${kp.text === text}</b></p>
    <div class="recon">${esc(kp.text.slice(0, 400))}…</div>`;
  btn.disabled = false;
}

// =============================================================================
// Boot
// =============================================================================
async function boot() {
  $("ecc-keygen").onclick = eccKeyGen;
  $("ecc-encrypt").onclick = eccEncrypt;
  $("ecc-bits").onchange = eccKeyGen;
  $("ecc-msg").addEventListener("change", () => { eccEncrypt(); caesarRun(); });
  $("cz-key").oninput = caesarRun;
  $("cmp-run").onclick = compareRun;
  $("ca-run").onclick = attackCaesar;
  $("ca-method").onchange = attackCaesar;
  $("ca-input").addEventListener("input", (e) => { e.target.dataset.touched = "1"; });
  $("exp-run").onclick = experimentRun;
  $("atk-brute").onclick = () => attackRun("brute");
  $("atk-bsgs").onclick = () => attackRun("bsgs");
  $("atk-stop").onclick = () => { stopFlag = true; };
  $("scale-run").onclick = scalingRun;
  $("weak-run").onclick = weakRun;

  state.rate = A.addsPerSecond();
  eccKeyGen();
  caesarRun();
  extrapolationTable();

  const [train, test, shak] = await Promise.all(["corpus-train", "corpus-test", "corpus-shakespeare"]
    .map((f) => fetch(`data/${f}.txt`).then((r) => { if (!r.ok) throw new Error(`cannot load ${f}`); return r.text(); })));
  state.corpora = { train, test, shakespeare: shak };
  state.model = X.buildModel(train);
  renderModel();
  attackCaesar();
  lipogramDemo();
  await experimentRun();
  await compareRun();
}
boot().catch((e) => { console.error(e); document.body.insertAdjacentHTML("afterbegin", `<p class="bad" style="padding:8px 16px">Error: ${esc(e.message)}</p>`); });
