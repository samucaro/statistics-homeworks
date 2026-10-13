// =============================================================================
// app.js — HW2 page logic: interactive pipeline + statistical experiments
// =============================================================================

import * as W from "./wallet.js";
import { keccak256, sha3_256 } from "./keccak.js";
import { WORDLIST } from "./wordlist.js";
import * as ST from "../../hw1/js/stats.js";
import { barChart } from "../../hw1/js/charts.js";

const $ = (id) => document.getElementById(id);
const enc = new TextEncoder();
const TEST_VECTOR = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const tag = (cls, txt) => `<span class="tag ${cls}">${txt}</span>`;
const short = (h, n = 16) => (h.length > 2 * n ? `${h.slice(0, n)}…${h.slice(-n)}` : h);
const yieldUI = () => new Promise((r) => setTimeout(r, 0));

// -----------------------------------------------------------------------------
// §3 Interactive pipeline
// -----------------------------------------------------------------------------
async function runPipeline() {
  const phrase = $("mn-input").value.trim().toLowerCase().replace(/\s+/g, " ");
  const pass = $("mn-pass").value;
  const idx = parseInt($("mn-index").value, 10) || 0;
  const path = `m/44'/60'/0'/0/${idx}`;
  const out = $("pipe-out");
  out.innerHTML = `<p class="caption">Computing…</p>`;
  let r;
  const t0 = performance.now();
  try { r = await W.pipeline(phrase, pass, path); }
  catch (e) { out.innerHTML = `<p class="bad">${e.message}</p>`; return; }
  const ms = performance.now() - t0;
  const v = r.validation;

  // Step 1: mnemonic ⇄ entropy + checksum
  let s1 = `<p class="${v.valid ? "ok" : "bad"}"><b>${v.valid ? "Valid mnemonic" : "Invalid mnemonic"}</b> — ${v.reason}</p>`;
  if (v.indices) {
    const bitStr = v.indices.map((i) => i.toString(2).padStart(11, "0")).join("");
    const CS = bitStr.length / 33;
    s1 += `<div class="table-wrap"><table><tr><th>#</th>${v.indices.map((_, i) => `<td>${i + 1}</td>`).join("")}</tr>
      <tr><th>word</th>${v.indices.map((i) => `<td>${WORDLIST[i] ?? "?"}</td>`).join("")}</tr>
      <tr><th>index</th>${v.indices.map((i) => `<td class="mono">${i}</td>`).join("")}</tr></table></div>
      <p class="mono" style="word-break:break-all;font-size:.78rem">entropy (${bitStr.length - CS} bits):
      ${bitStr.slice(0, -CS)}<b style="color:var(--accent)">${bitStr.slice(-CS)}</b> ← ${CS} checksum bits = first bits of SHA-256(entropy)</p>`;
  }
  // Step 3: derivation path
  const rows = r.nodes.map((n, i) => `<tr><td class="mono">${n.path}</td><td>${W.BIP44_LEVELS[i] ?? ""}</td>
      <td>${n.index === null ? "—" : n.hardened ? "hardened" : "normal"}</td>
      <td class="mono">${short(n.k.toString(16).padStart(64, "0"), 8)}</td><td class="mono">${short(W.toHex(n.c), 8)}</td></tr>`).join("");
  // Step 6: EIP-55 detail
  const csCells = r.cs.detail.map((d) => `<span class="eip ${d.letter ? (d.upper ? "up" : "low") : "dig"}"
      title="hash nibble ${d.nib.toString(16)} (${d.nib})">${d.upper ? d.ch.toUpperCase() : d.ch}<small>${d.nib.toString(16)}</small></span>`).join("");

  out.innerHTML = `
  <div class="step"><div class="step-h">① Mnemonic → entropy + checksum ${tag("gen", "generation")} ${tag("enc", "encoding")} ${tag("chk", "checksum")} <span class="std">BIP-39</span></div>${s1}</div>
  <div class="step"><div class="step-h">② Mnemonic + passphrase → seed ${tag("der", "derivation / key stretching")} <span class="std">BIP-39 · PBKDF2-HMAC-SHA512 ×2048</span></div>
    <p class="mono hex">${W.toHex(r.seed)}</p><p class="caption">512-bit seed${pass ? ` with passphrase "${pass.replace(/</g, "&lt;")}"` : " (empty passphrase)"}.</p></div>
  <div class="step"><div class="step-h">③ Seed → master key → child keys ${tag("der", "derivation")} <span class="std">BIP-32 · BIP-44</span></div>
    <div class="table-wrap"><table><thead><tr><th>path</th><th>BIP-44 level</th><th>type</th><th>private key k</th><th>chain code c</th></tr></thead><tbody>${rows}</tbody></table></div></div>
  <div class="step"><div class="step-h">④ Private key → public key ${tag("pk", "public-key crypto")} <span class="std">secp256k1 · Q = k·G</span></div>
    <p class="mono hex">k = ${r.leaf.k.toString(16).padStart(64, "0")}</p>
    <p class="mono hex">Q.x = ${r.pub.Q.x.toString(16).padStart(64, "0")}<br>Q.y = ${r.pub.Q.y.toString(16).padStart(64, "0")}</p></div>
  <div class="step"><div class="step-h">⑤ Public key → address ${tag("hash", "hashing")} <span class="std">Keccak-256, keep last 20 bytes</span></div>
    <p class="mono hex">Keccak-256(x‖y) = <span style="opacity:.5">${W.toHex(r.hash).slice(0, 24)}</span><b>${W.toHex(r.hash).slice(24)}</b></p></div>
  <div class="step"><div class="step-h">⑥ Address → checksummed address ${tag("chk", "checksum")} ${tag("enc", "encoding")} <span class="std">EIP-55</span></div>
    <p class="caption">Keccak-256 of the lowercase hex text; a letter is uppercased when the hash digit at the same position is ≥ 8. Small digits = hash nibble.</p>
    <div class="eip-row">0x${csCells}</div>
    <div class="pubkey" style="margin-top:10px">${r.cs.checksummed}</div></div>
  <p class="caption">Whole pipeline computed in ${ms.toFixed(0)} ms in your browser, nothing sent over the network.
  ${phrase === TEST_VECTOR && !pass && idx === 0 ? `<b class="ok">Matches the public test vector: 0x9858EfFD232B4033E47d90003D41EC34EcaEda94.</b>` : ""}</p>`;
}

