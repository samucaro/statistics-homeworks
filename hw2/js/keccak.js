// =============================================================================
// keccak.js — Keccak-256 (Ethereum) and SHA3-256 (NIST FIPS 202), from scratch.
//
// Both use the SAME permutation Keccak-f[1600] and the SAME sponge parameters
// (rate r = 1088 bits = 136 bytes, capacity c = 512 bits, 256-bit output).
// The ONLY difference is the padding / domain-separation byte appended to the
// message before the pad10*1 rule:
//     Keccak-256 (original submission, used by Ethereum):  0x01
//     SHA3-256   (standardised by NIST in 2015):           0x06  (= bits "01" + pad)
// So the two functions give completely different digests for the same input.
//
// Each 64-bit lane is stored as two 32-bit halves (lo, hi) because JavaScript
// bitwise operators work on 32-bit integers.
// =============================================================================

// Round constants RC[i] for the iota step, as [hi, lo] 32-bit pairs.
const RC = [
  [0x00000000, 0x00000001], [0x00000000, 0x00008082], [0x80000000, 0x0000808a], [0x80000000, 0x80008000],
  [0x00000000, 0x0000808b], [0x00000000, 0x80000001], [0x80000000, 0x80008081], [0x80000000, 0x00008009],
  [0x00000000, 0x0000008a], [0x00000000, 0x00000088], [0x00000000, 0x80008009], [0x00000000, 0x8000000a],
  [0x00000000, 0x8000808b], [0x80000000, 0x0000008b], [0x80000000, 0x00008089], [0x80000000, 0x00008003],
  [0x80000000, 0x00008002], [0x80000000, 0x00000080], [0x00000000, 0x0000800a], [0x80000000, 0x8000000a],
  [0x80000000, 0x80008081], [0x80000000, 0x00008080], [0x00000000, 0x80000001], [0x80000000, 0x80008008],
];

// Rotation offsets for the rho step, indexed by lane i = x + 5y.
const ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];

/** Keccak-f[1600]: 24 rounds of theta, rho, pi, chi, iota on the 5×5 state. */
function keccakF(lo, hi) {
  const Clo = new Uint32Array(5), Chi = new Uint32Array(5);
  const Blo = new Uint32Array(25), Bhi = new Uint32Array(25);
  for (let round = 0; round < 24; round++) {
    // theta: XOR each lane with the parities of two neighbouring columns
    for (let x = 0; x < 5; x++) {
      Clo[x] = lo[x] ^ lo[x + 5] ^ lo[x + 10] ^ lo[x + 15] ^ lo[x + 20];
      Chi[x] = hi[x] ^ hi[x + 5] ^ hi[x + 10] ^ hi[x + 15] ^ hi[x + 20];
    }
    for (let x = 0; x < 5; x++) {
      const a = (x + 1) % 5, b = (x + 4) % 5;
      // D = C[x−1] XOR rot(C[x+1], 1)
      const Dlo = Clo[b] ^ ((Clo[a] << 1) | (Chi[a] >>> 31));
      const Dhi = Chi[b] ^ ((Chi[a] << 1) | (Clo[a] >>> 31));
      for (let y = 0; y < 25; y += 5) { lo[x + y] ^= Dlo; hi[x + y] ^= Dhi; }
    }
    // rho (rotate each lane) + pi (move lane (x,y) to (y, 2x+3y))
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) {
      const i = x + 5 * y, j = y + 5 * ((2 * x + 3 * y) % 5);
      let l = lo[i], h = hi[i], n = ROT[i];
      if (n >= 32) { [l, h] = [h, l]; n -= 32; }
      if (n === 0) { Blo[j] = l; Bhi[j] = h; }
      else { Blo[j] = (l << n) | (h >>> (32 - n)); Bhi[j] = (h << n) | (l >>> (32 - n)); }
    }
    // chi: the only non-linear step  A = B XOR (NOT B[x+1] AND B[x+2])
    for (let y = 0; y < 25; y += 5) for (let x = 0; x < 5; x++) {
      const a = y + (x + 1) % 5, b = y + (x + 2) % 5;
      lo[x + y] = Blo[x + y] ^ (~Blo[a] & Blo[b]);
      hi[x + y] = Bhi[x + y] ^ (~Bhi[a] & Bhi[b]);
    }
    // iota: break symmetry between rounds
    hi[0] ^= RC[round][0]; lo[0] ^= RC[round][1];
  }
}

/** Generic sponge with rate 136 bytes and 32-byte output. */
function sponge256(msg, domainByte) {
  const RATE = 136;
  const lo = new Uint32Array(25), hi = new Uint32Array(25);
  // padding: msg || domainByte || 0x00… || 0x80   (last two may share a byte)
  const padLen = RATE - (msg.length % RATE);
  const data = new Uint8Array(msg.length + padLen);
  data.set(msg);
  data[msg.length] ^= domainByte;
  data[data.length - 1] ^= 0x80;
  // absorb: XOR each block into the first 17 lanes (little-endian), then permute
  for (let off = 0; off < data.length; off += RATE) {
    for (let i = 0; i < RATE / 8; i++) {
      const o = off + 8 * i;
      lo[i] ^= data[o] | (data[o + 1] << 8) | (data[o + 2] << 16) | (data[o + 3] << 24);
      hi[i] ^= data[o + 4] | (data[o + 5] << 8) | (data[o + 6] << 16) | (data[o + 7] << 24);
    }
    keccakF(lo, hi);
  }
  // squeeze 32 bytes (4 lanes) — the other 1344 bits of state stay hidden
  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) for (let b = 0; b < 4; b++) {
    out[8 * i + b] = (lo[i] >>> (8 * b)) & 0xff;
    out[8 * i + 4 + b] = (hi[i] >>> (8 * b)) & 0xff;
  }
  return out;
}

/** Keccak-256 as used by Ethereum (original Keccak padding, 0x01). */
export const keccak256 = (bytes) => sponge256(bytes, 0x01);
/** SHA3-256 as standardised in FIPS 202 (domain separation 0x06). */
export const sha3_256 = (bytes) => sponge256(bytes, 0x06);
