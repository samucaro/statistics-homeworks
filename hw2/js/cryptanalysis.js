// =============================================================================
// cryptanalysis.js — Statistical key recovery for the Caesar cipher
//
// Idea: the Caesar cipher has only 26 keys, so we can try all of them
// (exhaustive search). The hard part is not the search but RECOGNISING the
// right plaintext automatically. We do it statistically: decrypt with every
// shift s and give each candidate a score measuring how much it looks like
// the known language, estimated from a training corpus.
//
// Scoring functions implemented (higher = more English-like):
//   maxE   – heuristic: the most frequent ciphertext letter is 'E'
//   chi2   – Pearson χ² distance between candidate letter counts and the
//            corpus letter distribution (we maximise −χ²)
//   uni    – unigram log-likelihood  Σ log P(xₜ)
//   bi     – bigram  log-likelihood  log P(x₁) + Σ log P(xₜ | xₜ₋₁)
//   tri    – trigram log-likelihood  … + Σ log P(xₜ | xₜ₋₂ xₜ₋₁)
//   dict   – fraction of letters belonging to words found in the corpus vocabulary
// n-gram models use letters only (spaces and punctuation removed), with
// add-one (Laplace) smoothing so that unseen n-grams do not get probability 0.
// =============================================================================

import { letterIndices } from "./caesar.js";

export const METHODS = [
  { id: "maxE", name: "Most frequent letter = E" },
  { id: "chi2", name: "χ² vs corpus frequencies" },
  { id: "uni", name: "Unigram log-likelihood" },
  { id: "bi", name: "Bigram log-likelihood" },
  { id: "tri", name: "Trigram log-likelihood" },
  { id: "dict", name: "Dictionary words" },
];

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const stripHeader = (t) => t.split("\n").filter((l) => !l.startsWith("#")).join("\n");

// -----------------------------------------------------------------------------
// Language model from the training corpus
// -----------------------------------------------------------------------------
export function buildModel(rawText) {
  const text = stripHeader(rawText);
  const x = letterIndices(text);
  const N = x.length;
  const c1 = new Float64Array(26), c2 = new Float64Array(26 * 26), c3 = new Float64Array(26 * 26 * 26);
  for (let t = 0; t < N; t++) {
    c1[x[t]]++;
    if (t >= 1) c2[x[t - 1] * 26 + x[t]]++;
    if (t >= 2) c3[(x[t - 2] * 26 + x[t - 1]) * 26 + x[t]]++;
  }
  const p = Array.from(c1, (c) => c / N);
  // log-probabilities with add-one smoothing
  const lp1 = Array.from(c1, (c) => Math.log((c + 1) / (N + 26)));
  const first2 = new Float64Array(26), first3 = new Float64Array(676);
  for (let i = 0; i < 676; i++) first2[(i / 26) | 0] += c2[i];
  for (let i = 0; i < 17576; i++) first3[(i / 26) | 0] += c3[i];
  const lp2 = new Float64Array(676), lp3 = new Float64Array(17576);
  for (let i = 0; i < 676; i++) lp2[i] = Math.log((c2[i] + 1) / (first2[(i / 26) | 0] + 26));
  for (let i = 0; i < 17576; i++) lp3[i] = Math.log((c3[i] + 1) / (first3[(i / 26) | 0] + 26));

  // Entropy estimates (bits per letter) — plug-in estimators
  const H = (counts, total) => { let h = 0; for (const c of counts) if (c) h -= (c / total) * Math.log2(c / total); return h; };
  const H1 = H(c1, N), H12 = H(c2, N - 1), H123 = H(c3, N - 2);
  const entropy = { H0: Math.log2(26), H1, H2: H12 - H1, H3: H123 - H12 };

  // Vocabulary for the dictionary method
  const vocab = new Set(text.toLowerCase().match(/[a-z]+/g));

  return { N, counts: Array.from(c1), p, lp1, lp2, lp3, entropy, vocab, nWords: vocab.size };
}

/**
 * Unicity distance (Shannon): the ciphertext length beyond which, on average,
 * only one key gives a meaningful plaintext.  U = H(K) / D, where
 * H(K) = log2 26 is the key entropy and D = log2 26 − H is the redundancy
 * of the language per letter, as seen by a model with entropy H.
 */
export const unicity = (H) => Math.log2(26) / (Math.log2(26) - H);

// -----------------------------------------------------------------------------
// Scoring all 26 shifts
// -----------------------------------------------------------------------------