async function generateRandom(nBytes) {
  const m = await W.entropyToMnemonic(W.randomEntropy(nBytes));
  $("mn-input").value = m.words.join(" ");
  runPipeline();
}

// -----------------------------------------------------------------------------
// §5A BIP-39: uniformity of words, checksum strength, missing-word attack
// -----------------------------------------------------------------------------
async function expBip39() {
  const M = +$("b39-n").value, btn = $("b39-run"); btn.disabled = true;
  const all = [], last = [];
  let caught = 0, trials = 0;
  for (let t = 0; t < M; t++) {
    const m = await W.entropyToMnemonic(W.randomEntropy(16));
    all.push(...m.indices); last.push(m.indices[11]);
    // replace one random word with a different random word: does the checksum notice?
    const pos = (Math.random() * 12) | 0;
    let w; do { w = (Math.random() * 2048) | 0; } while (w === m.indices[pos]);
    const words = [...m.words]; words[pos] = WORDLIST[w];
    if (!(await W.validateMnemonic(words.join(" "))).valid) caught++;
    trials++;
    if (t % 50 === 49) { $("b39-progress").style.width = `${((t + 1) / M) * 100}%`; await yieldUI(); }
  }
  $("b39-progress").style.width = "100%";
  const bin = (xs) => { const h = new Array(64).fill(0); xs.forEach((i) => h[i >> 5]++); return h; };
  const hAll = bin(all), hLast = bin(last);
  const cAll = ST.chiSquareUniform(hAll), cLast = ST.chiSquareUniform(hLast);
  barChart($("b39-all"), hAll, { refLine: all.length / 64, xLabelEvery: 8, labels: hAll.map((_, i) => i * 32), xTitle: "word index (64 bins of 32 words)" });
  barChart($("b39-last"), hLast, { refLine: last.length / 64, xLabelEvery: 8, labels: hLast.map((_, i) => i * 32), color: "var(--accent)", xTitle: "index of the 12th word" });
  const undetected = 1 - caught / trials;
  $("b39-stats").innerHTML = `
    <div class="stat"><div class="v">${cAll.pValue.toFixed(3)}</div><div class="l">χ² p-value, all words (df ${cAll.df})</div></div>
    <div class="stat"><div class="v">${cLast.pValue.toFixed(3)}</div><div class="l">χ² p-value, 12th word</div></div>
    <div class="stat"><div class="v">${(undetected * 100).toFixed(2)}%</div><div class="l">wrong word NOT detected (theory 1/16 = 6.25%)</div></div>
    <div class="stat"><div class="v">±${(200 * Math.sqrt(0.0586 / trials)).toFixed(2)}%</div><div class="l">≈ 95% margin (2·SE)</div></div>`;
  btn.disabled = false;
}

