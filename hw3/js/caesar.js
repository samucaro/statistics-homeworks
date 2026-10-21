// =============================================================================
// caesar.js — The Caesar cipher
//   Letters are numbers 0…25 (A = 0). Key k ∈ {0, …, 25}.
//   Encryption:  c = (p + k) mod 26
//   Decryption:  p = (c − k) mod 26
// Case is preserved; characters outside A–Z (spaces, punctuation, digits)
// are copied unchanged — a common textbook convention, which also means the
// ciphertext still shows word lengths and punctuation (useful to an attacker).
// =============================================================================

const A = 65, a = 97;

export function shiftText(text, k) {
  k = ((k % 26) + 26) % 26;
  let out = "";
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (c >= A && c < A + 26) out += String.fromCharCode(A + ((c - A + k) % 26));
    else if (c >= a && c < a + 26) out += String.fromCharCode(a + ((c - a + k) % 26));
    else out += ch;
  }
  return out;
}

export const encrypt = (text, k) => shiftText(text, k);
export const decrypt = (text, k) => shiftText(text, -k);

/** Letters only, as numbers 0…25 (case-insensitive). */
export function letterIndices(text) {
  const out = [];
  for (const ch of text) {
    const c = ch.charCodeAt(0) | 32;              // lower-case ASCII letters
    if (c >= a && c < a + 26) out.push(c - a);
  }
  return out;
}

/** Counts of each letter A–Z. */
export function letterCounts(text) {
  const n = new Array(26).fill(0);
  for (const i of letterIndices(text)) n[i]++;
  return n;
}

/**
 * Index of coincidence: probability that two letters drawn without
 * replacement from the text are equal.  IC = Σ nᵢ(nᵢ−1) / (N(N−1)).
 * English ≈ 0.066; uniformly random letters = 1/26 ≈ 0.0385.
 * Any monoalphabetic substitution (Caesar included) leaves it unchanged.
 */
export function indexOfCoincidence(counts) {
  const N = counts.reduce((s, x) => s + x, 0);
  return counts.reduce((s, x) => s + x * (x - 1), 0) / (N * (N - 1));
}

export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
