# Statistics — Homeworks

Homeworks for the *Statistics* course (MSc in Cybersecurity, Sapienza University of Rome, A.A. 2026/27),
published with GitHub Pages.

| # | Topic | Page |
|---|-------|------|
| 1 | Part 1: private key → public key on a toy elliptic curve (secp256k1-style), statistical properties, blockchains. Part 2: from wallet seed to Ethereum address (BIP-39/32/44, secp256k1, Keccak-256, EIP-55) | [`hw1/`](hw1/) |
| 2 | Toy EC-ElGamal on secp256k1 vs Caesar cipher: statistical cryptanalysis and key-space attacks | [`hw2/`](hw2/) |
| 3 | Penetration scores as random walks (n systems, m attackers): LLN, variance scaling, CLT | [`hw3/`](hw3/) |
| 4 | Ex. 1: Welford's recurrences (derivation, code, stability). Ex. 2: sampling mean and variance of m hackers × n systems | [`hw4/`](hw4/) |

## Structure

```
index.html        course index
assets/style.css  shared style
hwN/              one folder per homework (self-contained HTML + JS)
```

All code is plain HTML/CSS/JavaScript (ES modules), no build step and no external libraries.
To run locally, serve the folder over HTTP (ES modules do not load from `file://`):

```
python -m http.server 8000   # then open http://localhost:8000
```

Each delivered version is marked with a git tag (`hw1-submitted`, …).

> Educational code: not constant-time, not suitable for real keys.