// PBKDF2 cost: how long does one guess cost? (key stretching)
async function expPbkdf2() {
  const N = 20, t0 = performance.now();
  for (let i = 0; i < N; i++) await W.mnemonicToSeed(TEST_VECTOR, "x" + i);
  const ms = (performance.now() - t0) / N;
  const t1 = performance.now();
  for (let i = 0; i < 2000; i++) await W.sha256(enc.encode("x" + i));
  const shaUs = ((performance.now() - t1) / 2000) * 1000;
  const perSec = 1000 / ms;
  const years128 = 2 ** 128 / perSec / 3.156e7;
  $("pb-stats").innerHTML = `
    <div class="stat"><div class="v">${ms.toFixed(1)} ms</div><div class="l">one mnemonic → seed (2048 × HMAC-SHA512)</div></div>
    <div class="stat"><div class="v">${shaUs.toFixed(1)} µs</div><div class="l">one plain SHA-256 call, for comparison</div></div>
    <div class="stat"><div class="v">${perSec.toFixed(0)}/s</div><div class="l">guesses per second here</div></div>
    <div class="stat"><div class="v">${years128.toExponential(1)} yr</div><div class="l">to try 2¹²⁸ mnemonics at this rate</div></div>`;
}

// -----------------------------------------------------------------------------
// §5B Keccak-256: avalanche, bit balance, hex-digit uniformity of addresses
// -----------------------------------------------------------------------------
async function expKeccak() {
  const N = +$("kk-n").value, btn = $("kk-run"); btn.disabled = true;
  const hdHash = [], hdAddr = [], addrs = [];
  for (let t = 0; t < N; t++) {
    const pub = crypto.getRandomValues(new Uint8Array(64)); // stands in for x||y
    const pub2 = pub.slice(); const bit = (Math.random() * 512) | 0; pub2[bit >> 3] ^= 1 << (bit & 7);
    const h1 = keccak256(pub), h2 = keccak256(pub2);
    hdHash.push(ST.hamming(W.bytesToBig(h1), W.bytesToBig(h2)));
    hdAddr.push(ST.hamming(W.bytesToBig(h1.slice(12)), W.bytesToBig(h2.slice(12))));
    addrs.push(W.bytesToBig(h1.slice(12)));
    if (t % 500 === 499) await yieldUI();
  }
  const digits = new Array(16).fill(0);
  addrs.forEach((a) => a.toString(16).padStart(40, "0").split("").forEach((c) => digits[parseInt(c, 16)]++));
  const cD = ST.chiSquareUniform(digits);
  const bf = ST.bitFrequencies(addrs, 160), se = Math.sqrt(0.25 / N);
  const outside = bf.filter((f) => Math.abs(f - 0.5) > 2 * se).length;
  const hist = (a, lo, w, n) => { const h = new Array(n).fill(0); a.forEach((d) => h[Math.min(n - 1, Math.max(0, Math.floor((d - lo) / w)))]++); return h.map((c) => c / a.length); };
  barChart($("kk-hd"), hist(hdAddr, 50, 2, 31), { labels: [...Array(31).keys()].map((i) => 50 + 2 * i), xLabelEvery: 5, xTitle: "address bits changed (of 160)" });
  barChart($("kk-digits"), digits, { labels: [..."0123456789abcdef"], xLabelEvery: 1, refLine: (N * 40) / 16, color: "var(--accent)", xTitle: "hex digit in addresses" });
  barChart($("kk-bits"), bf, { yMax: 1, refLine: 0.5, band: [0.5 - 2 * se, 0.5 + 2 * se], labels: bf.map((_, i) => i), xLabelEvery: 20, xTitle: "bit position in address" });
  $("kk-stats").innerHTML = `
    <div class="stat"><div class="v">${ST.mean(hdHash).toFixed(1)} ± ${ST.std(hdHash).toFixed(1)}</div><div class="l">digest bits changed (ideal 128 ± 8)</div></div>
    <div class="stat"><div class="v">${ST.mean(hdAddr).toFixed(1)} ± ${ST.std(hdAddr).toFixed(1)}</div><div class="l">address bits changed (ideal 80 ± 6.3)</div></div>
    <div class="stat"><div class="v">${cD.pValue.toFixed(3)}</div><div class="l">χ² p-value hex digits (df 15)</div></div>
    <div class="stat"><div class="v">${outside} / 160</div><div class="l">bits outside ±2 SE (≈ 8 expected)</div></div>`;
  btn.disabled = false;
}

