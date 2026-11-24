# Token Radar — pre-token protocols ranked by implied value (model radar-3)

A token launch radar built from one sealed DefiLlama snapshot. It answers,
for every protocol in the snapshot: what would its token be worth if the
protocol's record stayed as it is, and what should a reader do to farm it
before a token exists? It does not predict whether or when a token is
issued. Implied value is this entry's own claim, never make.fun's.

## What it is

- **The board:** 233 pre-token protocols, ranked by implied value — every one
  of the 40 watchlist slugs, plus every rankable pre-token protocol in the
  snapshot. Rank 1 is Steakhouse Financial at $128.9M implied; the median row
  is $5.1M. Ranks run 1..233 and implied values never rise down the board.
- **The model (radar-3):** the base multiple is fitted from the snapshot's
  own live-token protocols, not asserted. See "The model" below.
- **The live set:** the 24 largest live-token protocols, set aside as a
  control — they are what the model is fitted on, and they are never ranked.
- **Farm plans:** 6 steps per row, with a cost and a time on each, varied by
  the protocol's own category, chains, growth and age — plus a per-protocol
  "why farm this one" line and a risk note where the record warrants one.
- **The dashboard:** `dashboard/` is a single static page (no network, no
  framework). It filters by chain, category, watchlist-only and minimum
  implied value, sorts on every column, and opens a detail view per protocol
  with the full model breakdown, a recompute check, the farm plan and the
  risk note. A "How the ranking works" section states the model and its
  calibration in full.

## The model

Implied value is computed from the snapshot's own figures only — TVL,
7-day change, age with no token recorded, and chain breadth. No protocol
name is ever special-cased; a protocol is described as recording no token,
never as having none.

```
implied = TVL × K × TVL^(β−1) × category × (1 + clamp(7d, −30, +100) / 100 × 0.35)
          × (0.75 + 0.25 × √(min(age, 730) / 730)) × (1 + 0.02 × min(chains − 1, 4))
          × stability
```

Calibration, computed at run time from the same snapshot (deterministic —
run it twice and the outputs are byte-identical):

- **Live sample:** 128 protocols with a recorded market cap above zero.
- **Median mcap/TVL:** 0.214, at a median live TVL of $32.6M. The base
  multiple K = 91.1 is the constant that reproduces that median at that TVL.
- **Fitted log-log slope:** log(mcap) on log(TVL) is 0.52 (r = 0.44) — the
  ratio falls steeply as TVL grows ($5–50M: 0.307; $50–100M: 0.149;
  $100–500M: 0.082; $500M–1B: 0.034; $1–5B: 0.029). The model uses
  β = 0.65, a conservative dampening between linear and the fitted slope,
  so mega-TVL does not dominate.
- **Growth, age and chains barely predict the ratio** among live protocols:
  correlations of log(mcap/TVL) are −0.15 with 7-day change, −0.02 with
  log(age) and −0.04 with chain count. So growth enters clamped and with
  weight 0.35, maturity rises only from 0.75 to 1.00 over 730 days, and each
  extra chain adds 2% up to 8%.
- **Category factors** (shrunken toward 1.00 with k = 8, applied only where
  at least 5 live protocols exist in the category): Dexs 1.35 (n=11),
  Basis Trading 1.96 (n=7), Bridge 1.69 (n=6), RWA 1.15 (n=9),
  Yield 0.94 (n=9), Lending 0.75 (n=15), Liquid Staking 0.57 (n=9),
  Canonical Bridge 2.00 (n=8), CEX 0.66 (n=9). Every other category uses
  1.00 — including Risk Curators and Onchain Capital Allocator, which have
  almost no live-token sample, so the top of the board is driven by TVL
  and breadth, not by a category guess.
- **Stability:** a protocol that records no 7-day change is discounted 5%
  for the missing signal; unknown age is taken as 180 days.

## The board rule

Rankable means pre-token, not a CEX, and not a versioned pool name
(a slug ending in a version like `-v3`, or containing ` v` + a number).
The board ranks all 40 watchlist slugs unconditionally, plus every
board-eligible pre-token protocol. Board-eligible excludes wrapped,
staked and exchange-branded products, and — above the $50M floor — the
bridge and liquid-staking categories, because a $7B wrapped token is not
a launch waiting to happen. Below the floor every rankable protocol
stays, so the early board finds launches. That gives 233 rows from 289
rankable protocols (193 early rows + 40 watchlist).

## Farm plans

Each row carries 6 steps, each 20–600 characters, with a cost and a time.
The steps vary by the protocol's own record:

- The **size** follows TVL ($50 on the smallest, up to $250 on the
  largest), the **gas** follows the chain it is on, the **hold** follows
  age (21 days for a young protocol, 60 for a mature one).
- The **weekly step** is growth-aware: +20% or more in 7 days means start
  this week because the window may be short; −20% or worse means start
  with half the capital and add only if it steadies.
- **Multichain** protocols get a second-chain step; **Dexs** get a swap
  step, **Lending** a borrow step, **Yield** a vault step, **Risk
  Curators** a vault step, and anything else a deposit step.
- The **why-farm line** states the protocol's rank, TVL, chain count,
  7-day change and age in one sentence.
- A **risk note** appears when the record warrants it: a fall of 20% or
  more in 7 days (size the position small), no 7-day change reported, or
  listed less than 90 days ago.

## How to run it

Requires Node 22 or later, standard library only, no network.

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

It writes `board.json`, `data.js`, `dashboard/` (copied), `screenshots/`
(copied) and `dossier.json` into the output directory. Run it twice and
the outputs are byte-identical. The grader instead mounts the snapshot at
`/input` and takes `/output`.

## Files

- `main.ts` — entrypoint: reads the snapshot, scores it, writes the
  outputs and the dossier.
- `lib/model.ts` — the radar-3 model: calibration, implied value,
  board rule, farm plans, live set, and the dashboard data.
- `dashboard/` — `index.html`, `app.css`, `app.js`: the static page.
  Total source 31.5 KB.
- `screenshots/` — board, detail view, filtered view (1440×900 PNGs).
- `vendor/makefun-board.ts` — the vendored make.fun library that builds
  the dossier; do not modify it.
- `input/` — not in this repo; the snapshot is mounted by the grader.

## Limits

- The snapshot is frozen at 2026-11-14; nothing here updates it.
- Implied value is a fitted claim, not a price: it says what a token
  would be worth if the protocol's record stayed as it is, and the live
  sample it is fitted on is only 128 protocols with a wide spread
  (mcap/TVL from 0.032 at the 25th percentile to 1.00 at the 75th).
- The board says nothing about whether or when a token is issued, and
  the farm plans are research, not financial advice.
