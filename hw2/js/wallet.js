// =============================================================================
// wallet.js — Mnemonic → seed → keys → Ethereum address, step by step.
//   BIP-39  mnemonic ⇄ entropy, mnemonic → seed  (PBKDF2-HMAC-SHA512)
//   BIP-32  HD key derivation                    (HMAC-SHA512 + secp256k1)
//   BIP-44  derivation path m/44'/60'/0'/0/i for Ethereum
//   secp256k1 public key, Keccak-256 address, EIP-55 checksum
//
// SHA-256, SHA-512, HMAC and PBKDF2 come from the browser's Web Crypto API;
// secp256k1 arithmetic reuses HW1's ec.js; Keccak-256 is our keccak.js.
//
// WARNING: educational code. Never type a real seed phrase into ANY website,
// including this one.
// =============================================================================

import { SECP256K1 as S, scalarMult, mod } from "../../hw1/js/ec.js";
import { keccak256 } from "./keccak.js";
import { WORDLIST } from "./wordlist.js";

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();

// ---- byte helpers -----------------------------------------------------------
export const toHex = (b) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
export const fromHex = (h) => Uint8Array.from(h.match(/../g) || [], (x) => parseInt(x, 16));
export const bytesToBig = (b) => b.reduce((a, x) => (a << 8n) | BigInt(x), 0n);
export function bigToBytes(v, len) {
  const out = new Uint8Array(len);
  for (let i = len - 1; i >= 0; i--) { out[i] = Number(v & 0xffn); v >>= 8n; }
  return out;
}
const concat = (...arrs) => { const o = new Uint8Array(arrs.reduce((s, a) => s + a.length, 0)); let p = 0; for (const a of arrs) { o.set(a, p); p += a.length; } return o; };
const bits = (bytes) => [...bytes].map((x) => x.toString(2).padStart(8, "0")).join("");

export async function sha256(b) { return new Uint8Array(await subtle.digest("SHA-256", b)); }
export async function hmacSha512(key, data) {
  const k = await subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  return new Uint8Array(await subtle.sign("HMAC", k, data));
}

// =============================================================================
// BIP-39 — KEY GENERATION (randomness) + ENCODING (words) + CHECKSUM
// =============================================================================

/** Fresh entropy from the OS CSPRNG: this is the only truly random step. */
export function randomEntropy(nBytes = 16) {
  return crypto.getRandomValues(new Uint8Array(nBytes));
}

/**
 * entropy (ENT = 128…256 bits) → mnemonic.
 *   CS  = ENT / 32 checksum bits = first CS bits of SHA-256(entropy)
 *   (ENT + CS) bits are split into 11-bit groups → index into 2048 words.
 *   128 bits → 4 checksum bits → 132 bits → 12 words.
 */
export async function entropyToMnemonic(entropy) {
  const ENT = entropy.length * 8, CS = ENT / 32;
  const entBits = bits(entropy);
  const csBits = bits(await sha256(entropy)).slice(0, CS);
  const all = entBits + csBits;
  const indices = [];
  for (let i = 0; i < all.length; i += 11) indices.push(parseInt(all.slice(i, i + 11), 2));
  return { words: indices.map((i) => WORDLIST[i]), indices, entBits, csBits };
}

/** Checks words, length and checksum. Returns {valid, reason, indices}. */
export async function validateMnemonic(phrase) {
  const words = phrase.normalize("NFKD").trim().split(/\s+/);
  if (![12, 15, 18, 21, 24].includes(words.length)) return { valid: false, reason: `${words.length} words (must be 12/15/18/21/24)` };
  const indices = words.map((w) => WORDLIST.indexOf(w));
  const unknown = words.filter((_, i) => indices[i] < 0);
  if (unknown.length) return { valid: false, reason: `not in the BIP-39 wordlist: ${unknown.join(", ")}` };
  const all = indices.map((i) => i.toString(2).padStart(11, "0")).join("");
  const CS = all.length / 33, ENT = all.length - CS;
  const entropy = Uint8Array.from(all.slice(0, ENT).match(/.{8}/g), (b) => parseInt(b, 2));
  const expected = bits(await sha256(entropy)).slice(0, CS);
  const got = all.slice(ENT);
  return { valid: expected === got, reason: expected === got ? "checksum OK" : `checksum mismatch (expected ${expected}, got ${got})`, indices, entropy, csBits: got };
}

/**
 * mnemonic (+ optional passphrase) → 512-bit seed.
 * PBKDF2-HMAC-SHA512, 2048 iterations, salt = "mnemonic" + passphrase.
 * This is KEY STRETCHING: deliberately slow, to make guessing expensive.
 * Note: the seed is derived from the WORDS, not from the entropy, and any
 * passphrase gives a valid (different) wallet — there is no "wrong" passphrase.
 */
export async function mnemonicToSeed(phrase, passphrase = "") {
  const pw = enc.encode(phrase.normalize("NFKD").trim().split(/\s+/).join(" "));
  const salt = enc.encode(("mnemonic" + passphrase).normalize("NFKD"));
  const key = await subtle.importKey("raw", pw, "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-512", salt, iterations: 2048 }, key, 512));
}

// =============================================================================
// BIP-32 / BIP-44 — KEY DERIVATION (deterministic)
// =============================================================================
export const HARDENED = 0x80000000;

/** Compressed SEC1 encoding: 0x02/0x03 (parity of y) || x  (33 bytes). */
export function serPubCompressed(Q) {
  return concat(Uint8Array.of(Q.y & 1n ? 0x03 : 0x02), bigToBytes(Q.x, 32));
}