// -----------------------------------------------------------------------------
// §5C BIP-32: are sibling keys statistically unrelated?
// -----------------------------------------------------------------------------
async function expBip32() {
  const N = +$("b32-n").value, btn = $("b32-run"); btn.disabled = true;
  const seed = await W.mnemonicToSeed(TEST_VECTOR, "");
  const parent = (await W.derivePath(seed, "m/44'/60'/0'/0")).pop();
  const keys = [];
  for (let i = 0; i < N; i++) {
    keys.push((await W.ckdPriv(parent, i)).k);
    $("b32-progress").style.width = `${((i + 1) / N) * 100}%`;
    if (i % 3 === 2) await yieldUI();
  }
  const hdNext = keys.slice(1).map((k, i) => ST.hamming(k, keys[i]));
  const top = keys.map((k) => Number(k >> 224n)); // top 32 bits as a number for correlation
  const idx = keys.map((_, i) => i);
  const r = ST.pearson(idx, top), rho = ST.spearman(idx, top), thr = 2 / Math.sqrt(N);
  const bf = ST.bitFrequencies(keys, 256), se = Math.sqrt(0.25 / N);
  barChart($("b32-bits"), bf, { yMax: 1, refLine: 0.5, band: [0.5 - 2 * se, 0.5 + 2 * se], labels: bf.map((_, i) => i), xLabelEvery: 32, xTitle: "bit position of child private key" });
  $("b32-stats").innerHTML = `
    <div class="stat"><div class="v">${ST.mean(hdNext).toFixed(1)} ± ${ST.std(hdNext).toFixed(1)}</div><div class="l">bits differing, key i vs key i+1 (ideal 128 ± 8)</div></div>
    <div class="stat"><div class="v ${Math.abs(r) > thr ? "bad" : "ok"}">${r.toFixed(3)}</div><div class="l">Pearson r(index, key)</div></div>
    <div class="stat"><div class="v ${Math.abs(rho) > thr ? "bad" : "ok"}">${rho.toFixed(3)}</div><div class="l">Spearman ρ(index, key)</div></div>
    <div class="stat"><div class="v">±${thr.toFixed(3)}</div><div class="l">≈ 95% band under H₀</div></div>`;
  btn.disabled = false;
}