/** Pre-processes a ciphertext once: letter indices and words (as index arrays). */
export function prepare(cipherText) {
  const letters = letterIndices(cipherText);
  const words = (cipherText.toLowerCase().match(/[a-z]+/g) || []).map((w) => Array.from(w, (ch) => ch.charCodeAt(0) - 97));
  const counts = new Array(26).fill(0);
  for (const i of letters) counts[i]++;
  return { letters, words, counts, L: letters.length };
}

/** Returns an array of 26 scores: scores[s] = score of decrypting with key s. */
export function scoreShifts(prep, method, M) {
  const { letters: c, counts, L, words } = prep;
  const scores = new Array(26).fill(0);
  for (let s = 0; s < 26; s++) {
    const dec = (v) => (v - s + 26) % 26;
    switch (method) {
      case "maxE": { // only the count of the letter that would decrypt to 'E'
        scores[s] = counts[(4 + s) % 26];
        break;
      }
      case "chi2": {
        let chi = 0;
        for (let i = 0; i < 26; i++) { const O = counts[(i + s) % 26], E = L * M.p[i]; chi += (O - E) ** 2 / E; }
        scores[s] = -chi;
        break;
      }
      case "uni": {
        let ll = 0;
        for (let i = 0; i < 26; i++) ll += counts[(i + s) % 26] * M.lp1[i];
        scores[s] = ll;
        break;
      }
      case "bi": {
        if (!L) break;
        let prev = dec(c[0]), ll = M.lp1[prev];
        for (let t = 1; t < L; t++) { const x = dec(c[t]); ll += M.lp2[prev * 26 + x]; prev = x; }
        scores[s] = ll;
        break;
      }
      case "tri": {
        if (!L) break;
        let a = dec(c[0]), ll = M.lp1[a];
        if (L > 1) { const b = dec(c[1]); ll += M.lp2[a * 26 + b]; let p2 = a, p1 = b;
          for (let t = 2; t < L; t++) { const x = dec(c[t]); ll += M.lp3[(p2 * 26 + p1) * 26 + x]; p2 = p1; p1 = x; } }
        scores[s] = ll;
        break;
      }
      case "dict": {
        let hit = 0;
        for (const w of words) {
          let str = "";
          for (const v of w) str += LOWER[dec(v)];
          if (M.vocab.has(str)) hit += w.length;
        }
        scores[s] = L ? hit / L : 0;
        break;
      }
    }
  }
  return scores;
}

/** Best key; ties are broken uniformly at random (an honest coin flip). */
export function bestKey(scores) {
  const max = Math.max(...scores);
  const ties = scores.map((v, i) => [v, i]).filter(([v]) => Math.abs(v - max) <= 1e-9 * Math.max(1, Math.abs(max))).map(([, i]) => i);
  return { key: ties[(Math.random() * ties.length) | 0], ties: ties.length };
}

export function recoverKey(cipherText, method, M) {
  const prep = prepare(cipherText);
  const scores = scoreShifts(prep, method, M);
  return { ...bestKey(scores), scores };
}

// -----------------------------------------------------------------------------
// Experiment: success rate vs ciphertext length
// -----------------------------------------------------------------------------

/** Random excerpt starting at a word boundary and containing exactly L letters. */
export function sampleExcerpt(text, L) {
  for (;;) {
    let i = (Math.random() * (text.length - 20 * L - 100)) | 0;
    while (i < text.length && /[A-Za-z]/.test(text[i])) i++;     // move to a word boundary
    let out = "", n = 0;
    for (; i < text.length && n < L; i++) { out += text[i]; if (/[A-Za-z]/.test(text[i])) n++; }
    if (n === L) return out.replace(/\s+/g, " ").trim();
  }
}

/**
 * For each length and method: fraction of random excerpts (random key 1…25)
 * whose key is recovered exactly. The SAME ciphertexts are given to every
 * method, so the comparison between methods is paired.
 */
export async function lengthExperiment(M, rawTestText, lengths, trials, encryptFn, onProgress) {
  const text = stripHeader(rawTestText);
  const ok = Object.fromEntries(METHODS.map((m) => [m.id, new Array(lengths.length).fill(0)]));
  for (let li = 0; li < lengths.length; li++) {
    for (let t = 0; t < trials; t++) {
      const plain = sampleExcerpt(text, lengths[li]);
      const k = 1 + ((Math.random() * 25) | 0);
      const prep = prepare(encryptFn(plain, k));
      for (const m of METHODS) if (bestKey(scoreShifts(prep, m.id, M)).key === k) ok[m.id][li]++;
    }
    onProgress?.((li + 1) / lengths.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  for (const m of METHODS) ok[m.id] = ok[m.id].map((c) => c / trials);
  return ok;
}