/** Master node: I = HMAC-SHA512(key = "Bitcoin seed", seed); k = I_L, chain code = I_R. */
export async function masterNode(seed) {
  const I = await hmacSha512(enc.encode("Bitcoin seed"), seed);
  const k = bytesToBig(I.slice(0, 32));
  if (k === 0n || k >= S.n) throw new Error("invalid master key (probability < 2^-127)");
  return { k, c: I.slice(32), depth: 0, index: null, path: "m" };
}

/**
 * Child key derivation, private → private (CKDpriv).
 *   hardened  (i ≥ 2^31): data = 0x00 || ser256(k_par) || ser32(i)
 *   normal    (i < 2^31): data = serP(k_par·G)         || ser32(i)
 *   I = HMAC-SHA512(c_par, data);  k_i = (I_L + k_par) mod n;  c_i = I_R
 * Hardened children need the parent PRIVATE key; normal children can also be
 * derived from the parent PUBLIC key (watch-only wallets) — and that is why
 * leaking a normal child private key + parent xpub reveals the parent key.
 */
export async function ckdPriv(parent, i) {
  const hardened = i >= HARDENED;
  const ser32 = Uint8Array.of(i >>> 24, (i >>> 16) & 255, (i >>> 8) & 255, i & 255);
  const data = hardened
    ? concat(Uint8Array.of(0), bigToBytes(parent.k, 32), ser32)
    : concat(serPubCompressed(scalarMult(parent.k, S.G, S)), ser32);
  const I = await hmacSha512(parent.c, data);
  const IL = bytesToBig(I.slice(0, 32));
  const k = mod(IL + parent.k, S.n);
  if (IL >= S.n || k === 0n) throw new Error("invalid child, use next index (probability < 2^-127)");
  const label = hardened ? `${i - HARDENED}'` : `${i}`;
  return { k, c: I.slice(32), depth: parent.depth + 1, index: i, hardened, path: `${parent.path}/${label}` };
}

/** Parses "m/44'/60'/0'/0/0" into indices. */
export function parsePath(path) {
  const parts = path.trim().split("/");
  if (parts[0] !== "m") throw new Error("path must start with m");
  return parts.slice(1).map((p) => {
    const h = /'$|h$/i.test(p);
    const n = parseInt(p, 10);
    if (!(n >= 0 && n < HARDENED)) throw new Error(`bad index ${p}`);
    return h ? n + HARDENED : n;
  });
}

/** Derives every node along the path, returning the list for display. */
export async function derivePath(seed, path) {
  let node = await masterNode(seed);
  const nodes = [node];
  for (const i of parsePath(path)) { node = await ckdPriv(node, i); nodes.push(node); }
  return nodes;
}

/** BIP-44 meaning of each level of m / purpose' / coin_type' / account' / change / address_index. */
export const BIP44_LEVELS = ["master", "purpose (44' = BIP-44)", "coin type (60' = Ether, SLIP-44)", "account", "change (0 = external)", "address index"];

// =============================================================================
// secp256k1 — PUBLIC-KEY CRYPTOGRAPHY;  Keccak-256 — HASHING;  EIP-55 — CHECKSUM
// =============================================================================

/** Public key Q = k·G, Ethereum form = 64 bytes x || y (no 0x04 prefix). */
export function publicKey(k) {
  const Q = scalarMult(k, S.G, S);
  return { Q, raw: concat(bigToBytes(Q.x, 32), bigToBytes(Q.y, 32)) };
}

/** Address = last 20 bytes of Keccak-256(x || y), as lowercase hex. */
export function addressFromPub(raw) {
  const h = keccak256(raw);
  return { hash: h, address: toHex(h.slice(12)) };
}

/**
 * EIP-55: h = Keccak-256(ASCII of the 40 lowercase hex chars).
 * For each position i: if char is a letter (a–f) and the i-th hex digit of h
 * is ≥ 8, write it UPPERCASE. Digits 0–9 carry no information.
 * Returns the checksummed address and the per-character detail.
 */
export function eip55(addrLowerHex) {
  const a = addrLowerHex.toLowerCase().replace(/^0x/, "");
  const hHex = toHex(keccak256(enc.encode(a)));
  let out = "";
  const detail = [];
  for (let i = 0; i < 40; i++) {
    const ch = a[i], nib = parseInt(hHex[i], 16), letter = /[a-f]/.test(ch);
    const upper = letter && nib >= 8;
    out += upper ? ch.toUpperCase() : ch;
    detail.push({ ch, nib, letter, upper });
  }
  return { checksummed: "0x" + out, hashHex: hHex, detail };
}

/** True if a mixed-case address matches its EIP-55 checksum. */
export function isValidEip55(addr) {
  const a = addr.replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{40}$/.test(a)) return false;
  return eip55(a).checksummed.slice(2) === a;
}

// =============================================================================
// Full pipeline
// =============================================================================
export async function pipeline(phrase, passphrase, path) {
  const v = await validateMnemonic(phrase);
  const seed = await mnemonicToSeed(phrase, passphrase);
  const nodes = await derivePath(seed, path);
  const leaf = nodes[nodes.length - 1];
  const pub = publicKey(leaf.k);
  const { hash, address } = addressFromPub(pub.raw);
  const cs = eip55(address);
  return { validation: v, seed, nodes, leaf, pub, hash, address, cs };
}