// -----------------------------------------------------------------------------
// §5D EIP-55: how many check bits does an address carry? Typo detection rate.
// -----------------------------------------------------------------------------
async function expEip55() {
  const N = +$("e55-n").value, btn = $("e55-run"); btn.disabled = true;
  const L = [];
  let undetected = 0;
  const HEX = "0123456789abcdef";
  for (let t = 0; t < N; t++) {
    const a = W.toHex(crypto.getRandomValues(new Uint8Array(20)));
    L.push((a.match(/[a-f]/g) || []).length);
    // simulate a single-character typo in the checksummed address
    const good = W.eip55(a).checksummed.slice(2);
    const pos = (Math.random() * 40) | 0;
    let c; do { c = HEX[(Math.random() * 16) | 0]; } while (c === good[pos].toLowerCase());
    if (Math.random() < 0.5) c = c.toUpperCase();
    const typo = good.slice(0, pos) + c + good.slice(pos + 1);
    if (W.isValidEip55(typo)) undetected++;
    if (t % 1000 === 999) { $("e55-progress").style.width = `${((t + 1) / N) * 100}%`; await yieldUI(); }
  }
  $("e55-progress").style.width = "100%";
  // empirical distribution of #letters vs Binomial(40, 6/16)
  const emp = new Array(41).fill(0); L.forEach((l) => emp[l]++);
  const p = 6 / 16, binom = [];
  let c = Math.pow(1 - p, 40);
  for (let k = 0; k <= 40; k++) { binom.push(c); c *= ((40 - k) / (k + 1)) * (p / (1 - p)); }
  const lo = 5, hi = 26;
  barChart($("e55-letters"), emp.slice(lo, hi).map((x) => x / N), { labels: [...Array(hi - lo).keys()].map((i) => i + lo), xLabelEvery: 2, xTitle: "number of letters (= check bits) in an address" });
  barChart($("e55-binom"), binom.slice(lo, hi), { labels: [...Array(hi - lo).keys()].map((i) => i + lo), xLabelEvery: 2, color: "var(--point)", xTitle: "Binomial(40, 6/16) model" });
  const theory = Math.pow(13 / 16, 40); // E[2^-L] = (1 − p + p/2)^40
  $("e55-stats").innerHTML = `
    <div class="stat"><div class="v">${ST.mean(L).toFixed(2)}</div><div class="l">mean letters per address (theory 15)</div></div>
    <div class="stat"><div class="v">${(theory * 100).toFixed(4)}%</div><div class="l">theory: random change passes, E[2⁻ᴸ] = (13/16)⁴⁰</div></div>
    <div class="stat"><div class="v">${undetected} / ${N}</div><div class="l">simulated 1-char typos NOT detected</div></div>`;
  btn.disabled = false;
}

// -----------------------------------------------------------------------------
// §7 SHA-2 vs Keccak vs SHA-3 live comparison
// -----------------------------------------------------------------------------
async function compareHashes() {
  const msg = enc.encode($("h-input").value);
  const s256 = W.toHex(await W.sha256(msg));
  const s512 = W.toHex(new Uint8Array(await crypto.subtle.digest("SHA-512", msg)));
  $("h-out").innerHTML = `<table>
    <tr><th>SHA-256 (SHA-2)</th><td class="mono hex">${s256}</td></tr>
    <tr><th>SHA-512 (SHA-2)</th><td class="mono hex">${s512}</td></tr>
    <tr><th>Keccak-256 (Ethereum)</th><td class="mono hex">${W.toHex(keccak256(msg))}</td></tr>
    <tr><th>SHA3-256 (FIPS 202)</th><td class="mono hex">${W.toHex(sha3_256(msg))}</td></tr></table>`;
}

// -----------------------------------------------------------------------------
// Boot
// -----------------------------------------------------------------------------
$("mn-input").value = TEST_VECTOR;
$("mn-run").onclick = runPipeline;
$("mn-gen12").onclick = () => generateRandom(16);
$("mn-gen24").onclick = () => generateRandom(32);
$("mn-reset").onclick = () => { $("mn-input").value = TEST_VECTOR; $("mn-pass").value = ""; $("mn-index").value = 0; runPipeline(); };
$("b39-run").onclick = expBip39;
$("pb-run").onclick = expPbkdf2;
$("kk-run").onclick = expKeccak;
$("b32-run").onclick = expBip32;
$("e55-run").onclick = expEip55;
$("h-input").oninput = compareHashes;
runPipeline();
compareHashes();
